const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { sendOrderConfirmationEmailForGroup } = require('./emails');

const CONFIG_SECRET_NAME = 'FUNCTIONS_CONFIG_EXPORT';
const MANUAL_PAYMENT_TYPES = new Set(['bank', 'manual_eft', 'eft', 'bank_transfer']);
const DEFAULT_RETURN_COURIER_FEE = 350;

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
const getYocoConfig = () => {
  const cfg = getConfig();
  const yoco = cfg.yoco || {};
  return {
    YOCO_SECRET_LIVE: yoco.secret_key || '',
    YOCO_SECRET_TEST: yoco.test_secret_key || yoco.secret_key_test || '',
    YOCO_WEBHOOK_SECRET_LIVE: yoco.webhook_secret || '',
    YOCO_WEBHOOK_SECRET_TEST: yoco.test_webhook_secret || yoco.webhook_secret_test || ''
  };
};

const resolveYocoConfig = async () => {
  try {
    const settingsSnap = await admin.firestore().collection('admin').doc('settings').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const mode = settings?.yocoMode === 'test' ? 'test' : 'live';
    const {
      YOCO_SECRET_LIVE,
      YOCO_SECRET_TEST,
      YOCO_WEBHOOK_SECRET_LIVE,
      YOCO_WEBHOOK_SECRET_TEST
    } = getYocoConfig();
    const secretKey = mode === 'test'
      ? (YOCO_SECRET_TEST || YOCO_SECRET_LIVE)
      : (YOCO_SECRET_LIVE || YOCO_SECRET_TEST);
    const webhookSecret = mode === 'test'
      ? (YOCO_WEBHOOK_SECRET_TEST || YOCO_WEBHOOK_SECRET_LIVE)
      : (YOCO_WEBHOOK_SECRET_LIVE || YOCO_WEBHOOK_SECRET_TEST);
    return { mode, secretKey, webhookSecret };
  } catch (error) {
    console.error('Failed to load yoco mode from settings', error);
    const {
      YOCO_SECRET_LIVE,
      YOCO_SECRET_TEST,
      YOCO_WEBHOOK_SECRET_LIVE,
      YOCO_WEBHOOK_SECRET_TEST
    } = getYocoConfig();
    return {
      mode: 'live',
      secretKey: YOCO_SECRET_LIVE || YOCO_SECRET_TEST,
      webhookSecret: YOCO_WEBHOOK_SECRET_LIVE || YOCO_WEBHOOK_SECRET_TEST
    };
  }
};

const normalizeReferralCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const getConfiguredReturnCourierFee = async () => {
  const publicSnap = await admin.firestore().collection('public').doc('courier').get();
  const publicData = publicSnap.exists ? publicSnap.data() || {} : {};
  const publicFee = toNumber(
    publicData?.courierSettings?.returnCourierFee ?? publicData?.returnCourierFee,
    NaN
  );
  if (Number.isFinite(publicFee) && publicFee > 0) return round2(publicFee);

  const settingsSnap = await admin.firestore().collection('admin').doc('settings').get();
  const settingsData = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const settingsFee = toNumber(
    settingsData?.courierSettings?.returnCourierFee ?? settingsData?.returnCourierFee,
    NaN
  );
  if (Number.isFinite(settingsFee) && settingsFee > 0) return round2(settingsFee);

  return DEFAULT_RETURN_COURIER_FEE;
};

const normalizeText = (value) => String(value || '').trim();

const isManualPaymentType = (type) =>
  MANUAL_PAYMENT_TYPES.has(normalizeText(type).toLowerCase());

const normalizeManualPaymentConfig = (config = {}) => ({
  bankName: normalizeText(config.bankName || config.bank || config.bank_name),
  accountName: normalizeText(
    config.accountName || config.accountHolder || config.account_holder || config.beneficiaryName
  ),
  accountNumber: normalizeText(config.accountNumber || config.account_number),
  accountType: normalizeText(config.accountType || config.account_type),
  branchCode: normalizeText(config.branchCode || config.branch_code),
  referencePrefix: normalizeText(config.referencePrefix || config.reference_prefix || 'MZS'),
  instructions: normalizeText(config.instructions || config.note || config.notes)
});

const buildCustomerPaymentReference = (orderGroupRef, orderGroupId) => {
  const normalizedOrderRef = normalizeText(orderGroupRef).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (normalizedOrderRef) return normalizedOrderRef;

  const normalizedGroupId = normalizeText(orderGroupId).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return normalizedGroupId ? normalizedGroupId.slice(-6) : '';
};

const normalizeRequestedOrderGroupId = (value) => {
  const normalized = normalizeText(value).replace(/[^A-Za-z0-9]/g, '');
  return /^[A-Za-z0-9]{20}$/.test(normalized) ? normalized : '';
};

const loadPaymentMethodById = async (methodId) => {
  const normalizedMethodId = normalizeText(methodId);
  if (!normalizedMethodId) return null;

  const methodSnap = await admin.firestore().collection('paymentMethods').doc(normalizedMethodId).get();
  if (!methodSnap.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'Selected payment method no longer exists');
  }

  const data = methodSnap.data() || {};
  if (data.isActive === false) {
    throw new functions.https.HttpsError('failed-precondition', 'Selected payment method is inactive');
  }

  const type = normalizeText(data.type || normalizedMethodId).toLowerCase();
  return {
    id: methodSnap.id,
    label: normalizeText(data.label || 'Direct EFT'),
    description: normalizeText(data.description),
    type,
    config: normalizeManualPaymentConfig(data.config || {})
  };
};

const getOrderGroupKeyFromOrder = (order = {}, fallbackId = null) =>
  order.orderGroupId || order.paymentReference || order.id || fallbackId || null;

const loadOrdersForGroupKey = async (groupKey) => {
  const normalizedGroupKey = normalizeText(groupKey);
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

const ensureAdminAccess = async (context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const email = normalizeText(context.auth.token?.email).toLowerCase();
  if (email === 'admin@mzansishop.com' || email === 'bonginkosiconsider@gmail.com') {
    return email;
  }

  const adminSnap = await admin.firestore().collection('admins').doc(context.auth.uid).get();
  if (!adminSnap.exists || adminSnap.data()?.active === false) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  return email || 'admin';
};

const normalizePercent = (value, fallback = 0.05) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num > 1 ? num / 100 : num;
};

const isPaidOrderLike = (order = {}) =>
  String(order.paymentStatus || order.status || '').toLowerCase() === 'paid';

const getLineItemCount = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + Math.max(1, Number(item?.quantity || item?.qty || 1)),
    0
  );

const getOrderProductSubtotal = (order = {}) => {
  const subtotal = Number(order.subtotal || 0);
  if (Number.isFinite(subtotal) && subtotal > 0) return subtotal;

  const items = Array.isArray(order.items)
    ? order.items
    : (Array.isArray(order.lineItems) ? order.lineItems : []);

  const total = items.reduce((sum, item) => {
    const price = Number(item?.price || 0);
    const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1));
    return sum + (Number.isFinite(price) ? price * quantity : 0);
  }, 0);

  return Math.round(total * 100) / 100;
};

const getPromoterCreditAmount = (order = {}, commissionPercent = 0.05) =>
  round2(Math.max(0, getOrderProductSubtotal(order)) * normalizePercent(commissionPercent));

const trackPromoterCredit = (map, order = {}, commissionPercent = 0.05) => {
  if (order.promoterAttributionSource === 'wallet_owner') return;

  const promoterId = order.promoterId || null;
  if (!promoterId) return;

  const items = Array.isArray(order.items)
    ? order.items
    : (Array.isArray(order.lineItems) ? order.lineItems : []);
  const productSubtotal = Math.max(0, getOrderProductSubtotal({ ...order, items }));
  const itemCount = getLineItemCount(items);
  const orderGroupId = order.orderGroupId || order.paymentReference || order.id || null;
  const orderGroupRef = order.orderGroupRef || (orderGroupId ? String(orderGroupId).slice(-6).toUpperCase() : null);
  const creditAmount = getPromoterCreditAmount({ ...order, items }, commissionPercent);

  const current = map.get(promoterId) || {
    revenue: 0,
    itemCount: 0,
    orderGroups: new Set(),
    orderGroupIds: new Set(),
    orderGroupRefs: new Set(),
    creditAmount: 0
  };

  current.revenue = round2(current.revenue + productSubtotal);
  current.itemCount += itemCount;
  if (orderGroupId) {
    current.orderGroups.add(orderGroupId);
    current.orderGroupIds.add(orderGroupId);
  }
  if (orderGroupRef) {
    current.orderGroupRefs.add(orderGroupRef);
  }
  current.creditAmount = round2(current.creditAmount + creditAmount);

  map.set(promoterId, current);
};

const resolvePromoterAttribution = async (rawCode) => {
  const promoterCode = normalizeReferralCode(rawCode);
  if (!promoterCode) return null;

  const codeSnap = await admin.firestore().collection('promoterCodes').doc(promoterCode).get();
  if (codeSnap.exists) {
    const codeData = codeSnap.data() || {};
    if (codeData.status !== 'inactive' && codeData.promoterId) {
      const promoterSnap = await admin.firestore().collection('promoters').doc(codeData.promoterId).get();
      if (promoterSnap.exists) {
        const promoterData = promoterSnap.data() || {};
        const promoterStatus = String(promoterData.status || '').toLowerCase();
        if (
          promoterStatus !== 'inactive'
          && promoterStatus !== 'disabled'
          && promoterStatus !== 'rejected'
        ) {
          return {
            promoterId: codeData.promoterId,
            promoterCode,
            promoterName: promoterData.name || null,
            promoterHandle: promoterData.socialHandle || null,
            promoterPlatform: promoterData.socialPlatform || null,
            promoterProfileUrl: promoterData.profileUrl || null
          };
        }
      }
    }
  }

  const promoterFallbackSnap = await admin.firestore()
    .collection('promoters')
    .where('referralCode', '==', promoterCode)
    .limit(1)
    .get();

  if (promoterFallbackSnap.empty) return null;

  const promoterDoc = promoterFallbackSnap.docs[0];
  const promoterData = promoterDoc.data() || {};
  const promoterStatus = String(promoterData.status || '').toLowerCase();
  if (promoterStatus === 'inactive' || promoterStatus === 'disabled' || promoterStatus === 'rejected') {
    return null;
  }

  return {
    promoterId: promoterDoc.id,
    promoterCode,
    promoterName: promoterData.name || null,
    promoterHandle: promoterData.socialHandle || null,
    promoterPlatform: promoterData.socialPlatform || null,
    promoterProfileUrl: promoterData.profileUrl || null
  };
};

const resolvePromoterAttributionById = async (promoterId) => {
  const normalizedId = String(promoterId || '').trim();
  if (!normalizedId) return null;

  const promoterSnap = await admin.firestore().collection('promoters').doc(normalizedId).get();
  if (!promoterSnap.exists) return null;

  const promoterData = promoterSnap.data() || {};
  const promoterStatus = String(promoterData.status || '').toLowerCase();
  if (promoterStatus === 'inactive' || promoterStatus === 'disabled' || promoterStatus === 'rejected') {
    return null;
  }

  return {
    promoterId: promoterSnap.id,
    promoterCode: normalizeReferralCode(promoterData.referralCode),
    promoterName: promoterData.name || null,
    promoterHandle: promoterData.socialHandle || null,
    promoterPlatform: promoterData.socialPlatform || null,
    promoterProfileUrl: promoterData.profileUrl || null
  };
};

const addProductSales = (map, items, fallbackTenantId) => {
  if (!Array.isArray(items)) return;
  items.forEach((item) => {
    if (!item) return;
    const tenantId = item.tenantId || item.vendorId || fallbackTenantId || null;
    const productId = item.productId || item.id || null;
    const quantity = Number(item.quantity ?? item.qty ?? 0);
    if (!tenantId || !productId || !Number.isFinite(quantity) || quantity <= 0) return;
    const key = `${tenantId}::${productId}`;
    const current = map.get(key) || { tenantId, productId, quantity: 0 };
    current.quantity += quantity;
    map.set(key, current);
  });
};

const normalizeVendorText = (value) => (typeof value === 'string' ? value.trim() : '');

const GENERIC_VENDOR_LABELS = new Set([
  'vendor',
  'seller',
  'store',
  'shop',
  'merchant',
  'unknown',
  'unknown vendor',
  'n/a',
  'na',
  'none'
]);

const isGenericVendorLabel = (value) => {
  const text = normalizeVendorText(value).toLowerCase();
  return text ? GENERIC_VENDOR_LABELS.has(text) : true;
};

const isOpaqueVendorId = (value, blockedIds = new Set()) => {
  const text = normalizeVendorText(value);
  if (!text) return true;

  const lower = text.toLowerCase();
  if (blockedIds.has(lower)) return true;

  const compact = text.replace(/[-_]/g, '');
  return compact.length >= 20 && /^[a-z0-9]+$/i.test(compact) && !/\s/.test(text);
};

const resolveVendorDisplayName = (vendor, vendorId, vendorItems = []) => {
  const blockedIds = new Set(
    [vendorId, vendor?.ownerId]
      .map((value) => normalizeVendorText(value).toLowerCase())
      .filter(Boolean)
  );

  const itemLabel = vendorItems
    .map((item) =>
      normalizeVendorText(
        item?.storeName
        || item?.vendorName
        || item?.tenantName
        || item?.shopName
        || item?.merchantName
      )
    )
    .find(Boolean);

  const directMatch = [
    vendor?.name,
    vendor?.displayName,
    vendor?.storeName,
    vendor?.businessName,
    itemLabel
  ]
    .map(normalizeVendorText)
    .find((value) =>
      value
      && !isOpaqueVendorId(value, blockedIds)
      && !isGenericVendorLabel(value)
    );

  if (directMatch) return directMatch;

  const slugMatch = [vendor?.subdomain]
    .map(normalizeVendorText)
    .find((value) =>
      value
      && !isOpaqueVendorId(value, blockedIds)
      && !isGenericVendorLabel(value)
    );

  return slugMatch || '';
};

const queueProductSalesUpdates = async (batch, productSales) => {
  const updates = Array.from(productSales.values());
  if (updates.length === 0) return;

  const productRefs = updates.map((entry) =>
    admin.firestore()
      .collection('tenants')
      .doc(entry.tenantId)
      .collection('products')
      .doc(entry.productId)
  );

  const productSnaps = await admin.firestore().getAll(...productRefs);
  productSnaps.forEach((snap, idx) => {
    if (!snap.exists) {
      console.warn('Missing product for sales update', {
        tenantId: updates[idx].tenantId,
        productId: updates[idx].productId
      });
      return;
    }
    batch.update(productRefs[idx], {
      soldCount: admin.firestore.FieldValue.increment(updates[idx].quantity)
    });
  });
};

const getCommissionPercent = async () => {
  const settingsSnap = await admin.firestore().collection('admin').doc('settings').get();
  return settingsSnap.exists && typeof settingsSnap.data().commissionPercent === 'number'
    ? normalizePercent(settingsSnap.data().commissionPercent)
    : 0.05;
};

const queueTenantAggregateUpdates = (batch, tenantIncrements) => {
  tenantIncrements.forEach((values, tenantId) => {
    const sales = round2(values?.sales);
    const payout = round2(values?.payout);
    const orders = Number(values?.orders || 0);

    if (!tenantId || (sales === 0 && payout === 0 && orders === 0)) {
      return;
    }

    const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
    batch.set(
      tenantRef,
      {
        totalSales: admin.firestore.FieldValue.increment(sales),
        totalOrders: admin.firestore.FieldValue.increment(orders),
        pendingPayout: admin.firestore.FieldValue.increment(payout)
      },
      { merge: true }
    );
  });
};

const queuePromoterCreditUpdates = (batch, promoterCredits, source = 'system') => {
  promoterCredits.forEach((values, promoterId) => {
    const revenue = round2(values?.revenue);
    const creditAmount = round2(values?.creditAmount);
    const itemCount = Number(values?.itemCount || 0);
    const orderCount = values?.orderGroups instanceof Set ? values.orderGroups.size : 0;

    if (!promoterId || (revenue <= 0 && creditAmount <= 0 && itemCount <= 0 && orderCount <= 0)) {
      return;
    }

    const promoterRef = admin.firestore().collection('promoters').doc(promoterId);
    const promoterUpdate = {
      referredRevenue: admin.firestore.FieldValue.increment(revenue),
      referredItemCount: admin.firestore.FieldValue.increment(itemCount),
      referredOrderCount: admin.firestore.FieldValue.increment(orderCount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (creditAmount > 0) {
      promoterUpdate.availableBalance = admin.firestore.FieldValue.increment(creditAmount);
      promoterUpdate.lifetimeCredited = admin.firestore.FieldValue.increment(creditAmount);
      promoterUpdate.lastCreditedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    batch.set(promoterRef, promoterUpdate, { merge: true });

    if (creditAmount > 0) {
      const orderGroupIds = Array.from(values?.orderGroupIds || []);
      const orderGroupRefs = Array.from(values?.orderGroupRefs || []);
      const transactionRef = admin.firestore().collection('promoterTransactions').doc();
      batch.set(transactionRef, {
        promoterId,
        amount: creditAmount,
        type: 'referral_credit',
        reason: orderGroupRefs.length === 1
          ? `Referral order credit (${orderGroupRefs[0]})`
          : 'Referral order credit',
        orderGroupId: orderGroupIds.length === 1 ? orderGroupIds[0] : null,
        orderGroupIds,
        orderGroupRefs,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: source
      });
    }
  });
};

const queuePromoterWalletRelease = (batch, orders, reason = 'payment_failed') => {
  const reservations = new Map();

  orders.forEach(({ ref, data }) => {
    if (!data || data.promoterWalletStatus !== 'reserved' || !data.promoterWalletOwnerId) return;

    const amount = round2(data.promoterWalletAmountTotal);
    if (amount <= 0) return;

    const groupId = data.orderGroupId || data.paymentReference || ref.id;
    if (!reservations.has(groupId)) {
      reservations.set(groupId, {
        promoterId: data.promoterWalletOwnerId,
        amount,
        refs: []
      });
    }

    reservations.get(groupId).refs.push(ref);
  });

  reservations.forEach((reservation) => {
    const promoterRef = admin.firestore().collection('promoters').doc(reservation.promoterId);
    batch.set(
      promoterRef,
      {
        availableBalance: admin.firestore.FieldValue.increment(reservation.amount),
        walletHeldBalance: admin.firestore.FieldValue.increment(-reservation.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    reservation.refs.forEach((ref) => {
      batch.update(ref, {
        promoterWalletStatus: 'released',
        promoterWalletReleasedAt: admin.firestore.FieldValue.serverTimestamp(),
        promoterWalletReleaseReason: reason,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });
};

const queuePromoterWalletSettlement = (batch, orders, source = 'system') => {
  const reservations = new Map();

  orders.forEach(({ ref, data }) => {
    if (!data || data.promoterWalletStatus !== 'reserved' || !data.promoterWalletOwnerId) return;

    const amount = round2(data.promoterWalletAmountTotal);
    if (amount <= 0) return;

    const groupId = data.orderGroupId || data.paymentReference || ref.id;
    if (!reservations.has(groupId)) {
      reservations.set(groupId, {
        promoterId: data.promoterWalletOwnerId,
        amount,
        refs: []
      });
    }

    reservations.get(groupId).refs.push(ref);
  });

  reservations.forEach((reservation, groupId) => {
    const promoterRef = admin.firestore().collection('promoters').doc(reservation.promoterId);
    batch.set(
      promoterRef,
      {
        walletHeldBalance: admin.firestore.FieldValue.increment(-reservation.amount),
        lifetimeWalletSpent: admin.firestore.FieldValue.increment(reservation.amount),
        lastWalletSpentAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const transactionRef = admin.firestore().collection('promoterTransactions').doc();
    batch.set(transactionRef, {
      promoterId: reservation.promoterId,
      amount: -reservation.amount,
      type: 'wallet_purchase',
      reason: 'Promoter balance used at checkout',
      orderGroupId: groupId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: source
    });

    reservation.refs.forEach((ref) => {
      batch.update(ref, {
        promoterWalletStatus: 'applied',
        promoterWalletAppliedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
  });
};

const finalizeManualOrderGroupPayment = async (orderEntries, options = {}) => {
  if (!Array.isArray(orderEntries) || orderEntries.length === 0) {
    throw new functions.https.HttpsError('not-found', 'Order group not found');
  }

  const commissionPercent = await getCommissionPercent();
  const batch = admin.firestore().batch();
  const unpaidEntries = orderEntries.filter(({ data }) => !isPaidOrderLike(data));
  const tenantIncrements = new Map();
  const productIncrements = new Map();
  const promoterCredits = new Map();
  const verifiedAt = admin.firestore.FieldValue.serverTimestamp();
  const actor = normalizeText(options.actor) || 'admin';
  const source = normalizeText(options.source) || 'admin_manual_eft';

  unpaidEntries.forEach(({ ref, data }) => {
    const total = Number(data.total || 0);
    const externalAmount = round2(
      typeof data.externalPaymentAmount === 'number'
        ? data.externalPaymentAmount
        : total
    );
    const externalGroupAmount = round2(
      typeof data.externalPaymentAmountTotal === 'number'
        ? data.externalPaymentAmountTotal
        : externalAmount
    );
    const walletAmount = round2(data.promoterWalletAmount);
    const platformFee = typeof data.platformFee === 'number'
      ? data.platformFee
      : round2(total * commissionPercent);
    const courierCost = round2(Number(data.shippingCost || 0));
    const vendorPayout = typeof data.vendorPayout === 'number'
      ? data.vendorPayout
      : round2(total - platformFee - courierCost);
    const lineItems = Array.isArray(data.items) && data.items.length > 0
      ? data.items
      : (Array.isArray(data.lineItems) ? data.lineItems : []);
    const promoterId = data.promoterId || null;
    const currentPayment = data.payment && typeof data.payment === 'object' ? data.payment : {};
    const paymentProvider = normalizeText(
      options.provider || currentPayment.provider || data.paymentProvider || 'manual_eft'
    ) || 'manual_eft';
    const paymentMethod = normalizeText(
      options.method || currentPayment.method || data.paymentMethod || 'bank_transfer'
    ) || 'bank_transfer';
    const paymentReference = normalizeText(
      currentPayment.reference
      || data.customerPaymentReference
      || data.orderGroupRef
      || getOrderGroupKeyFromOrder(data, ref.id)
    );

    batch.update(ref, {
      paymentStatus: 'paid',
      status: 'paid',
      paymentProvider,
      paymentMethod,
      approvalStatus: 'approved',
      vendorVisible: true,
      approvedAt: verifiedAt,
      approvedBy: actor,
      platformFee,
      vendorPayout,
      payment: {
        ...currentPayment,
        provider: paymentProvider,
        method: paymentMethod,
        status: 'paid',
        amount: externalAmount,
        groupAmount: externalGroupAmount,
        walletAmount,
        orderTotal: total,
        currency: currentPayment.currency || 'ZAR',
        reference: paymentReference,
        verifiedBy: actor,
        verifiedAt
      },
      paidAt: verifiedAt,
      paymentError: admin.firestore.FieldValue.delete(),
      promoterAttributedAt: promoterId ? verifiedAt : (data.promoterAttributedAt || null),
      updatedAt: verifiedAt
    });

    if (data.tenantId) {
      const current = tenantIncrements.get(data.tenantId) || { sales: 0, payout: 0, orders: 0 };
      tenantIncrements.set(data.tenantId, {
        sales: current.sales + total,
        payout: current.payout + vendorPayout,
        orders: current.orders + 1
      });
    }

    addProductSales(productIncrements, lineItems, data.tenantId);

    if (promoterId) {
      trackPromoterCredit(
        promoterCredits,
        {
          ...data,
          items: lineItems,
          orderGroupId: getOrderGroupKeyFromOrder(data, ref.id)
        },
        commissionPercent
      );
    }
  });

  if (unpaidEntries.length > 0) {
    queuePromoterWalletSettlement(batch, unpaidEntries, source);
    await queueProductSalesUpdates(batch, productIncrements);
    queueTenantAggregateUpdates(batch, tenantIncrements);
    queuePromoterCreditUpdates(batch, promoterCredits, source);
    await batch.commit();
  }

  const primaryOrder = orderEntries[0]?.data || {};
  const orderGroupId = getOrderGroupKeyFromOrder(primaryOrder, orderEntries[0]?.ref?.id);
  const emailResult = await sendOrderConfirmationEmailForGroup(orderGroupId, {
    source
  }).catch((error) => {
    console.error('Manual EFT order confirmation email failed', {
      orderGroupId,
      error: error.message
    });
    return { error: error.message };
  });

  return {
    orderGroupId,
    updatedCount: unpaidEntries.length,
    emailResult
  };
};

exports.createCheckout = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const payload = data || {};
  const tenantId = payload.tenantId || null;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const shippingCost = toNumber(payload.shippingCost || 0);
  const couponDiscount = toNumber(payload.couponDiscount || 0);
  const paymentMethod = payload.paymentMethod || '';

  try {
    const mapAddress = (address = {}) => ({
      fullName: address.fullName || address.name || '',
      email: address.email || '',
      phone: address.phone || '',
      line1: address.line1 || address.street || '',
      line2: address.line2 || address.suburb || '',
      city: address.city || '',
      state: address.state || address.province || '',
      postalCode: address.zip || address.postalCode || '',
      country: address.country || 'ZA'
    });
    const mapLegacyAddress = (address = {}) => ({
      street: address.line1 || address.street || '',
      suburb: address.line2 || address.suburb || '',
      city: address.city || '',
      postalCode: address.postalCode || address.zip || ''
    });

    const normalizedItems = items.map((item) => ({
      tenantId: item.tenantId || item.vendorId || tenantId,
      productId: item.productId || item.id || null,
      name: item.name || 'Item',
      storeName: item.storeName || item.vendorName || null,
      storeSubdomain: item.storeSubdomain || null,
      quantity: Math.max(1, toNumber(item.quantity, 1)),
      price: toNumber(item.price, 0),
      image: item.image || null,
      sku: item.sku || null,
      variationId: item.variationId || null,
      selectedVariations: item.selectedVariations || {},
      weight: item.weight ?? item.weightKg ?? null,
      dimensions: item.dimensions || null,
      length: item.length ?? null,
      width: item.width ?? null,
      height: item.height ?? null,
      shippingClass: item.shippingClass || null
    }));

    if (normalizedItems.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No items in cart');
    }

    if (normalizedItems.some((item) => !item.tenantId)) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing vendor on one or more items');
    }

    const shippingAddress = mapAddress(payload.shippingAddress || {});
    const billingAddress = payload.billingAddress ? mapAddress(payload.billingAddress) : null;
    const adminSettingsSnap = await admin.firestore().collection('admin').doc('settings').get();
    const adminSettings = adminSettingsSnap.exists ? adminSettingsSnap.data() || {} : {};
    const configuredCourierProvider = String(
      adminSettings?.courierSettings?.provider
      || adminSettings?.courierProvider
      || ''
    ).toLowerCase();
    const courierInput = payload.courier && typeof payload.courier === 'object'
      ? payload.courier
      : null;
    const courier = courierInput
      ? {
          id: String(courierInput.id || '').trim(),
          provider: String(courierInput.provider || '').trim(),
          providerName: String(courierInput.providerName || '').trim() || null,
          defaultService: String(courierInput.defaultService || '').trim() || null,
          serviceCode: String(courierInput.serviceCode || '').trim() || null,
          serviceName: String(courierInput.serviceName || '').trim() || null,
          deliveryTime: String(courierInput.deliveryTime || '').trim() || null,
          label: String(courierInput.label || '').trim() || null,
          cost: shippingCost
        }
      : null;
    const shippingAddressComplete =
      String(shippingAddress.fullName || '').trim()
      && String(shippingAddress.email || '').trim()
      && String(shippingAddress.phone || '').trim()
      && String(shippingAddress.line1 || '').trim()
      && String(shippingAddress.city || '').trim()
      && String(shippingAddress.postalCode || '').trim()
      && String(shippingAddress.country || '').trim();

    if (!shippingAddressComplete) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Delivery address is incomplete'
      );
    }

    if (!courier?.id || !courier?.provider) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Select a courier service before checking out'
      );
    }

    if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Courier fee must be greater than 0 before checkout'
      );
    }

    if (
      configuredCourierProvider
      && configuredCourierProvider !== 'none'
      && courier.provider.toLowerCase() !== configuredCourierProvider
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Selected courier service does not match the configured provider'
      );
    }

    if (
      courier.provider.toLowerCase() === 'thecourierguy'
      && !courier.serviceCode
      && !courier.defaultService
    ) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Select a valid Courier Guy service before checking out'
      );
    }

    const grouped = normalizedItems.reduce((acc, item) => {
      if (!acc[item.tenantId]) acc[item.tenantId] = [];
      acc[item.tenantId].push(item);
      return acc;
    }, {});

    const vendorIds = Object.keys(grouped);
    const vendorRefs = vendorIds.map((id) => admin.firestore().collection('tenants').doc(id));
    const vendorSnaps = await admin.firestore().getAll(...vendorRefs);
    const vendorMap = new Map();
    vendorSnaps.forEach((snap) => {
      vendorMap.set(snap.id, snap.exists ? snap.data() : {});
    });

    const totalSubtotal = normalizedItems.reduce(
      (sum, item) => sum + round2(item.price * item.quantity),
      0
    );

    const computedTotal = round2(totalSubtotal + shippingCost - couponDiscount);
    if (!Number.isFinite(computedTotal) || computedTotal <= 0) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Order total must be greater than 0',
        { totalSubtotal, shippingCost, couponDiscount }
      );
    }

    const promoterWalletRequested = payload.usePromoterBalance === true || toNumber(payload.promoterBalanceToUse) > 0;
    let promoterWalletAmountTotal = 0;
    let promoterWalletOwnerId = null;
    if (promoterWalletRequested) {
      const promoterWalletSnap = await admin.firestore().collection('promoters').doc(context.auth.uid).get();
      if (promoterWalletSnap.exists) {
        const promoterWalletData = promoterWalletSnap.data() || {};
        const availableBalance = round2(promoterWalletData.availableBalance);
        const requestedAmount = round2(
          toNumber(payload.promoterBalanceToUse, availableBalance > 0 ? availableBalance : 0)
        );
        promoterWalletAmountTotal = Math.min(
          availableBalance,
          computedTotal,
          requestedAmount > 0 ? requestedAmount : availableBalance
        );
        if (promoterWalletAmountTotal > 0) {
          promoterWalletOwnerId = context.auth.uid;
        }
      }
    }

    const externalAmountToCharge = round2(computedTotal - promoterWalletAmountTotal);
    if (externalAmountToCharge > 0 && !paymentMethod) {
      throw new functions.https.HttpsError('invalid-argument', 'Payment method required');
    }

    let selectedPaymentMethod = null;
    let manualPaymentDetails = null;
    if (externalAmountToCharge > 0) {
      selectedPaymentMethod = await loadPaymentMethodById(paymentMethod);
      if (!selectedPaymentMethod || !isManualPaymentType(selectedPaymentMethod.type)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Only direct EFT payment methods are supported for checkout right now'
        );
      }
    }

    const commissionPercent = await getCommissionPercent();
    let promoterAttribution = await resolvePromoterAttribution(
      payload.promoterCode || payload.referralCode || payload.ref
    );
    if (!promoterAttribution && promoterWalletOwnerId) {
      promoterAttribution = await resolvePromoterAttributionById(promoterWalletOwnerId);
    }

    const requestedOrderGroupId = normalizeRequestedOrderGroupId(
      payload.requestedOrderGroupId || payload.orderGroupId
    );
    if (requestedOrderGroupId) {
      const existingGroupSnap = await admin.firestore()
        .collection('orders')
        .where('orderGroupId', '==', requestedOrderGroupId)
        .limit(1)
        .get();
      if (!existingGroupSnap.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Order reference already exists. Refresh checkout and try again.'
        );
      }

      const directOrderSnap = await admin.firestore().collection('orders').doc(requestedOrderGroupId).get();
      if (directOrderSnap.exists) {
        throw new functions.https.HttpsError(
          'already-exists',
          'Order reference already exists. Refresh checkout and try again.'
        );
      }
    }

    const orderGroupId = requestedOrderGroupId || admin.firestore().collection('orders').doc().id;
    const orderGroupRef = orderGroupId.slice(-6).toUpperCase();
    const orderNumber = buildCustomerPaymentReference(orderGroupRef, orderGroupId);
    if (selectedPaymentMethod) {
      manualPaymentDetails = {
        paymentMethodId: selectedPaymentMethod.id,
        paymentMethodLabel: selectedPaymentMethod.label || 'Direct EFT',
        paymentMethodType: selectedPaymentMethod.type || 'bank',
        amount: externalAmountToCharge,
        currency: 'ZAR',
        reference: orderNumber,
        bankName: selectedPaymentMethod.config.bankName,
        accountName: selectedPaymentMethod.config.accountName,
        accountNumber: selectedPaymentMethod.config.accountNumber,
        accountType: selectedPaymentMethod.config.accountType,
        branchCode: selectedPaymentMethod.config.branchCode,
        instructions: selectedPaymentMethod.config.instructions
      };
    }
    const createdAt = admin.firestore.FieldValue.serverTimestamp();

    const orders = [];
    let remainingShipping = round2(shippingCost);
    let remainingDiscount = round2(couponDiscount);
    let remainingWallet = round2(promoterWalletAmountTotal);
    let remainingExternal = round2(externalAmountToCharge);

    vendorIds.forEach((vendorId, index) => {
      const vendorItems = grouped[vendorId] || [];
      const vendorSubtotal = round2(
        vendorItems.reduce((sum, item) => sum + round2(item.price * item.quantity), 0)
      );
      const isLast = index === vendorIds.length - 1;
      const share = totalSubtotal > 0 ? vendorSubtotal / totalSubtotal : 1 / vendorIds.length;
      const shippingShare = isLast ? remainingShipping : round2(shippingCost * share);
      const discountShare = isLast ? remainingDiscount : round2(couponDiscount * share);
      const walletShare = isLast ? remainingWallet : round2(promoterWalletAmountTotal * share);
      const externalShare = isLast ? remainingExternal : round2(externalAmountToCharge * share);
      remainingShipping = round2(remainingShipping - shippingShare);
      remainingDiscount = round2(remainingDiscount - discountShare);
      remainingWallet = round2(remainingWallet - walletShare);
      remainingExternal = round2(remainingExternal - externalShare);
      const total = round2(vendorSubtotal + shippingShare - discountShare);
      const platformFee = round2(total * commissionPercent);
      const vendorPayout = round2(total - platformFee - shippingShare);

      const vendor = vendorMap.get(vendorId) || {};
      const orderRef = admin.firestore().collection('orders').doc();
      const vendorDisplayName = resolveVendorDisplayName(vendor, vendorId, vendorItems);

      orders.push({
        ref: orderRef,
        data: {
          id: orderRef.id,
          orderGroupId,
          orderGroupRef,
          orderNumber,
          paymentReference: orderGroupId,
          orderGroupTotal: computedTotal,
          orderGroupVendorCount: vendorIds.length,
          tenantId: vendorId,
          tenantName: vendorDisplayName || null,
          tenantSubdomain: vendor.subdomain || null,
          tenantEmail: vendor.email || null,
          customerId: context.auth.uid,
          customerName: shippingAddress.fullName || null,
          customerEmail: shippingAddress.email || context.auth.token?.email || null,
          customerPhone: shippingAddress.phone || null,
          promoterId: promoterAttribution?.promoterId || null,
          promoterCode: promoterAttribution?.promoterCode || null,
          promoterName: promoterAttribution?.promoterName || null,
          promoterHandle: promoterAttribution?.promoterHandle || null,
          promoterPlatform: promoterAttribution?.promoterPlatform || null,
          promoterProfileUrl: promoterAttribution?.promoterProfileUrl || null,
          promoterAttributionSource: promoterAttribution
            ? (promoterAttribution.promoterId === promoterWalletOwnerId ? 'wallet_owner' : 'referral_code')
            : null,
          customerAddress: mapLegacyAddress(shippingAddress),
          shippingAddress,
          billingAddress,
          items: vendorItems,
          subtotal: vendorSubtotal,
          shippingCost: shippingShare,
          discount: discountShare,
          total,
          courier,
          platformFee,
          vendorPayout,
          paymentProvider: externalAmountToCharge > 0 ? (manualPaymentDetails?.paymentMethodType || 'manual_eft') : 'promoter_wallet',
          paymentMethod: externalAmountToCharge > 0
            ? (manualPaymentDetails ? 'bank_transfer' : (paymentMethod || null))
            : 'promoter_balance',
          paymentMethodId: externalAmountToCharge > 0 ? (manualPaymentDetails?.paymentMethodId || paymentMethod) : null,
          paymentMethodLabel: externalAmountToCharge > 0 ? (manualPaymentDetails?.paymentMethodLabel || null) : 'Promoter Balance',
          paymentMethodType: externalAmountToCharge > 0 ? (manualPaymentDetails?.paymentMethodType || null) : 'promoter_balance',
          customerPaymentReference: externalAmountToCharge > 0 ? (manualPaymentDetails?.reference || null) : null,
          externalPaymentAmount: externalShare,
          externalPaymentAmountTotal: externalAmountToCharge,
          promoterWalletOwnerId,
          promoterWalletAmount: walletShare,
          promoterWalletAmountTotal,
          promoterWalletStatus: promoterWalletAmountTotal > 0
            ? (externalAmountToCharge > 0 ? 'reserved' : 'applied')
            : 'none',
          paymentStatus: externalAmountToCharge > 0 ? 'pending' : 'paid',
          approvalStatus: externalAmountToCharge > 0 ? 'pending' : 'approved',
          vendorVisible: externalAmountToCharge <= 0,
          approvedAt: externalAmountToCharge <= 0 ? createdAt : null,
          approvedBy: externalAmountToCharge <= 0 ? 'auto' : null,
          paidAt: externalAmountToCharge <= 0 ? createdAt : null,
          status: externalAmountToCharge > 0 ? 'pending' : 'paid',
          payment: externalAmountToCharge > 0
            ? {
                provider: 'manual_eft',
                method: 'bank_transfer',
                status: 'awaiting_verification',
                amount: round2(externalShare || 0),
                groupAmount: externalAmountToCharge,
                walletAmount: walletShare,
                orderTotal: total,
                currency: 'ZAR',
                reference: manualPaymentDetails?.reference || null,
                paymentMethodId: manualPaymentDetails?.paymentMethodId || paymentMethod,
                paymentMethodLabel: manualPaymentDetails?.paymentMethodLabel || null
              }
            : {
                provider: 'promoter_wallet',
                method: 'promoter_balance',
                status: 'paid',
                amount: 0,
                walletAmount: walletShare,
                orderTotal: total,
                currency: 'ZAR'
              },
          createdAt,
          updatedAt: createdAt
        }
      });
    });

    await admin.firestore().runTransaction(async (transaction) => {
      if (promoterWalletAmountTotal > 0 && promoterWalletOwnerId) {
        const promoterWalletRef = admin.firestore().collection('promoters').doc(promoterWalletOwnerId);
        const promoterWalletSnap = await transaction.get(promoterWalletRef);
        if (!promoterWalletSnap.exists) {
          throw new functions.https.HttpsError('failed-precondition', 'Promoter wallet not found');
        }

        const availableBalance = round2(promoterWalletSnap.data()?.availableBalance);
        if (availableBalance < promoterWalletAmountTotal) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'Promoter balance changed. Refresh checkout and try again.'
          );
        }

        if (externalAmountToCharge > 0) {
          transaction.set(
            promoterWalletRef,
            {
              availableBalance: admin.firestore.FieldValue.increment(-promoterWalletAmountTotal),
              walletHeldBalance: admin.firestore.FieldValue.increment(promoterWalletAmountTotal),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );
        } else {
          transaction.set(
            promoterWalletRef,
            {
              availableBalance: admin.firestore.FieldValue.increment(-promoterWalletAmountTotal),
              lifetimeWalletSpent: admin.firestore.FieldValue.increment(promoterWalletAmountTotal),
              lastWalletSpentAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            { merge: true }
          );

          const walletTransactionRef = admin.firestore().collection('promoterTransactions').doc();
          transaction.set(walletTransactionRef, {
            promoterId: promoterWalletOwnerId,
            amount: -promoterWalletAmountTotal,
            type: 'wallet_purchase',
            reason: 'Promoter balance used at checkout',
            orderGroupId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.token?.email || 'system'
          });
        }
      }

      orders.forEach(({ ref, data }) => transaction.set(ref, data));
    });

    if (externalAmountToCharge <= 0) {
      const successBatch = admin.firestore().batch();
      const productSales = new Map();
      const promoterCredits = new Map();

      orders.forEach(({ data }) => {
        const tenantRef = admin.firestore().collection('tenants').doc(data.tenantId);
        successBatch.set(
          tenantRef,
          {
            totalSales: admin.firestore.FieldValue.increment(data.total),
            totalOrders: admin.firestore.FieldValue.increment(1),
            pendingPayout: admin.firestore.FieldValue.increment(data.vendorPayout)
          },
          { merge: true }
        );

        addProductSales(productSales, data.items, data.tenantId);

        if (data.promoterId) {
          trackPromoterCredit(promoterCredits, data, commissionPercent);
        }
      });

      await queueProductSalesUpdates(successBatch, productSales);
      queuePromoterCreditUpdates(successBatch, promoterCredits, 'checkout_auto_paid');

      await successBatch.commit();
      await sendOrderConfirmationEmailForGroup(orderGroupId, {
        source: 'checkout_auto_paid'
      }).catch((error) => {
        console.error('Auto-paid order confirmation email failed', {
          orderGroupId,
          error: error.message
        });
      });

      return {
        paidWithPromoterBalance: true,
        orderGroupId,
        orderGroupRef,
        orderNumber,
        orderIds: orders.map((o) => o.ref.id),
        remainingAmount: 0
      };
    }

    return {
      requiresManualPayment: true,
      manualPayment: manualPaymentDetails,
      orderGroupId,
      orderGroupRef,
      orderNumber,
      orderIds: orders.map((o) => o.ref.id),
      remainingAmount: externalAmountToCharge,
      promoterWalletAmount: promoterWalletAmountTotal,
      paymentMethodId: manualPaymentDetails?.paymentMethodId || paymentMethod || null,
      customerPaymentReference: manualPaymentDetails?.reference || null
    };
  } catch (error) {
    console.error('Checkout error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.createReturnCheckout = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const payload = data || {};
  const refundRequestId = payload.refundRequestId;
  if (!refundRequestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing refund request id');
  }

  const requestRef = admin.firestore().collection('refundRequests').doc(refundRequestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Refund request not found');
  }

  const request = requestSnap.data() || {};
  if (request.customerId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not allowed');
  }
  if (request.status === 'cancelled') {
    throw new functions.https.HttpsError('failed-precondition', 'Return request cancelled');
  }
  if (request.courierFeePaid === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Refund application fee already paid');
  }

  const courierFee = await getConfiguredReturnCourierFee();
  if (!Number.isFinite(courierFee) || courierFee <= 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Refund application fee must be greater than 0');
  }

  const { mode, secretKey: YOCO_SECRET_KEY } = await resolveYocoConfig();
  if (!YOCO_SECRET_KEY) {
    throw new functions.https.HttpsError('failed-precondition', 'Missing Yoco secret key');
  }

  try {
    const idempotencyKey = payload.idempotencyKey || crypto.randomUUID();
    const body = {
      amount: Math.round(courierFee * 100),
      currency: 'ZAR',
      clientReferenceId: `return-${refundRequestId}`,
      metadata: {
        type: 'return_fee',
        refundRequestId,
        orderId: request.orderId || null,
        tenantId: request.tenantId || null,
        customerId: request.customerId,
        yocoMode: mode
      }
    };

    if (payload.successUrl) body.successUrl = payload.successUrl;
    if (payload.cancelUrl) body.cancelUrl = payload.cancelUrl;
    if (payload.failureUrl) body.failureUrl = payload.failureUrl;

    const response = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    let checkout = null;
    try {
      checkout = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      checkout = null;
    }

    if (!response.ok || !checkout?.redirectUrl) {
      await requestRef.update({
        paymentStatus: 'failed',
        paymentError:
          checkout?.message
          || checkout?.error?.message
          || responseText
          || 'Unable to create checkout',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      throw new Error(
        checkout?.message
        || checkout?.error?.message
        || responseText
        || 'Unable to create checkout'
      );
    }

    await requestRef.update({
      courierFee,
      paymentProvider: 'yoco',
      paymentStatus: 'pending',
      yocoCheckoutId: checkout.id,
      payment: {
        provider: 'yoco',
        status: 'pending',
        checkoutId: checkout.id,
        amount: courierFee,
        currency: 'ZAR'
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      redirectUrl: checkout.redirectUrl,
      checkoutId: checkout.id
    };
  } catch (error) {
    console.error('Return checkout error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.processPayment = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login required');
  }

  const payload = data || {};
  const token = payload.token;
  const tenantId = payload.tenantId;
  const items = payload.items || [];
  const amount = Number(payload.amount);

  if (!token || !tenantId || !amount || Number.isNaN(amount)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payment data');
  }

  try {
    const { secretKey: YOCO_SECRET_KEY } = await resolveYocoConfig();
    if (!YOCO_SECRET_KEY) {
      throw new functions.https.HttpsError('failed-precondition', 'Missing Yoco secret key');
    }
    const charge = await fetch('https://online.yoco.com/v1/charges/', {
      method: 'POST',
      headers: {
        'X-Auth-Secret-Key': YOCO_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: token,
        amountInCents: Math.round(amount * 100),
        currency: 'ZAR'
      })
    });

    const chargeData = await charge.json();

    if (!chargeData.id) {
      throw new Error('Payment failed: ' + JSON.stringify(chargeData));
    }

    const round2 = (value) => Math.round(Number(value) * 100) / 100;
    const platformFee = round2(amount * 0.05);
    const shippingCost = round2(payload.shippingCost || 0);
    const vendorAmount = round2(amount - platformFee - shippingCost);

    const orderRef = admin.firestore().collection('orders').doc();
    await orderRef.set({
      id: orderRef.id,
      tenantId: tenantId,
      customerId: context.auth.uid,
      items: items,
      total: amount,
      shippingCost,
      platformFee: platformFee,
      vendorPayout: vendorAmount,
      yocoChargeId: chargeData.id,
      status: 'paid',
      paymentStatus: 'paid',
      approvalStatus: 'approved',
      vendorVisible: true,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvedBy: 'auto',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      payoutStatus: 'pending'
    });

    await admin.firestore().collection('tenants').doc(tenantId).set(
      {
        totalSales: admin.firestore.FieldValue.increment(amount),
        totalOrders: admin.firestore.FieldValue.increment(1),
        pendingPayout: admin.firestore.FieldValue.increment(vendorAmount)
      },
      { merge: true }
    );

    const productSales = new Map();
    addProductSales(productSales, items, tenantId);
    if (productSales.size > 0) {
      const salesBatch = admin.firestore().batch();
      await queueProductSalesUpdates(salesBatch, productSales);
      await salesBatch.commit();
    }

    return { success: true, orderId: orderRef.id };
  } catch (error) {
    console.error('Payment error:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.markOrderGroupPaid = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onCall(async (data, context) => {
    const groupKey = normalizeText(data?.orderGroupId || data?.orderId);

    try {
      const actorEmail = await ensureAdminAccess(context);
      if (!groupKey) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing order group id or order id');
      }

      const orderEntries = await loadOrdersForGroupKey(groupKey);
      if (!orderEntries.length) {
        throw new functions.https.HttpsError('not-found', 'Order group not found');
      }

      const result = await finalizeManualOrderGroupPayment(orderEntries, {
        actor: actorEmail,
        source: 'admin_manual_eft',
        provider: 'manual_eft',
        method: 'bank_transfer'
      });

      return {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('markOrderGroupPaid failed', {
        groupKey,
        orderId: normalizeText(data?.orderId),
        actor: normalizeText(context?.auth?.token?.email) || context?.auth?.uid || 'anonymous',
        message: error?.message || 'Unknown error',
        stack: error?.stack || null
      });

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', error?.message || 'Failed to mark order group paid');
    }
  });

function verifyYocoWebhookWithSecrets(req, secrets) {
  const signatureHeader = req.get('webhook-signature') || '';
  const webhookId = req.get('webhook-id');
  const webhookTimestamp = req.get('webhook-timestamp');
  if (!signatureHeader || !webhookId || !webhookTimestamp) {
    throw new Error('Missing webhook headers');
  }

  const timestamp = Number(webhookTimestamp);
  if (!Number.isFinite(timestamp)) {
    throw new Error('Invalid webhook timestamp');
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 180) {
    throw new Error('Webhook timestamp too old');
  }

  const rawBody = req.rawBody ? req.rawBody.toString() : '';
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  const signatures = signatureHeader
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf(',');
      return idx >= 0 ? part.slice(idx + 1) : part;
    });

  const candidates = (Array.isArray(secrets) ? secrets : [])
    .filter((entry) => entry && entry.secret)
    .map((entry) => ({
      mode: entry.mode,
      secret: entry.secret
    }));

  if (!candidates.length) {
    throw new Error('Missing Yoco webhook secret');
  }

  for (const candidate of candidates) {
    const secretParts = candidate.secret.split('_');
    const secretBase64 = secretParts.length > 1 ? secretParts.slice(1).join('_') : candidate.secret;
    const secretBytes = Buffer.from(secretBase64, 'base64');
    const expected = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    const expectedBuf = Buffer.from(expected);
    const matched = signatures.some((sig) => {
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expectedBuf);
    });

    if (matched) {
      return candidate.mode || 'unknown';
    }
  }

  throw new Error('Invalid webhook signature');
}

exports.yocoWebhook = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .https.onRequest(async (req, res) => {
  let webhookMode = 'unknown';
  try {
    const {
      YOCO_WEBHOOK_SECRET_LIVE,
      YOCO_WEBHOOK_SECRET_TEST
    } = getYocoConfig();
    webhookMode = verifyYocoWebhookWithSecrets(req, [
      { mode: 'live', secret: YOCO_WEBHOOK_SECRET_LIVE },
      { mode: 'test', secret: YOCO_WEBHOOK_SECRET_TEST }
    ]);
  } catch (error) {
    console.error('Yoco webhook verification failed', error.message);
    return res.status(400).send('Invalid webhook');
  }

  const event = req.body || {};
  const eventType = event.type;
  const payload = event.payload || event.data || {};
  const checkoutId =
    payload?.metadata?.checkoutId ||
    payload?.metadata?.checkout_id ||
    payload?.checkoutId ||
    payload?.checkout_id ||
    payload?.checkout?.id ||
    null;

  if (!checkoutId) {
    console.warn('Webhook missing checkoutId');
    return res.status(200).send('OK');
  }

  try {
    console.log('Yoco webhook verified', { webhookMode, eventType, checkoutId });

    const refundSnap = await admin.firestore()
      .collection('refundRequests')
      .where('yocoCheckoutId', '==', checkoutId)
      .get();

    if (!refundSnap.empty) {
      const batch = admin.firestore().batch();
      refundSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const alreadyPaid = data.courierFeePaid === true || data.paymentStatus === 'paid';

        if (eventType === 'payment.succeeded' || payload.status === 'succeeded') {
          if (!alreadyPaid) {
            batch.update(docSnap.ref, {
              courierFeePaid: true,
              courierFeePaidAt: admin.firestore.FieldValue.serverTimestamp(),
              status: 'requested',
              paymentStatus: 'paid',
              payment: {
                provider: 'yoco',
                status: 'paid',
                checkoutId,
                amount: Number(data.courierFee || 0),
                currency: payload.currency || 'ZAR'
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } else if (eventType === 'payment.failed' || payload.status === 'failed') {
          if (!alreadyPaid) {
            batch.update(docSnap.ref, {
              paymentStatus: 'failed',
              paymentError: payload?.failureReason || payload?.status || 'failed',
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      });

      await batch.commit();
      return res.status(200).send('OK');
    }

    const ordersSnap = await admin.firestore()
      .collection('orders')
      .where('yocoCheckoutId', '==', checkoutId)
      .get();

    if (ordersSnap.empty) {
      console.warn('No orders found for checkoutId', checkoutId);
      return res.status(200).send('OK');
    }

    const commissionPercent = await getCommissionPercent();

    const batch = admin.firestore().batch();
    const orderEntries = ordersSnap.docs.map((docSnap) => ({
      ref: docSnap.ref,
      data: docSnap.data() || {}
    }));
    const tenantIncrements = new Map();
    const productIncrements = new Map();
    const promoterCredits = new Map();

    orderEntries.forEach(({ ref, data }) => {
      const alreadyPaid = data.paymentStatus === 'paid';
      const total = Number(data.total || 0);
      const externalAmount = round2(
        typeof data.externalPaymentAmount === 'number'
          ? data.externalPaymentAmount
          : total
      );
      const walletAmount = round2(data.promoterWalletAmount);

      if (eventType === 'payment.succeeded' || payload.status === 'succeeded') {
        if (!alreadyPaid) {
          const platformFee = typeof data.platformFee === 'number'
            ? data.platformFee
            : Math.round(total * commissionPercent * 100) / 100;
          const courierCost = Math.round(Number(data.shippingCost || 0) * 100) / 100;
          const vendorPayout = typeof data.vendorPayout === 'number'
            ? data.vendorPayout
            : Math.round((total - platformFee - courierCost) * 100) / 100;

          const lineItems = Array.isArray(data.items) && data.items.length > 0
            ? data.items
            : (Array.isArray(data.lineItems) ? data.lineItems : []);
          const promoterId = data.promoterId || null;
          const orderGroupKey = data.orderGroupId || ref.id;

          batch.update(ref, {
            paymentStatus: 'paid',
            status: 'paid',
            approvalStatus: 'approved',
            vendorVisible: true,
            approvedAt: admin.firestore.FieldValue.serverTimestamp(),
            approvedBy: 'auto',
            platformFee,
            vendorPayout,
            payment: {
              provider: 'yoco',
              method: payload?.paymentMethodDetails?.type || data.paymentMethod || 'yoco',
              status: 'paid',
              checkoutId,
              amount: externalAmount,
              walletAmount,
              orderTotal: total,
              currency: payload.currency || 'ZAR'
            },
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
            paymentEventId: event.id || null,
            promoterAttributedAt: promoterId ? admin.firestore.FieldValue.serverTimestamp() : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          const tenantId = data.tenantId;
          if (tenantId) {
            const current = tenantIncrements.get(tenantId) || { sales: 0, payout: 0, orders: 0 };
            tenantIncrements.set(tenantId, {
              sales: current.sales + total,
              payout: current.payout + vendorPayout,
              orders: current.orders + 1
            });
          }

          addProductSales(productIncrements, lineItems, data.tenantId);

          if (promoterId) {
            trackPromoterCredit(
              promoterCredits,
              {
                ...data,
                items: lineItems,
                orderGroupId: orderGroupKey
              },
              commissionPercent
            );
          }
        }
      } else if (eventType === 'payment.failed' || payload.status === 'failed') {
        if (!alreadyPaid) {
          batch.update(ref, {
            paymentStatus: 'failed',
            status: 'failed',
            paymentError: payload?.failureReason || payload?.status || 'failed',
            payment: {
              provider: 'yoco',
              method: data.paymentMethod || 'yoco',
              status: 'failed',
              checkoutId,
              amount: externalAmount,
              walletAmount,
              orderTotal: total,
              currency: payload.currency || 'ZAR'
            },
            paymentEventId: event.id || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });

    if (eventType === 'payment.succeeded' || payload.status === 'succeeded') {
      queuePromoterWalletSettlement(batch, orderEntries, 'yoco_webhook');
    } else if (eventType === 'payment.failed' || payload.status === 'failed') {
      queuePromoterWalletRelease(batch, orderEntries, 'payment_failed');
    }

    await queueProductSalesUpdates(batch, productIncrements);

    queueTenantAggregateUpdates(batch, tenantIncrements);
    queuePromoterCreditUpdates(batch, promoterCredits, 'yoco_webhook');

    await batch.commit();
    const groupsToEmail = Array.from(
      new Set(
        orderEntries
          .filter(({ data }) => isPaidOrderLike(data))
          .map(({ data, ref }) => data.orderGroupId || data.paymentReference || ref.id)
          .filter(Boolean)
      )
    );
    for (const groupKey of groupsToEmail) {
      await sendOrderConfirmationEmailForGroup(groupKey, {
        source: 'yoco_webhook'
      }).catch((error) => {
        console.error('Webhook order confirmation email failed', {
          groupKey,
          error: error.message
        });
      });
    }
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error', error);
    return res.status(500).send('Webhook error');
  }
});
