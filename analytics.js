const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const crypto = require('crypto');

const MAX_TEXT = 500;
const MAX_ID = 128;

const cleanText = (value, maxLength = MAX_TEXT) => {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.slice(0, maxLength);
};

const cleanId = (value) => {
  const text = cleanText(value, MAX_ID);
  if (!text) return '';
  if (!/^[a-zA-Z0-9._-]+$/.test(text)) return '';
  return text;
};

const hashKey = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizePath = (value) => {
  let path = cleanText(value, 1000);
  if (!path) return '/';

  try {
    if (/^https?:\/\//i.test(path)) {
      const parsed = new URL(path);
      path = parsed.pathname || '/';
    }
  } catch (error) {
    // Keep best-effort value.
  }

  path = path.split('?')[0].split('#')[0];
  if (!path.startsWith('/')) path = `/${path}`;
  return path.slice(0, 300) || '/';
};

const normalizeReferrer = (value) => {
  const referrer = cleanText(value, 1000);
  if (!referrer) return '';
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
};

const readHeader = (headers, key) => {
  const direct = headers[key];
  if (Array.isArray(direct)) return cleanText(direct[0], 120);
  return cleanText(direct, 120);
};

const decodeHeaderText = (value) => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
};

const getRequestIp = (headers = {}, req = null) => {
  const forwarded = readHeader(headers, 'x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const reqIp = req?.ip || req?.socket?.remoteAddress || '';
  return cleanText(reqIp, 120);
};

const getGeoFromHeaders = (headers = {}) => {
  const country = decodeHeaderText(readHeader(headers, 'x-appengine-country') || readHeader(headers, 'cf-ipcountry'));
  const region = decodeHeaderText(readHeader(headers, 'x-appengine-region'));
  const city = decodeHeaderText(readHeader(headers, 'x-appengine-city'));

  return {
    country: country && country !== 'ZZ' ? country : '',
    region: region && region !== 'ZZ' ? region : '',
    city: city && city !== 'ZZ' ? city : ''
  };
};

const getFunnelStage = (path) => {
  if (path === '/') return 'landing';
  if (path.startsWith('/product/')) return 'product';
  if (path.startsWith('/cart')) return 'cart';
  if (path.startsWith('/checkout')) return 'checkout';
  if (path.startsWith('/order-success')) return 'purchase';
  if (path.startsWith('/search')) return 'search';
  return 'browse';
};

const toDayKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

exports.trackVisit = functions.https.onCall(async (data, context) => {
  const payload = data || {};
  const rawReq = context.rawRequest || {};
  const headers = rawReq.headers || {};

  const path = normalizePath(payload.path || '/');
  const title = cleanText(payload.title, 140);
  const referrerHost = normalizeReferrer(payload.referrer);
  const host = cleanText(payload.host, 180).toLowerCase();
  const source = cleanText(payload.source, 40) || 'marketplace';
  const tenantId = cleanId(payload.tenantId);
  const timezone = cleanText(payload.timezone, 80);
  const language = cleanText(payload.language, 80);
  const sessionId = cleanId(payload.sessionId);
  const providedVisitorId = cleanId(payload.visitorId);
  const userId = context.auth?.uid || null;
  const userEmail = cleanText(context.auth?.token?.email, 180);
  const userName = cleanText(context.auth?.token?.name || context.auth?.token?.displayName, 180);
  const userAgent = cleanText(readHeader(headers, 'user-agent'), 300);
  const ipAddress = getRequestIp(headers, rawReq);
  const ipHash = ipAddress ? hashKey(ipAddress) : '';
  const geo = getGeoFromHeaders(headers);
  const dayKey = toDayKey(new Date());

  const visitorKey = providedVisitorId || hashKey(`${ipHash}:${userAgent || 'na'}`).slice(0, 64);
  const sessionKey = sessionId || hashKey(`${visitorKey}:${dayKey}:${userAgent || 'na'}`).slice(0, 64);
  const pageKey = hashKey(path).slice(0, 40);
  const locationLabel = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'Unknown';
  const locationKey = hashKey(`${geo.country}|${geo.region}|${geo.city}`).slice(0, 40);
  const funnelStage = getFunnelStage(path);

  const db = admin.firestore();
  const dayRef = db.collection('analyticsDaily').doc(dayKey);
  const visitorRef = dayRef.collection('visitors').doc(visitorKey);
  const sessionRef = dayRef.collection('sessions').doc(sessionKey);
  const pageRef = dayRef.collection('pages').doc(pageKey);
  const locationRef = dayRef.collection('locations').doc(locationKey);
  const funnelRef = dayRef.collection('funnels').doc(funnelStage);
  const eventRef = db.collection('analyticsEvents').doc();

  const now = admin.firestore.FieldValue.serverTimestamp();
  const eventPayload = {
    type: 'page_view',
    dayKey,
    path,
    title: title || null,
    referrerHost: referrerHost || null,
    host: host || null,
    source,
    tenantId: tenantId || null,
    visitorKey,
    sessionKey,
    userId,
    userEmail: userEmail || null,
    userName: userName || null,
    userAgent: userAgent || null,
    language: language || null,
    timezone: timezone || null,
    ipHash: ipHash || null,
    geo: {
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null,
      label: locationLabel
    },
    funnelStage,
    createdAt: now
  };

  await db.runTransaction(async (tx) => {
    const [visitorSnap, sessionSnap] = await Promise.all([
      tx.get(visitorRef),
      tx.get(sessionRef)
    ]);
    const visitorPayload = {
      userId,
      userEmail: userEmail || null,
      userName: userName || null,
      userAgent: userAgent || null,
      language: language || null,
      timezone: timezone || null,
      source,
      host: host || null,
      tenantId: tenantId || null,
      lastPath: path,
      lastTitle: title || null,
      lastLocationLabel: locationLabel,
      geo: {
        country: geo.country || null,
        region: geo.region || null,
        city: geo.city || null,
        label: locationLabel
      },
      pageViews: admin.firestore.FieldValue.increment(1)
    };

    tx.set(dayRef, {
      dayKey,
      pageViews: admin.firestore.FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });

    if (!visitorSnap.exists) {
      tx.set(visitorRef, {
        visitorKey,
        firstSeenAt: now,
        lastSeenAt: now,
        ...visitorPayload
      }, { merge: true });

      tx.set(dayRef, {
        uniqueVisitors: admin.firestore.FieldValue.increment(1)
      }, { merge: true });
    } else {
      tx.set(visitorRef, {
        lastSeenAt: now,
        ...visitorPayload
      }, { merge: true });
    }

    if (!sessionSnap.exists) {
      tx.set(sessionRef, {
        sessionKey,
        visitorKey,
        firstSeenAt: now,
        lastSeenAt: now
      }, { merge: true });

      tx.set(dayRef, {
        sessions: admin.firestore.FieldValue.increment(1)
      }, { merge: true });
    } else {
      tx.set(sessionRef, { lastSeenAt: now }, { merge: true });
    }

    tx.set(pageRef, {
      pageKey,
      path,
      views: admin.firestore.FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });

    tx.set(locationRef, {
      locationKey,
      label: locationLabel,
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null,
      views: admin.firestore.FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });

    tx.set(funnelRef, {
      stage: funnelStage,
      views: admin.firestore.FieldValue.increment(1),
      updatedAt: now
    }, { merge: true });

    tx.set(eventRef, eventPayload);
  });

  return {
    ok: true,
    dayKey
  };
});
