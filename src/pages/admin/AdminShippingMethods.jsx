import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit, Trash2, Truck, Search, Filter, Copy, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

const SHIPPING_TYPES = [
  { value: 'flat_rate', label: 'Flat Rate', description: 'Fixed price for all orders' },
  { value: 'free_shipping', label: 'Free Shipping', description: 'No cost, optional minimum order' },
  { value: 'weight_based', label: 'Weight-Based', description: 'Cost based on total weight' },
  { value: 'price_based', label: 'Price-Based', description: 'Cost based on order total' },
  { value: 'zone_based', label: 'Zone-Based', description: 'Different rates per geographic zone' },
  { value: 'courier', label: 'Courier', description: 'Third-party carrier integration' }
];

export default function AdminShippingMethods() {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedMethods, setSelectedMethods] = useState([]);
  const [formData, setFormData] = useState({
    label: '',
    type: 'flat_rate',
    cost: 0,
    estimate: '3-5 business days',
    isActive: true,
    description: '',
    taxable: true,
    minOrderAmount: 0,
    maxWeight: 0,
    weightUnit: 'kg',
    zones: [],
    config: {}
  });

  useEffect(() => {
    loadMethods();
  }, []);

  const loadMethods = async () => {
    try {
      const snap = await getDocs(collection(db, 'shippingMethods'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMethods(data);
    } catch (error) {
      console.error('Failed to load shipping methods:', error);
      toast.error('Failed to load shipping methods');
    } finally {
      setLoading(false);
    }
  };

  const filteredMethods = methods.filter(method => {
    const matchesSearch = method.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         method.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || method.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.label.trim()) {
      toast.error('Method label is required');
      return;
    }

    try {
      const submission = {
        ...formData,
        config: formData.config || {},
        zones: formData.zones || []
      };

      if (editing?.id) {
        await updateDoc(doc(db, 'shippingMethods', editing.id), submission);
        toast.success('Shipping method updated');
      } else {
        await addDoc(collection(db, 'shippingMethods'), submission);
        toast.success('Shipping method added');
      }

      setShowForm(false);
      setEditing(null);
      resetForm();
      loadMethods();
    } catch (error) {
      console.error('Failed to save shipping method:', error);
      toast.error(`Failed to save: ${error.message}`);
    }
  };

  const handleEdit = (method) => {
    setEditing(method);
    setFormData(method);
    setShowForm(true);
  };

  const handleDuplicate = async (method) => {
    try {
      const { id, ...methodData } = method;
      const newMethod = {
        ...methodData,
        label: `${method.label} (Copy)`,
        isActive: false
      };
      await addDoc(collection(db, 'shippingMethods'), newMethod);
      toast.success('Shipping method duplicated');
      loadMethods();
    } catch (error) {
      toast.error('Failed to duplicate method');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this shipping method?')) return;
    try {
      await deleteDoc(doc(db, 'shippingMethods', id));
      toast.success('Shipping method deleted');
      loadMethods();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete shipping method');
    }
  };

  const toggleStatus = async (method) => {
    try {
      await updateDoc(doc(db, 'shippingMethods', method.id), {
        isActive: !method.isActive
      });
      toast.success(`Method ${!method.isActive ? 'activated' : 'deactivated'}`);
      loadMethods();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const bulkActivate = async () => {
    try {
      const promises = selectedMethods.map(id =>
        updateDoc(doc(db, 'shippingMethods', id), { isActive: true })
      );
      await Promise.all(promises);
      toast.success(`${selectedMethods.length} methods activated`);
      setSelectedMethods([]);
      loadMethods();
    } catch (error) {
      toast.error('Failed to activate methods');
    }
  };

  const bulkDeactivate = async () => {
    try {
      const promises = selectedMethods.map(id =>
        updateDoc(doc(db, 'shippingMethods', id), { isActive: false })
      );
      await Promise.all(promises);
      toast.success(`${selectedMethods.length} methods deactivated`);
      setSelectedMethods([]);
      loadMethods();
    } catch (error) {
      toast.error('Failed to deactivate methods');
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedMethods.length} shipping methods?`)) return;
    try {
      const promises = selectedMethods.map(id =>
        deleteDoc(doc(db, 'shippingMethods', id))
      );
      await Promise.all(promises);
      toast.success(`${selectedMethods.length} methods deleted`);
      setSelectedMethods([]);
      loadMethods();
    } catch (error) {
      toast.error('Failed to delete methods');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormData({
      label: '',
      type: 'flat_rate',
      cost: 0,
      estimate: '3-5 business days',
      isActive: true,
      description: '',
      taxable: true,
      minOrderAmount: 0,
      maxWeight: 0,
      weightUnit: 'kg',
      zones: [],
      config: {}
    });
  };

  const addZone = () => {
    setFormData(prev => ({
      ...prev,
      zones: [...(prev.zones || []), { name: '', cost: 0, countries: [] }]
    }));
  };

  const updateZone = (index, field, value) => {
    const newZones = [...formData.zones];
    newZones[index][field] = value;
    setFormData(prev => ({ ...prev, zones: newZones }));
  };

  const removeZone = (index) => {
    setFormData(prev => ({
      ...prev,
      zones: prev.zones.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Loading shipping methods...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Shipping Methods</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Shipping Method
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search shipping methods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">All Types</option>
              {SHIPPING_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedMethods.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-700">
              {selectedMethods.length} method{selectedMethods.length > 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={bulkActivate}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Activate
              </button>
              <button
                onClick={bulkDeactivate}
                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                Deactivate
              </button>
              <button
                onClick={bulkDelete}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Methods Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedMethods.length === filteredMethods.length && filteredMethods.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedMethods(filteredMethods.map(m => m.id));
                      } else {
                        setSelectedMethods([]);
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estimate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMethods.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <Truck size={48} className="mx-auto text-gray-400 mb-3" />
                    No shipping methods found
                  </td>
                </tr>
              ) : (
                filteredMethods.map((method) => (
                  <tr key={method.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedMethods.includes(method.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMethods(prev => [...prev, method.id]);
                          } else {
                            setSelectedMethods(prev => prev.filter(id => id !== method.id));
                          }
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{method.label}</div>
                        {method.description && (
                          <div className="text-sm text-gray-500">{method.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                        {SHIPPING_TYPES.find(t => t.value === method.type)?.label || method.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      R{(method.cost || 0).toFixed(2)}
                      {method.type === 'free_shipping' && method.minOrderAmount > 0 && (
                        <div className="text-xs text-gray-500">
                          Min: R{method.minOrderAmount}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {method.estimate}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleStatus(method)}
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          method.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {method.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleEdit(method)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(method)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(method.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">
                {editing ? 'Edit Shipping Method' : 'Add Shipping Method'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Method Name *
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., Standard Delivery"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Method Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    {SHIPPING_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label} - {type.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Cost (R) *
                  </label>
                  <input
                    type="number"
                    value={formData.cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border rounded"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Estimate
                  </label>
                  <input
                    type="text"
                    value={formData.estimate}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., 3-5 business days"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                    placeholder="Optional description for customers"
                  />
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Advanced Settings</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Minimum Order Amount (R)
                    </label>
                    <input
                      type="number"
                      value={formData.minOrderAmount}
                      onChange={(e) => setFormData(prev => ({ ...prev, minOrderAmount: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border rounded"
                      min="0"
                      step="0.01"
                      placeholder="0 for no minimum"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Maximum Weight ({formData.weightUnit})
                    </label>
                    <input
                      type="number"
                      value={formData.maxWeight}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxWeight: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border rounded"
                      min="0"
                      step="0.1"
                      placeholder="0 for unlimited"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weight Unit
                    </label>
                    <select
                      value={formData.weightUnit}
                      onChange={(e) => setFormData(prev => ({ ...prev, weightUnit: e.target.value }))}
                      className="w-full px-3 py-2 border rounded"
                    >
                      <option value="kg">Kilograms (kg)</option>
                      <option value="lb">Pounds (lb)</option>
                      <option value="oz">Ounces (oz)</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.taxable}
                        onChange={(e) => setFormData(prev => ({ ...prev, taxable: e.target.checked }))}
                        className="rounded"
                      />
                      <span className="ml-2 text-sm">Taxable</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                        className="rounded"
                      />
                      <span className="ml-2 text-sm">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Shipping Zones */}
              {formData.type === 'zone_based' && (
                <div className="border-t pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Shipping Zones</h3>
                    <button
                      type="button"
                      onClick={addZone}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      Add Zone
                    </button>
                  </div>

                  <div className="space-y-4">
                    {(formData.zones || []).map((zone, index) => (
                      <div key={index} className="border rounded p-4 bg-gray-50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Zone Name
                            </label>
                            <input
                              type="text"
                              value={zone.name}
                              onChange={(e) => updateZone(index, 'name', e.target.value)}
                              className="w-full px-3 py-2 border rounded"
                              placeholder="e.g., Gauteng"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Zone Cost (R)
                            </label>
                            <input
                              type="number"
                              value={zone.cost}
                              onChange={(e) => updateZone(index, 'cost', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border rounded"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeZone(index)}
                              className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Courier Configuration */}
              {formData.type === 'courier' && (
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium mb-4">Courier Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Provider Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., FASTWAY, ARAMEX, DHL"
                        value={formData.config?.providerCode || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, providerCode: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        placeholder="API Key for rate fetching"
                        value={formData.config?.apiKey || ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          config: { ...prev.config, apiKey: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border rounded"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  {editing ? 'Update Method' : 'Add Method'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}