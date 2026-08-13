const normalizeText = (value) => String(value || '').trim();
const normalizeRecord = (record) => (record && typeof record === 'object' ? record : {});

export const getOrderReferenceCodeFromGroupId = (groupId) => {
  const normalizedGroupId = normalizeText(groupId).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return normalizedGroupId ? normalizedGroupId.slice(-6) : '';
};

export const getOrderReferenceCode = (record = {}) => {
  const safeRecord = normalizeRecord(record);
  const directReference = normalizeText(
    safeRecord.orderNumber
    || safeRecord.customerPaymentReference
    || safeRecord.payment?.reference
    || safeRecord.orderGroupRef
  );

  if (directReference) {
    return directReference;
  }

  const groupReference = getOrderReferenceCodeFromGroupId(
    safeRecord.orderGroupId || safeRecord.paymentReference || safeRecord.group
  );
  if (groupReference) {
    return groupReference;
  }

  const fallbackId = normalizeText(safeRecord.orderId || safeRecord.id);
  return fallbackId ? fallbackId.slice(-6).toUpperCase() : '';
};

export const formatOrderReferenceCode = (record = {}, fallback = '------') =>
  getOrderReferenceCode(record) || fallback;
