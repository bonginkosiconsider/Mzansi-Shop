import { normalizeReferralCode } from './promoters';
import { PLATFORM_ORIGIN } from './platform';

const STORAGE_KEY = 'mzansishop_promoter_referral';
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export const savePromoterReferralCode = (value) => {
  if (!canUseStorage()) return null;
  const code = normalizeReferralCode(value);
  if (!code) return null;

  const now = Date.now();
  const payload = {
    code,
    capturedAt: now,
    expiresAt: now + REFERRAL_TTL_MS
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload;
};

export const clearStoredPromoterReferral = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const getPromoterReferralCodeFromSearch = (search = '') => {
  const rawSearch =
    typeof search === 'string'
      ? search
      : (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(rawSearch);
  return normalizeReferralCode(params.get('ref') || params.get('promoter'));
};

export const capturePromoterReferralFromSearch = (search = '') => {
  const code = getPromoterReferralCodeFromSearch(search);
  if (!code) return null;
  return savePromoterReferralCode(code);
};

export const getStoredPromoterReferral = () => {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.code || parsed.expiresAt <= Date.now()) {
      clearStoredPromoterReferral();
      return null;
    }
    return parsed;
  } catch (error) {
    clearStoredPromoterReferral();
    return null;
  }
};

export const getStoredPromoterReferralCode = () => getStoredPromoterReferral()?.code || null;

export const appendPromoterReferralToUrl = (url, rawCode) => {
  const code = normalizeReferralCode(rawCode);
  if (!code || !url) return url;

  try {
    const resolved = new URL(
      url,
      typeof window !== 'undefined' ? window.location.origin : PLATFORM_ORIGIN
    );
    resolved.searchParams.set('ref', code);

    if (typeof window !== 'undefined' && resolved.origin === window.location.origin) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }

    return resolved.toString();
  } catch (error) {
    return url;
  }
};
