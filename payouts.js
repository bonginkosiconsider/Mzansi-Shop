const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const normalizePercent = (value, fallback = 0.05) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num > 1 ? num / 100 : num;
};

exports.dailyPayout = functions.pubsub
  .schedule('5 8 * * 1-5')
  .timeZone('Africa/Johannesburg')
  .onRun(async () => {
    const settingsSnap = await admin.firestore().collection('admin').doc('settings').get();
    const commissionPercent = settingsSnap.exists && typeof settingsSnap.data().commissionPercent === 'number'
      ? normalizePercent(settingsSnap.data().commissionPercent)
      : 0.05;
    const round2 = (value) => Math.round(Number(value) * 100) / 100;

    const pendingOrders = await admin.firestore()
      .collection('orders')
      .where('payoutStatus', '==', 'pending')
      .where('status', 'in', ['delivered', 'shipped'])
      .get();

    if (pendingOrders.empty) {
      console.log('No pending payouts');
      return null;
    }

    const payouts = {};
    pendingOrders.docs.forEach((doc) => {
      const order = doc.data();
      const tenantId = order.tenantId;
      if (!tenantId) return;

      const total = round2(order.total || 0);
      const platformFee = Number.isFinite(order.platformFee)
        ? round2(order.platformFee)
        : round2(total * commissionPercent);
      const courierCost = round2(order.shippingCost || 0);
      const computedVendorPayout = Math.max(0, round2(total - platformFee - courierCost));
      let vendorPayout = Number.isFinite(order.vendorPayout)
        ? round2(order.vendorPayout)
        : computedVendorPayout;
      if (Number.isFinite(computedVendorPayout) && vendorPayout > computedVendorPayout + 0.01) {
        vendorPayout = computedVendorPayout;
      }
      vendorPayout = Math.max(0, vendorPayout);

      if (!payouts[tenantId]) {
        payouts[tenantId] = {
          total: 0,
          orders: []
        };
      }
      payouts[tenantId].total += vendorPayout;
      payouts[tenantId].orders.push({ id: doc.id, vendorPayout });
    });

    for (const tenantId of Object.keys(payouts)) {
      const data = payouts[tenantId];

      try {
        const payoutRef = admin.firestore().collection('payouts').doc();
        await payoutRef.set({
          tenantId: tenantId,
          amount: data.total,
          orderCount: data.orders.length,
          status: 'processing',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          processedAt: null
        });

        const batch = admin.firestore().batch();
        data.orders.forEach((order) => {
          const ref = admin.firestore().collection('orders').doc(order.id);
          batch.update(ref, {
            payoutStatus: 'paid',
            payoutId: payoutRef.id,
            payoutDate: admin.firestore.FieldValue.serverTimestamp(),
            vendorPayout: order.vendorPayout
          });
        });
        await batch.commit();

        await payoutRef.update({
          status: 'completed',
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await admin.firestore().collection('tenants').doc(tenantId).update({
          pendingPayout: 0,
          lastPayoutDate: admin.firestore.FieldValue.serverTimestamp(),
          lastPayoutAmount: data.total
        });

        await admin.firestore().collection('notifications').add({
          tenantId: tenantId,
          type: 'payout_complete',
          message: `Your payout of R${data.total.toFixed(2)} has been processed.`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (error) {
        console.error(`Payout failed for ${tenantId}:`, error);
      }
    }

    console.log(`Processed payouts for ${Object.keys(payouts).length} vendors`);
    return null;
  });
