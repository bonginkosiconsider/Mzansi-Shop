import { useState, useEffect } from 'react';
import { updateEmail, updateProfile } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Store, Upload, Check, AlertCircle, Globe, Palette, MapPin, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';

const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'app', 'dashboard', 'support', 'help', 'blog', 'shop'];
const BANK_OPTIONS = [
  { value: 'fnb', label: 'FNB' },
  { value: 'absa', label: 'ABSA' },
  { value: 'nedbank', label: 'Nedbank' },
  { value: 'standard', label: 'Standard Bank' },
  { value: 'capitec', label: 'Capitec' }
];

const createInitialFormData = (tenant) => ({
  name: tenant?.name || '',
  description: tenant?.description || '',
  category: tenant?.category || '',
  subdomain: tenant?.subdomain || '',
  primaryColor: tenant?.primaryColor || '#2563eb',
  phone: tenant?.phone || '',
  email: tenant?.email || '',
  idNumber: tenant?.idNumber || '',
  logo: tenant?.logo || null,
  banner: tenant?.banner || null,
  address: {
    street: tenant?.address?.street || '',
    suburb: tenant?.address?.suburb || '',
    city: tenant?.address?.city || '',
    postalCode: tenant?.address?.postalCode || ''
  },
  bankDetails: {
    accountHolder: tenant?.bankDetails?.accountHolder || '',
    bankName: tenant?.bankDetails?.bankName || '',
    accountNumber: tenant?.bankDetails?.accountNumber || '',
    branchCode: tenant?.bankDetails?.branchCode || ''
  }
});

const trimValue = (value) => (typeof value === 'string' ? value.trim() : value);

const getSaveErrorMessage = (error) => {
  switch (error?.code) {
    case 'auth/requires-recent-login':
      return 'To change the login email, sign out and sign back in, then try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'That email address is already being used by another account.';
    default:
      return error?.message || 'Failed to update settings';
  }
};

export default function StoreSettings() {
  const { tenant, user, setTenant, refreshUser } = useAuth();
  const [formData, setFormData] = useState(() => createInitialFormData());
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [subdomainError, setSubdomainError] = useState('');
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const platformBase = (import.meta.env.VITE_PLATFORM_URL || window.location.origin).replace(/\/$/, '');
  const platformLabel = platformBase.replace(/^https?:\/\//, '');
  const storeUrl = `${platformBase}/store/${formData.subdomain || 'your-store'}`;
  const isOwnerEditing = !!user?.uid && !!tenant?.id && user.uid === tenant.id;

  useEffect(() => {
    setFormData(createInitialFormData(tenant));
  }, [tenant]);

  const setField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const setAddressField = (field, value) => {
    setFormData((current) => ({
      ...current,
      address: {
        ...current.address,
        [field]: value
      }
    }));
  };

  const setBankField = (field, value) => {
    setFormData((current) => ({
      ...current,
      bankDetails: {
        ...current.bankDetails,
        [field]: value
      }
    }));
  };

  const sanitizeSubdomain = (value) => value.toLowerCase().replace(/[^a-z0-9-]/g, '');

  const validateSubdomainFormat = (value) => {
    const clean = sanitizeSubdomain(value);
    if (RESERVED_SUBDOMAINS.includes(clean)) {
      setSubdomainError('This subdomain is reserved');
      return false;
    }
    if (clean.length < 3) {
      setSubdomainError('Subdomain must be at least 3 characters');
      return false;
    }
    setSubdomainError('');
    return true;
  };

  const checkSubdomainAvailability = async (value) => {
    const clean = sanitizeSubdomain(value);
    if (!validateSubdomainFormat(clean)) return false;
    if (tenant?.subdomain && tenant.subdomain === clean) {
      setSubdomainError('');
      return true;
    }

    setCheckingSubdomain(true);
    try {
      const q = query(collection(db, 'tenants'), where('subdomain', '==', clean), limit(1));
      const snapshot = await getDocs(q);
      const isTaken = snapshot.docs.some((docSnap) => docSnap.id !== tenant?.id);
      if (isTaken) {
        setSubdomainError('This subdomain is already taken');
        return false;
      }
      setSubdomainError('');
      return true;
    } catch (error) {
      setSubdomainError('Failed to verify subdomain');
      return false;
    } finally {
      setCheckingSubdomain(false);
    }
  };

  const handleImageUpload = async (file, path) => {
    if (!file) return undefined;
    if (!user) {
      toast.error('Please sign in to upload images');
      return undefined;
    }
    if (!tenant?.id) {
      toast.error('Tenant not loaded. Please reload and try again.');
      return undefined;
    }

    try {
      const storageRef = ref(storage, `stores/${tenant.id}/${path}_${Date.now()}`);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
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
      throw error;
    }
  };

  const handleSave = async () => {
    if (!tenant?.id) {
      toast.error('Tenant not loaded. Please reload and try again.');
      return;
    }

    const normalizedData = {
      name: trimValue(formData.name),
      description: trimValue(formData.description),
      category: trimValue(formData.category),
      subdomain: sanitizeSubdomain(formData.subdomain),
      primaryColor: trimValue(formData.primaryColor),
      phone: trimValue(formData.phone),
      email: trimValue(formData.email).toLowerCase(),
      idNumber: trimValue(formData.idNumber),
      logo: formData.logo,
      banner: formData.banner,
      address: {
        street: trimValue(formData.address.street),
        suburb: trimValue(formData.address.suburb),
        city: trimValue(formData.address.city),
        postalCode: trimValue(formData.address.postalCode)
      },
      bankDetails: {
        accountHolder: trimValue(formData.bankDetails.accountHolder),
        bankName: trimValue(formData.bankDetails.bankName),
        accountNumber: trimValue(formData.bankDetails.accountNumber),
        branchCode: trimValue(formData.bankDetails.branchCode)
      }
    };

    if (!normalizedData.name) {
      toast.error('Store name is required.');
      return;
    }

    if (!normalizedData.email) {
      toast.error('Email is required.');
      return;
    }

    const subdomainOk = tenant?.subdomain ? true : await checkSubdomainAvailability(normalizedData.subdomain);
    if (!subdomainOk) return;

    setSaving(true);
    try {
      const updates = { ...normalizedData };
      const nextLogo = await handleImageUpload(logoFile, 'logo');
      const nextBanner = await handleImageUpload(bannerFile, 'banner');

      if (nextLogo) {
        updates.logo = nextLogo;
      }
      if (nextBanner) {
        updates.banner = nextBanner;
      }

      if (isOwnerEditing && user) {
        if (updates.name && updates.name !== (user.displayName || '')) {
          await updateProfile(user, { displayName: updates.name });
        }

        if (updates.email && updates.email !== (user.email || '').toLowerCase()) {
          await updateEmail(user, updates.email);
        }

        await refreshUser().catch(() => null);
      }

      const updatedAt = new Date();
      await updateDoc(doc(db, 'tenants', tenant.id), {
        ...updates,
        updatedAt
      });

      setTenant({
        ...tenant,
        ...updates,
        updatedAt
      });

      setFormData((current) => ({
        ...current,
        logo: updates.logo,
        banner: updates.banner
      }));
      setLogoFile(null);
      setBannerFile(null);
      toast.success('Vendor settings updated');
    } catch (error) {
      console.error('Failed to update vendor settings:', error);
      toast.error(getSaveErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Vendor Settings</h2>
        <p className="text-sm text-gray-500 mt-1">
          Update your store profile, address, banking details, and contact information from one place.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Store size={20} className="text-blue-600" />
              Basic Information
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setField('name', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Describe your store..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setField('category', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  >
                    <option value="">Select Category</option>
                    <option value="electronics">Electronics</option>
                    <option value="fashion">Fashion</option>
                    <option value="home">Home and Garden</option>
                    <option value="beauty">Beauty</option>
                    <option value="sports">Sports</option>
                    <option value="books">Books</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
                  <input
                    type="text"
                    value={formData.idNumber}
                    onChange={(e) => setField('idNumber', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="Owner or business ID"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subdomain
                  <span className="text-xs text-gray-500 font-normal ml-2">(cannot be changed later)</span>
                </label>
                <div className="flex items-center">
                  <span className="bg-gray-100 border border-gray-300 rounded-l-lg px-4 py-2 text-gray-600 text-sm">
                    {platformLabel}/store/
                  </span>
                  <input
                    type="text"
                    value={formData.subdomain}
                    disabled={!!tenant?.subdomain}
                    onChange={(e) => {
                      const value = sanitizeSubdomain(e.target.value);
                      setField('subdomain', value);
                      validateSubdomainFormat(value);
                    }}
                    onBlur={() => {
                      if (!tenant?.subdomain && formData.subdomain) {
                        checkSubdomainAvailability(formData.subdomain);
                      }
                    }}
                    className="flex-1 border border-l-0 border-gray-300 rounded-r-lg px-4 py-2 disabled:bg-gray-100"
                    placeholder="your-store"
                  />
                </div>
                {checkingSubdomain && (
                  <p className="text-sm text-gray-500 mt-1">Checking availability...</p>
                )}
                {subdomainError && (
                  <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={14} /> {subdomainError}
                  </p>
                )}
                {!checkingSubdomain && !subdomainError && formData.subdomain && (
                  <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                    <Check size={14} /> {storeUrl}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Palette size={20} className="text-blue-600" />
              Branding
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={formData.primaryColor}
                    onChange={(e) => setField('primaryColor', e.target.value)}
                    className="h-10 w-20 rounded border border-gray-300"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => setField('primaryColor', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
                <div className="flex items-center gap-4">
                  {formData.logo && (
                    <img
                      src={formData.logo}
                      alt="Current logo"
                      loading="lazy"
                      decoding="async"
                      className="h-16 w-16 object-contain border rounded"
                    />
                  )}
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <Upload size={16} />
                    <span>Upload New</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {logoFile && <span className="text-sm text-green-600">{logoFile.name}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">Recommended: 400x400px, PNG or JPG</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Banner Image</label>
                <div className="flex items-center gap-4">
                  {formData.banner && (
                    <img
                      src={formData.banner}
                      alt="Current banner"
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-40 object-cover border rounded"
                    />
                  )}
                  <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <Upload size={16} />
                    <span>Upload New</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
                    />
                  </label>
                  {bannerFile && <span className="text-sm text-green-600">{bannerFile.name}</span>}
                </div>
                <p className="text-xs text-gray-500 mt-1">Recommended: 1200x400px, landscape orientation</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Globe size={20} className="text-blue-600" />
              Contact Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="082 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setField('email', e.target.value)}
                  disabled={!isOwnerEditing}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="store@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {isOwnerEditing
                    ? 'This updates the business email and the email used to sign in.'
                    : 'Login email can only be changed by the vendor while signed in to this account.'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <MapPin size={20} className="text-blue-600" />
              Business Address
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={formData.address.street}
                  onChange={(e) => setAddressField('street', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="123 Main Street"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Suburb</label>
                  <input
                    type="text"
                    value={formData.address.suburb}
                    onChange={(e) => setAddressField('suburb', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="Suburb"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.address.city}
                    onChange={(e) => setAddressField('city', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="City"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={formData.address.postalCode}
                  onChange={(e) => setAddressField('postalCode', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Postal code"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <CreditCard size={20} className="text-blue-600" />
              Banking Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder</label>
                <input
                  type="text"
                  value={formData.bankDetails.accountHolder}
                  onChange={(e) => setBankField('accountHolder', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Full account holder name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                <select
                  value={formData.bankDetails.bankName}
                  onChange={(e) => setBankField('bankName', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                >
                  <option value="">Select Bank</option>
                  {BANK_OPTIONS.map((bank) => (
                    <option key={bank.value} value={bank.value}>
                      {bank.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                <input
                  type="text"
                  value={formData.bankDetails.branchCode}
                  onChange={(e) => setBankField('branchCode', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Branch code"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                <input
                  type="text"
                  value={formData.bankDetails.accountNumber}
                  onChange={(e) => setBankField('accountNumber', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  placeholder="Account number"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-6 sticky top-6">
            <h3 className="font-semibold mb-4">Live Preview</h3>

            <div className="border rounded-lg overflow-hidden">
              <div
                className="h-32 bg-cover bg-center"
                style={{
                  backgroundImage: formData.banner
                    ? `url(${formData.banner})`
                    : 'linear-gradient(45deg, #e5e7eb, #f3f4f6)',
                  backgroundColor: formData.primaryColor
                }}
              />

              <div className="p-4">
                <div className="flex items-center gap-3 -mt-8 mb-3">
                  <div className="w-16 h-16 bg-white rounded-lg shadow p-1">
                    {formData.logo ? (
                      <img
                        src={formData.logo}
                        alt="Logo"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                        Logo
                      </div>
                    )}
                  </div>
                </div>

                <h4 className="font-bold text-lg">{formData.name || 'Your Store'}</h4>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                  {formData.description || 'Store description...'}
                </p>

                <div className="mt-4 pt-4 border-t space-y-2 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Globe size={14} />
                    <span>{storeUrl}</span>
                  </div>
                  {formData.phone && (
                    <div>
                      <span className="font-medium text-gray-700">Phone:</span> {formData.phone}
                    </div>
                  )}
                  {formData.address.city && (
                    <div>
                      <span className="font-medium text-gray-700">Location:</span> {formData.address.city}
                      {formData.address.suburb ? `, ${formData.address.suburb}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !!subdomainError || checkingSubdomain}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
