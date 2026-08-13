import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import { loadPublishedProducts } from '../utils/products';

const normalizeCategory = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export default function Category() {
  const { id } = useParams();
  const categoryName = decodeURIComponent(id || '').trim();
  const categoryKey = normalizeCategory(categoryName);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProducts();
  }, [id]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const items = await loadPublishedProducts();
      const filtered = items.filter((product) => {
        const names = [];
        if (product?.category) names.push(product.category);
        if (Array.isArray(product?.categories)) names.push(...product.categories);
        if (names.length === 0 && product?.storeCategory) names.push(product.storeCategory);
        return names.some((name) => normalizeCategory(name) === categoryKey);
      });
      setProducts(filtered);
    } catch (error) {
      console.error('Failed to load category products', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">{categoryName}</h1>
        {loading && <p className="text-gray-500">Loading products...</p>}
        {!loading && products.length === 0 && <p className="text-gray-500">No products found.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>

      <ShopFooter />
    </div>
  );
}
