import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import { isProductOnSale, resolveSalePricing } from '../utils/sales';

export default function Deals() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const debug = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      enabled: params.get('debugDeals') === '1',
      query: (params.get('debugQuery') || '').trim().toLowerCase()
    };
  }, [location.search]);

  useEffect(() => {
    const loadDeals = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const snapshot = await getDocs(collectionGroup(db, 'products'));
        const now = new Date();
        const allItems = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            tenantId: docSnap.ref.parent.parent?.id,
            ...docSnap.data()
          }))
          .filter((item) => item.isPublished !== false && item.status !== 'draft')
          .map((item) => {
            const pricing = resolveSalePricing(item, now);
            return pricing.onSale
              ? { ...item, price: pricing.price, originalPrice: pricing.originalPrice }
              : item;
          });

        const saleItems = allItems.filter((item) => isProductOnSale(item, now));

        setAllProducts(allItems);
        setProducts(saleItems);
      } catch (error) {
        console.error('Failed to load deals:', error);
        setLoadError(error?.message || String(error));
        setProducts([]);
        setAllProducts([]);
      } finally {
        setLoading(false);
      }
    };

    loadDeals();
  }, []);

  const totalDeals = products.length;
  const debugMatches = useMemo(() => {
    if (!debug.enabled) return [];
    if (!debug.query) return allProducts.slice(0, 5);
    return allProducts
      .filter((item) => (item.name || '').toLowerCase().includes(debug.query))
      .slice(0, 5);
  }, [allProducts, debug]);

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Today&apos;s Deals</h1>
            <p className="text-sm text-gray-500">
              Fresh discounts from stores across MzansiShop.
            </p>
          </div>
          {!loading && (
            <div className="text-sm text-gray-600">
              {totalDeals > 0
                ? `${totalDeals} sale item${totalDeals === 1 ? '' : 's'} available`
                : 'No sales today'}
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading deals...</p>
          </div>
        )}

        {!loading && totalDeals === 0 && (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No sales available right now. Check back later for new deals.
          </div>
        )}

        {!loading && totalDeals > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} showAddToCart={false} />
            ))}
          </div>
        )}

        {debug.enabled && (
          <div className="mt-10 bg-white border border-dashed border-orange-300 rounded-lg p-4 text-sm text-gray-700">
            <div className="font-semibold text-orange-700 mb-2">Deals debug</div>
            <div className="mb-3">
              Query: <span className="font-mono">{debug.query || '(none)'}</span>
            </div>
            <div className="mb-3">
              Total products loaded: <span className="font-mono">{allProducts.length}</span>
            </div>
            {loadError && (
              <div className="mb-3 text-red-600">
                Load error: <span className="font-mono">{loadError}</span>
              </div>
            )}
            {debugMatches.length === 0 ? (
              <div>
                <div>No matching products found in catalog.</div>
                {allProducts.length > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Sample products: {allProducts.slice(0, 3).map((p) => p.name || p.id).join(', ')}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {debugMatches.map((item) => {
                  const pricing = resolveSalePricing(item, new Date());
                  return (
                    <div key={item.id} className="bg-gray-50 rounded-md p-3">
                      <div className="font-medium">{item.name || 'Unnamed product'}</div>
                      <div className="text-xs text-gray-500">ID: {item.id}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>price: {String(item.price ?? '')}</div>
                        <div>regularPrice: {String(item.regularPrice ?? '')}</div>
                        <div>salePrice: {String(item.salePrice ?? '')}</div>
                        <div>originalPrice: {String(item.originalPrice ?? '')}</div>
                        <div>status: {String(item.status ?? '')}</div>
                        <div>isPublished: {String(item.isPublished ?? '')}</div>
                        <div>saleStartDate: {String(item.saleStartDate ?? '')}</div>
                        <div>saleEndDate: {String(item.saleEndDate ?? '')}</div>
                        <div>variations: {Array.isArray(item.variations) ? item.variations.length : 0}</div>
                        <div>onSale: {pricing.onSale ? 'true' : 'false'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <ShopFooter />
    </div>
  );
}
