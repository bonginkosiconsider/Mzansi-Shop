import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export default function ProductCard({ product, showAddToCart = true }) {
  const { addToCart } = useCart();

  const image = product.images?.[0] || '/placeholder.svg';
  const price = Number(product.price || 0);
  const originalPrice = product.originalPrice ? Number(product.originalPrice) : null;
  const storeLabel = product.storeName || product.storeSubdomain || '';
  const hasVariations =
    product?.type === 'variable' ||
    (Array.isArray(product?.variations) && product.variations.length > 0);
  const canQuickAdd = showAddToCart && !hasVariations;
  const hasStoreLabel = Boolean(storeLabel);

  return (
    <Link to={`/product/${product.id}`} className="block h-full">
      <div className="border rounded-lg p-3 sm:p-4 hover:shadow-lg transition-shadow group bg-white h-full flex flex-col">
        <div className="relative">
          <div className="relative w-full aspect-square bg-gray-50 rounded mb-3 overflow-hidden flex items-center justify-center p-3">
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              decoding="async"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <button
            type="button"
            className="absolute top-2 right-2 p-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Handle wishlist toggle here
            }}
          >
            <Heart size={16} className="text-gray-400 hover:text-red-500" />
          </button>
        </div>

        <h3 className="font-medium text-gray-900 line-clamp-2 hover:text-blue-600 mb-1 min-h-[40px]">
          {product.name}
        </h3>

        <div className="flex items-baseline gap-2 mb-2 min-h-[28px]">
          <span className="text-2xl font-bold text-gray-900">R{price.toFixed(2)}</span>
          {originalPrice && (
            <span className="text-sm text-gray-500 line-through">R{originalPrice.toFixed(2)}</span>
          )}
        </div>

        <p className={`text-xs text-gray-500 mb-3 min-h-[16px] ${hasStoreLabel ? '' : 'opacity-0'}`}>
          Sold by <span className="text-blue-600">{storeLabel || 'Store'}</span>
        </p>

        <div className="mt-auto">
          {canQuickAdd ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addToCart(product, 1);
              }}
              className="w-full bg-yellow-400 text-gray-900 py-2 rounded font-medium hover:bg-yellow-500"
            >
              Add to Cart
            </button>
          ) : (
            <div className="h-10" />
          )}
        </div>
      </div>
    </Link>
  );
}
