const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

export const getOrderLineItems = (order) => {
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
  if (Array.isArray(order?.lineItems) && order.lineItems.length > 0) return order.lineItems;
  return [];
};

export const getOrderItemCount = (order) =>
  getOrderLineItems(order).reduce((sum, item) => {
    const quantity = Math.max(1, toNumber(item?.quantity ?? item?.qty ?? 1));
    return sum + quantity;
  }, 0);

export const getOrderProductSubtotal = (order) => {
  if (!order) return 0;

  const subtotal = toNumber(order.subtotal);
  if (subtotal > 0) return subtotal;

  const itemsTotal = getOrderLineItems(order).reduce((sum, item) => {
    const price = toNumber(item?.price);
    const quantity = Math.max(1, toNumber(item?.quantity ?? item?.qty ?? 1));
    return sum + (price * quantity);
  }, 0);

  if (itemsTotal > 0) return Math.round(itemsTotal * 100) / 100;

  const total = toNumber(order.total);
  const shipping = toNumber(order.shippingCost) || toNumber(order?.courier?.cost);
  if (total > 0) {
    return Math.max(0, Math.round((total - shipping) * 100) / 100);
  }

  return 0;
};

const getTimeValue = (value) =>
  value?.toMillis?.()
  || value?.getTime?.()
  || (typeof value === 'number' ? value : 0);

const derivePaymentStatus = (orders) => {
  const statuses = orders.map((order) => order?.paymentStatus || order?.status || 'pending');
  if (statuses.length === 0) return 'pending';
  if (statuses.every((status) => status === 'paid')) return 'paid';
  if (statuses.some((status) => status === 'failed')) return 'failed';
  return 'pending';
};

const getVendorLabel = (order, item) =>
  item?.storeName
  || item?.vendorName
  || item?.tenantName
  || order?.tenantName
  || order?.vendorName
  || order?.tenantSubdomain
  || '';

export const groupPromoterOrders = (orders = []) => {
  const groups = new Map();

  orders.forEach((order) => {
    if (!order) return;

    const groupId = order.orderGroupId || order.paymentReference || order.id;
    if (!groupId) return;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        orderGroupId: groupId,
        orderGroupRef: order.orderGroupRef || String(groupId).slice(-6).toUpperCase(),
        customerEmail: order.customerEmail || '',
        customerName: order.customerName || '',
        createdAt: order.createdAt || null,
        orders: []
      });
    }

    const group = groups.get(groupId);
    group.orders.push(order);

    if (!group.customerEmail && order.customerEmail) {
      group.customerEmail = order.customerEmail;
    }

    if (!group.customerName && order.customerName) {
      group.customerName = order.customerName;
    }

    if (getTimeValue(order.createdAt) > getTimeValue(group.createdAt)) {
      group.createdAt = order.createdAt;
    }
  });

  return Array.from(groups.values())
    .map((group) => {
      const items = group.orders.flatMap((order) =>
        getOrderLineItems(order).map((item, index) => ({
          ...item,
          _key: `${order.id}-${item?.productId || item?.id || index}`,
          orderId: order.id,
          vendorLabel: getVendorLabel(order, item)
        }))
      );

      const productTotal = group.orders.reduce((sum, order) => sum + getOrderProductSubtotal(order), 0);
      const orderTotal = group.orders.reduce((sum, order) => sum + toNumber(order?.total), 0);
      const itemCount = group.orders.reduce((sum, order) => sum + getOrderItemCount(order), 0);
      const vendorNames = Array.from(
        new Set(group.orders.map((order) => order?.tenantName || order?.tenantSubdomain).filter(Boolean))
      );

      return {
        ...group,
        items,
        itemCount,
        orderTotal: Math.round(orderTotal * 100) / 100,
        productTotal: Math.round(productTotal * 100) / 100,
        vendorNames,
        paymentStatus: derivePaymentStatus(group.orders)
      };
    })
    .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt));
};

export const summarizePromoterSales = (orders = []) => {
  const purchases = groupPromoterOrders(orders);
  const paidPurchases = purchases.filter((purchase) => purchase.paymentStatus === 'paid');
  const failedPurchases = purchases.filter((purchase) => purchase.paymentStatus === 'failed');

  return {
    purchases,
    paidPurchases,
    purchaseCount: purchases.length,
    itemCount: purchases.reduce((sum, purchase) => sum + purchase.itemCount, 0),
    productValue: Math.round(
      purchases.reduce((sum, purchase) => sum + purchase.productTotal, 0) * 100
    ) / 100,
    totalValue: Math.round(
      purchases.reduce((sum, purchase) => sum + purchase.orderTotal, 0) * 100
    ) / 100,
    paidPurchaseCount: paidPurchases.length,
    paidItemCount: paidPurchases.reduce((sum, purchase) => sum + purchase.itemCount, 0),
    paidProductValue: Math.round(
      paidPurchases.reduce((sum, purchase) => sum + purchase.productTotal, 0) * 100
    ) / 100,
    pendingCount: purchases.filter((purchase) => purchase.paymentStatus === 'pending').length,
    failedCount: failedPurchases.length
  };
};
