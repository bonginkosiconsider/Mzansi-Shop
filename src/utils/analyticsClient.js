import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const VISITOR_ID_KEY = 'mz_visitor_id';
const SESSION_ID_KEY = 'mz_session_id';
const DUPLICATE_WINDOW_MS = 1200;

const trackVisit = httpsCallable(functions, 'trackVisit');

let lastTrackedKey = '';
let lastTrackedAt = 0;

const isLocalHost = (host) => host === 'localhost' || host === '127.0.0.1';

const normalizePath = (value) => {
  if (typeof value !== 'string') return '/';
  const trimmed = value.trim();
  if (!trimmed) return '/';
  const withoutQuery = trimmed.split('?')[0].split('#')[0];
  if (withoutQuery.startsWith('/')) return withoutQuery;
  return `/${withoutQuery}`;
};

const shouldTrackPath = (path) =>
  !path.startsWith('/admin') &&
  !path.startsWith('/sell');

const randomId = (prefix) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getOrCreateId = (storage, key, prefix) => {
  if (!storage) return randomId(prefix);
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = randomId(prefix);
  storage.setItem(key, created);
  return created;
};

const getStorage = (name) => {
  try {
    return window[name];
  } catch (error) {
    return null;
  }
};

export async function trackPageVisit({ path, source = 'marketplace', tenantId = null } = {}) {
  if (typeof window === 'undefined') return;

  const host = window.location.hostname || '';
  if (!host || isLocalHost(host)) return;

  const normalizedPath = normalizePath(path || window.location.pathname || '/');
  if (!shouldTrackPath(normalizedPath)) return;

  const now = Date.now();
  const dedupeKey = `${source}:${tenantId || 'none'}:${normalizedPath}`;
  if (dedupeKey === lastTrackedKey && now - lastTrackedAt < DUPLICATE_WINDOW_MS) {
    return;
  }
  lastTrackedKey = dedupeKey;
  lastTrackedAt = now;

  const localStorageRef = getStorage('localStorage');
  const sessionStorageRef = getStorage('sessionStorage');
  const visitorId = getOrCreateId(localStorageRef, VISITOR_ID_KEY, 'v');
  const sessionId = getOrCreateId(sessionStorageRef, SESSION_ID_KEY, 's');

  const payload = {
    path: normalizedPath,
    source,
    tenantId: tenantId || null,
    host: window.location.hostname || '',
    title: document.title || '',
    referrer: document.referrer || '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    language: navigator.language || '',
    visitorId,
    sessionId
  };

  try {
    await trackVisit(payload);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('Visit tracking failed', error);
    }
  }
}
