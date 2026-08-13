const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const isAdminUser = async (context) => {
  if (!context.auth) return false;
  const email = context.auth.token?.email || '';
  if (email === 'admin@mzansishop.com') return true;
  try {
    const adminDoc = await admin.firestore().collection('admins').doc(context.auth.uid).get();
    return adminDoc.exists && adminDoc.data()?.active !== false;
  } catch (error) {
    return false;
  }
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const sumItems = (items) => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((total, item) => {
    const price = toNumber(item?.price);
    const qty = toNumber(item?.quantity) || 1;
    return total + price * qty;
  }, 0);
};

exports.backfillRefundProductTotals = functions.https.onCall(async (data, context) => {
  const isAdmin = await isAdminUser(context);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required');
  }

  const payload = data || {};
  const limit = Math.min(Math.max(toNumber(payload.limit) || 500, 1), 2000);
  const dryRun = payload.dryRun === true;

  let updated = 0;
  let scanned = 0;
  let lastDoc = null;

  while (scanned < limit) {
    let query = admin.firestore()
      .collection('refundRequests')
      .orderBy('createdAt', 'desc')
      .limit(200);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snap = await query.get();
    if (snap.empty) break;

    let batch = admin.firestore().batch();
    let batchOps = 0;

    for (const docSnap of snap.docs) {
      if (scanned >= limit) break;
      scanned += 1;
      const request = docSnap.data() || {};

      let orderTotal = toNumber(request.orderTotal);
      let shippingCost = toNumber(request.shippingCost);
      let productSubtotal = toNumber(request.productSubtotal);

      let computedProduct = productSubtotal;
      let fetchedOrder = null;

      const needsOrder =
        orderTotal <= 0 || shippingCost <= 0 || productSubtotal <= 0 || request.items?.length === 0;

      if (needsOrder && request.orderId) {
        const orderSnap = await admin.firestore().collection('orders').doc(request.orderId).get();
        if (orderSnap.exists) {
          fetchedOrder = orderSnap.data() || {};
        }
      }

      if (fetchedOrder) {
        const orderSubtotal = toNumber(fetchedOrder.subtotal);
        const orderShipping = toNumber(fetchedOrder.shippingCost) || toNumber(fetchedOrder?.courier?.cost);
        const orderTotalDoc = toNumber(fetchedOrder.total);

        if (orderTotal <= 0 && orderTotalDoc > 0) {
          orderTotal = orderTotalDoc;
        }
        if (shippingCost <= 0 && orderShipping > 0) {
          shippingCost = orderShipping;
        }

        if (orderSubtotal > 0) {
          computedProduct = orderSubtotal;
        } else {
          const itemsSum = sumItems(fetchedOrder.items || []);
          if (itemsSum > 0) {
            computedProduct = itemsSum;
          } else if (orderTotalDoc > 0 && orderShipping > 0) {
            computedProduct = Math.max(0, orderTotalDoc - orderShipping);
          }
        }
      } else {
        if (productSubtotal <= 0) {
          const itemsSum = sumItems(request.items || []);
          if (itemsSum > 0) computedProduct = itemsSum;
        }
      }

      const shouldUpdate =
        (computedProduct > 0 && Math.abs(computedProduct - productSubtotal) > 0.01) ||
        (orderTotal > 0 && orderTotal !== toNumber(request.orderTotal)) ||
        (shippingCost > 0 && shippingCost !== toNumber(request.shippingCost));

      if (shouldUpdate) {
        if (!dryRun) {
          batch.update(docSnap.ref, {
            productSubtotal: computedProduct > 0 ? Math.round(computedProduct * 100) / 100 : productSubtotal,
            orderTotal: orderTotal > 0 ? Math.round(orderTotal * 100) / 100 : toNumber(request.orderTotal),
            shippingCost: shippingCost > 0 ? Math.round(shippingCost * 100) / 100 : toNumber(request.shippingCost),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        updated += 1;
        batchOps += 1;
      }

      if (batchOps >= 400) {
        if (!dryRun) {
          await batch.commit();
        }
        batch = admin.firestore().batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0 && !dryRun) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }

  return { scanned, updated, dryRun };
});
