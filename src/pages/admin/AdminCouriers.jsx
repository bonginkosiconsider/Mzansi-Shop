import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserPlus, MapPin, Phone, Mail, Star, CheckCircle, XCircle, Edit, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminCouriers() {
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    vehicle: 'motorcycle', // motorcycle, car, van, truck
    licensePlate: '',
    serviceAreas: [],
    baseRate: 0,
    perKmRate: 0,
    zones: [], // {name: 'CBD', rate: 50}, {name: 'Suburbs', rate: 75}
    isActive: true,
    rating: 0,
    totalDeliveries: 0,
    documents: {} // ID, license, vehicle registration
  });

  useEffect(() => {
    loadCouriers();
  }, []);

  const loadCouriers = async () => {
    try {
      const snap = await getDocs(collection(db, 'couriers'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCouriers(data);
    } catch (error) {
      console.error('Failed to load couriers:', error);
      toast.error('Failed to load couriers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      toast.error('Name, email, and phone are required');
      return;
    }

    try {
      const submission = {
        ...formData,
        zones: formData.zones || [],
        serviceAreas: formData.serviceAreas || [],
        documents: formData.documents || {},
        updatedAt: new Date()
      };

      if (editing?.id) {
        await updateDoc(doc(db, 'couriers', editing.id), submission);
        toast.success('Courier updated');
      } else {
        submission.createdAt = new Date();
        await addDoc(collection(db, 'couriers'), submission);
        toast.success('Courier added');
      }

      setShowForm(false);
      setEditing(null);
      resetForm();
      loadCouriers();
    } catch (error) {
      console.error('Failed to save courier:', error);
      toast.error(`Failed to save: ${error.message}`);
    }
  };

  const handleEdit = (courier) => {
    setEditing(courier);
    setFormData(courier);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this courier?')) return;
    try {
      await deleteDoc(doc(db, 'couriers', id));
      toast.success('Courier deleted');
      loadCouriers();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete courier');
    }
  };

  const toggleStatus = async (courier) => {
    try {
      await updateDoc(doc(db, 'couriers', courier.id), {
        isActive: !courier.isActive
      });
      toast.success(`Courier ${!courier.isActive ? 'activated' : 'deactivated'}`);
      loadCouriers();
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditing(null);
    setFormData({
      name: '',
      email: '',
      phone: '',
      vehicle: 'motorcycle',
      licensePlate: '',
      serviceAreas: [],
      baseRate: 0,
      perKmRate: 0,
      zones: [],
      isActive: true,
      rating: 0,
      totalDeliveries: 0,
      documents: {}
    });
  };

  const addZone = () => {
    setFormData(prev => ({
      ...prev,
      zones: [...(prev.zones || []), { name: '', rate: 0 }]
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

  const addServiceArea = () => {
    setFormData(prev => ({
      ...prev,
      serviceAreas: [...(prev.serviceAreas || []), '']
    }));
  };

  const updateServiceArea = (index, value) => {
    const newAreas = [...formData.serviceAreas];
    newAreas[index] = value;
    setFormData(prev => ({ ...prev, serviceAreas: newAreas }));
  };

  const removeServiceArea = (index) => {
    setFormData(prev => ({
      ...prev,
      serviceAreas: prev.serviceAreas.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return <div className="text-center py-8">Loading couriers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Courier Management</h1>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <UserPlus size={20} />
          Add Courier
        </button>
      </div>

      {/* Couriers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {couriers.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
            <UserPlus size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No couriers registered yet</p>
          </div>
        ) : (
          couriers.map((courier) => (
            <div key={courier.id} className="bg-white rounded-lg shadow p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{courier.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    <Star size={14} className="text-yellow-400" />
                    <span>{(courier.rating || 0).toFixed(1)}</span>
                    <span>({courier.totalDeliveries || 0} deliveries)</span>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  courier.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {courier.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400" />
                  <span>{courier.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400" />
                  <span>{courier.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-gray-400" />
                  <span>{courier.vehicle} - {courier.licensePlate}</span>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="font-medium text-sm mb-2">Delivery Rates</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Base Rate:</span>
                    <span>R{(courier.baseRate || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per KM:</span>
                    <span>R{(courier.perKmRate || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {courier.zones && courier.zones.length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="font-medium text-sm mb-2">Zone Rates</h4>
                  <div className="space-y-1 text-sm">
                    {courier.zones.slice(0, 2).map((zone, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{zone.name}:</span>
                        <span>R{(zone.rate || 0).toFixed(2)}</span>
                      </div>
                    ))}
                    {courier.zones.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{courier.zones.length - 2} more zones
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleEdit(courier)}
                  className="flex-1 bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200 flex items-center justify-center gap-1"
                >
                  <Edit size={16} />
                  Edit
                </button>
                <button
                  onClick={() => toggleStatus(courier)}
                  className={`flex-1 px-3 py-1 rounded text-sm flex items-center justify-center gap-1 ${
                    courier.isActive
                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {courier.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(courier.id)}
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
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold">
                {editing ? 'Edit Courier' : 'Add Courier'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="Courier's full name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="courier@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="+27 12 345 6789"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Type
                  </label>
                  <select
                    value={formData.vehicle}
                    onChange={(e) => setFormData(prev => ({ ...prev, vehicle: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="motorcycle">Motorcycle</option>
                    <option value="car">Car</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                    <option value="bicycle">Bicycle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    License Plate
                  </label>
                  <input
                    type="text"
                    value={formData.licensePlate}
                    onChange={(e) => setFormData(prev => ({ ...prev, licensePlate: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="ABC 123 GP"
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
                    <span className="ml-2 text-sm">Active Courier</span>
                  </label>
                </div>
              </div>

              {/* Service Areas */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Service Areas</h3>
                  <button
                    type="button"
                    onClick={addServiceArea}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                  >
                    Add Area
                  </button>
                </div>

                <div className="space-y-2">
                  {(formData.serviceAreas || []).map((area, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={area}
                        onChange={(e) => updateServiceArea(index, e.target.value)}
                        className="flex-1 px-3 py-2 border rounded"
                        placeholder="e.g., Johannesburg CBD, Sandton"
                      />
                      <button
                        type="button"
                        onClick={() => removeServiceArea(index)}
                        className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pricing */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Delivery Pricing</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base Rate (R)
                    </label>
                    <input
                      type="number"
                      value={formData.baseRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, baseRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border rounded"
                      min="0"
                      step="0.01"
                      placeholder="50.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Minimum delivery fee</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Per Kilometer Rate (R)
                    </label>
                    <input
                      type="number"
                      value={formData.perKmRate}
                      onChange={(e) => setFormData(prev => ({ ...prev, perKmRate: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 border rounded"
                      min="0"
                      step="0.01"
                      placeholder="15.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Additional cost per km</p>
                  </div>
                </div>
              </div>

              {/* Zone Rates */}
              <div className="border-t pt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Zone-Based Rates</h3>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Zone Name
                          </label>
                          <input
                            type="text"
                            value={zone.name}
                            onChange={(e) => updateZone(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 border rounded"
                            placeholder="e.g., CBD, Northern Suburbs"
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Rate (R)
                            </label>
                            <input
                              type="number"
                              value={zone.rate}
                              onChange={(e) => updateZone(index, 'rate', parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border rounded"
                              min="0"
                              step="0.01"
                              placeholder="75.00"
                            />
                          </div>
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

              <div className="flex gap-3 pt-6 border-t">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  {editing ? 'Update Courier' : 'Add Courier'}
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