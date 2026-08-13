import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Activity,
  Home,
  Laptop,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  Palette,
  Star,
  Twitter,
  Instagram,
  Facebook
} from 'lucide-react';
import {
  appendPromoterReferralToUrl,
  getStoredPromoterReferralCode
} from '../../utils/promoterReferral';

const CATEGORIES = [
  { id: 'electronics', name: 'Electronics', icon: Laptop, color: 'bg-blue-100' },
  { id: 'fashion', name: 'Fashion', icon: Palette, color: 'bg-pink-100' },
  { id: 'home', name: 'Home and Garden', icon: Home, color: 'bg-green-100' },
  { id: 'beauty', name: 'Beauty', icon: Sparkles, color: 'bg-purple-100' },
  { id: 'sports', name: 'Sports', icon: Activity, color: 'bg-orange-100' },
  { id: 'books', name: 'Books', icon: BookOpen, color: 'bg-yellow-100' }
];

const FEATURES = [
  { icon: Store, title: 'Your Own Store', desc: 'Get a custom subdomain and branded storefront' },
  { icon: ShoppingBag, title: 'Easy Management', desc: 'Simple dashboard to manage products and orders' },
  { icon: Truck, title: 'Courier Integration', desc: 'Auto-generate waybills with your preferred courier' },
  { icon: Shield, title: 'Secure Payments', desc: 'Direct EFT checkout with manual payment verification' }
];

export default function Marketplace() {
  const [featuredStores, setFeaturedStores] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ vendors: 0, products: 0, orders: 0 });
  const carouselRef = useRef(null);
  const promoterCode = getStoredPromoterReferralCode();

  useEffect(() => {
    document.title = 'MzansiShop - Your Own Store for R100/month';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        'content',
        'Mzansi Shop is a South African online marketplace that connects customers with local sellers, offering affordable products while empowering entrepreneurs and supporting local businesses.'
      );
    }
  }, []);

  useEffect(() => {
    loadFeaturedStores();
    loadStats();
  }, []);

  const loadFeaturedStores = async () => {
    try {
      const q = query(
        collection(db, 'tenants'),
        where('isActive', '==', true),
        orderBy('totalSales', 'desc'),
        limit(8)
      );
      const snapshot = await getDocs(q);
      setFeaturedStores(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Failed to load featured stores', error);
    }
  };

  const loadStats = async () => {
    try {
      const [vendorsSnap, productsSnap, ordersSnap] = await Promise.all([
        getCountFromServer(collection(db, 'tenants')),
        getCountFromServer(collectionGroup(db, 'products')),
        getCountFromServer(collection(db, 'orders'))
      ]);

      setStats({
        vendors: vendorsSnap.data().count || 0,
        products: productsSnap.data().count || 0,
        orders: ordersSnap.data().count || 0
      });
    } catch (error) {
      console.error('Failed to load stats', error);
    }
  };

  const scrollCarousel = (direction) => {
    if (!carouselRef.current) return;
    const amount = direction === 'left' ? -320 : 320;
    carouselRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const featuredTitle = useMemo(() => {
    if (featuredStores.length === 0) return 'Featured Stores';
    return 'Featured Stores';
  }, [featuredStores.length]);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <Store size={24} />
              </div>
              <span className="text-xl font-bold text-gray-900">MzansiShop</span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              <Link to="/" className="text-gray-600 hover:text-gray-900">
                Browse
              </Link>
              <Link to="/register" className="text-gray-600 hover:text-gray-900">
                Sell on MzansiShop
              </Link>
              <Link to="/login" className="text-gray-600 hover:text-gray-900">
                Login
              </Link>
              <Link
                to="/register"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Start Selling
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
              Your Own Online Store for <span className="text-yellow-300">R100/month</span>
            </h1>
            <p className="text-xl text-blue-100 mb-8">
              Join South Africa&apos;s fastest growing marketplace. Get your branded storefront,
              automated shipping, and direct EFT checkout. We only take 5 percent when you make a sale.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search for stores or products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-lg text-gray-900 focus:ring-4 focus:ring-blue-500/50"
                />
              </div>
              <Link
                to="/register"
                className="bg-yellow-400 text-blue-900 px-8 py-4 rounded-lg font-bold hover:bg-yellow-300 flex items-center justify-center gap-2"
              >
                Open Your Store <ArrowRight size={20} />
              </Link>
            </div>

            <div className="flex items-center gap-8 mt-8 text-sm text-blue-100">
              <span className="flex items-center gap-2">
                <Check size={16} /> No setup fees
              </span>
              <span className="flex items-center gap-2">
                <Check size={16} /> Cancel anytime
              </span>
              <span className="flex items-center gap-2">
                <Check size={16} /> Daily payouts
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: stats.vendors, label: 'Active Stores' },
              { value: stats.products, label: 'Products' },
              { value: stats.orders, label: 'Orders Delivered' },
              { value: 'R0', label: 'Paid to Vendors' }
            ].map((stat, idx) => (
              <div key={idx}>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                  <Link
                    key={cat.id}
                    to={`/category/${encodeURIComponent(cat.name)}`}
                    className={`${cat.color} p-6 rounded-xl hover:shadow-lg transition-shadow text-center group`}
                  >
                  <span className="mb-2 block group-hover:scale-110 transition-transform">
                    <Icon size={30} className="text-gray-700 mx-auto" />
                  </span>
                  <span className="font-medium text-gray-900">{cat.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Featured Stores */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">{featuredTitle}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel('left')}
                className="p-2 rounded-full border border-gray-300 text-gray-600 hover:bg-white"
                aria-label="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollCarousel('right')}
                className="p-2 rounded-full border border-gray-300 text-gray-600 hover:bg-white"
                aria-label="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
              <Link to="/stores" className="text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-2">
                View All <ChevronRight size={18} />
              </Link>
            </div>
          </div>

          {featuredStores.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed p-10 text-center text-gray-500">
              No featured stores yet. Be the first to list your store.
            </div>
          ) : (
            <div ref={carouselRef} className="flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory">
              {featuredStores.map((store) => (
                <a
                  key={store.id}
                  href={appendPromoterReferralToUrl(`https://${store.subdomain}.mzansishop.com`, promoterCode)}
                  className="min-w-[280px] md:min-w-[320px] bg-white rounded-xl shadow hover:shadow-lg transition-shadow overflow-hidden group snap-start"
                >
                  <div
                    className="h-32 bg-cover bg-center"
                    style={{
                      backgroundImage: store.banner
                        ? `url(${store.banner})`
                        : 'linear-gradient(45deg, #e5e7eb, #f3f4f6)',
                      backgroundColor: store.primaryColor
                    }}
                  />
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                          {store.name}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{store.description}</p>
                      </div>
                      {store.logo && (
                        <img
                          src={store.logo}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="w-12 h-12 rounded-lg object-cover border"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-400" /> 4.8
                      </span>
                      <span>
                        {store.totalSales ? `R${store.totalSales.toLocaleString()} sold` : 'New store'}
                      </span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Create Your Store',
                desc: 'Sign up, choose your subdomain, and customize your brand in minutes'
              },
              {
                step: '2',
                title: 'Add Products',
                desc: 'Upload photos, set prices, and start selling. No technical skills needed'
              },
              {
                step: '3',
                title: 'Get Paid Daily',
                desc: 'We handle checkout tracking and shipping. You get 95 percent of every sale once payments are verified'
              }
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-bold text-xl mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Sell Online</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="text-center">
                  <div className="w-16 h-16 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Icon size={32} className="text-blue-400" />
                  </div>
                  <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                  <p className="text-gray-400 text-sm">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 bg-blue-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
          <p className="text-gray-600 mb-8">No hidden fees. No long-term contracts. Cancel anytime.</p>

          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
            <div className="text-5xl font-bold text-gray-900 mb-2">
              R100<span className="text-lg text-gray-500 font-normal">/month</span>
            </div>
            <p className="text-gray-500 mb-6">+ 5 percent commission per sale</p>

            <ul className="text-left space-y-3 mb-8">
              {[
                'Your own branded storefront',
                'Unlimited products',
                'Custom domain (yourstore.mzansishop.com)',
                'Direct EFT checkout',
                'Courier integration',
                'Daily payouts',
                '24/7 support'
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-3">
                  <Check size={20} className="text-green-500" />
                  <span className="text-gray-700">{item}</span>
                </li>
              ))}
            </ul>

            <Link
              to="/register"
              className="block w-full bg-blue-600 text-white py-4 rounded-lg font-bold hover:bg-blue-700"
            >
              Start Your Free Trial
            </Link>
            <p className="text-xs text-gray-500 mt-4">14-day free trial. No credit card required.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ready to Start Selling?</h2>
          <p className="text-gray-600 mb-8">Join thousands of South African entrepreneurs on MzansiShop</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="bg-blue-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-blue-700">
              Create Your Store Now
            </Link>
            <Link
              to="/stores"
              className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg font-bold hover:border-gray-400"
            >
              Browse Stores
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 text-white mb-4">
                <Store size={24} />
                <span className="text-xl font-bold">MzansiShop</span>
              </div>
              <p className="text-sm">Empowering South African entrepreneurs to sell online.</p>
              <div className="flex items-center gap-3 mt-4">
                <a
                  href="https://twitter.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                  aria-label="Twitter"
                >
                  <Twitter size={18} />
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                  aria-label="Instagram"
                >
                  <Instagram size={18} />
                </a>
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white"
                  aria-label="Facebook"
                >
                  <Facebook size={18} />
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Make Money with Us</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/register" className="hover:text-white">
                    Open a Store
                  </Link>
                </li>
                <li>
                  <Link to="/promoters/apply" className="hover:text-white">
                    Become a Promoter
                  </Link>
                </li>
                <li>
                  <Link to="/promoters/dashboard" className="hover:text-white">
                    Promoter Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/help" className="hover:text-white">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link to="/contact" className="hover:text-white">
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link to="/status" className="hover:text-white">
                    System Status
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link to="/terms" className="hover:text-white">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-white">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/seller-agreement" className="hover:text-white">
                    Seller Agreement
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Newsletter</h4>
              <p className="text-sm mb-3">Weekly tips to grow your online store.</p>
              <form className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email address"
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-white"
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-sm text-center">
            (c) 2024 MzansiShop. All rights reserved. Made in South Africa.
          </div>
        </div>
      </footer>
    </div>
  );
}
