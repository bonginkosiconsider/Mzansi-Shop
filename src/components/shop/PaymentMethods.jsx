import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isManualPaymentType,
  normalizeManualPaymentMethod
} from '../../utils/manualPayment';
import {
  buildPaymentProofWhatsAppLink,
  PAYMENT_SUPPORT_WHATSAPP_DISPLAY
} from '../../utils/whatsapp';

export default function PaymentMethods({ onSelect, vendorId, referenceCode = '', amountDue = 0 }) {
  const [method, setMethod] = useState('');
  const [paymentOptions, setPaymentOptions] = useState([]);

  useEffect(() => {
    const loadMethods = async () => {
      try {
        const snap = await getDocs(collection(db, 'paymentMethods'));
        const opts = snap.docs
          .map((docSnap) => normalizeManualPaymentMethod({ id: docSnap.id, ...docSnap.data() }))
          .filter((option) => option.isActive && isManualPaymentType(option.type));
        setPaymentOptions(opts);
      } catch (err) {
        console.error('Failed to load payment options', err);
      }
    };
    loadMethods();
  }, []);

  // clear selection if method no longer exists
  useEffect(() => {
    if (method && paymentOptions.length > 0 && !paymentOptions.find((opt) => opt.id === method)) {
      setMethod('');
      onSelect && onSelect('', null);
    }
  }, [paymentOptions, method, onSelect]);

  const selectedOption = useMemo(
    () => paymentOptions.find((option) => option.id === method) || null,
    [method, paymentOptions]
  );
  const proofOfPaymentLink = useMemo(
    () => buildPaymentProofWhatsAppLink({ referenceCode, amount: amountDue }),
    [amountDue, referenceCode]
  );

  const handleChange = (e) => {
    const m = e.target.value;
    setMethod(m);
    const option = paymentOptions.find((entry) => entry.id === m) || null;
    onSelect && onSelect(m, option);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <h2 className="font-semibold mb-4">Payment Method</h2>
      {paymentOptions.length > 0 ? (
        <div className="space-y-2">
          {paymentOptions.map((option) => (
            <label key={option.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="payment"
                value={option.id}
                checked={method === option.id}
                onChange={handleChange}
              />
              <span>
                {option.label}
                {option.description ? (
                  <span className="block text-xs text-gray-500">{option.description}</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No active EFT payment methods are configured yet.
        </div>
      )}

      {selectedOption && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 space-y-2">
          <p className="font-semibold">{selectedOption.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Bank</p>
              <p>{selectedOption.config.bankName || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Account Name</p>
              <p>{selectedOption.config.accountName || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Account Number</p>
              <p className="font-mono">{selectedOption.config.accountNumber || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Branch Code</p>
              <p className="font-mono">{selectedOption.config.branchCode || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Account Type</p>
              <p>{selectedOption.config.accountType || 'Not configured'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-blue-700">Reference Code</p>
              <p className="font-mono">{referenceCode || 'Generating...'}</p>
            </div>
          </div>
          <p className="text-xs text-blue-800">
            This exact code will be the EFT payment reference for the buyer, and the same code will be used as the order number in admin so you can match the bank payment.
          </p>
          <div className="rounded border border-blue-100 bg-white/70 p-3 text-xs text-blue-900 space-y-2">
            <p>
              After payment, send your proof of payment to {PAYMENT_SUPPORT_WHATSAPP_DISPLAY} on WhatsApp using this same order number / reference.
            </p>
            <a
              href={proofOfPaymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
            >
              Send Proof on WhatsApp
            </a>
          </div>
          {selectedOption.config.instructions && (
            <div className="rounded border border-blue-100 bg-white/70 p-3 text-xs text-blue-900">
              {selectedOption.config.instructions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
