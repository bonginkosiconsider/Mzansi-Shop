import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit, Trash2, Copy, Percent, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminCoupons() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    discountType: 'percentage', // 'percentage' or 'fixed'
    discountValue: 0,
    minimumAmount: 0,
    maximumDiscount: null,
    usageLimit: null,
    usedCount: 0,
    isActive: true,
    expiresAt: '',
    applicableTo: 'all', // 'all', 'categories', 'products', 'vendors'
    applicableIds: [] // array of category/product/vendor IDs
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'coupons'));
      const couponsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCoupons(couponsData);
    } catch (error) {
      console.error('Error loading coupons:', error);
      toast.error('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  const generateCouponCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, code });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const couponData = {
        ...formData,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (editingCoupon) {
        await updateDoc(doc(db, 'coupons', editingCoupon.id), couponData);
        toast.success('Coupon updated successfully');
      } else {
        await addDoc(collection(db, 'coupons'), couponData);
        toast.success('Coupon created successfully');
      }
      setShowForm(false);
      setEditingCoupon(null);
      setFormData({
        code: '',
        description: '',
        discountType: 'percentage',
        discountValue: 0,
        minimumAmount: 0,
        maximumDiscount: null,
        usageLimit: null,
        usedCount: 0,
        isActive: true,
        expiresAt: '',
        applicableTo: 'all',
        applicableIds: []
      });
      loadCoupons();
    } catch (error) {
      console.error('Error saving coupon:', error);
      toast.error('Failed to save coupon');
    }
  };

  const handleEdit = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code || '',
      description: coupon.description || '',
      discountType: coupon.discountType || 'percentage',
      discountValue: coupon.discountValue || 0,
      minimumAmount: coupon.minimumAmount || 0,
      maximumDiscount: coupon.maximumDiscount || null,
      usageLimit: coupon.usageLimit || null,
      usedCount: coupon.usedCount || 0,
      isActive: coupon.isActive !== false,
      expiresAt: coupon.expiresAt ? coupon.expiresAt.toDate().toISOString().split('T')[0] : '',
      applicableTo: coupon.applicableTo || 'all',
      applicableIds: coupon.applicableIds || []
    });
    setShowForm(true);
  };

  const handleDelete = async (couponId, couponCode) => {
    if (!confirm(`Are you sure you want to delete coupon "${couponCode}"?`)) return;

    try {
      await deleteDoc(doc(db, 'coupons', couponId));
      toast.success('Coupon deleted successfully');
      loadCoupons();
    } catch (error) {
      console.error('Error deleting coupon:', error);
      toast.error('Failed to delete coupon');
    }
  };

  const toggleStatus = async (coupon) => {
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), {
        isActive: !coupon.isActive,
        updatedAt: new Date()
      });
      toast.success(`Coupon ${!coupon.isActive ? 'activated' : 'deactivated'}`);
      loadCoupons();
    } catch (error) {
      console.error('Error updating coupon:', error);
      toast.error('Failed to update coupon');
    }
  };

  const copyToClipboard = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Coupon code copied to clipboard');
  };

  const formatDiscount = (coupon) => {
    if (coupon.discountType === 'percentage') {
      return `${coupon.discountValue}% off`;
    } else {
      return `R${coupon.discountValue} off`;
    }
  };

  const isExpired = (coupon) => {
    if (!coupon.expiresAt) return false;
    const expiryDate = coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : coupon.expiresAt;
    return new Date() > new Date(expiryDate);
  };

  const isUsageLimitReached = (coupon) => {
    if (!coupon.usageLimit) return false;
    return coupon.usedCount >= coupon.usageLimit;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Global Coupons</h1>
            <p className="text-gray-600 mt-1">Create and manage platform-wide discount codes</p>
          </div>
          <button
            onClick={() => {
              setEditingCoupon(null);
              setFormData({
                code: '',
                description: '',
                discountType: 'percentage',
                discountValue: 0,
                minimumAmount: 0,
                maximumDiscount: null,
                usageLimit: null,
                usedCount: 0,
                isActive: true,
                expiresAt: '',
                applicableTo: 'all',
                applicableIds: []
              });
              setShowForm(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={20} />
            Create Coupon
          </button>
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coupon Code *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="flex-1 border rounded-lg px-3 py-2 uppercase"
                      placeholder="SUMMER2024"
                      required
                    />
                    <button
                      type="button"
                      onClick={generateCouponCode}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Type *
                  </label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (R)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {formData.discountType === 'percentage' ? 'Discount % *' : 'Discount Amount (R) *'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                      className="w-full border rounded-lg px-3 py-2 pr-10"
                      min="0"
                      step={formData.discountType === 'percentage' ? '1' : '0.01'}
                      max={formData.discountType === 'percentage' ? '100' : undefined}
                      required
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                      {formData.discountType === 'percentage' ? <Percent size={16} /> : <DollarSign size={16} />}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Order (R)
                  </label>
                  <input
                    type="number"
                    value={formData.minimumAmount}
                    onChange={(e) => setFormData({ ...formData, minimumAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full border rounded-lg px-3 py-2"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Discount (R)
                  </label>
                  <input
                    type="number"
                    value={formData.maximumDiscount || ''}
                    onChange={(e) => setFormData({ ...formData, maximumDiscount: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full border rounded-lg px-3 py-2"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usage Limit
                  </label>
                  <input
                    type="number"
                    value={formData.usageLimit || ''}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full border rounded-lg px-3 py-2"
                    min="1"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={2}
                  placeholder="Optional description for the coupon"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Active (coupon can be used)
                </label>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCoupon(null);
                  }}
                  className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Coupons List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Code</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Discount</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Usage</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Expires</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </td>
                  </tr>
                ) : coupons.length > 0 ? (
                  coupons.map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-gray-50">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                            {coupon.code}
                          </code>
                          <button
                            onClick={() => copyToClipboard(coupon.code)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Copy code"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-medium">{formatDiscount(coupon)}</span>
                        {coupon.minimumAmount > 0 && (
                          <p className="text-xs text-gray-500">Min: R{coupon.minimumAmount}</p>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm">
                          <p>{coupon.usedCount || 0} used</p>
                          {coupon.usageLimit && (
                            <p className="text-gray-500">of {coupon.usageLimit}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            coupon.isActive && !isExpired(coupon) && !isUsageLimitReached(coupon)
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {coupon.isActive && !isExpired(coupon) && !isUsageLimitReached(coupon) ? 'Active' : 'Inactive'}
                          </span>
                          {isExpired(coupon) && (
                            <span className="text-xs text-red-600">Expired</span>
                          )}
                          {isUsageLimitReached(coupon) && (
                            <span className="text-xs text-red-600">Limit reached</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {coupon.expiresAt ? (
                          <span className={`text-sm ${isExpired(coupon) ? 'text-red-600' : 'text-gray-900'}`}>
                            {(() => {
                              const expiryDate = coupon.expiresAt.toDate ? coupon.expiresAt.toDate() : coupon.expiresAt;
                              return new Date(expiryDate).toLocaleDateString();
                            })()}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">No expiry</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleStatus(coupon)}
                            className={`px-3 py-1 rounded text-xs font-medium ${
                              coupon.isActive
                                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                : 'bg-green-100 text-green-800 hover:bg-green-200'
                            }`}
                          >
                            {coupon.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleEdit(coupon)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit coupon"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon.id, coupon.code)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Delete coupon"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Percent size={48} className="text-gray-400 mb-3" />
                        <p className="text-gray-500 font-medium">No coupons yet</p>
                        <p className="text-gray-400 text-sm">Create your first coupon to get started</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}