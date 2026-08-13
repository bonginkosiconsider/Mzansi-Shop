import { useEffect, useState } from 'react';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import { loadPublishedProducts } from '../utils/products';

const shuffle = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

export default function AllProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllProducts = async () => {
      setLoading(true);
      try {
        const items = await loadPublishedProducts();
        setProducts(shuffle(items));
      } catch (error) {
        console.error('Failed to load products:', error);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadAllProducts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">All Products</h1>
            <p className="text-sm text-gray-500">Random picks from every store.</p>
          </div>
          {!loading && (
            <div className="text-sm text-gray-600">
              {products.length} product{products.length === 1 ? '' : 's'} available
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading products...</p>
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No products available right now. Check back later for new items.
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      <ShopFooter />
    </div>
  );
}
