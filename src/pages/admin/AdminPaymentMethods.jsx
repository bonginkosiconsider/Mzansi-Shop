import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CreditCard, Edit, Landmark, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../firebase';
import {
  isManualPaymentType,
  normalizeManualPaymentMethod
} from '../../utils/manualPayment';

const createEmptyForm = () => ({
  label: 'Capitec Direct EFT',
  type: 'bank',
  isActive: true,
  description: 'Pay by direct EFT and wait for manual verification.',
  config: {
    bankName: '',
    accountName: '',
    accountNumber: '',
    accountType: 'Savings',
    branchCode: '',
    referencePrefix: 'MZS',
    instructions: ''
  }
});

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(createEmptyForm);

  useEffect(() => {
    loadMethods();
  }, []);

  const loadMethods = async () => {
    try {
      const snap = await getDocs(collection(db, 'paymentMethods'));
      const data = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setMethods(data);
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      toast.error('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const submission = {
      label: String(formData.label || '').trim(),
      type: String(formData.type || 'bank').trim(),
      isActive: formData.isActive !== false,
      description: String(formData.description || '').trim(),
      config: {
        bankName: String(formData.config?.bankName || '').trim(),
        accountName: String(formData.config?.accountName || '').trim(),
        accountNumber: String(formData.config?.accountNumber || '').trim(),
        accountType: String(formData.config?.accountType || '').trim(),
        branchCode: String(formData.config?.branchCode || '').trim(),
        referencePrefix: String(formData.config?.referencePrefix || 'MZS').trim(),
        instructions: String(formData.config?.instructions || '').trim()
      }
    };

    if (isManualPaymentType(submission.type)) {
      if (!submission.config.bankName || !submission.config.accountName || !submission.config.accountNumber) {
        toast.error('Bank name, account name, and account number are required for direct EFT.');
        return;
      }
    }

    try {
      const saveFunc = httpsCallable(getFunctions(), 'savePaymentMethod');
      await saveFunc({ methodId: editing?.id || null, payload: submission });
      toast.success(`Payment method ${editing ? 'updated' : 'added'}`);
      setShowForm(false);
      setEditing(null);
      setFormData(createEmptyForm());
      await loadMethods();
    } catch (error) {
      console.error('Failed to save payment method:', error);
      toast.error(`Failed to save payment method: ${error.message || error}`);
    }
  };

  const handleEdit = (method) => {
    const normalizedMethod = normalizeManualPaymentMethod(method);
    setEditing(method);
    setFormData({
      label: method.label || normalizedMethod.label,
      type: method.type || normalizedMethod.type,
      isActive: method.isActive !== false,
      description: method.description || '',
      config: {
        ...createEmptyForm().config,
        ...normalizedMethod.config
      }
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this payment method?')) return;
    try {
      await deleteDoc(doc(db, 'paymentMethods', id));
      toast.success('Payment method deleted');
      await loadMethods();
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      toast.error('Failed to delete payment method');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormData(createEmptyForm());
  };

  if (loading) {
    return <div className="text-center py-8">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start gap-4">
          <Landmark className="mt-1 text-blue-600" size={22} />
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Direct EFT Checkout</h2>
            <p className="text-sm text-gray-600">
              Configure the Capitec or bank-transfer details that customers will see at checkout and on the order page.
              Orders stay pending until you verify the EFT from the admin orders screen.
            </p>
            <p className="text-xs text-gray-500">
              Use the payment method label customers should recognise, for example <span className="font-medium">Capitec Direct EFT</span>.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Payment Methods</h1>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormData(createEmptyForm());
            setShowForm(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Payment Method
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editing ? 'Edit Payment Method' : 'Add Payment Method'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    <option value="bank">Bank Transfer</option>
                    <option value="manual_eft">Manual EFT</option>
                    <option value="yoco">Legacy Yoco</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <span className="text-sm text-gray-700">Active</span>
              </label>

              {isManualPaymentType(formData.type) ? (
                <div className="border-t pt-4 space-y-4">
                  <h3 className="font-medium">Banking Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
                      <input
                        type="text"
                        value={formData.config.bankName}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, bankName: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Name *</label>
                      <input
                        type="text"
                        value={formData.config.accountName}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, accountName: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
                      <input
                        type="text"
                        value={formData.config.accountNumber}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, accountNumber: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch Code</label>
                      <input
                        type="text"
                        value={formData.config.branchCode}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, branchCode: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
                      <input
                        type="text"
                        value={formData.config.accountType}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, accountType: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reference Prefix (Legacy)</label>
                      <input
                        type="text"
                        value={formData.config.referencePrefix}
                        onChange={(e) => setFormData((prev) => ({
                          ...prev,
                          config: { ...prev.config, referencePrefix: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                        placeholder="MZS"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Direct EFT orders now get a generated reference code like ABC123. That same code is shown to the customer after checkout and stored on the admin order so you can match the payment.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Customer Instructions</label>
                    <textarea
                      value={formData.config.instructions}
                      onChange={(e) => setFormData((prev) => ({
                        ...prev,
                        config: { ...prev.config, instructions: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border rounded"
                      rows={4}
                      placeholder="Example: Pay from your Capitec app using the exact amount and the reference shown after checkout."
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Legacy Yoco methods are kept here only for cleanup or reference. The updated checkout flow uses direct EFT methods only.
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  {editing ? 'Update' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {methods.map((method) => {
              const normalized = normalizeManualPaymentMethod(method);
              return (
                <tr key={method.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      {isManualPaymentType(normalized.type) ? (
                        <Landmark className="h-5 w-5 text-blue-500 mt-0.5" />
                      ) : (
                        <CreditCard className="h-5 w-5 text-gray-400 mt-0.5" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{method.label}</div>
                        {method.description && (
                          <div className="text-sm text-gray-500">{method.description}</div>
                        )}
                        {isManualPaymentType(normalized.type) && (
                          <div className="mt-1 text-xs text-gray-500">
                            {normalized.config.bankName || 'Bank not set'} • {normalized.config.accountName || 'Account name not set'}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 capitalize">{method.type}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      method.isActive !== false
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {method.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      type="button"
                      onClick={() => handleEdit(method)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(method.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {methods.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No payment methods configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
