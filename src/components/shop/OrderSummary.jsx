import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

export default function OrderSummary({ items, subtotal, onCouponApplied }) {
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);

  const total = useMemo(() => {
    const base = subtotal;
    return Math.max(0, base - discount);
  }, [subtotal, discount]);

  const handleApplyCoupon = () => {
    // TODO: validate coupon against backend
    if (coupon === 'SAVE10') {
      setDiscount(10);
      onCouponApplied && onCouponApplied(10);
    } else {
      setDiscount(0);
      onCouponApplied && onCouponApplied(0);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="font-semibold mb-4">Order Summary</h2>
      <div className="space-y-4 text-sm">
        {items.map((item) => (
          <div key={item.cartKey} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src={item.images?.[0] || '/placeholder.svg'}
                alt={item.name}
                className="w-12 h-12 object-cover rounded"
              />
              <div className="flex flex-col">
                <span>{item.name}</span>
                {item.selectedVariations && (
                  <span className="text-xs text-gray-500">
                    {Object.entries(item.selectedVariations)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')}
                  </span>
                )}
                <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
              </div>
            </div>
            <span>R{(Number(item.price || 0) * item.quantity).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t pt-4">
        <div className="flex justify-between mb-2">
          <span>Subtotal</span>
          <span>R{subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span>-R{discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>R{total.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          value={coupon}
          onChange={(e) => setCoupon(e.target.value)}
          placeholder="Coupon code"
          className="flex-1 px-3 py-2 border rounded"
        />
        <button
          onClick={handleApplyCoupon}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Apply
        </button>
      </div>

      <div className="mt-4 text-right">
        <Link to="/cart" className="text-sm text-blue-600 hover:underline">
          Edit Cart
        </Link>
      </div>
    </div>
  );
}
