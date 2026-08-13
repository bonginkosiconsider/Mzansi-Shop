const DEFAULT_PLATFORM_ORIGIN = 'https://mzansishop.co.za';

const parseOrigin = (value) => {
  try {
    return new URL(value);
  } catch (error) {
    return new URL(DEFAULT_PLATFORM_ORIGIN);
  }
};

const configuredPlatformUrl = String(import.meta.env.VITE_PLATFORM_URL || '').trim();
const platformUrl = parseOrigin(configuredPlatformUrl || DEFAULT_PLATFORM_ORIGIN);
const configuredRootHost = platformUrl.hostname.replace(/^www\./i, '').toLowerCase();

export const PLATFORM_ORIGIN = platformUrl.origin.replace(/\/$/, '');
export const PLATFORM_ROOT_HOSTS = Array.from(
  new Set([configuredRootHost, 'mzansishop.co.za', 'mzansishop.com'])
).filter(Boolean);
export const PLATFORM_HOSTS = Array.from(
  new Set(
    PLATFORM_ROOT_HOSTS.flatMap((host) => [host, `www.${host}`])
  )
);

export const isLocalHost = (host = '') => {
  const normalizedHost = String(host || '').toLowerCase();
  return normalizedHost === 'localhost' || normalizedHost === '127.0.0.1';
};

export const isPlatformHost = (host = '') =>
  PLATFORM_HOSTS.includes(String(host || '').toLowerCase());

export const isPlatformSubdomainHost = (host = '', subdomains = []) => {
  const normalizedHost = String(host || '').toLowerCase();
  return PLATFORM_ROOT_HOSTS.some((rootHost) =>
    subdomains.some((subdomain) => normalizedHost === `${subdomain}.${rootHost}`)
  );
};
