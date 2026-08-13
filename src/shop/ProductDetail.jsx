import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { useCart } from '../context/CartContext';
import ShopHeader from '../components/shop/ShopHeader';
import ShopFooter from '../components/shop/ShopFooter';
import ProductCard from '../components/shop/ProductCard';
import { resolveSalePricing } from '../utils/sales';
import {
  RefreshCw,
  Share2,
  Shield,
  Star,
  Truck,
  Heart,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  MessageCircle,
  Award,
  CheckCircle,
  X,
  Plus,
  Minus
} from 'lucide-react';

export default function ProductDetail() {
  const { id } = useParams();
  const { addToCart } = useCart();
  const [product, setProduct] = useState(null);
  const [store, setStore] = useState(null);
  const [vendorOrdersCount, setVendorOrdersCount] = useState(null);
  const [vendorProductsSold, setVendorProductsSold] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [reviewStats, setReviewStats] = useState({ average: 0, count: 0 });
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [selectedVariations, setSelectedVariations] = useState({});
  const [activeTab, setActiveTab] = useState('description');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [addToCartState, setAddToCartState] = useState('idle');
  const addToCartTimers = useRef([]);

  const vendorSalesCount = vendorProductsSold !== null && vendorProductsSold !== undefined
    ? vendorProductsSold
    : vendorOrdersCount !== null && vendorOrdersCount !== undefined
      ? vendorOrdersCount
      : (store?.totalOrders ?? store?.orders ?? null);

  const vendorSalesLabel = vendorSalesCount !== null && vendorSalesCount !== undefined
    ? `${Number(vendorSalesCount).toLocaleString()} sold`
    : (store?.totalSales !== null && store?.totalSales !== undefined)
      ? `R${Number(store.totalSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total` 
      : '0 sold';

  useEffect(() => {
    loadProduct();
  }, [id]);

  useEffect(() => {
    setSelectedVariations({});
    setQuantity(1);
  }, [id]);

  const loadReviews = async (productId) => {
    setLoadingReviews(true);
    try {
      const reviewsQuery = query(
        collection(db, 'products', productId, 'reviews'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(reviewsQuery);
      const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const ratings = list
        .map((review) => Number(review.rating))
        .filter((rating) => Number.isFinite(rating) && rating > 0);
      const average = ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : 0;

      setReviews(list);
      setReviewStats({ average, count: list.length });
    } catch (error) {
      console.error('Failed to load reviews', error);
      setReviews([]);
      setReviewStats({ average: 0, count: 0 });
    } finally {
      setLoadingReviews(false);
    }
  };

  const loadProduct = async () => {
    setLoading(true);
    try {
      console.log('Loading product with ID:', id);

      // Get all tenants first
      const tenantsQuery = query(collection(db, 'tenants'));
      const tenantsSnapshot = await getDocs(tenantsQuery);
      console.log('Found tenants:', tenantsSnapshot.docs.length);

      let foundProduct = null;
      let tenantId = null;

      // Search through each tenant's products
      for (const tenantDoc of tenantsSnapshot.docs) {
        const currentTenantId = tenantDoc.id;
        console.log('Checking tenant:', currentTenantId);

        try {
          const productsQuery = query(collection(db, `tenants/${currentTenantId}/products`));
          const productsSnapshot = await getDocs(productsQuery);

          // Look for the product with matching ID
          for (const productDoc of productsSnapshot.docs) {
            if (productDoc.id === id) {
              console.log('Found product in tenant:', currentTenantId);
              foundProduct = { id: productDoc.id, tenantId: currentTenantId, ...productDoc.data() };
              tenantId = currentTenantId;
              break;
            }
          }

          if (foundProduct) break;
        } catch (error) {
          console.error(`Error checking products for tenant ${currentTenantId}:`, error);
        }
      }

      if (!foundProduct) {
        console.log('Product not found with ID:', id);
        setProduct(null);
        return;
      }

      console.log('Loaded product:', foundProduct);
      setProduct(foundProduct);
      loadReviews(foundProduct.id);

      if (tenantId) {
        const storeDoc = await getDoc(doc(db, 'tenants', tenantId));
        if (storeDoc.exists()) {
          const storeData = storeDoc.data();

          // Fallback for legacy entries where totalOrders may not be set:
          // compute from product soldCount at tenant level
          if (!Number.isFinite(Number(storeData.totalOrders))) {
            try {
              const productDocs = await getDocs(query(collection(db, `tenants/${tenantId}/products`)));
              const totalOrderCount = productDocs.docs.reduce((sum, itemDoc) => {
                const sold = Number(itemDoc.data()?.soldCount || 0);
                return sum + (Number.isFinite(sold) ? sold : 0);
              }, 0);
              setStore({ ...storeData, totalOrders: totalOrderCount });
            } catch (error) {
              console.error('Failed to calculate fallback totalOrders:', error);
              setStore({ ...storeData, totalOrders: 0 });
            }
          } else {
            setStore(storeData);
          }
        }

        try {
          // Authoritative vendor order count from orders collection
          const vendorOrdersQuery = query(
            collection(db, 'orders'),
            where('tenantId', '==', tenantId),
            where('paymentStatus', '==', 'paid')
          );
          const vendorOrdersSnapshot = await getDocs(vendorOrdersQuery);
          setVendorOrdersCount(vendorOrdersSnapshot.size);
        } catch (error) {
          console.error('Failed to load vendor paid order count:', error);
        }

        try {
          // Vendor sales = number of products sold across all products
          const vendorProducts = await getDocs(query(collection(db, `tenants/${tenantId}/products`)));
          const totalSold = vendorProducts.docs.reduce((sum, pDoc) => {
            const soldCount = Number(pDoc.data()?.soldCount || 0);
            return sum + (Number.isFinite(soldCount) ? soldCount : 0);
          }, 0);
          setVendorProductsSold(totalSold);
        } catch (error) {
          console.error('Failed to load vendor products sold count:', error);
        }
      }

      // Load related products
      if (foundProduct.category) {
        const relatedQuery = query(
          collectionGroup(db, 'products'),
          where('category', '==', foundProduct.category),
          where('isPublished', '==', true),
          limit(8)
        );
        const relatedSnap = await getDocs(relatedQuery);
        setRelatedProducts(
          relatedSnap.docs
            .map((rel) => ({
              id: rel.id,
              tenantId: rel.ref.parent.parent?.id,
              ...rel.data()
            }))
            .filter((item) => item.id !== id)
        );
      }
    } catch (error) {
      console.error('Failed to load product', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVariationChange = (variationType, value) => {
    const normalizedValue = value && typeof value === 'object'
      ? (value.value ?? value.label ?? value.name ?? '')
      : value;
    setSelectedVariations(prev => ({
      ...prev,
      [variationType]: normalizedValue
    }));
  };

  const clearVariations = () => {
    setSelectedVariations({});
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: product.description,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      // Could show a toast here
    }
  };

  const nextImage = () => {
    setActiveImage((prev) => (prev + 1) % (product?.images?.length || 1));
  };

  const prevImage = () => {
    setActiveImage((prev) => (prev - 1 + (product?.images?.length || 1)) % (product?.images?.length || 1));
  };

  const normalizeOption = (option) => {
    if (!option) return null;
    if (typeof option !== 'object') {
      const value = String(option ?? '').trim();
      if (!value) return null;
      return { label: value, value, imageUrl: '' };
    }
    const label = String(option.label ?? option.name ?? option.value ?? '').trim();
    const value = String(option.value ?? option.label ?? option.name ?? '').trim();
    const imageUrl = option.imageUrl ?? option.image ?? '';
    const displayValue = value || label;
    if (!displayValue) return null;
    return { label: label || displayValue, value: value || displayValue, imageUrl };
  };

  const normalizeOptions = (options) =>
    (Array.isArray(options) ? options : [])
      .map(normalizeOption)
      .filter(Boolean);

  const attributesWithOptions = (product?.attributes || []).map((attr) => ({
    ...attr,
    normalizedOptions: normalizeOptions(attr.options)
  }));

  const variationAttributes = attributesWithOptions.filter(
    (attr) => attr.variation && attr.normalizedOptions.length > 0
  );
  const requiresSelection = variationAttributes.length > 0;
  const optionAttributes = (requiresSelection ? variationAttributes : attributesWithOptions)
    .filter((attr) => attr.normalizedOptions.length > 0);
  const variationsAvailable = Array.isArray(product?.variations) && product.variations.length > 0;
  const normalizeValue = (value) => {
    if (value && typeof value === 'object') {
      const candidate = value.value ?? value.label ?? value.name ?? value.key ?? '';
      return String(candidate ?? '').trim().toLowerCase();
    }
    return String(value ?? '').trim().toLowerCase();
  };
  const getSelectedValue = (attr) => {
    if (selectedVariations[attr.name] !== undefined) return selectedVariations[attr.name];
    if (attr.slug && selectedVariations[attr.slug] !== undefined) return selectedVariations[attr.slug];
    const key = Object.keys(selectedVariations).find((k) =>
      normalizeValue(k) === normalizeValue(attr.name)
        || (attr.slug && normalizeValue(k) === normalizeValue(attr.slug))
    );
    return key ? selectedVariations[key] : undefined;
  };
  const getVariationValue = (variation, attr) => {
    if (!variation?.attributes) return undefined;
    const attrs = variation.attributes;
    if (Array.isArray(attrs)) {
      const byKey = attrs.find((item) => {
        const key = item?.name ?? item?.label ?? item?.key ?? '';
        return normalizeValue(key) === normalizeValue(attr.name)
          || (attr.slug && normalizeValue(key) === normalizeValue(attr.slug));
      });
      return byKey?.value ?? byKey?.option ?? byKey?.label ?? byKey?.name;
    }
    if (attrs[attr.name] !== undefined) return attrs[attr.name];
    if (attr.slug && attrs[attr.slug] !== undefined) return attrs[attr.slug];
    const key = Object.keys(attrs).find((k) =>
      normalizeValue(k) === normalizeValue(attr.name)
        || (attr.slug && normalizeValue(k) === normalizeValue(attr.slug))
    );
    return key ? attrs[key] : undefined;
  };

  const buildVariationAttributeMap = (variation) => {
    const map = {};
    const attrs = variation?.attributes;
    if (!attrs) return map;
    if (Array.isArray(attrs)) {
      attrs.forEach((item) => {
        const key = normalizeValue(item?.name ?? item?.label ?? item?.key);
        const value = normalizeValue(item?.value ?? item?.option ?? item?.label ?? item?.name);
        if (key) map[key] = value;
      });
      return map;
    }
    Object.entries(attrs).forEach(([key, value]) => {
      const normalizedKey = normalizeValue(key);
      const normalizedValue = normalizeValue(value);
      if (normalizedKey) map[normalizedKey] = normalizedValue;
    });
    return map;
  };
  const missingVariations = requiresSelection
    ? variationAttributes.filter((attr) => !getSelectedValue(attr))
    : [];
  const selectionComplete = missingVariations.length === 0;

  const selectedVariation = selectionComplete && variationsAvailable
    ? product.variations.find((variation) => {
        const attrMap = buildVariationAttributeMap(variation);
        return variationAttributes.every((attr) => {
          const selectedValue = normalizeValue(getSelectedValue(attr));
          const directValue = normalizeValue(getVariationValue(variation, attr));
          if (directValue && directValue === selectedValue) return true;
          const keyCandidates = [attr.name, attr.slug]
            .filter(Boolean)
            .map((key) => normalizeValue(key));
          return keyCandidates.some((key) => attrMap[key] === selectedValue);
        });
      })
    : null;

  const resolveVariationPricing = (variation) => {
    if (!variation) {
      const base = resolveSalePricing(product, new Date());
      return { price: base.price, originalPrice: base.originalPrice };
    }
    const pricing = resolveSalePricing(variation, new Date(), product);
    return { price: pricing.price, originalPrice: pricing.originalPrice };
  };

  const resolveVariationStock = (variation) => {
    if (!variation) return null;
    const status = String(variation.stockStatus || '').toLowerCase();
    if (status === 'outofstock') return 0;
    const qty = Number(variation.stockQuantity);
    if (Number.isFinite(qty)) {
      // If stock is tracked but set to 0 while status is in stock,
      // treat as unlimited to avoid blocking add-to-cart unintentionally.
      if (qty === 0 && status === 'instock') return null;
      return qty;
    }
    return null;
  };

  const baseStock = (() => {
    if (requiresSelection && !variationsAvailable) {
      // If variations aren't configured, don't block purchase on base stock.
      return null;
    }
    const status = String(product?.stockStatus || '').toLowerCase();
    if (status === 'outofstock') return 0;
    if (product?.manageStock) {
      const qty = Number(product.stockQuantity);
      if (Number.isFinite(qty)) return qty;
    }
    return null;
  })();

  const availableStock = selectedVariation ? resolveVariationStock(selectedVariation) : baseStock;
  const hasVariationMismatch = requiresSelection && selectionComplete && variationsAvailable && !selectedVariation;
  const inStock = requiresSelection
    ? selectionComplete && !hasVariationMismatch && (availableStock === null || availableStock > 0)
    : availableStock === null || availableStock > 0;
  const canAddToCart = inStock;

  const displayPricing = selectedVariation ? resolveVariationPricing(selectedVariation) : {
    price: Number(product?.price || 0),
    originalPrice: product?.originalPrice ? Number(product.originalPrice) : null
  };

  const stockLabel = (() => {
    if (requiresSelection && !selectionComplete) return 'Select options to see availability';
    if (hasVariationMismatch) return 'This combination is unavailable';
    if (availableStock === null) return 'In stock';
    if (availableStock > 10) return `${availableStock} available`;
    if (availableStock > 0) return `Only ${availableStock} left`;
    return 'Out of stock';
  })();

  const stockTone = (() => {
    if (requiresSelection && !selectionComplete) return 'text-gray-500';
    if (!inStock) return 'text-red-600';
    if (availableStock === null) return 'text-green-600';
    if (availableStock > 10) return 'text-green-600';
    if (availableStock > 0) return 'text-orange-600';
    return 'text-red-600';
  })();

  useEffect(() => {
    if (availableStock === null) return;
    if (availableStock <= 0) {
      setQuantity(1);
      return;
    }
    if (quantity > availableStock) {
      setQuantity(availableStock);
    }
  }, [availableStock, quantity]);

  const clearAddToCartTimers = () => {
    addToCartTimers.current.forEach((timer) => clearTimeout(timer));
    addToCartTimers.current = [];
  };

  useEffect(() => () => clearAddToCartTimers(), []);

  const handleAddToCart = () => {
    if (!product) return;
    if (requiresSelection && missingVariations.length > 0) return;
    if (requiresSelection && selectionComplete && variationsAvailable && !selectedVariation) return;

    const cartItem = { ...product, selectedVariations };
    if (selectedVariation) {
      const pricing = resolveVariationPricing(selectedVariation);
      cartItem.price = pricing.price;
      cartItem.originalPrice = pricing.originalPrice;
      cartItem.variationId = selectedVariation.id;
      cartItem.sku = selectedVariation.sku || product.sku;
      cartItem.weight = selectedVariation.weight || product.weight;
      cartItem.dimensions = selectedVariation.dimensions || product.dimensions;
      if (selectedVariation.image) {
        const rest = (product.images || []).filter((img) => img !== selectedVariation.image);
        cartItem.images = [selectedVariation.image, ...rest];
      }
      cartItem.stockQuantity = selectedVariation.stockQuantity;
      cartItem.stockStatus = selectedVariation.stockStatus;
    } else {
      cartItem.weight = product.weight;
      cartItem.dimensions = product.dimensions;
    }

    addToCart(cartItem, quantity);

    clearAddToCartTimers();
    setAddToCartState('adding');
    addToCartTimers.current.push(
      setTimeout(() => {
        setAddToCartState('added');
      }, 200)
    );
    addToCartTimers.current.push(
      setTimeout(() => {
        setAddToCartState('idle');
      }, 1400)
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <ShopHeader categories={[]} />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
          <p className="text-gray-500 mt-4">Loading product...</p>
        </div>
        <ShopFooter />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-white">
        <ShopHeader categories={[]} />
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Product Not Found</h1>
          <p className="text-gray-500 mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <Link to="/" className="bg-yellow-400 text-gray-900 px-6 py-3 rounded-lg font-bold hover:bg-yellow-500">
            Continue Shopping
          </Link>
        </div>
        <ShopFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <ShopHeader categories={[]} />

      {/* Breadcrumb Navigation */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <nav className="text-sm text-gray-500">
          <Link to="/" className="hover:text-blue-600">Home</Link>
          <span className="mx-2">&gt;</span>
          <Link to="/search" className="hover:text-blue-600">{product.category || 'Products'}</Link>
          <span className="mx-2">&gt;</span>
          <span className="text-gray-900">{product.name}</span>
        </nav>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 pb-24 lg:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12">
          {/* Image Gallery */}
          <div className="space-y-4 min-w-0">
              {/* Main Image */}
              <div className="relative group">
                <div
                  className="w-full max-w-[520px] mx-auto bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center p-4 min-h-[320px] max-h-[520px]"
                  style={{ aspectRatio: '3 / 4' }}
                >
                  <img
                    src={product.images?.[activeImage] || '/placeholder.svg'}
                    alt={product.name}
                    className="w-full h-full object-contain cursor-zoom-in"
                    onClick={() => setIsZoomed(true)}
                  />
                  <button
                    onClick={() => setIsZoomed(true)}
                  className="absolute top-4 right-4 p-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ZoomIn size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Image Navigation */}
              {product.images && product.images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow hover:bg-gray-50"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white rounded-full shadow hover:bg-gray-50"
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Strip */}
            {product.images && product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 max-w-full min-w-0">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded border-2 overflow-hidden ${
                      activeImage === idx ? 'border-blue-500' : 'border-gray-200'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Image Counter */}
            {product.images && product.images.length > 1 && (
              <div className="text-center text-sm text-gray-500">
                {activeImage + 1} of {product.images.length}
              </div>
            )}
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            {/* Title */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
              <div className="flex flex-wrap items-center gap-4 mb-4">
                {reviewStats.count > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={16}
                          className={
                            star <= Math.round(reviewStats.average)
                              ? 'fill-yellow-400 text-yellow-400'
                              : 'text-gray-300'
                          }
                        />
                      ))}
                    </div>
                    <span>{reviewStats.average.toFixed(1)} ({reviewStats.count} reviews)</span>
                  </div>
                )}
                <span className="text-gray-500">{product.soldCount || 0} sold</span>
              </div>
            </div>

            {/* Price */}
            <div className="border-t border-b py-6">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-3xl sm:text-4xl font-bold text-gray-900">
                  R{Number(displayPricing.price || 0).toFixed(2)}
                </span>
                {displayPricing.originalPrice && (
                  <>
                    <span className="text-lg text-gray-500 line-through">
                      R{Number(displayPricing.originalPrice || 0).toFixed(2)}
                    </span>
                    <span className="text-red-600 font-medium">
                      Save R{(Number(displayPricing.originalPrice || 0) - Number(displayPricing.price || 0)).toFixed(2)}
                    </span>
                  </>
                )}
              </div>
              <p className="text-sm text-gray-500">Inclusive of VAT</p>
            </div>

            {/* Variations */}
            {optionAttributes.length > 0 && (
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Options</h3>
                {optionAttributes.map((attr) => (
                  <div key={attr.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {attr.name}
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {attr.normalizedOptions.map((option, optionIndex) => {
                        const optionLabel = option.label || option.value;
                        const optionValue = option.value || optionLabel;
                        const optionImage = option.imageUrl || '';
                        const selectedValue = normalizeValue(getSelectedValue(attr));
                        const isSelected =
                          selectedValue !== '' && selectedValue === normalizeValue(optionValue);
                        return (
                          <button
                            key={`${optionValue}-${optionIndex}`}
                            onClick={() => handleVariationChange(attr.name, optionValue)}
                            className={`border rounded text-sm sm:text-base ${
                              optionImage ? 'p-2 w-20' : 'px-4 py-2'
                            } ${isSelected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 hover:border-gray-400'}`}
                            title={optionLabel}
                          >
                            {optionImage ? (
                              <div className="flex flex-col items-center gap-2 w-16">
                                <img
                                  src={optionImage}
                                  alt={optionLabel || 'Option'}
                                  className="h-12 w-12 rounded object-cover border"
                                />
                                <span className="text-[11px] text-gray-700 truncate w-full text-center">
                                  {optionLabel}
                                </span>
                              </div>
                            ) : (
                              optionLabel
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {missingVariations.length > 0 && (
                  <p className="text-sm text-red-600">
                    Select: {missingVariations.map((attr) => attr.name).join(', ')}
                  </p>
                )}
                {Object.keys(selectedVariations).length > 0 && (
                  <button
                    onClick={clearVariations}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Clear selections
                  </button>
                )}
              </div>
            )}

            {/* Quantity and Stock */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center border rounded">
                  <button
                    type="button"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-2 hover:bg-gray-100"
                    disabled={quantity <= 1}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="px-4 py-2 font-medium min-w-[3rem] text-center">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(quantity + 1)}
                    className="px-4 py-2 hover:bg-gray-100"
                    disabled={!inStock || (availableStock !== null && quantity >= availableStock)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <span className={`text-sm ${stockTone}`}>
                  {stockLabel}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!canAddToCart || addToCartState !== 'idle'}
                  className={`w-full sm:flex-1 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    addToCartState === 'added'
                      ? 'bg-green-500 text-white'
                      : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                  }`}
                >
                  {addToCartState === 'adding'
                    ? 'Adding...'
                    : addToCartState === 'added'
                      ? 'Added ✓'
                      : 'Add to Cart'}
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsWishlisted(!isWishlisted)}
                    className={`flex-1 sm:flex-none p-3 border rounded-lg hover:bg-gray-50 ${isWishlisted ? 'text-red-500 border-red-200' : 'text-gray-600'}`}
                  >
                    <Heart size={24} className={isWishlisted ? 'fill-current' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="flex-1 sm:flex-none p-3 border rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    <Share2 size={24} />
                  </button>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Shield size={16} className="text-blue-600" />
                <span>Secure Payment</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Award size={16} className="text-green-600" />
                <span>Authentic Product</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle size={16} className="text-purple-600" />
                <span>10-Day Returns</span>
              </div>
            </div>
          </div>
        </div>

        {/* Vendor Information */}
        <div className="mt-12 bg-gray-50 p-6 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-gray-600 font-bold text-lg">
                  {(store?.name || product.storeName || 'M')[0].toUpperCase()}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-lg">Sold by {store?.name || product.storeName || 'MzansiShop'}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span>{vendorSalesLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                to={store?.subdomain ? `/store/${store.subdomain}` : '#'}
                className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-100"
              >
                Visit Store
              </Link>
            </div>
          </div>
        </div>

        {/* Product Details Tabs */}
        <div className="mt-12">
          <div className="border-b border-gray-200">
            <nav className="flex gap-6 overflow-x-auto whitespace-nowrap">
              {[
                { id: 'description', label: 'Description' },
                { id: 'reviews', label: `Reviews${reviewStats.count > 0 ? ` (${reviewStats.count})` : ''}` },
                { id: 'shipping', label: 'Shipping & Returns' },
                { id: 'qa', label: 'Q&A' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="py-8">
            {activeTab === 'description' && (
              <div className="prose max-w-none">
                <h3 className="text-lg font-medium mb-4">Product Description</h3>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {product.description || 'No detailed description available.'}
                </div>
                {product.specifications && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-3">Specifications</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(product.specifications).map(([key, value]) => (
                        <div key={key} className="flex justify-between py-2 border-b border-gray-100">
                          <span className="font-medium">{key}</span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reviews' && (
              <div>
                <h3 className="text-lg font-medium mb-4">Customer Reviews</h3>
                {loadingReviews && <p className="text-gray-500">Loading reviews...</p>}
                {!loadingReviews && reviews.length === 0 && (
                  <p className="text-gray-500">No reviews yet.</p>
                )}
                {!loadingReviews && reviews.length > 0 && (
                  <div className="space-y-6">
                    {reviews.map((review) => {
                      const ratingValue = Number(review.rating || 0);
                      const reviewer =
                        review.userName || review.customerName || review.name || 'Anonymous';
                      const reviewText = review.comment || review.text || review.review || '';
                      const createdAt = review.createdAt?.toDate?.()
                        || (review.createdAt ? new Date(review.createdAt) : null);

                      return (
                        <div key={review.id} className="border-b border-gray-200 pb-6">
                          <div className="flex items-center gap-2 mb-2">
                            {ratingValue > 0 && (
                              <div className="flex">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    size={16}
                                    className={
                                      star <= Math.round(ratingValue)
                                        ? 'fill-yellow-400 text-yellow-400'
                                        : 'text-gray-300'
                                    }
                                  />
                                ))}
                              </div>
                            )}
                            <span className="font-medium">{reviewer}</span>
                            {createdAt && (
                              <span className="text-gray-500 text-sm">
                                {createdAt.toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {reviewText && (
                            <p className="text-gray-700">{reviewText}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'shipping' && (
              <div>
                <h3 className="text-lg font-medium mb-4">Shipping & Returns</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Truck size={20} className="text-green-600" />
                      Shipping Information
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• Standard delivery: 4-7 business days</li>
                      <li>• Express delivery: 1-2 business days</li>
                      <li>• Tracking number provided via email</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <RefreshCw size={20} className="text-blue-600" />
                      Returns & Exchanges
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li>• 10-day return policy</li>
                      <li>• Items must be unused and in original packaging</li>
                      <li>• Free return shipping for defective items</li>
                      <li>• Refunds processed within 5-7 business days</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'qa' && (
              <div>
                <h3 className="text-lg font-medium mb-4">Questions & Answers</h3>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="font-medium mb-2">Q: Is this product authentic?</p>
                    <p className="text-gray-600">A: Yes, all our products are 100% authentic with certificates of authenticity.</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="font-medium mb-2">Q: Do you offer warranty?</p>
                    <p className="text-gray-600">A: Yes, this product comes with a 1-year manufacturer warranty.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">You might also like</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {relatedProducts.slice(0, 5).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        )}

        {/* More from this vendor */}
        {relatedProducts.length > 5 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">More from {store?.name || product.storeName || 'this seller'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {relatedProducts.slice(5, 10).map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Image Zoom Modal */}
        {isZoomed && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setIsZoomed(false)}>
            <div className="relative w-[90vw] h-[90vh] p-4">
              <img
                src={product.images?.[activeImage] || '/placeholder.svg'}
                alt={product.name}
                className="max-w-full max-h-full object-contain"
            />
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 p-2 bg-white rounded-full shadow hover:bg-gray-100"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Add to Cart (Mobile) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-gray-900">
                R{Number(displayPricing.price || 0).toFixed(2)}
              </span>
              {displayPricing.originalPrice && (
                <span className="text-sm text-gray-500 line-through">
                  R{Number(displayPricing.originalPrice || 0).toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canAddToCart || addToCartState !== 'idle'}
            className={`flex-1 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 ${
              addToCartState === 'added'
                ? 'bg-green-500 text-white'
                : 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
            }`}
          >
            {addToCartState === 'adding'
              ? 'Adding...'
              : addToCartState === 'added'
                ? 'Added ✓'
                : 'Add to Cart'}
          </button>
        </div>
      </div>

      <ShopFooter />
    </div>
  );
}
