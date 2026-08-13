import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Save, X, Plus, Trash2, Percent, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CouponForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [coupon, setCoupon] = useState({
    code: '',
    description: '',
    type: 'percent',
    amount: '',
    expiryDate: '',
    usageLimit: '',
    usageLimitPerUser: '',
    minimumAmount: '',
    maximumAmount: '',
    individualUse: false,
    excludeSaleItems: false,
    productIds: [],
    excludeProductIds: [],
    productCategories: [],
    excludeProductCategories: [],
    emailRestrictions: [],
    freeShipping: false
  });

  useEffect(() => {
    if (id && id !== 'new') {
      loadCoupon();
    }
  }, [id]);

  const loadCoupon = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'tenants', tenant.id, 'coupons', id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCoupon({
          ...data,
          expiryDate: data.expiryDate ? data.expiryDate.split('T')[0] : ''
        });
      }
    } catch (error) {
      toast.error('Failed to load coupon');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!coupon.code.trim()) {
      toast.error('Coupon code is required');
      return;
    }

    if (!coupon.amount || coupon.amount <= 0) {
      toast.error('Valid discount amount is required');
      return;
    }

    setSaving(true);
    try {
      const couponData = {
        ...coupon,
        code: coupon.code.toUpperCase(),
        amount: parseFloat(coupon.amount),
        usageLimit: coupon.usageLimit ? parseInt(coupon.usageLimit) : null,
        usageLimitPerUser: coupon.usageLimitPerUser ? parseInt(coupon.usageLimitPerUser) : null,
        minimumAmount: coupon.minimumAmount ? parseFloat(coupon.minimumAmount) : null,
        maximumAmount: coupon.maximumAmount ? parseFloat(coupon.maximumAmount) : null,
        expiryDate: coupon.expiryDate || null,
        updatedAt: new Date()
      };

      if (id === 'new') {
        couponData.usageCount = 0;
        couponData.createdAt = new Date();
        await addDoc(collection(db, 'tenants', tenant.id, 'coupons'), couponData);
        toast.success('Coupon created');
        navigate('/sell/dashboard/coupons');
      } else {
        await updateDoc(doc(db, 'tenants', tenant.id, 'coupons', id), couponData);
        toast.success('Coupon updated');
      }
    } catch (error) {
      toast.error('Save failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addEmailRestriction = () => {
    setCoupon({
      ...coupon,
      emailRestrictions: [...coupon.emailRestrictions, '']
    });
  };

  const updateEmailRestriction = (index, value) => {
    const newRestrictions = [...coupon.emailRestrictions];
    newRestrictions[index] = value;
    setCoupon({ ...coupon, emailRestrictions: newRestrictions });
  };

  const removeEmailRestriction = (index) => {
    setCoupon({
      ...coupon,
      emailRestrictions: coupon.emailRestrictions.filter((_, i) => i !== index)
    });
  };

  if (loading) return <div className="flex justify-center p-12">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {id === 'new' ? 'Add New Coupon' : 'Edit Coupon'}
          </h2>
          <p className="text-gray-500">{coupon.code || 'Untitled Coupon'}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/sell/dashboard/coupons')}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            <X size={20} />
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Coupon'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* General */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4">General</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                  <input
                    type="text"
                    value={coupon.code}
                    onChange={(e) => setCoupon({...coupon, code: e.target.value.toUpperCase()})}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="SUMMER2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
                  <select
                    value={coupon.type}
                    onChange={(e) => setCoupon({...coupon, type: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2"
                  >
                    <option value="percent">Percentage discount</option>
                    <option value="fixed_cart">Fixed cart discount</option>
                    <option value="fixed_product">Fixed product discount</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {coupon.type === 'percent' ? 'Percentage (%)' : 'Amount (R)'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={coupon.type === 'percent' ? '1' : '0.01'}
                    value={coupon.amount}
                    onChange={(e) => setCoupon({...coupon, amount: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2 pr-12"
                    placeholder={coupon.type === 'percent' ? '20' : '50.00'}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {coupon.type === 'percent' ? <Percent size={16} /> : <DollarSign size={16} />}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={coupon.description}
                  onChange={(e) => setCoupon({...coupon, description: e.target.value})}
                  rows={3}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="Optional description for this coupon"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={coupon.expiryDate}
                  onChange={(e) => setCoupon({...coupon, expiryDate: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty for no expiry</p>
              </div>
            </div>
          </div>

          {/* Usage Restrictions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4">Usage Restrictions</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                  <input
                    type="number"
                    value={coupon.usageLimit}
                    onChange={(e) => setCoupon({...coupon, usageLimit: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="Unlimited"
                  />
                  <p className="text-xs text-gray-500 mt-1">How many times this coupon can be used</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit Per User</label>
                  <input
                    type="number"
                    value={coupon.usageLimitPerUser}
                    onChange={(e) => setCoupon({...coupon, usageLimitPerUser: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="Unlimited"
                  />
                  <p className="text-xs text-gray-500 mt-1">How many times each user can use</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Spend (R)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={coupon.minimumAmount}
                    onChange={(e) => setCoupon({...coupon, minimumAmount: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="No minimum"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Spend (R)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={coupon.maximumAmount}
                    onChange={(e) => setCoupon({...coupon, maximumAmount: e.target.value})}
                    className="w-full border rounded-lg px-4 py-2"
                    placeholder="No maximum"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coupon.individualUse}
                    onChange={(e) => setCoupon({...coupon, individualUse: e.target.checked})}
                  />
                  <span className="text-sm">Individual use only</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Check this box if the coupon cannot be used in conjunction with other coupons</p>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coupon.excludeSaleItems}
                    onChange={(e) => setCoupon({...coupon, excludeSaleItems: e.target.checked})}
                  />
                  <span className="text-sm">Exclude sale items</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Check this box if the coupon should not apply to items on sale</p>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={coupon.freeShipping}
                    onChange={(e) => setCoupon({...coupon, freeShipping: e.target.checked})}
                  />
                  <span className="text-sm">Allow free shipping</span>
                </label>
                <p className="text-xs text-gray-500 ml-6">Check this box if the coupon grants free shipping</p>
              </div>
            </div>
          </div>

          {/* Email Restrictions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4">Email Restrictions</h3>
            <p className="text-sm text-gray-600 mb-4">
              Restrict this coupon to specific email addresses. Leave blank for no restrictions.
            </p>
            <div className="space-y-2">
              {coupon.emailRestrictions.map((email, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmailRestriction(idx, e.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="user@example.com"
                  />
                  <button
                    onClick={() => removeEmailRestriction(idx)}
                    className="text-red-600 hover:text-red-800 p-2"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button
                onClick={addEmailRestriction}
                className="flex items-center gap-2 text-blue-600 text-sm hover:text-blue-800"
              >
                <Plus size={16} /> Add Email
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Usage Stats */}
          {id !== 'new' && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="font-medium mb-4">Usage Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Times Used:</span>
                  <span className="font-medium">{coupon.usageCount || 0}</span>
                </div>
                {coupon.usageLimit && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Usage Limit:</span>
                    <span className="font-medium">{coupon.usageLimit}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-medium ${
                    coupon.expiryDate && new Date(coupon.expiryDate) < new Date()
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}>
                    {coupon.expiryDate && new Date(coupon.expiryDate) < new Date()
                      ? 'Expired'
                      : 'Active'
                    }
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setCoupon({...coupon, code: generateCouponCode()})}
                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 py-2"
              >
                Generate Random Code
              </button>
              <button
                onClick={() => setCoupon({...coupon, expiryDate: getNextWeekDate()})}
                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 py-2"
              >
                Set Expiry to Next Week
              </button>
              <button
                onClick={() => setCoupon({...coupon, expiryDate: getNextMonthDate()})}
                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 py-2"
              >
                Set Expiry to Next Month
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function generateCouponCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getNextWeekDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split('T')[0];
}

function getNextMonthDate() {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}