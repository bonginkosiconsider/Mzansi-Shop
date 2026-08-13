const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

const CONFIG_SECRET_NAME = 'FUNCTIONS_CONFIG_EXPORT';

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
const getYocoSecret = () => {
  const cfg = getConfig();
  const yoco = cfg.yoco || {};
  return yoco.secret_key || yoco.test_secret_key || yoco.secret_key_test || '';
};

exports.createSubscription = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .firestore
  .document('tenants/{tenantId}')
  .onCreate(async (snap, context) => {
    const tenant = snap.data();

    const tomorrow8AM = new Date();
    tomorrow8AM.setDate(tomorrow8AM.getDate() + 1);
    tomorrow8AM.setHours(8, 0, 0, 0);

    await admin.firestore().collection('subscriptions').add({
      tenantId: context.params.tenantId,
      amount: 100.0,
      status: 'active',
      nextBillingDate: admin.firestore.Timestamp.fromDate(tomorrow8AM),
      failedAttempts: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Subscription created for tenant:', tenant ? tenant.name : context.params.tenantId);
  });

exports.processSubscriptions = functions
  .runWith({ secrets: [CONFIG_SECRET_NAME] })
  .pubsub
  .schedule('0 8 * * *')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('Weekend - skipping subscription processing');
      return null;
    }

    const today = admin.firestore.Timestamp.now();

    const dueSubs = await admin.firestore()
      .collection('subscriptions')
      .where('nextBillingDate', '<=', today)
      .where('status', 'in', ['active', 'past_due'])
      .get();

    for (const doc of dueSubs.docs) {
      const sub = doc.data();
      await chargeSubscription(doc.id, sub);
    }

    return null;
  });

async function chargeSubscription(subId, sub) {
  try {
    const YOCO_SECRET_KEY = getYocoSecret();
    if (!YOCO_SECRET_KEY) {
      throw new Error('Yoco secret key not set in functions config');
    }
    const tenant = await admin.firestore()
      .collection('tenants')
      .doc(sub.tenantId)
      .get();

    const tenantData = tenant.data() || {};

    const paymentRequest = await fetch('https://online.yoco.com/v1/payment-requests', {
      method: 'POST',
      headers: {
        'X-Auth-Secret-Key': YOCO_SECRET_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amountInCents: 10000,
        currency: 'ZAR',
        description: `MzansiShop Monthly Rent - ${tenantData.name || 'Vendor'}`,
        metadata: {
          tenantId: sub.tenantId,
          subscriptionId: subId,
          type: 'monthly_rent'
        }
      })
    });

    const result = await paymentRequest.json();

    if (result.id) {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setHours(8, 0, 0, 0);

      await admin.firestore().collection('subscriptions').doc(subId).update({
        nextBillingDate: admin.firestore.Timestamp.fromDate(nextMonth),
        lastPaymentRequestId: result.id,
        failedAttempts: 0
      });

      await admin.firestore().collection('notifications').add({
        tenantId: sub.tenantId,
        type: 'payment_request',
        message: `Your R100 monthly rent payment request is ready. Pay here: ${result.url}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Subscription charge failed:', error);

    const nextFailedAttempts = (sub.failedAttempts || 0) + 1;
    const nextStatus = nextFailedAttempts >= 3 ? 'suspended' : 'past_due';

    await admin.firestore().collection('subscriptions').doc(subId).update({
      failedAttempts: nextFailedAttempts,
      status: nextStatus
    });

    if (nextFailedAttempts >= 3) {
      await admin.firestore().collection('tenants').doc(sub.tenantId).update({
        isActive: false,
        suspensionReason: 'Non-payment of monthly rent'
      });
    }
  }
}
