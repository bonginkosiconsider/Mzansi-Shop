const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const express = require('express');
const path = require('path');

admin.initializeApp();

const app = express();

const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'api', 'app', 'dashboard', 'sell', 'vendor']);
const ROOT_HOSTS = new Set([
  'mzansishop.com',
  'www.mzansishop.com',
  'mzansishop.co.za',
  'www.mzansishop.co.za'
]);
const PLATFORM_SUFFIXES = ['.mzansishop.com', '.mzansishop.co.za'];

app.use(async (req, res, next) => {
  const hostHeader = (req.headers.host || '').toLowerCase();
  const host = hostHeader.split(':')[0];

  if (!host || ROOT_HOSTS.has(host)) {
    req.tenantId = null;
    return next();
  }

  const suffix = PLATFORM_SUFFIXES.find((item) => host.endsWith(item));
  const subdomain = suffix ? host.slice(0, -suffix.length) : host;

  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) {
    req.tenantId = null;
    return next();
  }

  try {
    const tenantSnap = await admin.firestore()
      .collection('tenants')
      .where('subdomain', '==', subdomain)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!tenantSnap.empty) {
      req.tenantId = tenantSnap.docs[0].id;
      req.tenantData = tenantSnap.docs[0].data();
    } else {
      req.tenantId = 'not-found';
    }
  } catch (error) {
    console.error('Subdomain lookup error:', error);
    req.tenantId = 'error';
  }

  next();
});

app.get('/api/store-data', async (req, res) => {
  if (!req.tenantId || req.tenantId === 'not-found') {
    return res.status(404).json({ error: 'Store not found' });
  }

  try {
    const products = await admin.firestore()
      .collection('tenants')
      .doc(req.tenantId)
      .collection('products')
      .where('isPublished', '==', true)
      .get();

    res.json({
      tenant: req.tenantData || null,
      products: products.docs.map((d) => ({ id: d.id, ...d.data() }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('*', async (req, res) => {
  if (req.tenantId === 'not-found') {
    return res.status(404).send('Store not found');
  }

  if (req.tenantId === 'error') {
    return res.status(500).send('Server error');
  }

  if (!req.tenantId) {
    return res.sendFile(path.join(__dirname, '../hosting/dist/marketplace.html'));
  }

  const html = await generateStorefront(req.tenantId, req.tenantData || {});
  res.send(html);
});

exports.subdomainRouter = functions.https.onRequest(app);

exports.createCheckout = require('./payments').createCheckout;
exports.createReturnCheckout = require('./payments').createReturnCheckout;
exports.processPayment = require('./payments').processPayment;
exports.markOrderGroupPaid = require('./payments').markOrderGroupPaid;
exports.yocoWebhook = require('./payments').yocoWebhook;
exports.adjustPromoterBalance = require('./promoters').adjustPromoterBalance;
exports.requestPromoterCashout = require('./promoters').requestPromoterCashout;
exports.reviewPromoterCashoutRequest = require('./promoters').reviewPromoterCashoutRequest;
exports.backfillRefundProductTotals = require('./refunds').backfillRefundProductTotals;
exports.createSubscription = require('./subscriptions').createSubscription;
exports.processSubscriptions = require('./subscriptions').processSubscriptions;
exports.dailyPayout = require('./payouts').dailyPayout;
exports.generateWaybill = require('./couriers').generateWaybill;
exports.getCourierRates = require('./couriers').getCourierRates;
exports.trackVisit = require('./analytics').trackVisit;
exports.sendOrderConfirmationEmail = require('./emails').sendOrderConfirmationEmail;
exports.getAdminUpdateAudiencePreview = require('./emails').getAdminUpdateAudiencePreview;
exports.getAdminUpdateRecipientList = require('./emails').getAdminUpdateRecipientList;
exports.sendAdminUpdateEmail = require('./emails').sendAdminUpdateEmail;
exports.resendWebhook = require('./emails').resendWebhook;

// callable function to add/update payment methods (bypasses client rules)
exports.savePaymentMethod = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be signed in');
  }

  const email = String(context.auth.token?.email || '').trim().toLowerCase();
  const allowedEmails = new Set(['admin@mzansishop.com', 'bonginkosiconsider@gmail.com']);
  if (!allowedEmails.has(email)) {
    const adminSnap = await admin.firestore().collection('admins').doc(context.auth.uid).get();
    if (!adminSnap.exists || adminSnap.data()?.active === false) {
      throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
    }
  }

  const { methodId, payload } = data;
  try {
    if (methodId) {
      await admin.firestore().collection('paymentMethods').doc(methodId).update(payload);
    } else {
      await admin.firestore().collection('paymentMethods').add(payload);
    }
    return { success: true };
  } catch (error) {
    console.error('savePaymentMethod error', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function generateStorefront(tenantId, tenantData) {
  const title = escapeHtml(tenantData.name || 'Store');
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title} | MzansiShop</title>
        <meta name="tenant-id" content="${tenantId}">
      </head>
      <body>
        <div id="root"></div>
        <script>
          window.TENANT_DATA = ${JSON.stringify(tenantData)};
          window.TENANT_ID = "${tenantId}";
        </script>
        <script src="/static/js/storefront.js"></script>
      </body>
    </html>
  `;
}
