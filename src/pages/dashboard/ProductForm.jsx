import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { 
  Save, X, Plus, Trash2, ChevronDown, ChevronUp, 
  Image as ImageIcon, Package, DollarSign, Truck, Tag 
} from 'lucide-react';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'general', label: 'General', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'shipping', label: 'Shipping', icon: Truck },
  { id: 'attributes', label: 'Attributes', icon: Tag },
  { id: 'variations', label: 'Variations', icon: Package },
  { id: 'seo', label: 'SEO', icon: Tag },
];

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenant, user } = useAuth();
  
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [isGalleryDragging, setIsGalleryDragging] = useState(false);
  const [isMainImageDragging, setIsMainImageDragging] = useState(false);
  const [draggingOptionKey, setDraggingOptionKey] = useState(null);
  
  // Product state
  const [product, setProduct] = useState({
    // General
    name: '',
    slug: '',
    type: 'simple',
    description: '',
    shortDescription: '',
    
    // Pricing
    regularPrice: '',
    salePrice: '',
    saleStartDate: '',
    saleEndDate: '',
    
    // Inventory
    sku: '',
    manageStock: true,
    stockQuantity: 0,
    stockStatus: 'instock',
    lowStockThreshold: 5,
    soldIndividually: false,
    
    // Shipping
    weight: '',
    dimensions: { length: '', width: '', height: '' },
    shippingClass: 'standard',
    
    // Tax
    taxStatus: 'taxable',
    taxClass: 'standard',
    
    // Categories & Tags
    categories: [],
    tags: [],
    
    // Images
    mainImage: '',
    galleryImages: [],
    
    // Attributes (for variations)
    attributes: [],
    
    // Variations
    variations: [],
    
    // Downloadable
    downloadable: { files: [], limit: -1, expiry: -1 },
    virtual: false,
    
    // External
    externalUrl: '',
    buttonText: 'Buy Product',
    
    // SEO
    seo: { title: '', description: '', focusKeyword: '' },
    
    // Status
    status: 'draft',
    featured: false,
    catalogVisibility: 'visible'
  });

  useEffect(() => {
    if (id && id !== 'new') {
      loadProduct();
    }
  }, [id]);

  useEffect(() => {
    loadCategories();
  }, []);

  const createLocalId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  };

  const uploadImage = async (file) => {
    if (!file) return null;
    if (!user) {
      toast.error('Please sign in to upload images');
      return null;
    }
    if (!tenant?.id) {
      toast.error('Tenant not loaded. Please reload and try again.');
      return null;
    }

    try {
      const fileName = `${Date.now()}-${file.name}`;
      const storageRef = ref(storage, `products/${tenant?.id}/${fileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      const message = String(error?.message || '');
      if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('preflight')) {
        toast.error('Upload blocked by CORS. Configure Storage CORS and try again.');
      } else if (error?.code === 'storage/unauthorized' || message.toLowerCase().includes('unauthorized')) {
        toast.error('Not authorized to upload. Please sign in again.');
      } else {
        toast.error('Failed to upload image');
      }
      return null;
    }
  };

  const deleteImage = async (imageUrl) => {
    if (!imageUrl) return;

    try {
      const imageRef = ref(storage, imageUrl);
      await deleteObject(imageRef);
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  };

  const handleMainImageFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    const uploadToast = toast.loading('Uploading image...');

    try {
      const imageUrl = await uploadImage(file);
      if (imageUrl) {
        if (product.mainImage) {
          await deleteImage(product.mainImage);
        }

        setProduct(prev => ({ ...prev, mainImage: imageUrl }));
        toast.success('Image uploaded successfully');
      }
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      toast.dismiss(uploadToast);
    }
  };

  const handleMainImageUpload = async (e) => {
    await handleMainImageFile(e.target.files[0]);
    e.target.value = '';
  };

  const uploadGalleryFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const validFiles = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5MB`);
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length === 0) return;

    const uploadToast = toast.loading(
      `Uploading ${validFiles.length} image${validFiles.length > 1 ? 's' : ''}...`
    );

    try {
      const uploaded = [];
      for (const file of validFiles) {
        const imageUrl = await uploadImage(file);
        if (imageUrl) uploaded.push(imageUrl);
      }
      if (uploaded.length > 0) {
        setProduct(prev => ({
          ...prev,
          galleryImages: [...prev.galleryImages, ...uploaded]
        }));
        toast.success(`${uploaded.length} image${uploaded.length > 1 ? 's' : ''} added to gallery`);
      }
    } catch (error) {
      toast.error('Failed to upload images');
    } finally {
      toast.dismiss(uploadToast);
    }
  };

  const handleGalleryImageUpload = async (e) => {
    await uploadGalleryFiles(e.target.files);
    e.target.value = '';
  };

  const handleGalleryDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGalleryDragging(true);
  };

  const handleGalleryDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGalleryDragging(false);
  };

  const handleGalleryDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGalleryDragging(false);
    await uploadGalleryFiles(e.dataTransfer.files);
  };

  const removeGalleryImage = async (index) => {
    const imageUrl = product.galleryImages[index];
    
    // Delete from storage
    await deleteImage(imageUrl);
    
    // Remove from state
    setProduct(prev => ({
      ...prev,
      galleryImages: prev.galleryImages.filter((_, i) => i !== index)
    }));
    
    toast.success('Image removed from gallery');
  };

  const loadProduct = async () => {
    setLoading(true);
    try {
      const sanitizedTenantId = tenant.id.replace(/[^a-zA-Z0-9_-]/g, '');
      const docPath = `tenants/${sanitizedTenantId}/products/${id}`;
      const docSnap = await getDoc(doc(db, docPath));
      if (docSnap.exists()) {
        const loadedData = docSnap.data();
        // Ensure arrays are properly initialized and map shop fields to form fields
        const safeData = {
          ...loadedData,
          categories: loadedData.categories || [],
          tags: loadedData.tags || [],
          attributes: loadedData.attributes || [],
          variations: loadedData.variations || [],
          seo: loadedData.seo || { title: '', description: '', focusKeyword: '' },
          dimensions: loadedData.dimensions || { length: '', width: '', height: '' },
          downloadable: loadedData.downloadable || { files: [], limit: -1, expiry: -1 },
          // Map shop fields back to form fields
          status: loadedData.isPublished ? 'published' : 'draft',
          mainImage: loadedData.images?.[0] || '',
          galleryImages: loadedData.images?.slice(1) || [],
          regularPrice: loadedData.originalPrice || loadedData.price || '',
          salePrice: loadedData.originalPrice ? loadedData.price : ''
        };
        
        // Set type to 'variable' if variations exist
        if (safeData.variations && safeData.variations.length > 0) {
          safeData.type = 'variable';
        }
        
        setProduct({ ...product, ...safeData });
      }
    } catch (error) {
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'categories'));
      const data = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setCategoryOptions(data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      
      if (!product.name) {
        toast.error('Product name is required');
        return;
      }
      
      if (!tenant?.id || typeof tenant.id !== 'string' || tenant.id.trim() === '') {
        toast.error('Invalid vendor ID');
        return;
      }

      // Sanitize tenant.id to ensure it's valid
      const sanitizedTenantId = tenant.id.replace(/[^a-zA-Z0-9_-]/g, '');
      if (sanitizedTenantId !== tenant.id) {
        console.warn('Tenant ID contained invalid characters, sanitized:', tenant.id, '->', sanitizedTenantId);
      }

      // Ensure all required fields are present and valid
      const normalizedAttributes = Array.isArray(product.attributes)
        ? product.attributes.map((attr) => {
            const optionType = attr.optionType || 'text';
            if (optionType === 'image') {
              const options = normalizeImageOptions(attr.options).filter(
                (option) => option.label || option.value || option.imageUrl
              );
              return { ...attr, optionType, options };
            }
            const options = normalizeTextOptions(attr.options);
            return { ...attr, optionType, options };
          })
        : [];

      const safeProductData = {
        ...product,
        name: product.name || 'Untitled Product',
        description: product.description || '',
        shortDescription: product.shortDescription || '',
        categories: Array.isArray(product.categories) ? product.categories : [],
        tags: Array.isArray(product.tags) ? product.tags : [],
        galleryImages: Array.isArray(product.galleryImages) ? product.galleryImages : [],
        attributes: normalizedAttributes,
        variations: Array.isArray(product.variations) ? product.variations : [],
        seo: product.seo || { title: '', description: '', focusKeyword: '' },
        dimensions: product.dimensions || { length: '', width: '', height: '' },
        downloadable: product.downloadable || { files: [], limit: -1, expiry: -1 }
      };

        const hasWeight = safeProductData.weight !== '' && safeProductData.weight !== null && safeProductData.weight !== undefined;
        const dims = safeProductData.dimensions || { length: '', width: '', height: '' };
        const hasDims = ['length', 'width', 'height'].some((key) => String(dims?.[key] ?? '').trim() !== '');

        const regularPriceValue = Number(safeProductData.regularPrice);
        const salePriceValue = Number(safeProductData.salePrice);
        const baseRegularPrice = Number.isFinite(regularPriceValue) && regularPriceValue > 0 ? regularPriceValue : null;
        const baseSalePrice = Number.isFinite(salePriceValue) && salePriceValue > 0 ? salePriceValue : null;
        const hasValidSale =
          baseRegularPrice !== null
          && baseSalePrice !== null
          && baseSalePrice < baseRegularPrice;
        const baseFallbackPrice = Number(
          safeProductData.price ?? safeProductData.regularPrice ?? safeProductData.salePrice ?? 0
        );
        const basePrice = hasValidSale
          ? baseSalePrice
          : (baseRegularPrice ?? (Number.isFinite(baseFallbackPrice) ? baseFallbackPrice : 0));

        const baseManageStock = safeProductData.manageStock !== false;
        const baseStockQty = Number(safeProductData.stockQuantity);
        const baseStockQuantity = baseManageStock && Number.isFinite(baseStockQty) ? baseStockQty : null;
        const baseStockStatus = safeProductData.stockStatus || 'instock';

        const syncedVariations = Array.isArray(safeProductData.variations)
          ? safeProductData.variations.map((variation) => {
              const overridePricing = variation.overridePricing === true;
              const overrideStock = variation.overrideStock === true;

              const varRegularRaw = Number(variation.regularPrice ?? variation.price ?? 0);
              const varSaleRaw = Number(variation.salePrice ?? 0);
              const varRegular = Number.isFinite(varRegularRaw) && varRegularRaw > 0 ? varRegularRaw : null;
              const varSale = Number.isFinite(varSaleRaw) && varSaleRaw > 0 ? varSaleRaw : null;

              const resolvedRegular = overridePricing
                ? (varRegular ?? baseRegularPrice ?? basePrice)
                : (baseRegularPrice ?? varRegular ?? basePrice);
              const resolvedSale = overridePricing
                ? varSale
                : (hasValidSale ? baseSalePrice : varSale);
              const resolvedOnSale =
                Number.isFinite(resolvedRegular)
                && resolvedRegular > 0
                && Number.isFinite(resolvedSale)
                && resolvedSale > 0
                && resolvedSale < resolvedRegular;
              const resolvedPrice = resolvedOnSale ? resolvedSale : (resolvedRegular ?? basePrice);

              const resolvedStockQuantity = overrideStock || !baseManageStock
                ? variation.stockQuantity
                : (baseStockQuantity ?? variation.stockQuantity);
              const resolvedStockStatus = overrideStock || !baseManageStock
                ? (variation.stockStatus || baseStockStatus)
                : baseStockStatus;

              return {
                ...variation,
                price: resolvedPrice,
                regularPrice: resolvedRegular,
                salePrice: resolvedOnSale ? resolvedSale : '',
                stockQuantity: resolvedStockQuantity,
                stockStatus: resolvedStockStatus,
                ...(hasWeight ? { weight: safeProductData.weight } : {}),
                ...(hasDims ? { dimensions: dims } : {})
              };
            })
          : [];

        const productData = {
          ...safeProductData,
          variations: syncedVariations,
          slug: safeProductData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          updatedAt: new Date(),
          vendorId: tenant.id,
          vendorName: tenant.name,
          // Shop-compatible fields
          isPublished: safeProductData.status === 'published',
          images: safeProductData.mainImage ? [safeProductData.mainImage, ...safeProductData.galleryImages] : safeProductData.galleryImages,
          price: basePrice,
          originalPrice: hasValidSale ? baseRegularPrice : null,
          category: safeProductData.categories?.[0] || null
        };

      console.log('Saving product with status:', safeProductData.status);
      console.log('Current product state:', product);
      console.log('Final productData:', productData);

      if (id === 'new') {
        const collectionPath = `tenants/${sanitizedTenantId}/products`;
        const collectionRef = collection(db, collectionPath);
        const docRef = await addDoc(collectionRef, {
          ...productData,
          createdAt: new Date()
        });
        toast.success('Product created');
        navigate(`/sell/dashboard/products/${docRef.id}`);
      } else {
        console.log('Updating existing product');
        const docPath = `tenants/${sanitizedTenantId}/products/${id}`;
        console.log('Document path string:', docPath);
        const docRef = doc(db, docPath);
        console.log('Document ref:', docRef);
        await updateDoc(docRef, productData);
        toast.success('Product updated');
      }
    } catch (error) {
      console.error('Save error:', error);
      console.error('Error stack:', error.stack);
      toast.error('Save failed: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Attribute management
  const addAttribute = () => {
    setProduct({
      ...product,
      attributes: [
        ...product.attributes,
        { name: '', slug: '', optionType: 'text', options: [], visible: true, variation: false }
      ]
    });
  };

  const updateAttribute = (index, field, value) => {
    const newAttrs = [...product.attributes];
    newAttrs[index][field] = value;
    setProduct({ ...product, attributes: newAttrs });
  };

  const normalizeText = (value) => String(value ?? '').trim();

  function normalizeImageOptions(options) {
    return (Array.isArray(options) ? options : []).map((option) => {
      if (option && typeof option === 'object') {
        const id = option.id || option._id || createLocalId();
        const label = normalizeText(option.label ?? option.value ?? option.name ?? '');
        const value = normalizeText(option.value ?? option.label ?? option.name ?? '');
        const finalLabel = label || value;
        const finalValue = value || label;
        return {
          id,
          label: finalLabel,
          value: finalValue,
          imageUrl: option.imageUrl || option.image || ''
        };
      }
      const text = normalizeText(option);
      return { id: createLocalId(), label: text, value: text, imageUrl: '' };
    });
  }

  function normalizeTextOptions(options) {
    return (Array.isArray(options) ? options : [])
      .map((option) => (
        typeof option === 'object'
          ? normalizeText(option.label ?? option.value ?? option.name ?? '')
          : normalizeText(option)
      ))
      .filter((option) => option !== '');
  }

  const updateAttributeOptionType = (index, optionType) => {
    const newAttrs = [...product.attributes];
    const current = newAttrs[index] || {};
    const options = current.options || [];
    newAttrs[index] = {
      ...current,
      optionType,
      options: optionType === 'image' ? normalizeImageOptions(options) : normalizeTextOptions(options)
    };
    setProduct({ ...product, attributes: newAttrs });
  };

  const updateAttributeOption = (attrIndex, optionIndex, field, value) => {
    const newAttrs = [...product.attributes];
    const currentAttr = newAttrs[attrIndex] || {};
    const options = Array.isArray(currentAttr?.options)
      ? [...currentAttr.options]
      : [];
    const currentOption = options[optionIndex] || {};
    const nextOption = { ...currentOption, [field]: value };

    if (currentAttr.optionType === 'image' && field === 'label') {
      nextOption.value = value;
    }

    options[optionIndex] = nextOption;
    newAttrs[attrIndex] = { ...currentAttr, options };
    setProduct({ ...product, attributes: newAttrs });
  };

  const addAttributeOption = (attrIndex) => {
    const newAttrs = [...product.attributes];
    const options = Array.isArray(newAttrs[attrIndex]?.options)
      ? [...newAttrs[attrIndex].options]
      : [];
    options.push({ id: createLocalId(), label: '', value: '', imageUrl: '' });
    newAttrs[attrIndex] = { ...newAttrs[attrIndex], options };
    setProduct({ ...product, attributes: newAttrs });
  };

  const removeAttributeOption = (attrIndex, optionIndex) => {
    const newAttrs = [...product.attributes];
    const options = Array.isArray(newAttrs[attrIndex]?.options)
      ? newAttrs[attrIndex].options.filter((_, idx) => idx !== optionIndex)
      : [];
    newAttrs[attrIndex] = { ...newAttrs[attrIndex], options };
    setProduct({ ...product, attributes: newAttrs });
  };

  const handleAttributeOptionImage = async (attrIndex, optionIndex, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }
    const uploadToast = toast.loading('Uploading image...');
    try {
      const imageUrl = await uploadImage(file);
      if (imageUrl) {
        updateAttributeOption(attrIndex, optionIndex, 'imageUrl', imageUrl);
        toast.success('Image uploaded');
      }
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      toast.dismiss(uploadToast);
    }
  };

  const handleOptionDragOver = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggingOptionKey !== key) {
      setDraggingOptionKey(key);
    }
  };

  const handleOptionDragLeave = (event, key) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggingOptionKey === key) {
      setDraggingOptionKey(null);
    }
  };

  const handleOptionDrop = async (event, attrIndex, optionIndex, key) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingOptionKey(null);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await handleAttributeOptionImage(attrIndex, optionIndex, file);
    }
  };

  const handleMainImageDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsMainImageDragging(true);
  };

  const handleMainImageDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsMainImageDragging(false);
  };

  const handleMainImageDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsMainImageDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await handleMainImageFile(file);
    }
  };

  const removeAttribute = (index) => {
    setProduct({
      ...product,
      attributes: product.attributes.filter((_, i) => i !== index)
    });
  };

  // Generate variations from attributes
  const generateVariations = () => {
    const variationAttrs = product.attributes.filter(a => a.variation && a.options.length > 0);
    
    if (variationAttrs.length === 0) {
      toast.error('Select attributes for variations first');
      return;
    }

    // Generate all combinations
    const combinations = variationAttrs.reduce((acc, attr) => {
      const newAcc = [];
        attr.options.forEach(option => {
          const optionValue =
            option && typeof option === 'object'
              ? (option.value || option.label || option.name || '')
              : option;
          if (acc.length === 0) {
            newAcc.push({ [attr.name]: optionValue });
          } else {
          acc.forEach(combo => {
            newAcc.push({ ...combo, [attr.name]: optionValue });
          });
        }
      });
      return newAcc;
    }, []);

      const baseStockQty = Number(product.stockQuantity);
      const baseStockQuantity = Number.isFinite(baseStockQty) ? baseStockQty : 0;
      const baseStockStatus = product.stockStatus || 'instock';
      const baseRegular = Number(product.regularPrice || product.price || 0);
      const baseSale = Number(product.salePrice || 0);
      const baseHasSale =
        Number.isFinite(baseRegular)
        && Number.isFinite(baseSale)
        && baseSale > 0
        && baseSale < baseRegular;
      const basePrice = baseHasSale ? baseSale : baseRegular;

      const newVariations = combinations.map((attrs, idx) => ({
        id: `var_${idx}`,
        attributes: attrs,
        sku: `${product.sku}-${Object.values(attrs).join('-')}`,
        price: basePrice,
        regularPrice: Number.isFinite(baseRegular) && baseRegular > 0 ? baseRegular : basePrice,
        salePrice: baseHasSale ? baseSale : '',
        stockQuantity: baseStockQuantity,
        stockStatus: baseStockStatus,
        weight: product.weight,
        image: '',
        overridePricing: false,
        overrideStock: false
      }));

    setProduct({ ...product, variations: newVariations, type: 'variable' });
    toast.success(`${newVariations.length} variations generated`);
  };

  if (loading) return <div className="flex justify-center p-12">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {id === 'new' ? 'Add New Product' : 'Edit Product'}
          </h2>
          <p className="text-gray-500">{product.name || 'Untitled Product'}</p>
        </div>
        <div className="flex gap-3">
          <select
            value={product.status}
            onChange={(e) => setProduct({...product, status: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="pending">Pending Review</option>
            <option value="private">Private</option>
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="flex border-b overflow-x-auto">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap ${
                      activeTab === tab.id 
                        ? 'border-b-2 border-blue-600 text-blue-600' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {/* GENERAL TAB */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      value={product.name}
                      onChange={(e) => setProduct({...product, name: e.target.value})}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Enter product name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                    <select
                      value={product.type}
                      onChange={(e) => setProduct({...product, type: e.target.value})}
                      className="w-full border rounded-lg px-4 py-2"
                    >
                      <option value="simple">Simple Product</option>
                      <option value="variable">Variable Product</option>
                      <option value="grouped">Grouped Product</option>
                      <option value="external">External/Affiliate Product</option>
                      <option value="downloadable">Downloadable</option>
                      <option value="virtual">Virtual</option>
                    </select>
                  </div>

                  {/* Pricing */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-4 flex items-center gap-2">
                      <DollarSign size={18} /> Pricing
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Regular Price (R)</label>
                        <input
                          type="number"
                          value={product.regularPrice}
                          onChange={(e) => setProduct({...product, regularPrice: e.target.value})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Sale Price (R)</label>
                        <input
                          type="number"
                          value={product.salePrice}
                          onChange={(e) => setProduct({...product, salePrice: e.target.value})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                    </div>
                    {product.salePrice && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Sale Start Date</label>
                          <input
                            type="date"
                            value={product.saleStartDate}
                            onChange={(e) => setProduct({...product, saleStartDate: e.target.value})}
                            className="w-full border rounded-lg px-4 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Sale End Date</label>
                          <input
                            type="date"
                            value={product.saleEndDate}
                            onChange={(e) => setProduct({...product, saleEndDate: e.target.value})}
                            className="w-full border rounded-lg px-4 py-2"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={product.description}
                      onChange={(e) => setProduct({...product, description: e.target.value})}
                      rows={6}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Full product description..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                    <textarea
                      value={product.shortDescription}
                      onChange={(e) => setProduct({...product, shortDescription: e.target.value})}
                      rows={3}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Brief description for product listings..."
                    />
                  </div>

                  {/* External Product Fields */}
                  {product.type === 'external' && (
                    <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                      <h3 className="font-medium mb-4">External Product</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Product URL</label>
                          <input
                            type="url"
                            value={product.externalUrl}
                            onChange={(e) => setProduct({...product, externalUrl: e.target.value})}
                            className="w-full border rounded-lg px-4 py-2"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Button Text</label>
                          <input
                            type="text"
                            value={product.buttonText}
                            onChange={(e) => setProduct({...product, buttonText: e.target.value})}
                            className="w-full border rounded-lg px-4 py-2"
                            placeholder="Buy Product"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Downloadable Fields */}
                  {(product.type === 'downloadable' || product.downloadable?.files?.length > 0) && (
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h3 className="font-medium mb-4">Downloadable Files</h3>
                      <div className="space-y-3">
                        {product.downloadable.files.map((file, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input
                              type="text"
                              placeholder="File Name"
                              value={file.name}
                              onChange={(e) => {
                                const newFiles = [...product.downloadable.files];
                                newFiles[idx].name = e.target.value;
                                setProduct({...product, downloadable: {...product.downloadable, files: newFiles}});
                              }}
                              className="flex-1 border rounded px-3 py-2"
                            />
                            <input
                              type="url"
                              placeholder="File URL"
                              value={file.url}
                              onChange={(e) => {
                                const newFiles = [...product.downloadable.files];
                                newFiles[idx].url = e.target.value;
                                setProduct({...product, downloadable: {...product.downloadable, files: newFiles}});
                              }}
                              className="flex-1 border rounded px-3 py-2"
                            />
                            <button
                              onClick={() => {
                                const newFiles = product.downloadable.files.filter((_, i) => i !== idx);
                                setProduct({...product, downloadable: {...product.downloadable, files: newFiles}});
                              }}
                              className="text-red-600"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            setProduct({
                              ...product,
                              downloadable: {
                                ...product.downloadable,
                                files: [...product.downloadable.files, { name: '', url: '', limit: -1 }]
                              }
                            });
                          }}
                          className="flex items-center gap-2 text-blue-600 text-sm"
                        >
                          <Plus size={16} /> Add File
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Download Limit</label>
                          <input
                            type="number"
                            value={product.downloadable.limit}
                            onChange={(e) => setProduct({...product, downloadable: {...product.downloadable, limit: e.target.value}})}
                            className="w-full border rounded-lg px-4 py-2"
                            placeholder="-1 for unlimited"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Download Expiry (days)</label>
                          <input
                            type="number"
                            value={product.downloadable.expiry}
                            onChange={(e) => setProduct({...product, downloadable: {...product.downloadable, expiry: e.target.value}})}
                            className="w-full border rounded-lg px-4 py-2"
                            placeholder="-1 for never"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* INVENTORY TAB */}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                      <input
                        type="text"
                        value={product.sku}
                        onChange={(e) => setProduct({...product, sku: e.target.value})}
                        className="w-full border rounded-lg px-4 py-2"
                        placeholder="Stock Keeping Unit"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Stock Status</label>
                      <select
                        value={product.stockStatus}
                        onChange={(e) => setProduct({...product, stockStatus: e.target.value})}
                        className="w-full border rounded-lg px-4 py-2"
                      >
                        <option value="instock">In stock</option>
                        <option value="outofstock">Out of stock</option>
                        <option value="onbackorder">On backorder</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={product.manageStock}
                        onChange={(e) => setProduct({...product, manageStock: e.target.checked})}
                      />
                      <span className="text-sm">Manage stock level</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={product.soldIndividually}
                        onChange={(e) => setProduct({...product, soldIndividually: e.target.checked})}
                      />
                      <span className="text-sm">Sold individually</span>
                    </label>
                  </div>

                  {product.manageStock && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Stock Quantity</label>
                        <input
                          type="number"
                          value={product.stockQuantity}
                          onChange={(e) => setProduct({...product, stockQuantity: parseInt(e.target.value)})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Low Stock Threshold</label>
                        <input
                          type="number"
                          value={product.lowStockThreshold}
                          onChange={(e) => setProduct({...product, lowStockThreshold: parseInt(e.target.value)})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SHIPPING TAB */}
              {activeTab === 'shipping' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={product.weight}
                      onChange={(e) => setProduct({...product, weight: e.target.value})}
                      className="w-full border rounded-lg px-4 py-2"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Dimensions (cm)</label>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Length</label>
                        <input
                          type="number"
                          value={product.dimensions.length}
                          onChange={(e) => setProduct({...product, dimensions: {...product.dimensions, length: e.target.value}})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Width</label>
                        <input
                          type="number"
                          value={product.dimensions.width}
                          onChange={(e) => setProduct({...product, dimensions: {...product.dimensions, width: e.target.value}})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Height</label>
                        <input
                          type="number"
                          value={product.dimensions.height}
                          onChange={(e) => setProduct({...product, dimensions: {...product.dimensions, height: e.target.value}})}
                          className="w-full border rounded-lg px-4 py-2"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Class</label>
                    <select
                      value={product.shippingClass}
                      onChange={(e) => setProduct({...product, shippingClass: e.target.value})}
                      className="w-full border rounded-lg px-4 py-2"
                    >
                      <option value="standard">Standard</option>
                      <option value="express">Express</option>
                      <option value="free">Free Shipping</option>
                      <option value="heavy">Heavy Items</option>
                      <option value="fragile">Fragile</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ATTRIBUTES TAB */}
              {activeTab === 'attributes' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Product Attributes</h3>
                    <button
                      onClick={addAttribute}
                      className="flex items-center gap-2 text-blue-600 text-sm"
                    >
                      <Plus size={16} /> Add Attribute
                    </button>
                  </div>

                  {product.attributes.map((attr, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium">Attribute {idx + 1}</h4>
                        <button onClick={() => removeAttribute(idx)} className="text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <input
                            type="text"
                            value={attr.name}
                            onChange={(e) => updateAttribute(idx, 'name', e.target.value)}
                            className="w-full border rounded px-3 py-2"
                            placeholder="Size"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Slug</label>
                          <input
                            type="text"
                            value={attr.slug}
                            onChange={(e) => updateAttribute(idx, 'slug', e.target.value)}
                            className="w-full border rounded px-3 py-2"
                            placeholder="size"
                          />
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs text-gray-500 mb-1">Option Type</label>
                        <select
                          value={attr.optionType || 'text'}
                          onChange={(e) => updateAttributeOptionType(idx, e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm"
                        >
                          <option value="text">Text options (comma separated)</option>
                          <option value="image">Image options</option>
                        </select>
                      </div>
                      <div className="mb-3">
                        {attr.optionType === 'image' ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="block text-xs text-gray-500 mb-1">Image Options</label>
                              <button
                                type="button"
                                onClick={() => addAttributeOption(idx)}
                                className="text-xs text-blue-600 hover:text-blue-700"
                              >
                                + Add option
                              </button>
                            </div>
                              {(Array.isArray(attr.options) ? attr.options : []).map((option, optionIndex) => {
                                const optionKey = option?.id || option?._id || `${idx}-${optionIndex}`;
                                const isDragging = draggingOptionKey === optionKey;
                                return (
                                <div key={optionKey} className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] gap-3 items-center">
                                  <input
                                    type="text"
                                    value={option?.label || ''}
                                    onChange={(e) => updateAttributeOption(idx, optionIndex, 'label', e.target.value)}
                                    placeholder="Color name"
                                    className="w-full border rounded px-3 py-2 text-sm"
                                  />
                                  <div
                                    className={`flex items-center gap-3 ${isDragging ? 'rounded border border-blue-500 bg-blue-50 px-2 py-1' : ''}`}
                                    onDragOver={(event) => handleOptionDragOver(event, optionKey)}
                                    onDragEnter={(event) => handleOptionDragOver(event, optionKey)}
                                    onDragLeave={(event) => handleOptionDragLeave(event, optionKey)}
                                    onDrop={(event) => handleOptionDrop(event, idx, optionIndex, optionKey)}
                                  >
                                    {option?.imageUrl ? (
                                      <img
                                        src={option.imageUrl}
                                        alt={option.label || 'Option'}
                                        className="h-10 w-10 rounded border object-cover"
                                      />
                                    ) : (
                                      <div className="h-10 w-10 rounded border border-dashed flex items-center justify-center text-xs text-gray-400">
                                        No image
                                      </div>
                                    )}
                                    <label className="text-xs text-blue-600 cursor-pointer">
                                      Upload
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleAttributeOptionImage(idx, optionIndex, e.target.files?.[0])}
                                      />
                                    </label>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeAttributeOption(idx, optionIndex)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )})}
                            {(Array.isArray(attr.options) ? attr.options : []).length === 0 && (
                              <p className="text-xs text-gray-500">Add options with labels and images.</p>
                            )}
                          </div>
                        ) : (
                          <>
                            <label className="block text-xs text-gray-500 mb-1">Options (comma separated)</label>
                            <input
                              type="text"
                              value={(Array.isArray(attr.options) ? attr.options : []).join(', ')}
                              onChange={(e) => updateAttribute(idx, 'options', e.target.value.split(',').map(s => s.trim()))}
                              className="w-full border rounded px-3 py-2"
                              placeholder="S, M, L, XL"
                            />
                          </>
                        )}
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={attr.visible}
                            onChange={(e) => updateAttribute(idx, 'visible', e.target.checked)}
                          />
                          Visible on product page
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={attr.variation}
                            onChange={(e) => updateAttribute(idx, 'variation', e.target.checked)}
                          />
                          Used for variations
                        </label>
                      </div>
                    </div>
                  ))}
                  
                  {product.attributes.some(a => a.variation && a.options.length > 0) && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-blue-700">
                          Attributes are set for variations. Generate variations to create product variants.
                        </p>
                        <button
                          onClick={generateVariations}
                          className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
                        >
                          Generate Variations
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VARIATIONS TAB */}
              {activeTab === 'variations' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="font-medium">Product Variations</h3>
                    <button
                      onClick={generateVariations}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
                    >
                      Generate Variations
                    </button>
                  </div>

                  {product.type !== 'variable' ? (
                    <p className="text-gray-500 text-center py-8">
                      Set product type to "Variable Product" and add attributes to create variations
                    </p>
                  ) : product.variations.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      Add attributes and click "Generate Variations" to create product variations
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {product.variations.map((variation, idx) => (
                        <div key={variation.id} className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex justify-between items-start mb-3">
                            <h4 className="font-medium">
                              {Object.entries(variation.attributes).map(([k, v]) => `${k}: ${v}`).join(', ')}
                            </h4>
                          </div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">SKU</label>
                                <input
                                  type="text"
                                  value={variation.sku}
                                onChange={(e) => {
                                  const newVars = [...product.variations];
                                  newVars[idx].sku = e.target.value;
                                  setProduct({...product, variations: newVars});
                                }}
                                  className="w-full border rounded px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Regular Price</label>
                                <input
                                  type="number"
                                  value={variation.regularPrice ?? variation.price ?? ''}
                                  onChange={(e) => {
                                    const newVars = [...product.variations];
                                    newVars[idx].regularPrice = e.target.value;
                                    newVars[idx].price = e.target.value;
                                    newVars[idx].overridePricing = true;
                                    setProduct({...product, variations: newVars});
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Sale Price</label>
                                <input
                                  type="number"
                                  value={variation.salePrice ?? ''}
                                  onChange={(e) => {
                                    const newVars = [...product.variations];
                                    newVars[idx].salePrice = e.target.value;
                                    newVars[idx].overridePricing = true;
                                    setProduct({...product, variations: newVars});
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Stock</label>
                                <input
                                  type="number"
                                  value={variation.stockQuantity}
                                  onChange={(e) => {
                                    const newVars = [...product.variations];
                                    newVars[idx].stockQuantity = parseInt(e.target.value);
                                    newVars[idx].overrideStock = true;
                                    setProduct({...product, variations: newVars});
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Status</label>
                                <select
                                  value={variation.stockStatus}
                                  onChange={(e) => {
                                    const newVars = [...product.variations];
                                    newVars[idx].stockStatus = e.target.value;
                                    newVars[idx].overrideStock = true;
                                    setProduct({...product, variations: newVars});
                                  }}
                                  className="w-full border rounded px-3 py-2"
                                >
                                <option value="instock">In stock</option>
                                <option value="outofstock">Out of stock</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SEO TAB */}
              {activeTab === 'seo' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SEO Title</label>
                    <input
                      type="text"
                      value={product.seo.title}
                      onChange={(e) => setProduct({...product, seo: {...product.seo, title: e.target.value}})}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Product title for search engines"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
                    <textarea
                      value={product.seo.description}
                      onChange={(e) => setProduct({...product, seo: {...product.seo, description: e.target.value}})}
                      rows={3}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Brief description for search results..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Focus Keyword</label>
                    <input
                      type="text"
                      value={product.seo.focusKeyword}
                      onChange={(e) => setProduct({...product, seo: {...product.seo, focusKeyword: e.target.value}})}
                      className="w-full border rounded-lg px-4 py-2"
                      placeholder="Main keyword for this product"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Gallery */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Product Gallery</h3>
            <div className="grid grid-cols-3 gap-2">
              {product.galleryImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img} alt="" className="w-full h-20 object-cover rounded" />
                  <button
                    type="button"
                    onClick={() => removeGalleryImage(idx)}
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div
                className={`border-2 border-dashed rounded h-20 flex items-center justify-center text-gray-400 ${
                  isGalleryDragging ? 'border-blue-500 bg-blue-50 text-blue-600' : ''
                }`}
                onDragOver={handleGalleryDragOver}
                onDragEnter={handleGalleryDragOver}
                onDragLeave={handleGalleryDragLeave}
                onDrop={handleGalleryDrop}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleGalleryImageUpload}
                  multiple
                  id="gallery-image-upload"
                />
                <label htmlFor="gallery-image-upload" className="cursor-pointer flex flex-col items-center">
                  <Plus size={20} className="mb-1" />
                  <span className="text-xs text-center">Add Images or Drag & Drop</span>
                </label>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">PNG, JPG up to 5MB each</p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Publish Box */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Publish</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium capitalize">{product.status}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Visibility:</span>
                <select
                  value={product.catalogVisibility}
                  onChange={(e) => setProduct({...product, catalogVisibility: e.target.value})}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value="visible">Shop and search</option>
                  <option value="catalog">Shop only</option>
                  <option value="search">Search only</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={product.featured}
                  onChange={(e) => setProduct({...product, featured: e.target.checked})}
                />
                <span className="text-sm">Featured product</span>
              </label>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Categories</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {categoriesLoading ? (
                <p className="text-sm text-gray-500">Loading categories...</p>
              ) : categoryOptions.length > 0 ? (
                categoryOptions.map((category) => {
                  const name = category.name || category.id;
                  if (!name) return null;
                  return (
                    <label key={category.id || name} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={product.categories.includes(name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setProduct({ ...product, categories: [...product.categories, name] });
                          } else {
                            setProduct({
                              ...product,
                              categories: product.categories.filter((c) => c !== name)
                            });
                          }
                        }}
                      />
                      <span className="text-sm">{name}</span>
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">No categories yet.</p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Tags</h3>
            <input
              type="text"
              placeholder="Add tags (comma separated)"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const tag = e.target.value.trim();
                  if (tag && !product.tags.includes(tag)) {
                    setProduct({...product, tags: [...product.tags, tag]});
                    e.target.value = '';
                  }
                }
              }}
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {product.tags.map(tag => (
                <span key={tag} className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => setProduct({...product, tags: product.tags.filter(t => t !== tag)})}
                    className="text-gray-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Main Image */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Main Image</h3>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center ${
                isMainImageDragging ? 'border-blue-500 bg-blue-50' : ''
              }`}
              onDragOver={handleMainImageDragOver}
              onDragEnter={handleMainImageDragOver}
              onDragLeave={handleMainImageDragLeave}
              onDrop={handleMainImageDrop}
            >
              {product.mainImage ? (
                <div>
                  <img src={product.mainImage} alt="" className="w-full h-40 object-cover rounded mb-2" />
                  <button
                    type="button"
                    onClick={() => {
                      deleteImage(product.mainImage);
                      setProduct(prev => ({ ...prev, mainImage: '' }));
                      toast.success('Main image removed');
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove Image
                  </button>
                </div>
              ) : (
                <div className="py-8 text-gray-400">
                  <ImageIcon size={48} className="mx-auto mb-2" />
                  <p className="text-sm mb-2">Click to upload main image</p>
                  <p className="text-xs">PNG, JPG up to 5MB</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMainImageUpload}
                id="main-image-upload"
              />
              <label
                htmlFor="main-image-upload"
                className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700"
              >
                {product.mainImage ? 'Change Image' : 'Upload Image'}
              </label>
            </div>
          </div>
        </div>
      </div>
      </form>
    </div>
  );
}
