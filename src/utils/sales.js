export const parseDateValue = (value, isEnd = false) => {
  if (!value) return null;

  if (typeof value === 'string') {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    if (!year || !month || !day) return null;
    return isEnd
      ? new Date(year, month - 1, day, 23, 59, 59, 999)
      : new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  if (typeof value?.toDate === 'function') {
    const date = value.toDate();
    return isEnd
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
      : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  if (value instanceof Date) {
    return isEnd
      ? new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  }

  return null;
};

export const isSaleActive = (product, now = new Date()) => {
  const startDate = parseDateValue(product?.saleStartDate, false);
  const endDate = parseDateValue(product?.saleEndDate, true);

  if (startDate && now < startDate) return false;
  if (endDate && now > endDate) return false;
  return true;
};

const hasActiveVariationSale = (product, now = new Date()) => {
  const variations = Array.isArray(product?.variations) ? product.variations : [];
  if (variations.length === 0) return false;

  return variations.some((variation) => {
    const pricing = resolveSalePricing(variation, now, product);
    return pricing.onSale;
  });
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const collectCandidates = (entity) => {
  if (!entity) return [];
  return [
    toNumber(entity.regularPrice),
    toNumber(entity.originalPrice),
    toNumber(entity.compareAtPrice),
    toNumber(entity.listPrice),
    toNumber(entity.price),
    toNumber(entity.salePrice),
    toNumber(entity.discountPrice)
  ].filter(Boolean);
};

const resolveSaleWindow = (primary, fallback) => ({
  saleStartDate: primary?.saleStartDate ?? fallback?.saleStartDate ?? null,
  saleEndDate: primary?.saleEndDate ?? fallback?.saleEndDate ?? null
});

export const resolveSalePricing = (product, now = new Date(), fallback = null) => {
  const candidates = [
    ...collectCandidates(product),
    ...collectCandidates(fallback)
  ];

  if (candidates.length >= 2) {
    const regular = Math.max(...candidates);
    const sale = Math.min(...candidates);
    const onSale = sale < regular && isSaleActive(resolveSaleWindow(product, fallback), now);

    if (onSale) {
      return {
        price: sale,
        originalPrice: regular,
        onSale: true
      };
    }
  }

  const fallbackPrice = toNumber(product?.price) ?? toNumber(product?.salePrice) ?? toNumber(product?.regularPrice) ?? 0;
  const fallbackOriginal = toNumber(product?.originalPrice);
  return {
    price: Number(fallbackPrice || 0),
    originalPrice: fallbackOriginal ?? null,
    onSale: false
  };
};

export const isProductOnSale = (product, now = new Date()) => {
  const { onSale } = resolveSalePricing(product, now);
  if (onSale) return true;
  return hasActiveVariationSale(product, now);
};
