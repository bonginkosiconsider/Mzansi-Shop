import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import CategoryPromoCarousel from '../components/shop/CategoryPromoCarousel';

const shuffle = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const normalizeCategory = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const loadProducts = async () => {
    try {
      console.log('Loading products from shop...');

      // Try a different approach - query all tenants and their products
      const tenantsQuery = query(collection(db, 'tenants'));
      const tenantsSnapshot = await getDocs(tenantsQuery);
      console.log('Found tenants:', tenantsSnapshot.docs.length);

      let allProducts = [];

      for (const tenantDoc of tenantsSnapshot.docs) {
        const tenantId = tenantDoc.id;
        const tenantData = tenantDoc.data() || {};
        const storeName =
          tenantData.name ||
          tenantData.storeName ||
          tenantData.businessName ||
          tenantData.subdomain ||
          '';
        const storeSubdomain = tenantData.subdomain || '';
        console.log('Checking tenant:', tenantId);

        try {
          const productsQuery = query(collection(db, `tenants/${tenantId}/products`));
          const productsSnapshot = await getDocs(productsQuery);
          console.log(`Products in tenant ${tenantId}:`, productsSnapshot.docs.length);

          productsSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log(`Product ${doc.id} in tenant ${tenantId}:`, {
              name: data.name,
              status: data.status,
              isPublished: data.isPublished,
              price: data.price
            });
            allProducts.push({
              id: doc.id,
              tenantId: tenantId,
              ...data,
              storeName: data.storeName || storeName,
              storeSubdomain: data.storeSubdomain || storeSubdomain,
              storeCategory: data.storeCategory || tenantData.category || tenantData.storeCategory || ''
            });
          });
        } catch (error) {
          console.error(`Error loading products for tenant ${tenantId}:`, error);
        }
      }

      // Filter for published products
      const publishedProducts = allProducts.filter(
        (product) => product.isPublished === true || product.status === 'published'
      );
      console.log('Total published products found:', publishedProducts.length);

      setProducts(publishedProducts);
      console.log('Final products loaded:', publishedProducts.length);
    } catch (error) {
      console.error('Failed to load products:', error);
      console.error('Error details:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'categories')));
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const visible = data.filter((category) => category.isActive !== false);
      visible.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setCategories(visible);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  useEffect(() => {
    loadCategories();
  }, []);

  const { productsByCategory, categoryFallbacks } = useMemo(() => {
    const byCategory = new Map();
    const fallbacks = new Map();

    const addProduct = (key, label, product) => {
      if (!key) return;
      if (!byCategory.has(key)) {
        byCategory.set(key, []);
      }
      byCategory.get(key).push(product);
      if (label && !fallbacks.has(key)) {
        fallbacks.set(key, String(label).trim());
      }
    };

    products.forEach((product) => {
      const names = [];
      if (product?.category) names.push(product.category);
      if (Array.isArray(product?.categories)) names.push(...product.categories);
      if (names.length === 0 && product?.storeCategory) names.push(product.storeCategory);

      names.forEach((name) => {
        const key = normalizeCategory(name);
        if (!key) return;
        addProduct(key, name, product);
      });
    });

    return { productsByCategory: byCategory, categoryFallbacks: fallbacks };
  }, [products]);

  const mergedCategories = useMemo(() => {
    const map = new Map();

    categories.forEach((category) => {
      const label = category.name || category.id || '';
      const key = normalizeCategory(label);
      if (!key) return;
      map.set(key, { ...category, name: label, key });
    });

    categoryFallbacks.forEach((label, key) => {
      if (!map.has(key)) {
        map.set(key, { id: key, name: label, key });
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const aOrder = Number.isFinite(a.sortOrder) ? a.sortOrder : null;
      const bOrder = Number.isFinite(b.sortOrder) ? b.sortOrder : null;
      if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
      if (aOrder !== null) return -1;
      if (bOrder !== null) return 1;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    return list;
  }, [categories, categoryFallbacks]);

  const categorySections = useMemo(() => {
    return mergedCategories
      .map((category) => {
        const key = category.key || normalizeCategory(category.name || category.id);
        const items = productsByCategory.get(key) || [];
        if (items.length === 0) return null;

        const unique = [];
        const seen = new Set();
        items.forEach((item) => {
          const id = item.tenantId ? `${item.tenantId}:${item.id}` : item.id;
          if (seen.has(id)) return;
          seen.add(id);
          unique.push(item);
        });

        return { ...category, products: shuffle(unique) };
      })
      .filter(Boolean);
  }, [mergedCategories, productsByCategory]);

  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured === true),
    [products]
  );
  const featuredSelection = useMemo(
    () => shuffle(featuredProducts).slice(0, 10),
    [featuredProducts]
  );
  const recommendedProducts = useMemo(() => shuffle(products).slice(0, 10), [products]);

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <div className="relative bg-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 sm:p-8 text-white">
            <h1 className="text-3xl sm:text-4xl font-bold mb-4">Welcome to MzansiShop</h1>
            <p className="text-base sm:text-xl mb-6">South Africa&apos;s largest online marketplace</p>
            <Link
              to="/deals"
              className="bg-yellow-400 text-gray-900 px-6 py-3 rounded font-bold hover:bg-yellow-500"
            >
              Shop Deals Now
            </Link>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        <section className="bg-white rounded-lg shadow p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <h2 className="text-2xl font-bold">Shop by Category</h2>
          </div>
          {(loading || categoriesLoading) && (
            <p className="text-gray-500">Loading categories...</p>
          )}
          {!loading && !categoriesLoading && categorySections.length === 0 && (
            <p className="text-gray-500">No categories available yet.</p>
          )}
          <div className="space-y-6">
            {categorySections.map((category) => (
              <div key={category.id || category.name}>
                <div className="flex items-center justify-between mb-3">
                  <Link
                    to={`/category/${encodeURIComponent(category.name)}`}
                    className="text-lg font-semibold hover:text-blue-600"
                  >
                    {category.name}
                  </Link>
                  <Link
                    to={`/category/${encodeURIComponent(category.name)}`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                  >
                    View category
                  </Link>
                </div>
                <CategoryPromoCarousel
                  categoryName={category.name}
                  slides={category.promoSlides}
                />
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {category.products.map((product) => (
                    <div
                      key={`${product.tenantId || 'tenant'}-${product.id}`}
                      className="min-w-[220px] max-w-[220px]"
                    >
                      <ProductCard product={product} showAddToCart={false} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!loading && products.length > 0 && (
            <div className="mt-6 flex justify-center">
              <Link
                to="/products"
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                View more
              </Link>
            </div>
          )}
        </section>

        {featuredSelection.length > 0 && (
          <section className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Featured Products</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {featuredSelection.map((product) => (
                <ProductCard key={product.id} product={product} showAddToCart={false} />
              ))}
            </div>
          </section>
        )}

        <section className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-2xl font-bold mb-4">Recommended for You</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {recommendedProducts.map((product) => (
              <ProductCard key={product.id} product={product} showAddToCart={false} />
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-800 text-white p-6 sm:p-8">
          <div className="max-w-3xl">
            <p className="text-xs sm:text-sm uppercase tracking-[0.24em] text-blue-100">Promoter Program</p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold">Have 1,000+ followers? Turn referrals into rand earnings.</h2>
            <p className="mt-3 text-sm sm:text-base text-blue-100">
              Apply to become a MzansiShop promoter, get approved manually by admin, receive your referral code, and track your sales from your own dashboard.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/promoters/apply"
              className="inline-flex items-center rounded-xl bg-white px-5 py-3 font-semibold text-slate-900 hover:bg-blue-50"
            >
              Apply to be a promoter
            </Link>
            <Link
              to="/promoters/dashboard"
              className="inline-flex items-center rounded-xl border border-white/30 px-5 py-3 font-semibold text-white hover:bg-white/10"
            >
              Open promoter dashboard
            </Link>
          </div>
        </section>
      </main>

      <ShopFooter />
    </div>
  );
}
