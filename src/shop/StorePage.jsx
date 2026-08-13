import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';

export default function StorePage() {
  const { subdomain } = useParams();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStore();
  }, [subdomain]);

  const loadStore = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'tenants'), where('subdomain', '==', subdomain));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setStore(null);
        setProducts([]);
        return;
      }
      const storeDoc = snapshot.docs[0];
      const storeData = { id: storeDoc.id, ...storeDoc.data() };
      setStore(storeData);

      const productsSnap = await getDocs(collection(db, 'tenants', storeDoc.id, 'products'));
      const items = productsSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        tenantId: storeDoc.id,
        ...docSnap.data()
      }));
      setProducts(items.filter((item) => item.isPublished));
    } catch (error) {
      console.error('Failed to load store', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        {loading && <p className="text-gray-500">Loading store...</p>}
        {!loading && !store && <p className="text-gray-500">Store not found.</p>}
        {store && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center gap-4">
                {store.logo && (
                  <img src={store.logo} alt={store.name} className="w-16 h-16 rounded object-cover" />
                )}
                <div>
                  <h1 className="text-3xl font-bold">{store.name}</h1>
                  <p className="text-gray-500">{store.description}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={{ ...product, storeName: store.name }} />
              ))}
              {products.length === 0 && <p className="text-gray-500">No products published yet.</p>}
            </div>
          </>
        )}
      </div>
      <ShopFooter />
    </div>
  );
}
