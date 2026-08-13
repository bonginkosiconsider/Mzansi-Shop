import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Menu, Search, ShoppingCart, X } from 'lucide-react';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { trackSearch } from '../../utils/searchHistory';
import { isProductOnSale } from '../../utils/sales';
import { normalizeText, scoreItem } from '../../utils/search';
import { loadPublishedProducts } from '../../utils/products';

const EMPTY_CATEGORIES = [];

export default function ShopHeader({ categories = EMPTY_CATEGORIES, searching = false }) {
  const navigate = useNavigate();
  const { cartCount } = useCart();
  const { user } = useAuth();
  const accountHref = user ? '/account' : '/login';
  const ordersHref = user ? '/orders' : '/login';
  const accountGreeting = user?.displayName ? `Hello, ${user.displayName}` : 'Hello, Sign in';
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [dealsCount, setDealsCount] = useState(null);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [productCache, setProductCache] = useState([]);
  const suggestionTimer = useRef(null);

  const categoriesKey = useMemo(() => {
    if (!Array.isArray(categories) || categories.length === 0) {
      return 'empty';
    }
    return categories
      .map((cat) => {
        if (typeof cat === 'string') return cat;
        return cat.id || cat.name || cat.slug || cat.value || cat.label || '';
      })
      .filter(Boolean)
      .join('|');
  }, [categories]);

  useEffect(() => {
    let isMounted = true;

    const loadCategories = async () => {
      if (Array.isArray(categories) && categories.length > 0) {
        setCategoryOptions(categories);
        setCategoriesLoading(false);
        return;
      }

      setCategoriesLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'categories'));
        const data = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        if (isMounted) {
          setCategoryOptions(data);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        if (isMounted) {
          setCategoriesLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [categoriesKey]);

  useEffect(() => {
    let isMounted = true;

    const loadDealsCount = async () => {
      setDealsLoading(true);
      try {
        const snapshot = await getDocs(collectionGroup(db, 'products'));
        const now = new Date();
        const count = snapshot.docs.reduce((total, docSnap) => {
          const data = docSnap.data() || {};
          if (data.isPublished === false || data.status === 'draft') return total;
          if (!isProductOnSale(data, now)) return total;
          return total + 1;
        }, 0);

        if (isMounted) {
          setDealsCount(count);
        }
      } catch (error) {
        console.error('Failed to load deals count:', error);
        if (isMounted) {
          setDealsCount(null);
        }
      } finally {
        if (isMounted) {
          setDealsLoading(false);
        }
      }
    };

    loadDealsCount();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleCategories = useMemo(() => {
    const source = Array.isArray(categories) && categories.length > 0 ? categories : categoryOptions;
    return source
      .map((cat) => (typeof cat === 'string' ? { id: cat, name: cat, isActive: true } : cat))
      .filter((cat) => cat && cat.name)
      .filter((cat) => cat.isActive !== false);
  }, [categories, categoryOptions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;

    const searchQuery = query.trim();

    // Track the search if user is logged in
    if (user) {
      try {
        await trackSearch(user.uid, searchQuery);
      } catch (error) {
        console.error('Error tracking search:', error);
      }
    }

    navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  useEffect(() => {
    if (suggestionTimer.current) {
      clearTimeout(suggestionTimer.current);
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      return;
    }

    let isMounted = true;
    setSuggestionsLoading(true);

    suggestionTimer.current = setTimeout(async () => {
      try {
        let items = productCache;

        if (items.length === 0) {
          items = await loadPublishedProducts();
          if (isMounted) {
            setProductCache(items);
          }
        }

        const needle = normalizeText(trimmedQuery);
        const ranked = items
          .map((item) => ({ item, score: scoreItem(item, needle) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
          .map((entry) => entry.item);

        if (isMounted) {
          setSuggestions(ranked);
          setSuggestionsOpen(true);
        }
      } catch (error) {
        console.error('Failed to load search suggestions:', error);
        if (isMounted) {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      } finally {
        if (isMounted) {
          setSuggestionsLoading(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      if (suggestionTimer.current) {
        clearTimeout(suggestionTimer.current);
      }
    };
  }, [query, productCache]);

  return (
    <header className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="flex items-center justify-between md:justify-start gap-4">
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="text-2xl font-bold text-yellow-400">MzansiShop</div>
          </Link>
          <Link to="/cart" className="flex items-end gap-1 hover:text-yellow-400 md:hidden">
            <div className="relative">
              <ShoppingCart size={28} />
              <span className="absolute -top-1 -right-2 bg-yellow-400 text-gray-900 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {cartCount}
              </span>
            </div>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="w-full md:flex-1 md:max-w-2xl relative">
          <div className="flex">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => query.trim() && setSuggestionsOpen(true)}
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 120)}
              placeholder="Search for products, brands and more"
              className="flex-1 px-4 py-2 text-gray-900 rounded-l-md"
            />
            <button
              type="submit"
              disabled={searching}
              className="bg-yellow-400 text-gray-900 px-6 py-2 rounded-r-md hover:bg-yellow-500 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {searching ? (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Loader2 size={18} className="animate-spin" />
                  Searching...
                </span>
              ) : (
                <Search size={20} />
              )}
            </button>
          </div>
          {suggestionsOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white text-gray-900 border rounded-lg shadow-lg z-40 overflow-hidden">
              {suggestionsLoading && (
                <div className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Searching products...
                </div>
              )}
              {!suggestionsLoading && suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-500">No suggestions yet.</div>
              )}
              {!suggestionsLoading && suggestions.length > 0 && (
                <div className="divide-y">
                  {suggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-gray-50"
                      onMouseDown={() => {
                        setSuggestionsOpen(false);
                        setQuery(item.name || '');
                        navigate(`/product/${item.id}`);
                      }}
                    >
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        {item.storeName || item.storeSubdomain || 'MzansiShop'}
                        <span>·</span>
                        <span>R{Number(item.price || 0).toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                    onMouseDown={() => {
                      setSuggestionsOpen(false);
                      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                    }}
                  >
                    View all results for &quot;{query.trim()}&quot;
                  </button>
                </div>
              )}
            </div>
          )}
          <span className="sr-only" aria-live="polite">
            {searching ? 'Searching products' : ''}
          </span>
        </form>

        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link to={accountHref} className="hover:text-yellow-400">
            <div className="font-bold">{accountGreeting}</div>
            <div>Account</div>
          </Link>

          <Link to={ordersHref} className="hover:text-yellow-400">
            <div>Returns</div>
            <div className="font-bold">Orders</div>
          </Link>

          <Link to="/cart" className="flex items-end gap-1 hover:text-yellow-400">
            <div className="relative">
              <ShoppingCart size={32} />
              <span className="absolute -top-1 -right-2 bg-yellow-400 text-gray-900 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {cartCount}
              </span>
            </div>
            <span className="font-bold">Cart</span>
          </Link>
        </div>
      </div>

      <div className="bg-gray-800 text-white text-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-4 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            className="flex items-center gap-1 font-bold"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={18} /> All
          </button>
          <Link to="/deals" className="hover:text-yellow-400 flex items-center gap-2">
            <span>Today&apos;s Deals</span>
            {(dealsLoading || dealsCount !== null) && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  dealsLoading
                    ? 'bg-gray-700 text-gray-200'
                    : dealsCount > 0
                      ? 'bg-yellow-400 text-gray-900'
                      : 'bg-gray-700 text-gray-200'
                }`}
              >
                {dealsLoading
                  ? 'Checking...'
                  : dealsCount > 0
                    ? `${dealsCount} sale${dealsCount === 1 ? '' : 's'}`
                    : 'No sales'}
              </span>
            )}
          </Link>
          <Link to="/customer-service" className="hover:text-yellow-400">
            Customer Service
          </Link>
          <Link to="/gift-cards" className="hover:text-yellow-400">
            Gift Cards
          </Link>
          <Link to="/help" className="hover:text-yellow-400">
            Help
          </Link>
        </div>
      </div>

      <div className="bg-gray-800 text-gray-200 text-sm md:hidden">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <Link to={accountHref} className="hover:text-yellow-400 font-medium">
            {user ? 'Account' : 'Sign in'}
          </Link>
          <Link to={ordersHref} className="hover:text-yellow-400 font-medium">
            Returns & Orders
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-white text-gray-900 shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Categories</h3>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 rounded hover:bg-gray-100"
                aria-label="Close categories"
              >
                <X size={18} />
              </button>
            </div>
            {categoriesLoading ? (
              <p className="text-sm text-gray-500">Loading categories...</p>
            ) : visibleCategories.length > 0 ? (
              <nav className="space-y-2">
                {visibleCategories.map((category) => (
                  <Link
                    key={category.id || category.name}
                    to={`/category/${encodeURIComponent(category.name)}`}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {category.name}
                  </Link>
                ))}
              </nav>
            ) : (
              <p className="text-sm text-gray-500">No categories available.</p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
