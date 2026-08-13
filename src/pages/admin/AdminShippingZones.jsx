import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit, Trash2, MapPin, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminShippingZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'domestic', // domestic, international, custom
    countries: [],
    regions: [],
    postalCodes: [],
    cost: 0,
    isActive: true,
    description: ''
  });

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async () => {
    try {
      const snap = await getDocs(collection(db, 'shippingZones'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setZones(data);
    } catch (error) {
      console.error('Failed to load shipping zones:', error);
      toast.error('Failed to load shipping zones');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Zone name is required');
      return;
    }

    try {
      const submission = {
        ...formData,
        countries: formData.countries || [],
        regions: formData.regions || [],
        postalCodes: formData.postalCodes || []
      };

      if (editing?.id) {
        await updateDoc(doc(db, 'shippingZones', editing.id), submission);
        toast.success('Shipping zone updated');
      } else {
        await addDoc(collection(db, 'shippingZones'), submission);
        toast.success('Shipping zone added');
      }

      setShowForm(false);
      setEditing(null);
      resetForm();
      loadZones();
    } catch (error) {
      console.error('Failed to save shipping zone:', error);
      toast.error(`Failed to save: ${error.message}`);
    }
  };

  const handleEdit = (zone) => {
    setEditing(zone);
    setFormData(zone);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this shipping zone?')) return;
    try {
      await deleteDoc(doc(db, 'shippingZones', id));
      toast.success('Shipping zone deleted');
      loadZones();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete shipping zone');
    }
  };

  const toggleStatus = async (zone) => {
    try {
      await updateDoc(doc(db, 'shippingZones', zone.id), {
        isActive: !zone.isActive
      });
      toast.success(`Zone ${!zone.isActive ? 'activated' : 'deactivated'}`);
      loadZones();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormData({
      name: '',
      type: 'domestic',
      countries: [],
      regions: [],
      postalCodes: [],
      cost: 0,
      isActive: true,
      description: ''
    });
  };

  const addCountry = () => {
    setFormData(prev => ({
      ...prev,
      countries: [...(prev.countries || []), '']
    }));
  };

  const updateCountry = (index, value) => {
    const newCountries = [...formData.countries];
    newCountries[index] = value;
    setFormData(prev => ({ ...prev, countries: newCountries }));
  };

  const removeCountry = (index) => {
    setFormData(prev => ({
      ...prev,
      countries: prev.countries.filter((_, i) => i !== index)
    }));
  };

  const addRegion = () => {
    setFormData(prev => ({
      ...prev,
      regions: [...(prev.regions || []), '']
    }));
  };

  const updateRegion = (index, value) => {
    const newRegions = [...formData.regions];
    newRegions[index] = value;
    setFormData(prev => ({ ...prev, regions: newRegions }));
  };

  const removeRegion = (index) => {
    setFormData(prev => ({
      ...prev,
      regions: prev.regions.filter((_, i) => i !== index)
    }));
  };

  const addPostalCode = () => {
    setFormData(prev => ({
      ...prev,
      postalCodes: [...(prev.postalCodes || []), '']
    }));
  };

  const updatePostalCode = (index, value) => {
    const newPostalCodes = [...formData.postalCodes];
    newPostalCodes[index] = value;
    setFormData(prev => ({ ...prev, postalCodes: newPostalCodes }));
  };

  const removePostalCode = (index) => {
    setFormData(prev => ({
      ...prev,
      postalCodes: prev.postalCodes.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Loading shipping zones...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Shipping Zones</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus size={20} />
          Add Shipping Zone
        </button>
      </div>

      {/* Zones List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {zones.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
            <MapPin size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No shipping zones configured yet</p>
          </div>
        ) : (
          zones.map((zone) => (
            <div key={zone.id} className="bg-white rounded-lg shadow p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{zone.name}</h3>
                  <p className="text-sm text-gray-500 capitalize">{zone.type}</p>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  zone.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {zone.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="py-2">
                <p className="font-bold text-lg">R{(zone.cost || 0).toFixed(2)}</p>
              </div>

              {zone.description && (
                <p className="text-sm text-gray-600">{zone.description}</p>
              )}

              <div className="space-y-1">
                {zone.countries?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Globe size={12} />
                    <span>{zone.countries.length} countr{zone.countries.length > 1 ? 'ies' : 'y'}</span>
                  </div>
                )}
                {zone.regions?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={12} />
                    <span>{zone.regions.length} region{zone.regions.length > 1 ? 's' : ''}</span>
                  </div>
                )}
                {zone.postalCodes?.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={12} />
                    <span>{zone.postalCodes.length} postal code{zone.postalCodes.length > 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleEdit(zone)}
                  className="flex-1 bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200 flex items-center justify-center gap-1"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <button
                  onClick={() => toggleStatus(zone)}
                  className={`flex-1 px-3 py-1 rounded text-sm flex items-center justify-center gap-1 ${
                    zone.isActive
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {zone.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(zone.id)}
                  className="flex-1 bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200 flex items-center justify-center gap-1"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">
                {editing ? 'Edit Shipping Zone' : 'Add Shipping Zone'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zone Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="e.g., South Africa"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zone Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    required
                  >
                    <option value="domestic">Domestic</option>
                    <option value="international">International</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Base Cost (R)
                  </label>
                  <input
                    type="number"
                    value={formData.cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border rounded"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="flex items-center">
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

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    rows={3}
                    placeholder="Optional description for this zone"
                  />
                </div>
              </div>

              {/* Countries */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Countries</h3>
                  <button
                    type="button"
                    onClick={addCountry}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Add Country
                  </button>
                </div>

                <div className="space-y-2">
                  {(formData.countries || []).map((country, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => updateCountry(index, e.target.value)}
                        className="flex-1 px-3 py-2 border rounded"
                        placeholder="e.g., South Africa"
                      />
                      <button
                        type="button"
                        onClick={() => removeCountry(index)}
                        className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regions */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Regions/States/Provinces</h3>
                  <button
                    type="button"
                    onClick={addRegion}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Add Region
                  </button>
                </div>

                <div className="space-y-2">
                  {(formData.regions || []).map((region, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={region}
                        onChange={(e) => updateRegion(index, e.target.value)}
                        className="flex-1 px-3 py-2 border rounded"
                        placeholder="e.g., Gauteng, Western Cape"
                      />
                      <button
                        type="button"
                        onClick={() => removeRegion(index)}
                        className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Postal Codes */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Postal Codes</h3>
                  <button
                    type="button"
                    onClick={addPostalCode}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Add Postal Code
                  </button>
                </div>

                <div className="space-y-2">
                  {(formData.postalCodes || []).map((postalCode, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => updatePostalCode(index, e.target.value)}
                        className="flex-1 px-3 py-2 border rounded"
                        placeholder="e.g., 2000, 8001 (use ranges like 2000-2999)"
                      />
                      <button
                        type="button"
                        onClick={() => removePostalCode(index)}
                        className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-6 border-t">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  {editing ? 'Update Zone' : 'Add Zone'}
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