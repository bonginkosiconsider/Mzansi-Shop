import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Save, X, Plus, Trash2, MapPin, Truck, Globe, Building } from 'lucide-react';
import toast from 'react-hot-toast';

const SHIPPING_METHODS = [
  { id: 'flat_rate', name: 'Flat Rate', description: 'Charge a fixed rate for shipping' },
  { id: 'free_shipping', name: 'Free Shipping', description: 'Offer free shipping based on conditions' },
  { id: 'local_pickup', name: 'Local Pickup', description: 'Allow customers to pick up orders' }
];

export default function ShippingZoneForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [zone, setZone] = useState({
    name: '',
    order: 1,
    regions: [],
    methods: []
  });

  useEffect(() => {
    if (id && id !== 'new') {
      loadZone();
    }
  }, [id]);

  const loadZone = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'tenants', tenant.id, 'shippingZones', id));
      if (docSnap.exists()) {
        setZone(docSnap.data());
      }
    } catch (error) {
      toast.error('Failed to load shipping zone');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!zone.name.trim()) {
      toast.error('Zone name is required');
      return;
    }

    if (zone.regions.length === 0) {
      toast.error('At least one region must be selected');
      return;
    }

    setSaving(true);
    try {
      const zoneData = {
        ...zone,
        updatedAt: new Date()
      };

      if (id === 'new') {
        zoneData.createdAt = new Date();
        await addDoc(collection(db, 'tenants', tenant.id, 'shippingZones'), zoneData);
        toast.success('Shipping zone created');
        navigate('/sell/dashboard/shipping');
      } else {
        await updateDoc(doc(db, 'tenants', tenant.id, 'shippingZones', id), zoneData);
        toast.success('Shipping zone updated');
      }
    } catch (error) {
      toast.error('Save failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addRegion = (type) => {
    const newRegion = {
      type,
      code: '',
      name: ''
    };

    if (type === 'country') {
      newRegion.code = 'ZA';
      newRegion.name = 'South Africa';
    }

    setZone({
      ...zone,
      regions: [...zone.regions, newRegion]
    });
  };

  const updateRegion = (index, field, value) => {
    const newRegions = [...zone.regions];
    newRegions[index][field] = value;
    setZone({ ...zone, regions: newRegions });
  };

  const removeRegion = (index) => {
    setZone({
      ...zone,
      regions: zone.regions.filter((_, i) => i !== index)
    });
  };

  const addMethod = (methodType) => {
    const template = SHIPPING_METHODS.find(m => m.id === methodType);
    if (!template) return;

    const newMethod = {
      id: methodType,
      title: template.name,
      enabled: true,
      cost: 0,
      taxStatus: 'taxable'
    };

    if (methodType === 'free_shipping') {
      newMethod.requires = 'min_amount';
      newMethod.minAmount = 500;
    }

    setZone({
      ...zone,
      methods: [...zone.methods, newMethod]
    });
  };

  const updateMethod = (index, field, value) => {
    const newMethods = [...zone.methods];
    newMethods[index][field] = value;
    setZone({ ...zone, methods: newMethods });
  };

  const removeMethod = (index) => {
    setZone({
      ...zone,
      methods: zone.methods.filter((_, i) => i !== index)
    });
  };

  if (loading) return <div className="flex justify-center p-12">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {id === 'new' ? 'Add Shipping Zone' : 'Edit Shipping Zone'}
          </h2>
          <p className="text-gray-500">{zone.name || 'Untitled Zone'}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/sell/dashboard/shipping')}
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
            {saving ? 'Saving...' : 'Save Zone'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Zone Details */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4">Zone Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone Name</label>
                <input
                  type="text"
                  value={zone.name}
                  onChange={(e) => setZone({...zone, name: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="e.g. South Africa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zone Order</label>
                <input
                  type="number"
                  value={zone.order}
                  onChange={(e) => setZone({...zone, order: parseInt(e.target.value)})}
                  className="w-full border rounded-lg px-4 py-2"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">Zones are matched in order from lowest to highest</p>
              </div>
            </div>
          </div>

          {/* Regions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Regions</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => addRegion('country')}
                  className="flex items-center gap-2 text-blue-600 text-sm hover:text-blue-800"
                >
                  <Globe size={16} /> Add Country
                </button>
                <button
                  onClick={() => addRegion('state')}
                  className="flex items-center gap-2 text-blue-600 text-sm hover:text-blue-800"
                >
                  <Building size={16} /> Add State/Province
                </button>
              </div>
            </div>

            {zone.regions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No regions added yet. Add countries or states to define where this shipping zone applies.
              </p>
            ) : (
              <div className="space-y-3">
                {zone.regions.map((region, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <MapPin size={16} className="text-gray-400" />
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Code</label>
                        <input
                          type="text"
                          value={region.code}
                          onChange={(e) => updateRegion(idx, 'code', e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm"
                          placeholder={region.type === 'country' ? 'ZA' : 'ZA-GP'}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Name</label>
                        <input
                          type="text"
                          value={region.name}
                          onChange={(e) => updateRegion(idx, 'name', e.target.value)}
                          className="w-full border rounded px-3 py-2 text-sm"
                          placeholder={region.type === 'country' ? 'South Africa' : 'Gauteng'}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => removeRegion(idx)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shipping Methods */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Shipping Methods</h3>
              <div className="flex gap-2">
                {SHIPPING_METHODS.map(method => (
                  <button
                    key={method.id}
                    onClick={() => addMethod(method.id)}
                    className="flex items-center gap-2 text-blue-600 text-sm hover:text-blue-800"
                  >
                    <Plus size={16} /> {method.name}
                  </button>
                ))}
              </div>
            </div>

            {zone.methods.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No shipping methods added yet. Add methods to define how customers can receive their orders.
              </p>
            ) : (
              <div className="space-y-4">
                {zone.methods.map((method, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <Truck size={20} className="text-gray-400" />
                        <div>
                          <h4 className="font-medium">{method.title}</h4>
                          <p className="text-sm text-gray-500">
                            {SHIPPING_METHODS.find(m => m.id === method.id)?.description}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeMethod(idx)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Method Title</label>
                        <input
                          type="text"
                          value={method.title}
                          onChange={(e) => updateMethod(idx, 'title', e.target.value)}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-600 mb-1">Cost (R)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={method.cost}
                          onChange={(e) => updateMethod(idx, 'cost', parseFloat(e.target.value))}
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                    </div>

                    {/* Method-specific fields */}
                    {method.id === 'free_shipping' && (
                      <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
                        <h5 className="text-sm font-medium text-blue-900 mb-2">Free Shipping Conditions</h5>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-blue-700 mb-1">Requires</label>
                            <select
                              value={method.requires || 'min_amount'}
                              onChange={(e) => updateMethod(idx, 'requires', e.target.value)}
                              className="w-full border rounded px-3 py-2 text-sm"
                            >
                              <option value="min_amount">Minimum order amount</option>
                              <option value="coupon">Valid coupon</option>
                              <option value="both">Minimum amount AND coupon</option>
                            </select>
                          </div>
                          {(method.requires === 'min_amount' || method.requires === 'both') && (
                            <div>
                              <label className="block text-xs text-blue-700 mb-1">Minimum Amount (R)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={method.minAmount || 0}
                                onChange={(e) => updateMethod(idx, 'minAmount', parseFloat(e.target.value))}
                                className="w-full border rounded px-3 py-2 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-4">
                      <label className="block text-sm text-gray-600 mb-1">Tax Status</label>
                      <select
                        value={method.taxStatus || 'taxable'}
                        onChange={(e) => updateMethod(idx, 'taxStatus', e.target.value)}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="taxable">Taxable</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Zone Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Zone Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Regions:</span>
                <span className="font-medium">{zone.regions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping Methods:</span>
                <span className="font-medium">{zone.methods.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Order:</span>
                <span className="font-medium">{zone.order}</span>
              </div>
            </div>
          </div>

          {/* Help */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">How Shipping Zones Work</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Zones are checked in order from lowest to highest</li>
              <li>• First matching zone determines available shipping methods</li>
              <li>• Customers see all methods for their zone</li>
              <li>• Use specific regions for precise control</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}