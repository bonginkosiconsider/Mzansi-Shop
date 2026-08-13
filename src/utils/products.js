import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../firebase';

export const loadPublishedProducts = async () => {
  const tenantsSnapshot = await getDocs(query(collection(db, 'tenants')));
  const tenantDocs = tenantsSnapshot.docs;

  const productLists = await Promise.all(
    tenantDocs.map(async (tenantDoc) => {
      const tenantId = tenantDoc.id;
      const tenantData = tenantDoc.data() || {};
      const storeName =
        tenantData.name ||
        tenantData.storeName ||
        tenantData.businessName ||
        tenantData.subdomain ||
        '';
      const storeSubdomain = tenantData.subdomain || '';

      try {
        const productsSnapshot = await getDocs(
          query(collection(db, `tenants/${tenantId}/products`))
        );
        return productsSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          tenantId,
          ...docSnap.data(),
          storeName: docSnap.data().storeName || storeName,
          storeSubdomain: docSnap.data().storeSubdomain || storeSubdomain,
          storeCategory: tenantData.category || tenantData.storeCategory || ''
        }));
      } catch (error) {
        console.error(`Failed to load products for tenant ${tenantId}:`, error);
        return [];
      }
    })
  );

  const allProducts = productLists.flat();
  return allProducts.filter(
    (product) => product.isPublished === true || product.status === 'published'
  );
};
