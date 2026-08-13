import { useMemo, useState, useEffect } from 'react';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../firebase';
import OrderSummary from '../components/shop/OrderSummary';
import ShippingForm from '../components/shop/ShippingForm';
import PaymentMethods from '../components/shop/PaymentMethods';
import toast from 'react-hot-toast';
import { getStoredPromoterReferralCode } from '../utils/promoterReferral';
import { formatZAR } from '../utils/promoters';
import { isManualPaymentType } from '../utils/manualPayment';
import { getOrderReferenceCodeFromGroupId } from '../utils/orderReference';

const createPreviewOrderGroupId = () => doc(collection(db, 'orders')).id;

export default function Checkout() {
  const { items, subtotal, vendorIds } = useCart();
  const { user, sendVerificationEmail, refreshUser } = useAuth();
  const promoterCode = getStoredPromoterReferralCode();

  const singleVendor = vendorIds.length === 1 ? vendorIds[0] : null;

  // feature states
  const [shippingAddress, setShippingAddress] = useState(null);
  const [courierConfig, setCourierConfig] = useState(null);
  const [couriers, setCouriers] = useState([]);
  const [selectedCourier, setSelectedCourier] = useState(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState(null);
  const [ratesDebug, setRatesDebug] = useState(null);
  const [billingSame, setBillingSame] = useState(true);
  const [billingAddress, setBillingAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [promoterProfile, setPromoterProfile] = useState(null);
  const [usePromoterBalance, setUsePromoterBalance] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isRefreshingUser, setIsRefreshingUser] = useState(false);
  const [previewOrderGroupId, setPreviewOrderGroupId] = useState(() => createPreviewOrderGroupId());

  const configuredCourierProvider = useMemo(
    () =>
      String(
        courierConfig?.courierSettings?.provider
        || courierConfig?.courierProvider
        || courierConfig?.provider
        || ''
      ).toLowerCase(),
    [courierConfig]
  );

  const courierProviderName = useMemo(() => {
    if (courierConfig?.courierProviderMeta?.name) {
      return courierConfig.courierProviderMeta.name;
    }
    if (configuredCourierProvider === 'thecourierguy') {
      return 'The Courier Guy';
    }
    if (!configuredCourierProvider) {
      return 'Courier service';
    }
    return configuredCourierProvider
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [configuredCourierProvider, courierConfig?.courierProviderMeta?.name]);

  const hasText = (value) => Boolean(String(value || '').trim());

  const isCourierAddressReady = useMemo(
    () =>
      hasText(shippingAddress?.line1)
      && hasText(shippingAddress?.city)
      && hasText(shippingAddress?.zip || shippingAddress?.postalCode)
      && hasText(shippingAddress?.country || 'ZA'),
    [shippingAddress]
  );

  const isShippingAddressComplete = useMemo(
    () =>
      hasText(shippingAddress?.fullName)
      && hasText(shippingAddress?.email)
      && hasText(shippingAddress?.phone)
      && isCourierAddressReady,
    [isCourierAddressReady, shippingAddress]
  );

  const courierAddressSignature = useMemo(
    () =>
      [
        shippingAddress?.line1 || '',
        shippingAddress?.line2 || '',
        shippingAddress?.city || '',
        shippingAddress?.state || '',
        shippingAddress?.zip || shippingAddress?.postalCode || '',
        shippingAddress?.country || 'ZA'
      ].join('|'),
    [shippingAddress]
  );

  const showRatesDebug = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return Boolean(
      import.meta.env.DEV ||
      courierConfig?.courierSettings?.debugRates === true ||
      params.get('debugRates') === '1'
    );
  }, [courierConfig]);

  useEffect(() => {
    const loadCourierConfig = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'public', 'courier'));
        if (snapshot.exists()) {
          setCourierConfig(snapshot.data());
          return;
        }
        // Fallback to admin settings in dev (helps when public doc isn't populated yet)
        if (import.meta.env.DEV && user) {
          const adminSnap = await getDoc(doc(db, 'admin', 'settings'));
          if (adminSnap.exists()) {
            const adminData = adminSnap.data();
            if (adminData?.courierSettings) {
              setCourierConfig({
                courierSettings: {
                  provider: adminData.courierSettings.provider,
                  defaultService: adminData.courierSettings.defaultService,
                  checkoutRate: adminData.courierSettings.checkoutRate,
                  deliveryEstimate: adminData.courierSettings.deliveryEstimate
                },
                courierProvider: adminData.courierProvider || adminData.courierSettings.provider || '',
                updatedAt: adminData.updatedAt || null
              });
              return;
            }
          }
        } else {
          setCourierConfig(null);
        }
      } catch (err) {
        console.error('Failed to load courier config', err);
        setCourierConfig(null);
      }
    };

    loadCourierConfig();
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return;
    setIsRefreshingUser(true);
    refreshUser()
      .catch(() => null)
      .finally(() => setIsRefreshingUser(false));
  }, [user, refreshUser]);

  useEffect(() => {
    if (!user?.uid) {
      setPromoterProfile(null);
      setUsePromoterBalance(false);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'promoters', user.uid),
      (snapshot) => {
        setPromoterProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      },
      () => {
        setPromoterProfile(null);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!configuredCourierProvider || configuredCourierProvider === 'none') {
      setCouriers([]);
      return;
    }

    if (configuredCourierProvider === 'thecourierguy') {
      setCouriers([]);
      return;
    }

    const settings = courierConfig?.courierSettings || {};

    const meta = courierConfig?.courierProviderMeta;
    const checkoutRate = Number(
      settings.checkoutRate ?? courierConfig?.checkoutRate ?? 0
    ) || 0;
    const rawBankCharge = Number(
        settings.bankChargePercent
        ?? courierConfig?.bankChargePercent
        ?? courierConfig?.courierBankChargePercent
        ?? 0.03
    );
    const bankChargePercent = configuredCourierProvider === 'thecourierguy' && Number.isFinite(rawBankCharge) && rawBankCharge > 0
      ? rawBankCharge
      : 0;
    const applyBankCharge = (value) =>
      bankChargePercent > 0 ? Math.round(value * (1 + bankChargePercent) * 100) / 100 : value;
    const deliveryEstimate =
      settings.deliveryEstimate ?? courierConfig?.deliveryEstimate ?? '';
    const defaultService =
      settings.defaultService ?? courierConfig?.defaultService ?? '';
    setCouriers([
      {
        id: configuredCourierProvider,
        label: meta?.name || courierProviderName,
        estimate: deliveryEstimate,
        cost: applyBankCharge(checkoutRate),
        courier: {
          provider: configuredCourierProvider,
          providerName: meta?.name || courierProviderName,
          defaultService: defaultService
        }
      }
    ]);
  }, [configuredCourierProvider, courierConfig, courierProviderName]);

  useEffect(() => {
    if (configuredCourierProvider !== 'thecourierguy') {
      setRatesLoading(false);
      setRatesError(null);
      setRatesDebug(null);
      return;
    }

    setSelectedCourier(null);
    setCouriers([]);

    if (!isCourierAddressReady) {
      setRatesLoading(false);
      setRatesError(null);
      setRatesDebug(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setRatesLoading(true);
      setRatesError(null);
      setRatesDebug(null);
      try {
        const functionsInstance = getFunctions();
        const fetchRates = httpsCallable(functionsInstance, 'getCourierRates');
          const response = await fetchRates({
            shippingAddress,
            items: items.map(item => ({
              name: item.name,
              quantity: item.quantity,
              weight: item.weight,
              weightKg: item.weightKg,
              dimensions: item.dimensions,
              length: item.length,
              width: item.width,
              height: item.height
            })),
          debug: showRatesDebug
          });

        if (!active) return;
        const methods = response?.data?.methods || [];
        if (methods.length > 0) {
          setCouriers(methods);
        } else {
          setCouriers([]);
          setRatesError('No courier services are available for this address yet.');
        }
        setRatesDebug(response?.data?.debug || null);
      } catch (error) {
        if (!active) return;
        console.error('Failed to fetch courier rates', error);
        setCouriers([]);
        setRatesError('We could not load courier services for this address. Please check the address and try again.');
        setRatesDebug(null);
      } finally {
        if (active) setRatesLoading(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [configuredCourierProvider, courierAddressSignature, isCourierAddressReady, items, showRatesDebug]);

  // keep selection in sync with available couriers (no auto-select)
  useEffect(() => {
    if (couriers.length === 0) {
      setSelectedCourier(null);
      return;
    }
    if (selectedCourier && !couriers.find(c => c.id === selectedCourier)) {
      setSelectedCourier(null);
    }
  }, [couriers, selectedCourier]);

  const selectedCourierData = useMemo(
    () => couriers.find((courier) => courier.id === selectedCourier) || null,
    [couriers, selectedCourier]
  );

  const shippingCost = selectedCourierData
    ? Number(selectedCourierData.cost || 0)
    : 0;

  const grandTotal = subtotal - couponDiscount + shippingCost;
  const promoterAvailableBalance = Number(promoterProfile?.availableBalance || 0);
  const promoterPendingCashoutBalance = Number(promoterProfile?.pendingCashoutBalance || 0);
  const promoterHeldBalance = Number(promoterProfile?.walletHeldBalance || 0);
  const promoterBalanceApplied = usePromoterBalance
    ? Math.min(promoterAvailableBalance, grandTotal)
    : 0;
  const remainingDue = Math.max(0, Math.round((grandTotal - promoterBalanceApplied) * 100) / 100);
  const selectedManualPayment = useMemo(
    () => (selectedPaymentMethod && isManualPaymentType(selectedPaymentMethod.type) ? selectedPaymentMethod : null),
    [selectedPaymentMethod]
  );
  const previewOrderReference = useMemo(
    () => getOrderReferenceCodeFromGroupId(previewOrderGroupId),
    [previewOrderGroupId]
  );

  const courierPanelState = useMemo(() => {
    if (!configuredCourierProvider || configuredCourierProvider === 'none') return 'error';
    if (!isCourierAddressReady) return 'locked';
    if (ratesLoading) return 'loading';
    if (ratesError) return 'error';
    return 'ready';
  }, [configuredCourierProvider, isCourierAddressReady, ratesError, ratesLoading]);

  const courierStatusMessage = useMemo(() => {
    if (!configuredCourierProvider || configuredCourierProvider === 'none') {
      return 'Courier services are not configured right now.';
    }
    if (!isCourierAddressReady) {
      return 'Please add address to see available courier services.';
    }
    if (ratesLoading) {
      return `Checking live ${courierProviderName} services for this address...`;
    }
    if (ratesError) {
      return ratesError;
    }
    if (!selectedCourierData) {
      return 'Select an available courier service before paying.';
    }
    if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
      return 'Courier fee must load before checkout.';
    }
    return `${selectedCourierData.label} selected. Courier fee is locked in for this checkout.`;
  }, [
    configuredCourierProvider,
    courierProviderName,
    isCourierAddressReady,
    ratesError,
    ratesLoading,
    selectedCourierData,
    shippingCost
  ]);

  const checkoutReadinessMessage = useMemo(() => {
    if (!isShippingAddressComplete) {
      return 'Please complete your delivery details.';
    }
    if (courierStatusMessage && !selectedCourierData) {
      return courierStatusMessage;
    }
    if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
      return 'Courier fee must load before checkout.';
    }
    if (remainingDue > 0 && !paymentMethod) {
      return 'Select a payment method to continue.';
    }
    return '';
  }, [
    courierStatusMessage,
    isShippingAddressComplete,
    paymentMethod,
    remainingDue,
    selectedCourierData,
    shippingCost
  ]);

  const canPlaceOrder = !checkoutReadinessMessage && !isProcessing;

  useEffect(() => {
    if (promoterAvailableBalance <= 0 && usePromoterBalance) {
      setUsePromoterBalance(false);
    }
  }, [promoterAvailableBalance, usePromoterBalance]);

  const handleCoupon = (amount) => {
    setCouponDiscount(amount);
  };

  const formatItemDimensions = (item) => {
    if (!item) return 'n/a';
    if (typeof item.dimensions === 'string' && item.dimensions.trim()) {
      return item.dimensions;
    }
    const dims = item.dimensions && typeof item.dimensions === 'object' ? item.dimensions : {};
    const length = item.length ?? dims.length ?? dims.lengthCm;
    const width = item.width ?? dims.width ?? dims.widthCm;
    const height = item.height ?? dims.height ?? dims.heightCm;
    if (length || width || height) {
      return `${length ?? 'n/a'} x ${width ?? 'n/a'} x ${height ?? 'n/a'} cm`;
    }
    return 'n/a';
  };

  const formatItemWeight = (item) => {
    const weight = item?.weight ?? item?.weightKg;
    return weight !== undefined && weight !== null && weight !== '' ? `${weight} kg` : 'n/a';
  };
  const handlePlaceOrder = async () => {
    if (!isShippingAddressComplete) {
      toast.error('Please complete your delivery address before checking out.');
      return;
    }
    if (ratesLoading) {
      toast.error(`Checking live ${courierProviderName} services. Please wait a moment.`);
      return;
    }
    if (!selectedCourierData) {
      toast.error(
        isCourierAddressReady
          ? 'Please select an available courier service.'
          : 'Please add address to see available courier services.'
      );
      return;
    }
    if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
      toast.error('Courier fee has not loaded yet. Please select a courier service again.');
      return;
    }
    if (remainingDue > 0 && !paymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    if (!Number.isFinite(grandTotal) || grandTotal <= 0) {
      toast.error('Order total must be greater than 0');
      return;
    }

    setIsProcessing(true);
    try {
      const functionsInstance = getFunctions();
      const createCheckoutFunc = httpsCallable(functionsInstance, 'createCheckout');

      const checkoutBaseUrl = import.meta.env.VITE_CHECKOUT_BASE_URL || window.location.origin;

      const response = await createCheckoutFunc({
        requestedOrderGroupId: previewOrderGroupId,
        tenantId: singleVendor || null,
        amount: remainingDue,
        subtotal: subtotal,
        couponDiscount,
        shippingCost,
        paymentMethod,
        usePromoterBalance,
        promoterBalanceToUse: promoterBalanceApplied,
        items: items.map(item => ({
          tenantId: item.tenantId || item.storeId || null,
          productId: item.id,
          name: item.name,
          storeName: item.storeName || null,
          storeSubdomain: item.storeSubdomain || null,
          quantity: item.quantity,
          price: item.price,
          image: item.images?.[0] || null,
          sku: item.sku || null,
          variationId: item.variationId || null,
          selectedVariations: item.selectedVariations || {},
          weight: item.weight ?? item.weightKg ?? null,
          dimensions: item.dimensions || null,
          length: item.length ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          shippingClass: item.shippingClass || null
        })),
        shippingAddress: shippingAddress,
        billingAddress: billingSame ? null : billingAddress,
        courier: {
          id: selectedCourier,
          provider: selectedCourierData?.courier?.provider || selectedCourier,
          providerName: selectedCourierData?.courier?.providerName,
          defaultService: selectedCourierData?.courier?.defaultService,
          serviceCode: selectedCourierData?.courier?.serviceCode || null,
          serviceName: selectedCourierData?.courier?.serviceName || null,
          cost: shippingCost,
          deliveryTime: selectedCourierData?.estimate,
          label: selectedCourierData?.label || null
        },
        successUrl: `${checkoutBaseUrl}/order-success`,
        cancelUrl: `${checkoutBaseUrl}/checkout`,
        failureUrl: `${checkoutBaseUrl}/checkout`,
        promoterCode
      });

      if (response.data?.redirectUrl) {
        window.location.href = response.data.redirectUrl;
      } else if (response.data?.manualPayment) {
        const manualPayment = response.data.manualPayment;
        try {
          window.sessionStorage.setItem(
            `manual-payment:${response.data.orderGroupId}`,
            JSON.stringify(manualPayment)
          );
        } catch (storageError) {
          console.warn('Unable to persist manual payment details in session storage', storageError);
        }
        const params = new URLSearchParams({
          mode: 'eft',
          group: response.data.orderGroupId || '',
          orderRef: response.data.orderNumber || response.data.customerPaymentReference || response.data.orderGroupRef || '',
          methodId: response.data.paymentMethodId || manualPayment.paymentMethodId || '',
          amount: String(response.data.remainingAmount ?? manualPayment.amount ?? remainingDue),
          reference: response.data.customerPaymentReference || manualPayment.reference || ''
        });
        window.location.href = `${checkoutBaseUrl}/order-success?${params.toString()}`;
      } else if (response.data?.paidWithPromoterBalance) {
        window.location.href = `${checkoutBaseUrl}/order-success`;
      } else {
        toast.error('Failed to create order');
      }
    } catch (error) {
      console.error('Order error:', error);
      const errorCode = String(error?.code || '').toLowerCase();
      const errorMessage = String(error?.message || '').toLowerCase();
      if (errorCode.includes('already-exists') || errorMessage.includes('order reference already exists')) {
        setPreviewOrderGroupId(createPreviewOrderGroupId());
      }
      toast.error(`Failed to process order: ${error.message || error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {promoterCode && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            Promoter referral applied: <span className="font-semibold">{promoterCode}</span>
          </div>
        )}

        {user && !user.emailVerified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              Your email is not verified yet. You can still place and pay for your order.
              <span className="block text-xs text-yellow-700">
                Verification is still recommended for account recovery and order updates.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsSendingVerification(true);
                  try {
                    await sendVerificationEmail();
                    toast.success('Verification email sent.');
                  } catch (error) {
                    toast.error(error.message || 'Failed to send verification email');
                  } finally {
                    setIsSendingVerification(false);
                  }
                }}
                disabled={isSendingVerification}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
              >
                {isSendingVerification ? 'Sending...' : 'Resend email'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsRefreshingUser(true);
                  try {
                    await refreshUser();
                    toast.success('Account status refreshed.');
                  } catch (error) {
                    toast.error('Failed to refresh status');
                  } finally {
                    setIsRefreshingUser(false);
                  }
                }}
                disabled={isRefreshingUser}
                className="px-3 py-2 border border-yellow-300 rounded-lg hover:bg-yellow-100 disabled:opacity-60"
              >
                {isRefreshingUser ? 'Refreshing...' : 'Refresh status'}
              </button>
            </div>
          </div>
        )}

        {items.length === 0 && <p className="text-gray-500">Your cart is empty.</p>}

        {items.length > 0 && (
          <>
            <OrderSummary items={items} subtotal={subtotal} onCouponApplied={handleCoupon} />

            {(promoterProfile || promoterHeldBalance > 0 || promoterPendingCashoutBalance > 0) && (
              <div className="bg-white rounded-lg shadow p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">Promoter Balance</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Use your credited promoter balance first, then pay the remaining amount by direct EFT if needed.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Available</p>
                    <p className="text-xl font-bold text-gray-900">{formatZAR(promoterAvailableBalance)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Applied now</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(promoterBalanceApplied)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Reserved</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(promoterHeldBalance)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Pending cashout</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(promoterPendingCashoutBalance)}</p>
                  </div>
                </div>

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={usePromoterBalance}
                    disabled={promoterAvailableBalance <= 0}
                    onChange={() => setUsePromoterBalance((value) => !value)}
                  />
                  <span className="text-sm text-gray-700">
                    Apply {formatZAR(Math.min(promoterAvailableBalance, grandTotal))} from my promoter balance to this order.
                  </span>
                </label>

                {usePromoterBalance && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Balance used now: <span className="font-semibold">{formatZAR(promoterBalanceApplied)}</span>
                    {remainingDue > 0 ? (
                      <>. Remaining to pay by EFT: <span className="font-semibold">{formatZAR(remainingDue)}</span>.</>
                    ) : (
                      <>. Your promoter balance covers this whole order.</>
                    )}
                  </div>
                )}
              </div>
            )}

            <ShippingForm
              title="Shipping Information"
              address={shippingAddress}
              onChange={setShippingAddress}
              methods={couriers}
              selectedMethod={selectedCourier}
              onMethodChange={setSelectedCourier}
              courierState={courierPanelState}
              courierMessage={courierStatusMessage}
              courierProviderLabel={courierProviderName}
            />
            {showRatesDebug && ratesDebug && (
              <div className="text-xs text-gray-500">
                Using parcel: {ratesDebug.parcels?.[0]?.submitted_length_cm} x {ratesDebug.parcels?.[0]?.submitted_width_cm} x {ratesDebug.parcels?.[0]?.submitted_height_cm} {ratesDebug.units?.dimensions}, {ratesDebug.parcels?.[0]?.submitted_weight_kg} {ratesDebug.units?.weight}
              </div>
            )}
            {showRatesDebug && ratesDebug?.ratePreview?.length > 0 && (
              <div className="text-xs text-gray-500">
                Rate fields:
                {ratesDebug.ratePreview.map((rate, idx) => (
                  <div key={idx}>
                    name: {rate.name || 'n/a'} | service_name: {rate.service_name || 'n/a'} | service_level_name: {rate.service_level_name || 'n/a'} | service_code: {rate.service_code || 'n/a'} | service_level_code: {rate.service_level_code || 'n/a'}
                  </div>
                ))}
              </div>
            )}
            {showRatesDebug && items.length > 0 && (
              <div className="text-xs text-gray-500">
                Cart shipping snapshot:
                {items.map((item, idx) => (
                  <div key={item.cartKey || idx}>
                    {item.name} x{item.quantity} — {formatItemWeight(item)}, {formatItemDimensions(item)}
                  </div>
                ))}
              </div>
            )}

            {!billingSame && (
              <ShippingForm
                title="Billing Address"
                address={billingAddress}
                onChange={setBillingAddress}
                methods={null}
                showDefaultOption={false}
              />
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={billingSame}
                onChange={() => setBillingSame(!billingSame)}
              />
              <span>Billing same as shipping</span>
            </div>

            {remainingDue > 0 ? (
              <PaymentMethods
                onSelect={(methodId, option) => {
                  setPaymentMethod(methodId);
                  setSelectedPaymentMethod(option);
                }}
                amountDue={remainingDue}
                referenceCode={previewOrderReference}
                vendorId={singleVendor}
              />
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-600">
                No extra payment method is needed because your promoter balance covers the full order total.
              </div>
            )}

            {/* summary and place order button */}
            <div className="bg-white rounded-lg shadow p-6 text-right">
              <div className="flex justify-between mb-2 text-sm text-gray-600">
                <span>Courier</span>
                <span className={selectedCourierData ? 'text-gray-900' : 'text-amber-700'}>
                  {selectedCourierData ? formatZAR(shippingCost) : 'Awaiting selection'}
                </span>
              </div>
              {selectedCourierData && (
                <div className="mb-2 text-right text-xs text-gray-500">
                  {selectedCourierData.label}
                  {selectedCourierData.estimate ? ` | ${selectedCourierData.estimate}` : ''}
                </div>
              )}
              {promoterBalanceApplied > 0 && (
                <div className="flex justify-between mb-2 text-sm text-emerald-700">
                  <span>Promoter balance</span>
                  <span>-{formatZAR(promoterBalanceApplied)}</span>
                </div>
              )}
              <div className="flex justify-between mb-2">
                <span className="font-medium">{remainingDue > 0 ? 'Amount Due Now' : 'Amount Due Now'}</span>
                <span className="font-bold">R{remainingDue.toFixed(2)}</span>
              </div>
              {checkoutReadinessMessage && (
                <p className="mt-3 text-left text-sm text-amber-700">
                  {checkoutReadinessMessage}
                </p>
              )}
              <button
                onClick={handlePlaceOrder}
                disabled={!canPlaceOrder}
                className="mt-4 w-full bg-yellow-400 text-gray-900 py-2 rounded font-bold hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing
                  ? 'Processing...'
                  : remainingDue > 0
                    ? selectedManualPayment
                      ? `Place EFT Order for R${remainingDue.toFixed(2)}`
                      : `Continue with R${remainingDue.toFixed(2)}`
                    : 'Place Order with Promoter Balance'}
              </button>
            </div>
          </>
        )}
      </div>

      <ShopFooter />
    </div>
  );
}

