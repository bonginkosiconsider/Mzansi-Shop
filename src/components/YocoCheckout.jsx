import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import toast from 'react-hot-toast';

export default function YocoCheckout({
  amount = 0,
  tenantId,
  items = [],
  promoterCode = null,
  onSuccess
}) {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    setLoading(true);

    try {
      if (!tenantId) {
        throw new Error('Missing tenant');
      }

      const createCheckout = httpsCallable(functions, 'createCheckout');
      const result = await createCheckout({
        amount,
        tenantId,
        paymentMethod: 'yoco',
        successUrl: window.location.href,
        cancelUrl: window.location.href,
        promoterCode,
        items: items.map((i) => ({
          tenantId,
          productId: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity
        })),
        shippingAddress: {}
      });

      const payload = result?.data || {};
      if (payload.redirectUrl) {
        window.location.href = payload.redirectUrl;
        return;
      }

      if (payload.success) {
        toast.success('Payment successful!');
        if (onSuccess) onSuccess();
        return;
      }

      throw new Error('Unable to start checkout');
    } catch (error) {
      toast.error(`Payment failed: ${error.message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300"
    >
      {loading ? 'Processing...' : `Pay R${amount.toFixed(2)}`}
    </button>
  );
}
