const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { Webhook } = require('svix');

const CONFIG_SECRET_NAME = 'FUNCTIONS_CONFIG_EXPORT';
const DEFAULT_PLATFORM_URL = 'https://mzansishop.co.za';
const DEFAULT_ORDER_EMAIL_SETTINGS = {
  enabled: false,
  from: 'MzansiShop Orders <orders@mzansishop.co.za>',
  replyTo: 'support@mzansishop.co.za',
  subject: 'Your MzansiShop order {{ORDER_REFERENCE}} is confirmed',
  templateId: ''
};
const DEFAULT_UPDATE_EMAIL_SETTINGS = {
  from: 'MzansiShop Updates <updates@mzansishop.co.za>',
  replyTo: 'support@mzansishop.co.za',
  subject: 'MzansiShop update',
  templateId: ''
};

const getConfig = () => {
  const raw = process.env[CONFIG_SECRET_NAME];
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to parse FUNCTIONS_CONFIG_EXPORT secret', error);
    return {};
  }
};

const getResendConfig = () => {
  const cfg = getConfig();
  const resend = cfg.resend || {};
  return {
    apiKey: resend.api_key || resend.apiKey || resend.key || '',
    webhookSecret: resend.webhook_secret || resend.webhookSecret || resend.signing_secret || ''
  };
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const normalizeText = (value, maxLength = 1000) =>
  String(value || '').trim().slice(0, maxLength);

const getHeaderValue = (value) => {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
};

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  const timestamp = getTimestampMs(value);
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Johannesburg'
  }).format(new Date(timestamp));
};

const toFirestoreTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return admin.firestore.Timestamp.fromDate(date);
};

const isPaidOrder = (order = {}) =>
  String(order.paymentStatus || order.status || '').toLowerCase() === 'paid';

const getOrderGroupKey = (order = {}) =>
  order.orderGroupId || order.paymentReference || order.id || null;

const getOrderGroupReference = (order = {}) => {
  const groupKey = getOrderGroupKey(order);
  return order.orderGroupRef || (groupKey ? String(groupKey).slice(-6).toUpperCase() : '');
};

const getCustomerOrderDisplayId = (order = {}) => {
  return String(
    order.orderNumber
    || order.customerPaymentReference
    || order.payment?.reference
    || getOrderGroupReference(order)
    || ''
  ).trim();
};

const ensureAdminAccess = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const email = normalizeEmail(context.auth.token?.email);
  if (email === 'admin@mzansishop.com' || email === 'bonginkosiconsider@gmail.com') {
    return;
  }

  const adminSnap = await admin.firestore().collection('admins').doc(context.auth.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.active === false) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }
};

const loadAdminSettings = async () => {
  const snapshot = await admin.firestore().collection('admin').doc('settings').get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  return {
    supportEmail: String(data.supportEmail || DEFAULT_ORDER_EMAIL_SETTINGS.replyTo).trim(),
    orderEmails: {
      ...DEFAULT_ORDER_EMAIL_SETTINGS,
      ...(data.orderEmails || {})
    },
    updateEmails: {
      ...DEFAULT_UPDATE_EMAIL_SETTINGS,
      ...(data.updateEmails || {})
    }
  };
};

const loadOrdersForGroupKey = async (groupKey) => {
  const normalizedGroupKey = String(groupKey || '').trim();
  if (!normalizedGroupKey) return [];

  const byGroupSnap = await admin.firestore()
    .collection('orders')
    .where('orderGroupId', '==', normalizedGroupKey)
    .get();
  if (!byGroupSnap.empty) {
    return byGroupSnap.docs.map((docSnap) => ({ ref: docSnap.ref, data: docSnap.data() || {} }));
  }

  const byReferenceSnap = await admin.firestore()
    .collection('orders')
    .where('paymentReference', '==', normalizedGroupKey)
    .get();
  if (!byReferenceSnap.empty) {
    return byReferenceSnap.docs.map((docSnap) => ({ ref: docSnap.ref, data: docSnap.data() || {} }));
  }

  const directOrderSnap = await admin.firestore().collection('orders').doc(normalizedGroupKey).get();
  if (directOrderSnap.exists) {
    return [{ ref: directOrderSnap.ref, data: directOrderSnap.data() || {} }];
  }

  return [];
};

const formatAddress = (order = {}) => {
  const address = order.shippingAddress || order.customerAddress || order.billingAddress || {};
  const parts = [
    address.fullName,
    address.street || address.line1,
    address.suburb || address.line2,
    address.city,
    address.state || address.province,
    address.postalCode || address.zip,
    address.country
  ].filter(Boolean);
  return parts.join(', ');
};

const interpolateSubject = (template, variables) =>
  String(template || DEFAULT_ORDER_EMAIL_SETTINGS.subject).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => {
    const direct = variables[key];
    return direct !== undefined && direct !== null ? String(direct) : '';
  });

const updateGroupEmailState = async (orders, patch) => {
  const batch = admin.firestore().batch();
  orders.forEach(({ ref }) => {
    batch.update(ref, {
      confirmationEmail: patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
};

const buildOrderEmailPayload = (orders, settings) => {
  const sortedOrders = [...orders].sort((a, b) => getTimestampMs(a.createdAt) - getTimestampMs(b.createdAt));
  const primaryOrder = sortedOrders[0] || {};
  const customerName = String(primaryOrder.customerName || '').trim() || 'Customer';
  const customerEmail = normalizeEmail(primaryOrder.customerEmail);
  const paymentReference = getOrderGroupReference(primaryOrder);
  const orderGroupId = getOrderGroupKey(primaryOrder);
  const customerOrderNumbers = Array.from(
    new Set(sortedOrders.map(getCustomerOrderDisplayId).filter(Boolean))
  );
  const orderReference = customerOrderNumbers.length === 0
    ? paymentReference
    : customerOrderNumbers.length === 1
      ? customerOrderNumbers[0]
      : `${customerOrderNumbers[0]} +${customerOrderNumbers.length - 1} more`;
  const orderNumbersText = customerOrderNumbers.join(', ');
  const paidAt =
    sortedOrders.reduce((latest, order) => Math.max(latest, getTimestampMs(order.paidAt)), 0)
    || sortedOrders.reduce((latest, order) => Math.max(latest, getTimestampMs(order.approvedAt)), 0)
    || sortedOrders.reduce((latest, order) => Math.max(latest, getTimestampMs(order.createdAt)), 0);
  const lineItems = sortedOrders.flatMap((order) =>
    (Array.isArray(order.items) ? order.items : []).map((item) => {
      const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1));
      const price = round2(item?.price || 0);
      const lineTotal = round2(price * quantity);
      return {
        vendorName: order.tenantName || item?.storeName || item?.vendorName || '',
        name: item?.name || 'Item',
        quantity,
        price,
        lineTotal
      };
    })
  );
  const subtotal = round2(sortedOrders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0));
  const shippingCost = round2(sortedOrders.reduce((sum, order) => sum + Number(order.shippingCost || 0), 0));
  const discount = round2(sortedOrders.reduce((sum, order) => sum + Number(order.discount || 0), 0));
  const total = round2(sortedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const itemCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const storeNames = Array.from(new Set(lineItems.map((item) => item.vendorName).filter(Boolean))).join(', ');
  const paymentMethod =
    String(primaryOrder.payment?.method || primaryOrder.paymentMethod || primaryOrder.payment?.provider || 'yoco')
      .replace(/_/g, ' ');
  const shippingAddress = formatAddress(primaryOrder);
  const itemLines = lineItems
    .map((item) => `${item.quantity} x ${item.name}${item.vendorName ? ` (${item.vendorName})` : ''} - ${formatCurrency(item.lineTotal)}`)
    .join('\n');
  const primaryProductName = !lineItems.length
    ? 'Order items'
    : lineItems.length === 1
      ? lineItems[0].name
      : `${lineItems[0].name} +${lineItems.length - 1} more`;
  const supportEmail = String(settings.supportEmail || settings.orderEmails.replyTo || '').trim();
  const supportUrl = `${DEFAULT_PLATFORM_URL}/orders`;
  const totalText = formatCurrency(total);
  const subtotalText = formatCurrency(subtotal);
  const shippingText = formatCurrency(shippingCost);
  const discountText = formatCurrency(discount);
  const paidAtText = formatDateTime(paidAt);

  const templateVariables = {
    CUSTOMER_NAME: customerName,
    customerName,
    CUSTOMER_EMAIL: customerEmail,
    customerEmail,
    ORDER_REFERENCE: orderReference,
    orderReference,
    ORDER_NUMBERS: orderNumbersText,
    orderNumbers: orderNumbersText,
    order_numbers: orderNumbersText,
    ORDER_GROUP_ID: orderGroupId,
    orderGroupId,
    PAYMENT_REFERENCE: paymentReference,
    paymentReference,
    payment_reference: paymentReference,
    ORDER_DATE: paidAtText,
    orderDate: paidAtText,
    PAYMENT_METHOD: paymentMethod,
    paymentMethod,
    PAYMENT_STATUS: 'paid',
    paymentStatus: 'paid',
    STORE_NAMES: storeNames,
    storeNames,
    ITEM_COUNT: String(itemCount),
    itemCount: String(itemCount),
    PRODUCT_NAME: primaryProductName,
    productName: primaryProductName,
    product_name: primaryProductName,
    SUBTOTAL: subtotalText,
    subtotal: subtotalText,
    SHIPPING_COST: shippingText,
    shippingCost: shippingText,
    DISCOUNT: discountText,
    discount: discountText,
    TOTAL: totalText,
    total: totalText,
    AMOUNT: total.toFixed(2),
    amount: total.toFixed(2),
    AMOUNT_FORMATTED: totalText,
    amountFormatted: totalText,
    TOTAL_RAW: total.toFixed(2),
    totalRaw: total.toFixed(2),
    SUPPORT_EMAIL: supportEmail,
    supportEmail,
    SUPPORT_URL: supportUrl,
    supportUrl,
    VIEW_ORDER_URL: supportUrl,
    viewOrderUrl: supportUrl,
    view_order_url: supportUrl,
    TRACK_ORDER_URL: supportUrl,
    trackOrderUrl: supportUrl,
    track_order_url: supportUrl,
    SHIPPING_ADDRESS: shippingAddress,
    shippingAddress,
    ITEM_LINES: itemLines,
    itemLines,
    ORDER_ID: orderReference,
    orderId: orderReference,
    order_id: orderReference,
    CUSTOMER_NAME_LOWER: customerName,
    customer_name: customerName
  };

  const htmlItems = lineItems.length
    ? lineItems.map((item) =>
      `<tr><td style="padding:8px 0;">${escapeHtml(item.quantity)} x ${escapeHtml(item.name)}${item.vendorName ? ` <span style="color:#6b7280;">(${escapeHtml(item.vendorName)})</span>` : ''}</td><td style="padding:8px 0; text-align:right;">${escapeHtml(formatCurrency(item.lineTotal))}</td></tr>`
    ).join('')
    : '<tr><td style="padding:8px 0;" colspan="2">No items available</td></tr>';

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, sans-serif; color:#111827;">
    <div style="max-width:640px; margin:0 auto; padding:24px;">
      <div style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.08);">
        <div style="background:#111827; color:#ffffff; padding:24px;">
          <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.75;">Payment confirmed</p>
          <h1 style="margin:0; font-size:28px; line-height:1.2;">Order ${escapeHtml(orderReference)} confirmed</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px;">Hi ${escapeHtml(customerName)}, your payment has been confirmed and your order is now being processed.</p>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr><td style="padding:4px 0; color:#6b7280;">${customerOrderNumbers.length > 1 ? 'Order numbers' : 'Order number'}</td><td style="padding:4px 0; text-align:right;">${escapeHtml(orderNumbersText || orderReference)}</td></tr>
            ${paymentReference && paymentReference !== orderReference ? `<tr><td style="padding:4px 0; color:#6b7280;">Payment reference</td><td style="padding:4px 0; text-align:right;">${escapeHtml(paymentReference)}</td></tr>` : ''}
            <tr><td style="padding:4px 0; color:#6b7280;">Paid at</td><td style="padding:4px 0; text-align:right;">${escapeHtml(paidAtText || '-')}</td></tr>
            <tr><td style="padding:4px 0; color:#6b7280;">Payment method</td><td style="padding:4px 0; text-align:right; text-transform:capitalize;">${escapeHtml(paymentMethod)}</td></tr>
            <tr><td style="padding:4px 0; color:#6b7280;">Stores</td><td style="padding:4px 0; text-align:right;">${escapeHtml(storeNames || 'MzansiShop')}</td></tr>
          </table>
          <h2 style="margin:0 0 12px; font-size:18px;">Items</h2>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">${htmlItems}</table>
          <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
            <tr><td style="padding:4px 0; color:#6b7280;">Subtotal</td><td style="padding:4px 0; text-align:right;">${escapeHtml(subtotalText)}</td></tr>
            <tr><td style="padding:4px 0; color:#6b7280;">Shipping</td><td style="padding:4px 0; text-align:right;">${escapeHtml(shippingText)}</td></tr>
            ${discount > 0 ? `<tr><td style="padding:4px 0; color:#15803d;">Discount</td><td style="padding:4px 0; text-align:right; color:#15803d;">-${escapeHtml(discountText)}</td></tr>` : ''}
            <tr><td style="padding:8px 0; font-weight:700;">Total</td><td style="padding:8px 0; text-align:right; font-weight:700;">${escapeHtml(totalText)}</td></tr>
          </table>
          ${shippingAddress ? `<p style="margin:0 0 16px;"><strong>Delivery address:</strong><br>${escapeHtml(shippingAddress)}</p>` : ''}
          <p style="margin:0;">Need help? Contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a> or view your orders at <a href="${escapeHtml(supportUrl)}">${escapeHtml(supportUrl)}</a>.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Hi ${customerName},`,
    '',
    `Your payment has been confirmed for order ${orderReference}.`,
    orderNumbersText && orderNumbersText !== orderReference ? `Order numbers: ${orderNumbersText}` : null,
    paymentReference && paymentReference !== orderReference ? `Payment reference: ${paymentReference}` : null,
    paidAtText ? `Paid at: ${paidAtText}` : null,
    `Payment method: ${paymentMethod}`,
    storeNames ? `Stores: ${storeNames}` : null,
    '',
    'Items:',
    itemLines || 'No items available',
    '',
    `Subtotal: ${subtotalText}`,
    `Shipping: ${shippingText}`,
    discount > 0 ? `Discount: -${discountText}` : null,
    `Total: ${totalText}`,
    shippingAddress ? `Delivery address: ${shippingAddress}` : null,
    '',
    supportEmail ? `Support: ${supportEmail}` : null,
    `Orders: ${supportUrl}`
  ].filter(Boolean).join('\n');

  return {
    orderGroupId,
    to: customerEmail,
    from: String(settings.orderEmails.from || '').trim(),
    replyTo: String(settings.orderEmails.replyTo || settings.supportEmail || '').trim(),
    subject: String(settings.orderEmails.subject || DEFAULT_ORDER_EMAIL_SETTINGS.subject).trim(),
    templateId: String(settings.orderEmails.templateId || '').trim(),
    templateVariables,
    html,
    text
  };
};

const sendViaResend = async ({
  from,
  to,
  subject,
  replyTo,
  templateId,
  templateVariables,
  html,
  text,
  idempotencyKey
}) => {
  const { apiKey } = getResendConfig();
  if (!apiKey) {
    throw new Error('Missing Resend API key in FUNCTIONS_CONFIG_EXPORT');
  }
  if (!from) {
    throw new Error('Missing email from address');
  }

  const body = {
    from,
    to: [to],
    subject
  };

  if (replyTo) body.reply_to = replyTo;

  if (templateId) {
    body.template = {
      id: templateId,
      variables: templateVariables
    };
  } else {
    body.html = html;
    body.text = text;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(body)
  });

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (error) {
    payload = {};
  }

  if (!response.ok || !payload?.id) {
    throw new Error(
      payload?.message
      || payload?.error
      || rawText
      || 'Failed to send order confirmation email'
    );
  }

  return payload;
};

const sendOrderConfirmationEmailForGroup = async (groupKey, options = {}) => {
  const orders = await loadOrdersForGroupKey(groupKey);
  if (!orders.length) {
    throw new functions.https.HttpsError('not-found', 'Order group not found');
  }

  const orderData = orders.map(({ data }) => data);
  const primaryOrder = orderData[0] || {};
  const normalizedGroupKey = getOrderGroupKey(primaryOrder);

  if (!orderData.every(isPaidOrder)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'All orders in this payment group must be marked as paid before sending the confirmation email'
    );
  }

  if (!options.force && orderData.some((order) => order?.confirmationEmail?.status === 'sent')) {
    return { skipped: true, reason: 'already_sent', orderGroupId: normalizedGroupKey };
  }

  const settings = await loadAdminSettings();
  if (!settings.orderEmails.enabled) {
    await updateGroupEmailState(orders, {
      status: 'skipped',
      reason: 'disabled',
      source: options.source || 'system',
      attemptedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { skipped: true, reason: 'disabled', orderGroupId: normalizedGroupKey };
  }

  const payload = buildOrderEmailPayload(orderData, settings);
  if (!payload.to) {
    await updateGroupEmailState(orders, {
      status: 'skipped',
      reason: 'missing_customer_email',
      source: options.source || 'system',
      attemptedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { skipped: true, reason: 'missing_customer_email', orderGroupId: normalizedGroupKey };
  }

  const subject = interpolateSubject(payload.subject, payload.templateVariables);
  const idempotencyKey = options.force
    ? `order-email:${normalizedGroupKey}:manual:${Date.now()}`
    : `order-email:${normalizedGroupKey}:auto`;

  try {
    const result = await sendViaResend({
      from: payload.from,
      to: payload.to,
      subject,
      replyTo: payload.replyTo,
      templateId: payload.templateId,
      templateVariables: payload.templateVariables,
      html: payload.html,
      text: payload.text,
      idempotencyKey
    });

    await updateGroupEmailState(orders, {
      status: 'sent',
      source: options.source || 'system',
      templateId: payload.templateId || null,
      emailId: result.id,
      subject,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: null
    });

    return {
      sent: true,
      id: result.id,
      to: payload.to,
      subject,
      orderGroupId: normalizedGroupKey
    };
  } catch (error) {
    await updateGroupEmailState(orders, {
      status: 'failed',
      source: options.source || 'system',
      templateId: payload.templateId || null,
      subject,
      attemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastError: error.message || 'Failed to send order confirmation email'
    });
    throw error;
  }
};

const getWebhookEventError = (eventType, payloadData = {}) => {
  if (eventType === 'email.bounced') {
    return String(payloadData?.bounce?.message || payloadData?.bounce?.subType || 'Email bounced').trim();
  }
  if (eventType === 'email.failed') {
    return String(
      payloadData?.failure?.message
      || payloadData?.failure?.reason
      || payloadData?.reason
      || 'Email failed'
    ).trim();
  }
  if (eventType === 'email.complained') {
    return 'Recipient marked the email as spam';
  }
  return '';
};

const buildWebhookEmailPatch = (event = {}, verified) => {
  const eventType = String(event.type || '').trim();
  const payloadData = event.data || {};
  const eventTimestamp = toFirestoreTimestamp(event.created_at) || admin.firestore.FieldValue.serverTimestamp();
  const patch = {
    'confirmationEmail.lastEventType': eventType || null,
    'confirmationEmail.lastEventAt': eventTimestamp,
    'confirmationEmail.webhookVerified': verified,
    'confirmationEmail.webhookReceivedAt': admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  if (eventType === 'email.sent') {
    patch['confirmationEmail.providerStatus'] = 'sent';
    patch['confirmationEmail.sentEventAt'] = eventTimestamp;
  }

  if (eventType === 'email.delivered') {
    patch['confirmationEmail.deliveryStatus'] = 'delivered';
    patch['confirmationEmail.deliveredAt'] = eventTimestamp;
    patch['confirmationEmail.lastError'] = null;
  }

  if (eventType === 'email.delivery_delayed') {
    patch['confirmationEmail.deliveryStatus'] = 'delivery_delayed';
    patch['confirmationEmail.deliveryDelayedAt'] = eventTimestamp;
  }

  if (eventType === 'email.failed') {
    patch['confirmationEmail.status'] = 'failed';
    patch['confirmationEmail.deliveryStatus'] = 'failed';
    patch['confirmationEmail.failedAt'] = eventTimestamp;
    patch['confirmationEmail.lastError'] = getWebhookEventError(eventType, payloadData);
  }

  if (eventType === 'email.bounced') {
    patch['confirmationEmail.deliveryStatus'] = 'bounced';
    patch['confirmationEmail.bouncedAt'] = eventTimestamp;
    patch['confirmationEmail.lastError'] = getWebhookEventError(eventType, payloadData);
  }

  if (eventType === 'email.complained') {
    patch['confirmationEmail.deliveryStatus'] = 'complained';
    patch['confirmationEmail.complainedAt'] = eventTimestamp;
    patch['confirmationEmail.lastError'] = getWebhookEventError(eventType, payloadData);
  }

  if (eventType === 'email.opened') {
    patch['confirmationEmail.openedAt'] = eventTimestamp;
  }

  if (eventType === 'email.clicked') {
    patch['confirmationEmail.clickedAt'] = eventTimestamp;
  }

  return patch;
};

const recordWebhookEvent = async ({ event, verified, verificationBypassed }) => {
  const payloadData = event?.data || {};
  await admin.firestore().collection('resendWebhookEvents').add({
    type: String(event?.type || '').trim() || null,
    emailId: String(payloadData?.email_id || '').trim() || null,
    createdAt: String(event?.created_at || payloadData?.created_at || '').trim() || null,
    verified,
    verificationBypassed,
    to: Array.isArray(payloadData?.to) ? payloadData.to : [],
    subject: String(payloadData?.subject || '').trim() || null,
    payload: event || {},
    receivedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

const applyWebhookEventToOrders = async ({ event, verified }) => {
  const payloadData = event?.data || {};
  const emailId = String(payloadData?.email_id || '').trim();
  if (!emailId) return 0;

  const ordersSnap = await admin.firestore()
    .collection('orders')
    .where('confirmationEmail.emailId', '==', emailId)
    .get();

  if (ordersSnap.empty) {
    return 0;
  }

  const patch = buildWebhookEmailPatch(event, verified);
  const batch = admin.firestore().batch();
  ordersSnap.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, patch);
  });
  await batch.commit();
  return ordersSnap.size;
};

exports.resendWebhook = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onRequest(async (req, res) => {
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        message: 'Resend webhook endpoint is running'
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const rawPayload = Buffer.isBuffer(req.rawBody)
      ? req.rawBody.toString('utf8')
      : String(req.rawBody || '');

    if (!rawPayload) {
      return res.status(400).json({ error: 'Missing request body' });
    }

    const headers = {
      'svix-id': getHeaderValue(req.headers['svix-id']),
      'svix-timestamp': getHeaderValue(req.headers['svix-timestamp']),
      'svix-signature': getHeaderValue(req.headers['svix-signature'])
    };

    const { webhookSecret } = getResendConfig();
    let event = null;
    let verified = false;
    let verificationBypassed = false;

    try {
      if (webhookSecret && headers['svix-id'] && headers['svix-timestamp'] && headers['svix-signature']) {
        const webhook = new Webhook(webhookSecret);
        event = webhook.verify(rawPayload, headers);
        verified = true;
      } else {
        event = JSON.parse(rawPayload);
        verificationBypassed = true;
      }
    } catch (error) {
      console.error('Invalid Resend webhook', error);
      return res.status(400).json({ error: 'Invalid webhook signature or payload' });
    }

    try {
      await recordWebhookEvent({ event, verified, verificationBypassed });
      const matchedOrders = await applyWebhookEventToOrders({ event, verified });
      return res.status(200).json({
        received: true,
        type: event?.type || null,
        matchedOrders
      });
    } catch (error) {
      console.error('Failed to process Resend webhook', error);
      return res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

const VALID_UPDATE_AUDIENCES = new Set([
  'registered_users',
  'customers',
  'vendors',
  'promoters',
  'test'
]);

const UPDATE_AUDIENCE_LABELS = {
  registered_users: 'Registered users',
  customers: 'Customers',
  vendors: 'Vendors',
  promoters: 'Promoters',
  test: 'Test email'
};

const getRecipientName = (data = {}) => {
  const emailPrefix = normalizeEmail(data.email).split('@')[0] || '';
  return normalizeText(
    data.name
    || data.displayName
    || data.fullName
    || data.customerName
    || data.storeName
    || data.businessName
    || emailPrefix
    || '',
    120
  );
};

const addRecipient = (recipientsByEmail, recipient, stats) => {
  const email = normalizeEmail(recipient.email);
  if (!email) {
    stats.skippedMissingEmail += 1;
    return;
  }

  const name = getRecipientName(recipient);
  if (recipientsByEmail.has(email)) {
    stats.duplicateEmails += 1;
    const existing = recipientsByEmail.get(email);
    if (!existing.name && name) existing.name = name;
    if (!existing.uid && recipient.uid) existing.uid = recipient.uid;
    return;
  }

  recipientsByEmail.set(email, {
    email,
    name,
    uid: recipient.uid || null,
    source: recipient.source || null
  });
};

const loadAuthRecipients = async () => {
  const recipientsByEmail = new Map();
  const stats = {
    sourceTotal: 0,
    disabledUsers: 0,
    skippedMissingEmail: 0,
    duplicateEmails: 0
  };
  let pageToken;

  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    stats.sourceTotal += page.users.length;

    page.users.forEach((userRecord) => {
      if (userRecord.disabled) {
        stats.disabledUsers += 1;
        return;
      }

      addRecipient(recipientsByEmail, {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
        displayName: userRecord.displayName,
        source: 'auth'
      }, stats);
    });

    pageToken = page.pageToken;
  } while (pageToken);

  return {
    recipients: Array.from(recipientsByEmail.values()).sort((a, b) => a.email.localeCompare(b.email)),
    stats: {
      ...stats,
      uniqueRecipients: recipientsByEmail.size
    }
  };
};

const loadCollectionRecipients = async (collectionName, source) => {
  const snapshot = await admin.firestore().collection(collectionName).get();
  const recipientsByEmail = new Map();
  const stats = {
    sourceTotal: snapshot.size,
    disabledUsers: 0,
    skippedMissingEmail: 0,
    duplicateEmails: 0
  };

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    addRecipient(recipientsByEmail, {
      ...data,
      uid: docSnap.id,
      email: data.email || data.customerEmail || data.ownerEmail || data.contactEmail || '',
      source
    }, stats);
  });

  return {
    recipients: Array.from(recipientsByEmail.values()).sort((a, b) => a.email.localeCompare(b.email)),
    stats: {
      ...stats,
      uniqueRecipients: recipientsByEmail.size
    }
  };
};

const loadAdminUpdateRecipients = async (audience) => {
  if (audience === 'registered_users') return loadAuthRecipients();
  if (audience === 'customers') return loadCollectionRecipients('customers', 'customers');
  if (audience === 'vendors') return loadCollectionRecipients('tenants', 'vendors');
  if (audience === 'promoters') return loadCollectionRecipients('promoters', 'promoters');
  throw new functions.https.HttpsError('invalid-argument', 'Invalid update audience');
};

const parseExcludedEmails = (value) => {
  const raw = Array.isArray(value)
    ? value.join('\n')
    : String(value || '');

  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter((email) => email && email.includes('@'))
    )
  ).sort();
};

const applyRecipientExclusions = (recipients, excludedEmails) => {
  const excludedSet = new Set(excludedEmails || []);
  if (excludedSet.size === 0) {
    return {
      recipients,
      excludedRecipients: 0,
      excludedEmailCount: 0,
      unmatchedExcludedEmails: 0
    };
  }

  const matchedEmails = new Set();
  const filteredRecipients = recipients.filter((recipient) => {
    const email = normalizeEmail(recipient.email);
    if (excludedSet.has(email)) {
      matchedEmails.add(email);
      return false;
    }
    return true;
  });

  return {
    recipients: filteredRecipients,
    excludedRecipients: recipients.length - filteredRecipients.length,
    excludedEmailCount: excludedSet.size,
    unmatchedExcludedEmails: Math.max(0, excludedSet.size - matchedEmails.size)
  };
};

const formatMessageHtml = (message) => {
  const clean = normalizeText(message, 6000);
  if (!clean) return '';

  return clean
    .split(/\n{2,}/)
    .map((paragraph) =>
      `<p style="margin:0 0 16px; line-height:1.6;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
};

const buildAdminUpdateEmailPayload = ({ recipient, campaign, settings }) => {
  const customerName = recipient.name || 'there';
  const supportEmail = normalizeText(settings.supportEmail || campaign.replyTo || DEFAULT_UPDATE_EMAIL_SETTINGS.replyTo, 180);
  const platformUrl = DEFAULT_PLATFORM_URL;
  const title = campaign.title || campaign.subject;
  const message = campaign.message || '';
  const ctaLabel = campaign.ctaLabel || 'Visit MzansiShop';
  const ctaUrl = campaign.ctaUrl || platformUrl;
  const templateVariables = {
    CUSTOMER_NAME: customerName,
    customerName,
    customer_name: customerName,
    EMAIL: recipient.email,
    email: recipient.email,
    UPDATE_TITLE: title,
    updateTitle: title,
    update_title: title,
    MESSAGE: message,
    message,
    CTA_LABEL: ctaLabel,
    ctaLabel,
    cta_label: ctaLabel,
    CTA_URL: ctaUrl,
    ctaUrl,
    cta_url: ctaUrl,
    PLATFORM_URL: platformUrl,
    platformUrl,
    SUPPORT_EMAIL: supportEmail,
    supportEmail
  };

  const messageHtml = formatMessageHtml(message);
  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, sans-serif; color:#111827;">
    <div style="max-width:640px; margin:0 auto; padding:24px;">
      <div style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 30px rgba(15,23,42,0.08);">
        <div style="background:#111827; color:#ffffff; padding:24px;">
          <p style="margin:0 0 8px; font-size:12px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.75;">MzansiShop update</p>
          <h1 style="margin:0; font-size:28px; line-height:1.2;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 16px; line-height:1.6;">Hi ${escapeHtml(customerName)},</p>
          ${messageHtml || '<p style="margin:0 0 16px; line-height:1.6;">We have an update from MzansiShop.</p>'}
          ${ctaUrl ? `<p style="margin:24px 0;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:8px; font-weight:700;">${escapeHtml(ctaLabel)}</a></p>` : ''}
          <p style="margin:24px 0 0; color:#6b7280; font-size:13px; line-height:1.5;">Need help? Contact <a href="mailto:${escapeHtml(supportEmail)}">${escapeHtml(supportEmail)}</a>.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Hi ${customerName},`,
    '',
    title,
    '',
    message || 'We have an update from MzansiShop.',
    '',
    ctaUrl ? `${ctaLabel}: ${ctaUrl}` : null,
    supportEmail ? `Support: ${supportEmail}` : null
  ].filter(Boolean).join('\n');

  return {
    to: recipient.email,
    from: campaign.from,
    replyTo: campaign.replyTo,
    subject: interpolateSubject(campaign.subject, templateVariables),
    templateId: campaign.templateId,
    templateVariables,
    html,
    text
  };
};

const runWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));

  return results;
};

const buildIdempotencyKey = (campaignId, email) => {
  const encodedEmail = Buffer.from(email).toString('base64url');
  return `admin-update:${campaignId}:${encodedEmail}`.slice(0, 240);
};

exports.getAdminUpdateAudiencePreview = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    await ensureAdminAccess(context);

    const audience = normalizeText(data?.audience || 'registered_users', 40);
    if (!VALID_UPDATE_AUDIENCES.has(audience)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid update audience');
    }
    const excludedEmails = parseExcludedEmails(data?.excludedEmails);

    if (audience === 'test') {
      const testEmail = normalizeEmail(data?.testEmail || context.auth?.token?.email);
      return {
        audience,
        audienceLabel: UPDATE_AUDIENCE_LABELS[audience],
        sourceTotal: testEmail ? 1 : 0,
        uniqueRecipients: testEmail ? 1 : 0,
        skippedMissingEmail: testEmail ? 0 : 1,
        duplicateEmails: 0,
        disabledUsers: 0,
        excludedRecipients: 0,
        excludedEmailCount: 0,
        unmatchedExcludedEmails: 0
      };
    }

    const { recipients, stats } = await loadAdminUpdateRecipients(audience);
    const filtered = applyRecipientExclusions(recipients, excludedEmails);
    return {
      audience,
      audienceLabel: UPDATE_AUDIENCE_LABELS[audience],
      ...stats,
      uniqueBeforeExclusions: stats.uniqueRecipients,
      uniqueRecipients: filtered.recipients.length,
      excludedRecipients: filtered.excludedRecipients,
      excludedEmailCount: filtered.excludedEmailCount,
      unmatchedExcludedEmails: filtered.unmatchedExcludedEmails
    };
  });

exports.getAdminUpdateRecipientList = functions
  .runWith({ timeoutSeconds: 120, memory: '256MB' })
  .https.onCall(async (data, context) => {
    await ensureAdminAccess(context);

    const audience = normalizeText(data?.audience || 'registered_users', 40);
    if (!VALID_UPDATE_AUDIENCES.has(audience) || audience === 'test') {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid update audience');
    }

    const { recipients, stats } = await loadAdminUpdateRecipients(audience);
    return {
      audience,
      audienceLabel: UPDATE_AUDIENCE_LABELS[audience],
      recipients: recipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name || '',
        source: recipient.source || null
      })),
      stats
    };
  });

exports.sendAdminUpdateEmail = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME], timeoutSeconds: 540, memory: '512MB' })
  .https.onCall(async (data, context) => {
    await ensureAdminAccess(context);

    const settings = await loadAdminSettings();
    const audience = normalizeText(data?.audience || 'registered_users', 40);
    if (!VALID_UPDATE_AUDIENCES.has(audience)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid update audience');
    }
    const excludedEmails = parseExcludedEmails(data?.excludedEmails);

    const campaign = {
      audience,
      audienceLabel: UPDATE_AUDIENCE_LABELS[audience],
      title: normalizeText(data?.title, 140),
      subject: normalizeText(data?.subject || settings.updateEmails.subject, 180),
      templateId: normalizeText(data?.templateId || settings.updateEmails.templateId, 160),
      from: normalizeText(data?.from || settings.updateEmails.from, 220),
      replyTo: normalizeText(data?.replyTo || settings.updateEmails.replyTo || settings.supportEmail, 220),
      message: normalizeText(data?.message, 6000),
      ctaLabel: normalizeText(data?.ctaLabel, 80),
      ctaUrl: normalizeText(data?.ctaUrl, 600)
    };

    if (!campaign.subject) {
      throw new functions.https.HttpsError('invalid-argument', 'Email subject is required');
    }
    if (!campaign.from) {
      throw new functions.https.HttpsError('invalid-argument', 'From address is required');
    }
    if (!campaign.templateId && !campaign.message) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Add a Resend template ID or write a message for the built-in email'
      );
    }

    const isTest = audience === 'test';
    if (!isTest && data?.confirmSend !== true) {
      throw new functions.https.HttpsError('failed-precondition', 'Confirm the campaign send before sending');
    }

    let recipients = [];
    let stats = {
      sourceTotal: 0,
      disabledUsers: 0,
      skippedMissingEmail: 0,
      duplicateEmails: 0,
      uniqueRecipients: 0,
      uniqueBeforeExclusions: 0,
      excludedRecipients: 0,
      excludedEmailCount: 0,
      unmatchedExcludedEmails: 0
    };

    if (isTest) {
      const testEmail = normalizeEmail(data?.testEmail || context.auth?.token?.email);
      if (!testEmail) {
        throw new functions.https.HttpsError('invalid-argument', 'Test email is required');
      }
      recipients = [{
        email: testEmail,
        name: normalizeText(data?.testName || context.auth?.token?.name || 'Test recipient', 120),
        uid: null,
        source: 'test'
      }];
      stats = {
        ...stats,
        sourceTotal: 1,
        uniqueRecipients: 1,
        uniqueBeforeExclusions: 1
      };
    } else {
      const loaded = await loadAdminUpdateRecipients(audience);
      const filtered = applyRecipientExclusions(loaded.recipients, excludedEmails);
      recipients = filtered.recipients;
      stats = {
        ...loaded.stats,
        uniqueBeforeExclusions: loaded.stats.uniqueRecipients,
        uniqueRecipients: recipients.length,
        excludedRecipients: filtered.excludedRecipients,
        excludedEmailCount: filtered.excludedEmailCount,
        unmatchedExcludedEmails: filtered.unmatchedExcludedEmails
      };
    }

    if (!recipients.length) {
      throw new functions.https.HttpsError('failed-precondition', 'No recipients with email addresses found');
    }

    const campaignRef = admin.firestore().collection('adminUpdateCampaigns').doc();
    await campaignRef.set({
      audience,
      audienceLabel: campaign.audienceLabel,
      title: campaign.title || null,
      subject: campaign.subject,
      templateId: campaign.templateId || null,
      from: campaign.from,
      replyTo: campaign.replyTo || null,
      message: campaign.message || null,
      ctaLabel: campaign.ctaLabel || null,
      ctaUrl: campaign.ctaUrl || null,
      testMode: isTest,
      status: 'sending',
      sourceTotal: stats.sourceTotal,
      recipientCount: recipients.length,
      uniqueBeforeExclusions: stats.uniqueBeforeExclusions || recipients.length,
      excludedRecipients: stats.excludedRecipients || 0,
      excludedEmailCount: stats.excludedEmailCount || 0,
      unmatchedExcludedEmails: stats.unmatchedExcludedEmails || 0,
      excludedEmails: excludedEmails.slice(0, 250),
      skippedMissingEmail: stats.skippedMissingEmail || 0,
      duplicateEmails: stats.duplicateEmails || 0,
      disabledUsers: stats.disabledUsers || 0,
      createdBy: context.auth?.uid || null,
      createdByEmail: normalizeEmail(context.auth?.token?.email) || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    try {
      const results = await runWithConcurrency(recipients, 5, async (recipient) => {
        const payload = buildAdminUpdateEmailPayload({ recipient, campaign, settings });
        try {
          const result = await sendViaResend({
            from: payload.from,
            to: payload.to,
            subject: payload.subject,
            replyTo: payload.replyTo,
            templateId: payload.templateId,
            templateVariables: payload.templateVariables,
            html: payload.html,
            text: payload.text,
            idempotencyKey: buildIdempotencyKey(campaignRef.id, recipient.email)
          });
          return {
            ok: true,
            email: recipient.email,
            id: result.id
          };
        } catch (error) {
          return {
            ok: false,
            email: recipient.email,
            error: error.message || 'Failed to send email'
          };
        }
      });

      const sent = results.filter((result) => result?.ok);
      const failed = results.filter((result) => result && !result.ok);
      const status = failed.length === 0
        ? 'sent'
        : sent.length > 0
          ? 'partial_failed'
          : 'failed';

      await campaignRef.set({
        status,
        sentCount: sent.length,
        failedCount: failed.length,
        failures: failed.slice(0, 25).map((item) => ({
          email: item.email,
          error: item.error
        })),
        firstEmailId: sent[0]?.id || null,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        campaignId: campaignRef.id,
        audience,
        audienceLabel: campaign.audienceLabel,
        sourceTotal: stats.sourceTotal,
        uniqueRecipients: recipients.length,
        uniqueBeforeExclusions: stats.uniqueBeforeExclusions || recipients.length,
        excludedRecipients: stats.excludedRecipients || 0,
        excludedEmailCount: stats.excludedEmailCount || 0,
        unmatchedExcludedEmails: stats.unmatchedExcludedEmails || 0,
        skippedMissingEmail: stats.skippedMissingEmail || 0,
        duplicateEmails: stats.duplicateEmails || 0,
        disabledUsers: stats.disabledUsers || 0,
        sent: sent.length,
        failed: failed.length,
        status
      };
    } catch (error) {
      await campaignRef.set({
        status: 'failed',
        failedCount: recipients.length,
        lastError: error.message || 'Failed to send campaign',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.error('Admin update campaign failed', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', error.message || 'Failed to send campaign');
    }
  });

exports.sendOrderConfirmationEmail = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onCall(async (data, context) => {
    await ensureAdminAccess(context);

    const orderId = String(data?.orderId || '').trim();
    const explicitGroupId = String(data?.orderGroupId || '').trim();

    let groupKey = explicitGroupId;
    if (!groupKey && orderId) {
      const orderSnap = await admin.firestore().collection('orders').doc(orderId).get();
      if (!orderSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Order not found');
      }
      groupKey = getOrderGroupKey(orderSnap.data() || {}) || orderId;
    }

    if (!groupKey) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing order id or order group id');
    }

    try {
      return await sendOrderConfirmationEmailForGroup(groupKey, {
        force: true,
        source: 'admin_manual'
      });
    } catch (error) {
      console.error('Manual order email resend failed', error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError('internal', error.message || 'Failed to send email');
    }
  });

exports.sendOrderConfirmationEmailForGroup = sendOrderConfirmationEmailForGroup;
