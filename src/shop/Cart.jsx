import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import { useCart } from '../context/CartContext';
import { Link } from 'react-router-dom';

export default function Cart() {
  const { items, subtotal, updateQuantity, removeFromCart } = useCart();

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />

      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-4">Your Cart</h1>
          {items.length === 0 && <p className="text-gray-500">Your cart is empty.</p>}
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.cartKey} className="flex gap-4 border-b pb-4">
                <img
                  src={item.images?.[0] || '/placeholder.svg'}
                  alt={item.name}
                  className="w-24 h-24 object-cover rounded"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{item.name}</h3>
                  <p className="text-sm text-gray-500">Sold by {item.storeName || 'MzansiShop'}</p>
                  {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                    <p className="text-xs text-gray-500">
                      {Object.entries(item.selectedVariations)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ')}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">R{Number(item.price || 0).toFixed(2)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartKey, Math.max(1, item.quantity - 1))}
                      className="px-3 py-1 border rounded"
                    >
                      -
                    </button>
                    <span className="px-2">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                      className="px-3 py-1 border rounded"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.cartKey)}
                      className="ml-4 text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <div className="font-semibold">R{(Number(item.price || 0) * item.quantity).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 h-fit">
          <h2 className="text-xl font-bold mb-4">Order Summary</h2>
          <div className="flex justify-between text-sm mb-2">
            <span>Subtotal</span>
            <span>R{subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span>Delivery</span>
            <span>Calculated at checkout</span>
          </div>
          <div className="flex justify-between font-bold text-lg border-t pt-4">
            <span>Total</span>
            <span>R{subtotal.toFixed(2)}</span>
          </div>
          <Link
            to="/checkout"
            className={`block w-full text-center mt-6 py-3 rounded-lg font-bold ${
              items.length === 0
                ? 'bg-gray-300 text-gray-500 pointer-events-none'
                : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
            }`}
          >
            Proceed to Checkout
          </Link>
        </div>
      </div>

      <ShopFooter />
    </div>
  );
}
