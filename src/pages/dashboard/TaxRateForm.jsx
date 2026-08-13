import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Save, X, Percent, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TaxRateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [rate, setRate] = useState({
    country: 'ZA',
    state: '',
    postcode: '',
    city: '',
    rate: 15,
    name: 'VAT',
    priority: 1,
    compound: false,
    shipping: true,
    class: 'standard'
  });

  useEffect(() => {
    if (id && id !== 'new') {
      loadRate();
    }
  }, [id]);

  const loadRate = async () => {
    setLoading(true);
    try {
      const docSnap = await getDoc(doc(db, 'tenants', tenant.id, 'taxRates', id));
      if (docSnap.exists()) {
        setRate(docSnap.data());
      }
    } catch (error) {
      toast.error('Failed to load tax rate');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!rate.country) {
      toast.error('Country is required');
      return;
    }

    if (!rate.name.trim()) {
      toast.error('Tax name is required');
      return;
    }

    if (rate.rate < 0 || rate.rate > 100) {
      toast.error('Tax rate must be between 0 and 100');
      return;
    }

    setSaving(true);
    try {
      const rateData = {
        ...rate,
        updatedAt: new Date()
      };

      if (id === 'new') {
        rateData.createdAt = new Date();
        await addDoc(collection(db, 'tenants', tenant.id, 'taxRates'), rateData);
        toast.success('Tax rate created');
        navigate('/sell/dashboard/tax');
      } else {
        await updateDoc(doc(db, 'tenants', tenant.id, 'taxRates', id), rateData);
        toast.success('Tax rate updated');
      }
    } catch (error) {
      toast.error('Save failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {id === 'new' ? 'Add Tax Rate' : 'Edit Tax Rate'}
          </h2>
          <p className="text-gray-500">{rate.name} - {rate.rate}%</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/sell/dashboard/tax')}
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
            {saving ? 'Saving...' : 'Save Tax Rate'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Location */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <MapPin size={20} />
              Tax Location
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country Code</label>
                <select
                  value={rate.country}
                  onChange={(e) => setRate({...rate, country: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option value="ZA">South Africa (ZA)</option>
                  <option value="US">United States (US)</option>
                  <option value="GB">United Kingdom (GB)</option>
                  <option value="CA">Canada (CA)</option>
                  <option value="AU">Australia (AU)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State/Province Code</label>
                <input
                  type="text"
                  value={rate.state}
                  onChange={(e) => setRate({...rate, state: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="e.g. GP for Gauteng"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank to apply to all states</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input
                  type="text"
                  value={rate.postcode}
                  onChange={(e) => setRate({...rate, postcode: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="Specific postcode or range"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank to apply to all postcodes</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={rate.city}
                  onChange={(e) => setRate({...rate, city: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="Specific city"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank to apply to all cities</p>
              </div>
            </div>
          </div>

          {/* Tax Details */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
              <Percent size={20} />
              Tax Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Name</label>
                <input
                  type="text"
                  value={rate.name}
                  onChange={(e) => setRate({...rate, name: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="e.g. VAT, GST, Sales Tax"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={rate.rate}
                  onChange={(e) => setRate({...rate, rate: parseFloat(e.target.value)})}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="15.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <input
                  type="number"
                  min="1"
                  value={rate.priority}
                  onChange={(e) => setRate({...rate, priority: parseInt(e.target.value)})}
                  className="w-full border rounded-lg px-4 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers have higher priority</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Class</label>
                <select
                  value={rate.class}
                  onChange={(e) => setRate({...rate, class: e.target.value})}
                  className="w-full border rounded-lg px-4 py-2"
                >
                  <option value="standard">Standard Rate</option>
                  <option value="reduced-rate">Reduced Rate</option>
                  <option value="zero-rate">Zero Rate</option>
                </select>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-medium mb-4">Options</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rate.compound}
                    onChange={(e) => setRate({...rate, compound: e.target.checked})}
                  />
                  <div>
                    <span className="text-sm font-medium">Compound tax</span>
                    <p className="text-xs text-gray-500">Calculate this tax on top of other taxes</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rate.shipping}
                    onChange={(e) => setRate({...rate, shipping: e.target.checked})}
                  />
                  <div>
                    <span className="text-sm font-medium">Apply to shipping</span>
                    <p className="text-xs text-gray-500">Apply this tax rate to shipping costs</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Rate Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Tax Rate Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Rate:</span>
                <span className="font-medium">{rate.rate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Priority:</span>
                <span className="font-medium">{rate.priority}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Compound:</span>
                <span className="font-medium">{rate.compound ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-medium">{rate.shipping ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Location Summary */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="font-medium mb-4">Location Summary</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600">Country:</span>
                <span className="ml-2 font-medium">{rate.country}</span>
              </div>
              {rate.state && (
                <div>
                  <span className="text-gray-600">State:</span>
                  <span className="ml-2 font-medium">{rate.state}</span>
                </div>
              )}
              {rate.postcode && (
                <div>
                  <span className="text-gray-600">Postcode:</span>
                  <span className="ml-2 font-medium">{rate.postcode}</span>
                </div>
              )}
              {rate.city && (
                <div>
                  <span className="text-gray-600">City:</span>
                  <span className="ml-2 font-medium">{rate.city}</span>
                </div>
              )}
              {!rate.state && !rate.postcode && !rate.city && (
                <div className="text-gray-500 italic">Applies to entire country</div>
              )}
            </div>
          </div>

          {/* Help */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Tax Calculation</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Rates are applied by priority (lower first)</li>
              <li>• Compound rates add to previous taxes</li>
              <li>• More specific locations override general ones</li>
              <li>• Shipping tax is optional per rate</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}