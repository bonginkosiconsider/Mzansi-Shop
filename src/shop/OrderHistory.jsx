import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Copy } from 'lucide-react';
import { db, functions } from '../firebase';
import { useAuth } from '../context/AuthContext';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import toast from 'react-hot-toast';
import { getVendorDisplayName } from '../utils/vendorDisplay';
import {
  isManualPaymentType,
  normalizeManualPaymentMethod
} from '../utils/manualPayment';
import { formatZAR } from '../utils/promoters';
import { formatOrderReferenceCode } from '../utils/orderReference';
import {
  buildPaymentProofWhatsAppLink,
  PAYMENT_SUPPORT_WHATSAPP_DISPLAY
} from '../utils/whatsapp';

const ORDER_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' }
];

const RETURN_STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'received', label: 'Received' },
  { key: 'refunded', label: 'Refunded' }
];

const DEFAULT_RETURN_COURIER_FEE = 350;

export default function OrderHistory() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showRefundForm, setShowRefundForm] = useState(false);
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);
  const [returnCourierFee, setReturnCourierFee] = useState(DEFAULT_RETURN_COURIER_FEE);
  const [paymentLoadingId, setPaymentLoadingId] = useState(null);
  const [selectedPaymentMethodDetails, setSelectedPaymentMethodDetails] = useState(null);
  const [refundForm, setRefundForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    reason: '',
    description: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'ZA'
  });

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'orders'),
      where('customerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    let active = true;

    const loadSelectedPaymentMethod = async () => {
      const paymentMethodId = selectedOrder?.paymentMethodId || selectedOrder?.payment?.paymentMethodId || '';
      if (!paymentMethodId) {
        setSelectedPaymentMethodDetails(null);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'paymentMethods', paymentMethodId));
        if (!active || !snap.exists()) {
          if (active) setSelectedPaymentMethodDetails(null);
          return;
        }

        const method = normalizeManualPaymentMethod({ id: snap.id, ...snap.data() });
        if (!active) return;
        setSelectedPaymentMethodDetails({
          id: method.id,
          label: method.label,
          type: method.type,
          ...method.config
        });
      } catch (error) {
        console.error('Failed to load payment method details for order history', error);
        if (active) setSelectedPaymentMethodDetails(null);
      }
    };

    loadSelectedPaymentMethod();

    return () => {
      active = false;
    };
  }, [selectedOrder]);

  const selectedOrderDisplayRef = formatOrderReferenceCode(selectedOrder);
  const selectedOrderPaymentReference = selectedOrderDisplayRef || '';
  const selectedOrderWhatsappLink = useMemo(
    () => buildPaymentProofWhatsAppLink({
      referenceCode: selectedOrderPaymentReference,
      amount: Number(selectedOrder?.externalPaymentAmountTotal || selectedOrder?.total || 0)
    }),
    [selectedOrder?.externalPaymentAmountTotal, selectedOrder?.total, selectedOrderPaymentReference]
  );

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const getOrderProductSubtotal = (order) => {
    if (!order) return 0;
    const subtotal = toNumber(order.subtotal);
    const total = toNumber(order.total);
    const shipping = toNumber(order.shippingCost) || toNumber(order?.courier?.cost);
    const target = total > 0 ? Math.max(0, total - (shipping > 0 ? shipping : 0)) : 0;
    const candidates = [];
    if (subtotal > 0) candidates.push(subtotal);
    if (Array.isArray(order.items) && order.items.length > 0) {
      const sumQty = order.items.reduce((acc, item) => {
        const price = toNumber(item?.price);
        const qty = toNumber(item?.quantity) || 1;
        return acc + price * qty;
      }, 0);
      const sumLine = order.items.reduce((acc, item) => acc + toNumber(item?.price), 0);
      [sumQty, sumLine].forEach((value) => {
        if (Number.isFinite(value) && value > 0) candidates.push(value);
      });
    }
    if (candidates.length > 0) {
      if (target > 0) {
        return candidates.reduce((best, value) =>
          Math.abs(value - target) < Math.abs(best - target) ? value : best
        );
      }
      return candidates[0];
    }
    if (target > 0) return target;
    return 0;
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'public', 'courier'),
      (snap) => {
        if (!snap.exists()) {
          setReturnCourierFee(DEFAULT_RETURN_COURIER_FEE);
          return;
        }
        const data = snap.data() || {};
        const fee = Number(data?.courierSettings?.returnCourierFee ?? data?.returnCourierFee);
        setReturnCourierFee(Number.isFinite(fee) ? fee : DEFAULT_RETURN_COURIER_FEE);
      },
      () => {
        setReturnCourierFee(DEFAULT_RETURN_COURIER_FEE);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'refundRequests'),
      where('customerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRefundRequests(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return unsubscribe;
  }, [user]);

  const refundByOrderId = useMemo(() => {
    const map = new Map();
    // refundRequests are ordered by createdAt desc, keep the newest per orderId
    refundRequests.forEach((request) => {
      if (!map.has(request.orderId)) {
        map.set(request.orderId, request);
      }
    });
    return map;
  }, [refundRequests]);

  const openRefundForm = (order) => {
    const existing = refundByOrderId.get(order.id);
    if (existing && !['rejected', 'refunded', 'cancelled'].includes(existing.status)) {
      toast.error('A return request is already open for this order.');
      return;
    }
    const address = order.shippingAddress || {};
    setSelectedOrder(order);
    setRefundForm({
      fullName: address.fullName || order.customerName || '',
      email: address.email || order.customerEmail || user?.email || '',
      phone: address.phone || order.customerPhone || '',
      reason: '',
      description: '',
      addressLine1: address.line1 || address.street || '',
      addressLine2: address.line2 || address.suburb || '',
      city: address.city || '',
      state: address.state || address.province || '',
      postalCode: address.postalCode || address.zip || '',
      country: address.country || 'ZA'
    });
    setShowRefundForm(true);
  };

  const submitRefundRequest = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;
    if (!refundForm.fullName || !refundForm.email || !refundForm.phone) {
      toast.error('Please fill in your full name, email, and phone number.');
      return;
    }
    if (!refundForm.reason) {
      toast.error('Please select a reason for the return.');
      return;
    }
    if (!refundForm.description) {
      toast.error('Please describe the issue.');
      return;
    }
    const courierFee = returnCourierFee;
    const calcProductSubtotal = () => {
      return getOrderProductSubtotal(selectedOrder);
    };
    const productSubtotal = Math.round(calcProductSubtotal() * 100) / 100;
    const orderShippingCost = Number(
      selectedOrder.shippingCost || selectedOrder?.courier?.cost || 0
    );
    const orderTotalFull = Number(selectedOrder.total || productSubtotal + orderShippingCost);
    const initialStatus = courierFee > 0 ? 'payment_pending' : 'requested';

    setIsSubmittingRefund(true);
    try {
      const docRef = await addDoc(collection(db, 'refundRequests'), {
        orderId: selectedOrder.id,
        orderGroupId: selectedOrder.orderGroupId || null,
        orderGroupRef: selectedOrder.orderGroupRef || null,
        orderNumber: selectedOrderDisplayRef || null,
        orderTotal: orderTotalFull,
        productSubtotal,
        shippingCost: orderShippingCost,
        itemCount: selectedOrder.items?.length || 0,
        items: (selectedOrder.items || []).map((item) => ({
          name: item.name || 'Item',
          quantity: item.quantity || 1,
          sku: item.sku || null,
          price: Number(item.price || 0)
        })),
        tenantId: selectedOrder.tenantId || null,
        tenantName: selectedOrder.tenantName || null,
        customerId: user.uid,
        customerName: refundForm.fullName,
        customerEmail: refundForm.email,
        customerPhone: refundForm.phone,
        reason: refundForm.reason,
        description: refundForm.description,
        returnMethod: 'courier',
        courierFee,
        courierFeePaid: courierFee <= 0,
        paymentProvider: courierFee > 0 ? 'yoco' : null,
        paymentStatus: courierFee > 0 ? 'pending' : 'paid',
        pickupAddress: {
          line1: refundForm.addressLine1,
          line2: refundForm.addressLine2,
          city: refundForm.city,
          state: refundForm.state,
          postalCode: refundForm.postalCode,
          country: refundForm.country
        },
        status: initialStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      if (courierFee > 0) {
        setShowRefundForm(false);
        await startReturnPayment(docRef.id, courierFee);
        return;
      }
      toast.success('Return request submitted.');
      setShowRefundForm(false);
    } catch (error) {
      console.error('Refund request error:', error);
      toast.error('Failed to submit return request.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  const getStepIndex = (steps, statusKey) => {
    const idx = steps.findIndex((step) => step.key === statusKey);
    return idx === -1 ? 0 : idx;
  };

  const cancelReturnRequest = async (request) => {
    if (!confirm('Cancel this return request?')) return;
    try {
      await updateDoc(doc(db, 'refundRequests', request.id), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success('Return request cancelled.');
    } catch (error) {
      console.error('Failed to cancel return request:', error);
      toast.error('Failed to cancel return request.');
    }
  };

  const startReturnPayment = async (refundRequestId, amountOverride) => {
    if (!refundRequestId) return;
    setPaymentLoadingId(refundRequestId);
    try {
      const createReturnCheckout = httpsCallable(functions, 'createReturnCheckout');
      const result = await createReturnCheckout({
        refundRequestId,
        amount: Number(amountOverride || 0),
        successUrl: window.location.href,
        cancelUrl: window.location.href
      });
      const payload = result?.data || {};
      if (payload.redirectUrl) {
        window.location.href = payload.redirectUrl;
        return;
      }
      toast.error('Unable to start courier payment.');
    } catch (error) {
      console.error('Return payment error:', error);
      toast.error(error.message || 'Failed to start courier payment.');
    } finally {
      setPaymentLoadingId(null);
    }
  };

  const copyPaymentReference = async (reference) => {
    if (!reference) {
      toast.error('No payment reference is available yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(reference);
      toast.success('Payment reference copied.');
    } catch (error) {
      console.error('Failed to copy payment reference', error);
      toast.error('Failed to copy payment reference.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Your Orders</h1>
        {!user && <p className="text-gray-500">Please sign in to view your orders.</p>}
        {user && orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
        {orders.length > 0 && (
          <div className="bg-white rounded-lg shadow divide-y">
            {orders.map((order) => {
              const request = refundByOrderId.get(order.id);
              const returnStatus = request?.status || order.returnStatus || null;
              const productSubtotal = getOrderProductSubtotal(order);
              return (
                <div key={order.id} className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold">Order #{formatOrderReferenceCode(order)}</p>
                    <p className="text-sm text-gray-500">
                      {getVendorDisplayName(null, order)} â€¢ {order.status || 'pending'}
                    </p>
                    {order.items && order.items.length > 0 && (
                      <p className="text-xs text-gray-500">
                        {order.items.length} item{order.items.length > 1 ? 's' : ''} â€¢{' '}
                        {order.items.map((item) => item.name).slice(0, 3).join(', ')}
                        {order.items.length > 3 ? 'â€¦' : ''}
                      </p>
                    )}
                    {returnStatus && (
                      <p className={`text-xs ${returnStatus === 'cancelled' ? 'text-gray-500' : 'text-orange-600'}`}>
                        Return status: {returnStatus}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">R{productSubtotal.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Products only</p>
                    {order.paymentStatus && (
                      <p className="text-xs text-gray-500">Payment: {order.paymentStatus}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                    >
                      View details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ShopFooter />

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Order #{selectedOrderDisplayRef}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedOrder.createdAt?.toDate?.()?.toLocaleString?.('en-ZA')
                    || selectedOrder.createdAt?.toLocaleString?.('en-ZA')
                    || 'Unknown date'}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setShowRefundForm(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium mb-3">Order Progress</h4>
                <div className="flex items-center justify-between">
                  {ORDER_STEPS.map((step, idx) => {
                    const currentIndex = getStepIndex(ORDER_STEPS, selectedOrder.status || 'pending');
                    const isActive = currentIndex >= idx;
                    const isComplete = currentIndex > idx;
                    return (
                      <div key={step.key} className="flex items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                            isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        {idx < ORDER_STEPS.length - 1 && (
                          <div className={`w-12 h-1 ${isComplete ? 'bg-blue-600' : 'bg-gray-200'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-sm text-gray-600">
                  Status: {selectedOrder.status || 'pending'}
                </div>
              </div>

              <div className="bg-amber-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Payment</h4>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>Status: {selectedOrder.paymentStatus || 'pending'}</p>
                  {(selectedOrder.paymentMethodLabel || selectedOrder.paymentMethod) && (
                    <p>Method: {selectedOrder.paymentMethodLabel || selectedOrder.paymentMethod}</p>
                  )}
                  {selectedOrderPaymentReference && (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p>
                        Order Number / EFT Reference: <span className="font-mono text-red-700">{selectedOrderPaymentReference}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => copyPaymentReference(selectedOrderPaymentReference)}
                        className="inline-flex items-center gap-2 self-start rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <Copy size={14} />
                        Copy reference
                      </button>
                    </div>
                  )}
                  {Number(selectedOrder.externalPaymentAmountTotal || 0) > 0 && (
                    <p>Amount due: {formatZAR(selectedOrder.externalPaymentAmountTotal)}</p>
                  )}
                </div>
                {selectedOrder.paymentStatus !== 'paid'
                  && isManualPaymentType(selectedOrder.paymentMethodType || selectedPaymentMethodDetails?.type || '') && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950 space-y-3">
                    <p className="font-semibold">Direct EFT instructions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <p>Bank: {selectedPaymentMethodDetails?.bankName || 'Configured in admin'}</p>
                      <p>Account Name: {selectedPaymentMethodDetails?.accountName || 'Configured in admin'}</p>
                      <p>Account Number: <span className="font-mono">{selectedPaymentMethodDetails?.accountNumber || 'Configured in admin'}</span></p>
                      <p>Branch Code: <span className="font-mono">{selectedPaymentMethodDetails?.branchCode || 'Configured in admin'}</span></p>
                    </div>
                    <div className="rounded-lg border border-red-300 bg-white p-3">
                      <p className="font-semibold">Important: use this exact order number / EFT reference</p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono font-semibold">
                          {selectedOrderPaymentReference || 'Waiting for payment reference'}
                        </p>
                        <button
                          type="button"
                          onClick={() => copyPaymentReference(selectedOrderPaymentReference)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
                        >
                          <Copy size={16} />
                          Copy Reference
                        </button>
                      </div>
                    <p className="mt-3 text-red-700">
                      Do not change this reference. It is auto-generated for this order and is used to match your EFT to your payment.
                    </p>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-950">
                      <p className="font-semibold">Send proof of payment on WhatsApp</p>
                      <p className="mt-2 text-xs">
                        After payment, send your proof of payment to {PAYMENT_SUPPORT_WHATSAPP_DISPLAY}. The message will include your order number / reference automatically.
                      </p>
                      <a
                        href={selectedOrderWhatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                      >
                        Send Proof on WhatsApp
                      </a>
                    </div>
                    <p className="text-xs text-red-800">
                      Your order confirmation email is sent after the EFT is verified manually.
                    </p>
                    {selectedPaymentMethodDetails?.instructions && (
                      <p className="text-xs text-red-900">{selectedPaymentMethodDetails.instructions}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Shipping</h4>
                <div className="text-sm text-gray-700 space-y-1">
                  <p>Courier: {selectedOrder.courier?.providerName || selectedOrder.courier?.provider || 'n/a'}</p>
                  {selectedOrder.courier?.deliveryTime && (
                    <p>Estimated delivery: {selectedOrder.courier.deliveryTime}</p>
                  )}
                  {selectedOrder.waybillNumber && <p>Waybill: {selectedOrder.waybillNumber}</p>}
                  {selectedOrder.trackingUrl && (
                    <a
                      href={selectedOrder.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm hover:underline"
                    >
                      Track shipment -&gt;
                    </a>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-3">Items</h4>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-medium">R{(Number(item.price || 0) * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const productSubtotal = getOrderProductSubtotal(selectedOrder);
                  const discount = toNumber(selectedOrder.discount);
                  const refundableTotal = Math.max(0, productSubtotal - discount);
                  return (
                    <div className="pt-4 text-sm text-gray-700 space-y-1">
                      <div className="flex justify-between">
                        <span>Product total</span>
                        <span>R{productSubtotal.toFixed(2)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Discount</span>
                          <span>-R{discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 text-lg font-bold text-gray-900">
                        <span>Total</span>
                        <span>R{refundableTotal.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Courier fees are not refundable.
                      </p>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Returns & Refunds</h4>
                {(() => {
                  const request = refundByOrderId.get(selectedOrder.id);
                  if (request) {
                    return (
                      <div className="space-y-3 text-sm text-gray-700">
                        <p>Status: {request.status || 'requested'}</p>
                        {request.status === 'payment_pending' && (
                          <p className="text-xs text-orange-600">
                            Refund application fee payment pending. Your request will be processed once payment is confirmed.
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          {RETURN_STEPS.map((step, idx) => {
                            const currentIndex = getStepIndex(RETURN_STEPS, request.status || 'requested');
                            const isActive = currentIndex >= idx;
                            const isComplete = currentIndex > idx;
                            return (
                              <div key={step.key} className="flex items-center">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] ${
                                    isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                                  }`}
                                >
                                  {idx + 1}
                                </div>
                                {idx < RETURN_STEPS.length - 1 && (
                                  <div className={`w-10 h-1 ${isComplete ? 'bg-blue-600' : 'bg-gray-200'}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p>Return method: courier collection</p>
                        <p>
                          Refund application fee: R{Number(request.courierFee || 0).toFixed(2)} -{' '}
                          {request.courierFeePaid ? 'Paid' : 'Payment pending'}
                        </p>
                        {request.status === 'cancelled' && (
                          <div className="space-y-2">
                            <p className="text-gray-500">This return request was cancelled.</p>
                            <button
                              type="button"
                              onClick={() => openRefundForm(selectedOrder)}
                              className="inline-flex items-center px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-100"
                            >
                              Request Again
                            </button>
                          </div>
                        )}
                        {request.status === 'rejected' && (
                          <p className="text-red-600">Return request was rejected. Contact the seller for help.</p>
                        )}
                        {request.status === 'payment_pending' && !request.courierFeePaid && (
                          <button
                            type="button"
                            onClick={() => startReturnPayment(request.id, request.courierFee)}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-100"
                            disabled={paymentLoadingId === request.id}
                          >
                            {paymentLoadingId === request.id ? 'Redirecting...' : 'Pay Application Fee'}
                          </button>
                        )}
                        {request.status && ['requested', 'payment_pending', 'approved'].includes(request.status) && (
                          <button
                            type="button"
                            onClick={() => cancelReturnRequest(request)}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 rounded text-xs hover:bg-gray-100"
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="text-sm text-gray-700">
                      No return request yet.
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => openRefundForm(selectedOrder)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Request Refund / Return
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {showRefundForm && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">Request a Return / Refund</h3>
                <p className="text-sm text-gray-500">
                  Order #{selectedOrderDisplayRef}
                </p>
              </div>
              <button onClick={() => setShowRefundForm(false)} className="text-gray-400 hover:text-gray-600">
                X
              </button>
            </div>

            <form onSubmit={submitRefundRequest} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Full name"
                  value={refundForm.fullName}
                  onChange={(e) => setRefundForm({ ...refundForm, fullName: e.target.value })}
                  className="border rounded-lg px-4 py-3"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={refundForm.email}
                  onChange={(e) => setRefundForm({ ...refundForm, email: e.target.value })}
                  className="border rounded-lg px-4 py-3"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={refundForm.phone}
                  onChange={(e) => setRefundForm({ ...refundForm, phone: e.target.value })}
                  className="border rounded-lg px-4 py-3"
                  required
                />
                <select
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="border rounded-lg px-4 py-3"
                  required
                >
                  <option value="">Select reason</option>
                  <option value="damaged">Damaged item</option>
                  <option value="wrong_item">Wrong item</option>
                  <option value="not_as_described">Not as described</option>
                  <option value="missing_items">Missing items</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <textarea
                placeholder="Describe the issue"
                value={refundForm.description}
                onChange={(e) => setRefundForm({ ...refundForm, description: e.target.value })}
                className="border rounded-lg px-4 py-3 w-full"
                rows={4}
                required
              />

              <div className="border rounded-lg p-4 bg-gray-50 space-y-2">
                <h4 className="font-medium">Courier Collection</h4>
                <p className="text-sm text-gray-700">
                  Refund application fee: <strong>R{returnCourierFee}</strong>
                </p>
                <p className="text-xs text-gray-600">
                  After you submit, you will be redirected to Yoco to pay the refund application fee.
                  Your return request will be activated after payment is successful.
                </p>
              </div>

              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <h4 className="font-medium">Pickup Address</h4>
                <input
                  type="text"
                  placeholder="Address line 1"
                  value={refundForm.addressLine1}
                  onChange={(e) => setRefundForm({ ...refundForm, addressLine1: e.target.value })}
                  className="border rounded-lg px-4 py-3 w-full"
                  required
                />
                <input
                  type="text"
                  placeholder="Address line 2"
                  value={refundForm.addressLine2}
                  onChange={(e) => setRefundForm({ ...refundForm, addressLine2: e.target.value })}
                  className="border rounded-lg px-4 py-3 w-full"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="City"
                    value={refundForm.city}
                    onChange={(e) => setRefundForm({ ...refundForm, city: e.target.value })}
                    className="border rounded-lg px-4 py-3"
                    required
                  />
                  <input
                    type="text"
                    placeholder="State / Province"
                    value={refundForm.state}
                    onChange={(e) => setRefundForm({ ...refundForm, state: e.target.value })}
                    className="border rounded-lg px-4 py-3"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Postal Code"
                    value={refundForm.postalCode}
                    onChange={(e) => setRefundForm({ ...refundForm, postalCode: e.target.value })}
                    className="border rounded-lg px-4 py-3"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Country"
                    value={refundForm.country}
                    onChange={(e) => setRefundForm({ ...refundForm, country: e.target.value })}
                    className="border rounded-lg px-4 py-3"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRefundForm(false)}
                  className="flex-1 border border-gray-300 py-3 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRefund}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmittingRefund ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

