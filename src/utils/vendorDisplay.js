const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');

const toTitleCase = (value) =>
  normalizeText(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
  const text = normalizeText(value).toLowerCase();
  return text ? GENERIC_VENDOR_LABELS.has(text) : true;
};

const isOpaqueId = (value, blockedIds) => {
  const text = normalizeText(value);
  if (!text) return true;

  const lower = text.toLowerCase();
  if (blockedIds.has(lower)) return true;

  const compact = text.replace(/[-_]/g, '');
  return compact.length >= 20 && /^[a-z0-9]+$/i.test(compact) && !/\s/.test(text);
};

const findItemValue = (order, picker) => {
  if (!Array.isArray(order?.items)) return '';
  const match = order.items
    .map((item) => normalizeText(picker(item)))
    .find(Boolean);
  return match || '';
};

export const getVendorDisplayName = (vendor = null, order = null, fallback = 'Vendor') => {
  const blockedIds = new Set(
    [
      vendor?.id,
      vendor?.ownerId,
      order?.tenantId,
      order?.vendorId,
      order?.storeId
    ]
      .map((value) => normalizeText(value).toLowerCase())
      .filter(Boolean)
  );

  const directMatch = [
    vendor?.name,
    vendor?.displayName,
    vendor?.storeName,
    vendor?.businessName,
    order?.tenantName,
    order?.tenantDisplayName,
    order?.vendorName,
    order?.storeName,
    order?.shopName,
    order?.merchantName,
    findItemValue(order, (item) => item?.tenantName),
    findItemValue(order, (item) => item?.storeName),
    findItemValue(order, (item) => item?.vendorName),
    findItemValue(order, (item) => item?.shopName),
    findItemValue(order, (item) => item?.merchantName)
  ]
    .map(normalizeText)
    .find((value) =>
      value
      && !isOpaqueId(value, blockedIds)
      && !isGenericVendorLabel(value)
    );

  if (directMatch) return directMatch;

  const slugMatch = [
    vendor?.subdomain,
    order?.tenantSubdomain,
    order?.storeSubdomain,
    findItemValue(order, (item) => item?.storeSubdomain)
  ]
    .map(normalizeText)
    .find((value) =>
      value
      && !isOpaqueId(value, blockedIds)
      && !isGenericVendorLabel(value)
    );

  if (slugMatch) return toTitleCase(slugMatch) || slugMatch;

  return isGenericVendorLabel(fallback) ? 'Unknown vendor' : fallback;
};
