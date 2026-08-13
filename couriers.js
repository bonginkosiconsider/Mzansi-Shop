const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

exports.generateWaybill = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();

    if (newData.status === 'paid' && oldData.status !== 'paid') {
      const adminSettingsSnap = await admin.firestore().collection('admin').doc('settings').get();
      const adminSettings = adminSettingsSnap.data() || {};

      const courierProvider =
        adminSettings.courierProvider ||
        adminSettings.courierSettings?.provider;
      const courierApiKey =
        adminSettings.courierApiKey ||
        adminSettings.courierSettings?.apiKey;
      const collectionAddress =
        adminSettings.courierSettings?.collectionAddress ||
        {};
      const deliveryAddress = newData.customerAddress || newData.shippingAddress || {};
      const defaultService = adminSettings.courierSettings?.defaultService || 'economy';
      const autoGenerateWaybill = adminSettings.courierSettings?.autoGenerateWaybill !== false;

      if (courierApiKey && courierProvider === 'thecourierguy' && autoGenerateWaybill) {
        try {
          const waybill = await createTCGWaybill(
            courierApiKey,
            collectionAddress,
            deliveryAddress,
            newData.items,
            defaultService
          );

          await change.after.ref.update({
            waybillNumber: waybill.number,
            trackingUrl: waybill.trackingUrl,
            courier: 'thecourierguy',
            status: 'awaiting_collection'
          });
        } catch (error) {
          console.error('Waybill generation failed:', error);
          await change.after.ref.update({
            courierError: error.message,
            status: 'payment_confirmed'
          });
        }
      } else {
        await admin.firestore().collection('notifications').add({
          tenantId: newData.tenantId,
          type: 'manual_shipping_required',
          orderId: context.params.orderId,
          message: 'New order paid - please arrange courier',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  });

async function createTCGWaybill(apiKey, collectionAddress, deliveryAddress, items, defaultService) {
  const mapAddress = (address = {}) => ({
    address: address.street || address.line1 || '',
    suburb: address.suburb || address.line2 || '',
    city: address.city || '',
    postalCode: address.postalCode || address.zip || '',
    contactName: address.contactName || address.name || address.fullName || '',
    contactPhone: address.contactPhone || address.phone || ''
  });

  const collection = mapAddress(collectionAddress);
  const delivery = mapAddress(deliveryAddress);

  const response = await fetch('https://api.thecourierguy.co.za/waybill', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      collection: {
        address: collection.address,
        suburb: collection.suburb,
        city: collection.city,
        postalCode: collection.postalCode,
        contactName: collection.contactName,
        contactPhone: collection.contactPhone
      },
      delivery: {
        address: delivery.address,
        suburb: delivery.suburb,
        city: delivery.city,
        postalCode: delivery.postalCode,
        contactName: delivery.contactName,
        contactPhone: delivery.contactPhone
      },
      parcels: items.map((item) => ({
        description: item.name,
        weight: item.weight || 1,
        dimensions: item.dimensions || '30x20x10'
      })),
      service: defaultService || 'economy',
      reference: `MZANSI-${Date.now()}`
    })
  });

  if (!response.ok) {
    throw new Error(`TCG API error: ${response.statusText}`);
  }

  return await response.json();
}

exports.getCourierRates = functions.https.onCall(async (data, context) => {
  try {
    const adminSettingsSnap = await admin.firestore().collection('admin').doc('settings').get();
    if (!adminSettingsSnap.exists) {
      throw new functions.https.HttpsError('failed-precondition', 'Courier settings not configured');
    }

    const adminSettings = adminSettingsSnap.data() || {};
    const courierSettings = adminSettings.courierSettings || {};
    const provider = courierSettings.provider || adminSettings.courierProvider || '';

    if (provider !== 'thecourierguy') {
      return { provider, methods: [] };
    }

    const apiKey = courierSettings.apiKey || adminSettings.courierApiKey || '';
    const rawBankCharge = Number(
      courierSettings.bankChargePercent ?? adminSettings.courierBankChargePercent ?? 0.03
    );
    const bankChargePercent = Number.isFinite(rawBankCharge) && rawBankCharge > 0 ? rawBankCharge : 0;
    const applyBankCharge = (value) => {
      if (provider !== 'thecourierguy' || bankChargePercent <= 0) return value;
      return Math.round(value * (1 + bankChargePercent) * 100) / 100;
    };
    const shippingAddress = data?.shippingAddress || {};
    const items = Array.isArray(data?.items) ? data.items : [];

    const collectionAddress = courierSettings.collectionAddress || adminSettings.businessAddress || {};

    const mapCollection = () => ({
      company: 'The Courier Guy',
      street_address: collectionAddress.street || '',
      local_area: collectionAddress.suburb || '',
      code: collectionAddress.postalCode || '',
      city: collectionAddress.city || '',
      zone: collectionAddress.province || '',
      country: collectionAddress.country || 'ZA',
      type: 'business'
    });

    const mapDelivery = () => ({
      company: shippingAddress.fullName || '',
      street_address: shippingAddress.line1 || shippingAddress.street || '',
      local_area: shippingAddress.line2 || shippingAddress.suburb || '',
      code: shippingAddress.zip || shippingAddress.postalCode || '',
      city: shippingAddress.city || '',
      zone: shippingAddress.state || shippingAddress.province || '',
      country: shippingAddress.country || 'ZA',
      type: shippingAddress.type === 'Business' ? 'business' : 'residential'
    });

    const packaging = courierSettings.packaging || {};

    const normalizeNumber = (value, fallback) => {
      const num = Number(value);
      return Number.isFinite(num) && num > 0 ? num : fallback;
    };

    const parseDimensionValue = (value, fallbackCm) => {
      if (value === undefined || value === null || value === '') return fallbackCm;
      if (typeof value === 'number') {
        return value > 0 ? value : fallbackCm;
      }
      const text = String(value).trim().toLowerCase();
      const match = text.match(/([\d.]+)\s*(mm|cm|m)?/);
      if (!match) return fallbackCm;
      const num = Number(match[1]);
      if (!Number.isFinite(num) || num <= 0) return fallbackCm;
      const unit = match[2] || 'cm';
      if (unit === 'mm') return num / 10;
      if (unit === 'm') return num * 100;
      return num; // cm
    };

    const parseWeightValue = (value, fallbackKg) => {
      if (value === undefined || value === null || value === '') return fallbackKg;
      if (typeof value === 'number') {
        const numeric = value;
        if (numeric <= 0) return fallbackKg;
        return numeric;
      }
      const text = String(value).trim().toLowerCase();
      const match = text.match(/([\d.]+)\s*(kg|g)?/);
      if (!match) return fallbackKg;
      const num = Number(match[1]);
      if (!Number.isFinite(num) || num <= 0) return fallbackKg;
      const unit = match[2] || 'kg';
      if (unit === 'g') return num / 1000;
      return num;
    };

    const parseDimensionsString = (value) => {
      if (!value || typeof value !== 'string') return null;
      const parts = value.split(/[xX]/).map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 3) return null;
      const parsed = parts.map((part) => parseDimensionValue(part, null));
      if (parsed.some((num) => !Number.isFinite(num))) return null;
      return { length: parsed[0], width: parsed[1], height: parsed[2] };
    };

    const parseItemDimensions = (item) => {
      if (!item) return null;
      const dimsValue = item.dimensions;
      const dimsFromString = parseDimensionsString(dimsValue);
      if (dimsFromString) return dimsFromString;
      const dims =
        dimsValue && typeof dimsValue === 'object' && !Array.isArray(dimsValue)
          ? dimsValue
          : {};
      return {
        length: parseDimensionValue(item.length ?? dims.length ?? dims.lengthCm, null),
        width: parseDimensionValue(item.width ?? dims.width ?? dims.widthCm, null),
        height: parseDimensionValue(item.height ?? dims.height ?? dims.heightCm, null)
      };
    };

    const parseItemWeight = (item) => {
      if (!item) return null;
      return parseWeightValue(item.weight ?? item.weightKg, null);
    };

    const mapPackaging = (type) => {
      const value = String(type || '').toLowerCase();
      if (value.includes('satchel') || value.includes('flyer')) return 'Standard flyer';
      if (value.includes('tube')) return 'Tube';
      if (value.includes('crate')) return 'Crate';
      if (value.includes('box')) return 'Standard box';
      return 'Standard box';
    };

    let totalWeight = 0;
    let totalVolume = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;
    let totalItems = 0;

    if (items.length > 0) {
      items.forEach((item) => {
        const quantity = Number(item.quantity || 1);
        const itemDims = parseItemDimensions(item);
        const itemWeight = parseItemWeight(item);
        const length = parseDimensionValue(itemDims?.length, parseDimensionValue(packaging.lengthCm, 20));
        const width = parseDimensionValue(itemDims?.width, parseDimensionValue(packaging.widthCm, 20));
        const height = parseDimensionValue(itemDims?.height, parseDimensionValue(packaging.heightCm, 10));
        const weight = parseWeightValue(itemWeight, parseWeightValue(packaging.weightKg, 1));

        for (let i = 0; i < Math.max(1, quantity); i += 1) {
          totalItems += 1;
          totalWeight += weight;
          totalVolume += length * width * height;
          maxLength = Math.max(maxLength, length);
          maxWidth = Math.max(maxWidth, width);
          maxHeight = Math.max(maxHeight, height);
        }
      });
    }

    if (!totalItems) {
      totalItems = 1;
      totalWeight = parseWeightValue(packaging.weightKg, 1);
      maxLength = parseDimensionValue(packaging.lengthCm, 20);
      maxWidth = parseDimensionValue(packaging.widthCm, 20);
      maxHeight = parseDimensionValue(packaging.heightCm, 10);
      totalVolume = maxLength * maxWidth * maxHeight;
    }

    const combinedLength = maxLength || parseDimensionValue(packaging.lengthCm, 20);
    const combinedWidth = maxWidth || parseDimensionValue(packaging.widthCm, 20);
    const combinedHeight = Math.max(
      maxHeight || parseDimensionValue(packaging.heightCm, 10),
      Math.ceil(totalVolume / Math.max(1, combinedLength * combinedWidth))
    );

    const parcels = [{
      parcel_description: `Order (${totalItems} item${totalItems > 1 ? 's' : ''})`,
      submitted_length_cm: combinedLength,
      submitted_width_cm: combinedWidth,
      submitted_height_cm: combinedHeight,
      submitted_weight_kg: totalWeight,
      packaging: mapPackaging(packaging.type)
    }];

    const today = new Date().toISOString().split('T')[0];
    const payload = {
      collection_address: mapCollection(),
      delivery_address: mapDelivery(),
      parcels,
      collection_min_date: today,
      delivery_min_date: today
    };

    const endpoint = courierSettings.ratesUrl || 'https://api.shiplogic.com/rates';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new functions.https.HttpsError(
        'internal',
        `Rate request failed: ${response.status} ${response.statusText} ${errorText}`
      );
    }

    const json = await response.json();
    const rawRates = json?.rates || json?.data?.rates || json?.rate_options || json?.services || [];
    const rateInCents = courierSettings.rateInCents === true || adminSettings.courierRateInCents === true;
    const debugEnabled = data?.debug === true || courierSettings.debugRates === true;
    const normalizeRateCost = (rate) => {
      const raw =
        rate.total_incl_vat ??
        rate.total ??
        rate.total_price ??
        rate.rate ??
        rate.amount ??
        rate.cost ??
        0;
      const rawString = String(raw);
      let value = Number(raw);
      if (!Number.isFinite(value)) return 0;

      // Only convert from cents if explicitly configured.
      if (rateInCents) {
        value = value / 100;
      }
      return value;
    };

    const pickFirstString = (...values) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return '';
    };

    const readServiceName = (rate) =>
      pickFirstString(
        rate.service_level_name,
        rate.service_name,
        rate.name,
        rate.service,
        rate.service_level,
        rate.service?.name,
        rate.service_level?.name,
        rate.service_level?.display_name,
        rate.service_level?.description,
        rate.product
      );

    const readServiceCode = (rate) =>
      pickFirstString(
        rate.service_level_code,
        rate.service_code,
        rate.service?.code,
        rate.service_level?.code,
        rate.id
      );

      const methods = rawRates.map((rate, index) => {
        const cost = applyBankCharge(normalizeRateCost(rate));
      const id =
        String(readServiceCode(rate) || `rate_${index}`);
      const serviceCode = readServiceCode(rate);
      const serviceName = readServiceName(rate);
      const fallbackService =
        courierSettings.defaultService
          ? `Default (${courierSettings.defaultService})`
          : serviceCode
            ? `Service ${serviceCode}`
            : 'Standard Service';
      const label = `The Courier Guy - ${serviceName || fallbackService}`;

      const estimate = rate.estimated_delivery_days
        ? `${rate.estimated_delivery_days} days`
        : rate.delivery_estimate
          || rate.estimated_delivery_date
          || rate.delivery_date_from && rate.delivery_date_to
            ? `${rate.delivery_date_from} - ${rate.delivery_date_to}`
            : '';

      return {
        id,
        label,
        estimate,
        cost,
        courier: {
          provider: 'thecourierguy',
          providerName: 'The Courier Guy',
          serviceCode: serviceCode,
          serviceName: serviceName || fallbackService
        }
      };
    });

    const ratePreview = debugEnabled
      ? rawRates.slice(0, 3).map((rate) => ({
          service_level_name: rate.service_level_name,
          service_level_code: rate.service_level_code,
          service_name: rate.service_name,
          service_code: rate.service_code,
          name: rate.name,
          service: typeof rate.service === 'object'
            ? { name: rate.service?.name, code: rate.service?.code }
            : rate.service,
          service_level: typeof rate.service_level === 'object'
            ? { name: rate.service_level?.name, code: rate.service_level?.code }
            : rate.service_level,
          product: rate.product
        }))
      : null;

    if (debugEnabled && rawRates.length > 0) {
      console.log('getCourierRates sample rate fields', ratePreview);
    }

    return {
      provider,
      methods,
      raw: json,
      ...(debugEnabled
        ? {
            debug: {
              parcels,
              totals: {
                totalItems,
                totalWeight,
                combinedLength,
                combinedWidth,
                combinedHeight
              },
              units: {
                weight: 'kg',
                dimensions: 'cm'
              },
              ratePreview
            }
          }
        : {})
    };
  } catch (error) {
    console.error('getCourierRates error', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to fetch courier rates');
  }
});
