import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import { CheckCircle, Copy, Landmark, MailCheck } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeManualPaymentMethod } from '../utils/manualPayment';
import { formatZAR } from '../utils/promoters';
import {
  buildPaymentProofWhatsAppLink,
  PAYMENT_SUPPORT_WHATSAPP_DISPLAY
} from '../utils/whatsapp';
import toast from 'react-hot-toast';

export default function OrderSuccess() {
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [manualPayment, setManualPayment] = useState(null);

  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const paymentMode = searchParams.get('mode');
  const orderGroupId = searchParams.get('group') || '';
  const orderGroupRef = searchParams.get('orderRef') || '';
  const referenceParam = searchParams.get('reference') || '';
  const paymentMethodId = searchParams.get('methodId') || '';
  const paymentAmount = Number(searchParams.get('amount') || 0);

  useEffect(() => {
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (paymentMode !== 'eft') {
      setManualPayment(null);
      return;
    }

    let active = true;
    const storageKey = orderGroupId ? `manual-payment:${orderGroupId}` : '';

    const loadManualPayment = async () => {
      if (storageKey) {
        try {
          const stored = window.sessionStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (active && parsed && typeof parsed === 'object') {
              setManualPayment(parsed);
              return;
            }
          }
        } catch (error) {
          console.warn('Failed to read manual payment details from session storage', error);
        }
      }

      if (!paymentMethodId) return;

      try {
        const snap = await getDoc(doc(db, 'paymentMethods', paymentMethodId));
        if (!active || !snap.exists()) return;
        const method = normalizeManualPaymentMethod({ id: snap.id, ...snap.data() });
        setManualPayment({
          paymentMethodId: method.id,
          paymentMethodLabel: method.label,
          amount: paymentAmount,
          reference: referenceParam || orderGroupRef || orderGroupId,
          ...method.config
        });
      } catch (error) {
        console.error('Failed to load payment method for order success page', error);
      }
    };

    loadManualPayment();

    return () => {
      active = false;
    };
  }, [orderGroupId, orderGroupRef, paymentAmount, paymentMethodId, paymentMode, referenceParam, searchParams]);

  const manualReference = manualPayment?.reference || referenceParam || orderGroupRef || orderGroupId;
  const amountDue = Number.isFinite(paymentAmount) && paymentAmount > 0
    ? paymentAmount
    : Number(manualPayment?.amount || 0);
  const isManualEft = paymentMode === 'eft';
  const displayOrderNumber = manualReference || orderGroupRef || orderGroupId || 'Not available';
  const whatsappProofLink = useMemo(
    () => buildPaymentProofWhatsAppLink({ referenceCode: manualReference, amount: amountDue }),
    [amountDue, manualReference]
  );

  const handleCopyReference = async () => {
    if (!manualReference) {
      toast.error('No payment reference is available yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(manualReference);
      toast.success('Payment reference copied.');
    } catch (error) {
      console.error('Failed to copy payment reference', error);
      toast.error('Failed to copy payment reference.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />

      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center space-y-6">
          {isManualEft ? (
            <>
              <Landmark size={64} className="mx-auto text-red-600" />
              <h1 className="text-3xl font-bold">Order Received</h1>
              <p className="text-gray-600">
                Your order has been created and is waiting for EFT verification. Once the payment is verified manually,
                the order will be marked as paid and your confirmation email will be sent.
              </p>
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-left space-y-4">
                <div className="flex flex-col gap-4 border-b border-red-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Amount Due</p>
                    <p className="text-2xl font-bold text-red-950">
                      {amountDue > 0 ? formatZAR(amountDue) : 'Check your order total'}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs uppercase tracking-wide text-red-700">Payment Reference</p>
                    <div className="mt-1 inline-flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2">
                      <p className="font-mono font-semibold text-red-950">
                        {manualReference || 'Waiting for payment reference'}
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyReference}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        <Copy size={14} />
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 text-sm text-red-950 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Payment Method</p>
                    <p>{manualPayment?.paymentMethodLabel || 'Direct EFT'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Order Number</p>
                    <p className="font-mono">{displayOrderNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Bank</p>
                    <p>{manualPayment?.bankName || 'Configure bank name in admin'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Account Name</p>
                    <p>{manualPayment?.accountName || 'Configure account name in admin'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Account Number</p>
                    <p className="font-mono">{manualPayment?.accountNumber || 'Configure account number in admin'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Branch Code</p>
                    <p className="font-mono">{manualPayment?.branchCode || 'Configure branch code in admin'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Account Type</p>
                    <p>{manualPayment?.accountType || 'Configure account type in admin'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-red-700">Email Trigger</p>
                    <p className="flex items-center gap-2">
                      <MailCheck size={16} />
                      Sent after manual payment verification
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-red-300 bg-white p-4 text-sm text-red-950">
                  <p className="font-semibold">Important: use this exact order number / EFT reference</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-mono font-semibold">
                      {manualReference || 'Waiting for payment reference'}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyReference}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
                    >
                      <Copy size={16} />
                      Copy Reference
                    </button>
                  </div>
                  <p className="mt-3 text-red-700">
                    Do not change this reference. It is auto-generated for this order and is used to match your EFT to your payment.
                  </p>
                  {manualPayment?.instructions ? (
                    <p className="mt-3 text-red-900">{manualPayment.instructions}</p>
                  ) : (
                    <p className="mt-3 text-red-900">
                      Pay the exact amount above from your banking app, then wait for manual verification before delivery starts.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950">
                  <p className="font-semibold">Send proof of payment on WhatsApp</p>
                  <p className="mt-2">
                    After paying, send your proof of payment to {PAYMENT_SUPPORT_WHATSAPP_DISPLAY}. The message will include your order number / reference automatically.
                  </p>
                  <a
                    href={whatsappProofLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
                  >
                    Send Proof on WhatsApp
                  </a>
                </div>
              </div>
            </>
          ) : (
            <>
              <CheckCircle size={64} className="mx-auto text-green-500" />
              <h1 className="text-3xl font-bold">Order Confirmed!</h1>
              <p className="text-gray-600">
                Thank you for your purchase. Your order has been successfully placed and payment processed.
              </p>
              <p className="text-sm text-gray-500">
                You will receive a confirmation email shortly with your order details and tracking information.
              </p>
            </>
          )}

          <div className="pt-4 space-y-2">
            <button
              onClick={() => navigate('/')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
            >
              Continue Shopping
            </button>
            <button
              onClick={() => navigate('/orders')}
              className="w-full bg-gray-200 text-gray-900 py-3 rounded-lg font-semibold hover:bg-gray-300"
            >
              View My Orders
            </button>
          </div>
        </div>
      </div>

      <ShopFooter />
    </div>
  );
}
