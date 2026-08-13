import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { ShoppingCart, Search, X, Phone, Mail } from 'lucide-react';
import YocoCheckout from '../../components/YocoCheckout';
import { trackPageVisit } from '../../utils/analyticsClient';
import {
  capturePromoterReferralFromSearch,
  getStoredPromoterReferralCode
} from '../../utils/promoterReferral';
import { isLocalHost, PLATFORM_ORIGIN } from '../../utils/platform';

export default function Storefront() {
  const [tenant, setTenant] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [promoterCode, setPromoterCode] = useState(() => getStoredPromoterReferralCode());
  const marketplaceOrigin = (() => {
    const { protocol, hostname, port } = window.location;
    if (isLocalHost(hostname)) {
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
    }
    return PLATFORM_ORIGIN;
  })();
  
  // Get tenant from window (injected by Cloud Function) or URL
  const tenantId = window.TENANT_ID || window.location.hostname.split('.')[0];

  useEffect(() => {
    loadStorefront();
  }, []);

  useEffect(() => {
    const savedReferral = capturePromoterReferralFromSearch(window.location.search);
    setPromoterCode(savedReferral?.code || getStoredPromoterReferralCode());
  }, []);

  useEffect(() => {
    trackPageVisit({
      path: window.location.pathname,
      source: 'storefront',
      tenantId: window.TENANT_ID || tenantId
    });
  }, [tenantId]);

  const loadStorefront = async () => {
    try {
      // If we have tenantId from window, use it directly
      if (window.TENANT_DATA) {
        setTenant(window.TENANT_DATA);
        loadProducts(window.TENANT_ID);
      } else {
        // Fallback: lookup by subdomain
        const q = query(
          collection(db, 'tenants'),
          where('subdomain', '==', tenantId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const tenantData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
          setTenant(tenantData);
          loadProducts(tenantData.id);
        }
      }
    } catch (error) {
      console.error('Error loading storefront:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async (tid) => {
    const q = query(
      collection(db, 'tenants', tid, 'products'),
      where('isPublished', '==', true)
    );
    const snapshot = await getDocs(q);
    setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-screen">Loading...</div>;
  if (!tenant) return <div className="flex items-center justify-center h-screen">Store not found</div>;

  return (
    <div className="min-h-screen bg-gray-50" style={{ '--brand-color': tenant.primaryColor || '#2563eb' }}>
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {tenant.logo ? (
                <img
                  src={tenant.logo}
                  alt={tenant.name}
                  loading="lazy"
                  decoding="async"
                  className="h-10 object-contain"
                />
              ) : (
                <h1 className="text-xl font-bold text-gray-900">{tenant.name}</h1>
              )}
            </div>

            <div className="flex-1 max-w-lg mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-gray-600 hover:text-gray-900"
            >
              <ShoppingCart size={24} />
              {cart.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {cart.reduce((a, b) => a + b.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Banner */}
      {tenant.banner && (
        <div className="h-64 bg-gray-200 relative">
          <img
            src={tenant.banner}
            alt="Store banner"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="text-center text-white">
              <h2 className="text-4xl font-bold mb-2">{tenant.name}</h2>
              <p className="text-lg">{tenant.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Products Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No products found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                <div className="aspect-square bg-gray-200 rounded-t-lg overflow-hidden">
                  {product.images?.[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400">No image</div>
                  )}
                </div>
                
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mt-1">{product.description}</p>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xl font-bold text-blue-600">R{product.price}</span>
                    <button
                      onClick={() => addToCart(product)}
                      disabled={product.stock === 0}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                    >
                      Add to Cart
                    </button>
                  </div>
                  {product.stock < 5 && product.stock > 0 && (
                    <p className="text-xs text-red-600 mt-2">Only {product.stock} left!</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-bold text-lg mb-4">{tenant.name}</h3>
            <p className="text-gray-400">{tenant.description}</p>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4">Contact</h3>
            {tenant.phone && (
              <p className="flex items-center gap-2 text-gray-400 mb-2">
                <Phone size={16} />
                {tenant.phone}
              </p>
            )}
            {tenant.email && (
              <p className="flex items-center gap-2 text-gray-400">
                <Mail size={16} />
                {tenant.email}
              </p>
            )}
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4">Make Money with Us</h3>
            <div className="space-y-2 text-gray-400">
              <p>
                <a href={`${marketplaceOrigin}/promoters/apply`} className="hover:text-white">
                  Become a Promoter
                </a>
              </p>
              <p>
                <a href={`${marketplaceOrigin}/promoters/dashboard`} className="hover:text-white">
                  Promoter Dashboard
                </a>
              </p>
            </div>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4">Powered by</h3>
            <p className="text-gray-400">MzansiShop - South Africa's Marketplace</p>
          </div>
        </div>
      </footer>

      {/* Cart Sidebar */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsCartOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Shopping Cart</h2>
              <button onClick={() => setIsCartOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4" style={{ height: 'calc(100vh - 200px)' }}>
              {cart.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Your cart is empty</p>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex gap-4 bg-gray-50 p-4 rounded-lg">
                      {item.images?.[0] && (
                        <img
                          src={item.images[0]}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-medium">{item.name}</h4>
                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                        <p className="font-semibold text-blue-600">R{item.price * item.quantity}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t p-4 space-y-4">
                {promoterCode && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    Promoter referral applied: <span className="font-semibold">{promoterCode}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total</span>
                  <span>R{cartTotal.toFixed(2)}</span>
                </div>
                <YocoCheckout 
                  amount={cartTotal}
                  tenantId={tenant.id}
                  items={cart}
                  promoterCode={promoterCode}
                  onSuccess={() => {
                    setCart([]);
                    setIsCartOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
