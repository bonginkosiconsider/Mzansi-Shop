import { isLocalHost, isPlatformHost, PLATFORM_ORIGIN, PLATFORM_ROOT_HOSTS } from './platform';

export const SOCIAL_PLATFORMS = [
  'Instagram',
  'TikTok',
  'Facebook',
  'YouTube',
  'X',
  'WhatsApp',
  'Telegram',
  'LinkedIn',
  'Other'
];

export const MIN_PROMOTER_FOLLOWERS = 1000;
export const BANK_OPTIONS = [
  { value: 'fnb', label: 'FNB' },
  { value: 'absa', label: 'ABSA' },
  { value: 'nedbank', label: 'Nedbank' },
  { value: 'standard', label: 'Standard Bank' },
  { value: 'capitec', label: 'Capitec' },
  { value: 'tymebank', label: 'TymeBank' }
];

export const normalizeReferralCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);

export const createReferralCodeSuggestion = (value = '') => {
  const source = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const base = source.slice(0, 6) || 'PROMO';
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return normalizeReferralCode(`${base}${suffix}`);
};

const getDefaultPromoterOrigin = () => {
  if (typeof window === 'undefined') return PLATFORM_ORIGIN;

  const { origin, hostname } = window.location;
  if (isLocalHost(hostname)) {
    return origin;
  }

  const normalizedHost = String(hostname || '').toLowerCase();
  if (isPlatformHost(normalizedHost)) {
    return PLATFORM_ORIGIN;
  }

  if (PLATFORM_ROOT_HOSTS.some((rootHost) => normalizedHost.endsWith(`.${rootHost}`))) {
    return PLATFORM_ORIGIN;
  }

  return origin || PLATFORM_ORIGIN;
};

export const buildReferralLink = (code, origin) => {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return '';
  const baseOrigin = origin || getDefaultPromoterOrigin();
  return `${baseOrigin}/?ref=${encodeURIComponent(normalized)}`;
};

export const formatBankName = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Not provided';
  return BANK_OPTIONS.find((option) => option.value === normalized)?.label || value;
};

export const formatZAR = (value) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));

export const formatFollowerCount = (value) =>
  new Intl.NumberFormat('en-ZA', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
