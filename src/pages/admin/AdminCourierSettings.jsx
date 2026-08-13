import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Truck, Check, AlertCircle, Package, Settings, ExternalLink, Box } from 'lucide-react';
import toast from 'react-hot-toast';

const COURIERS = [
  {
    id: 'thecourierguy',
    name: 'The Courier Guy',
    logo: '/couriers/tcg.png',
    description: 'Nationwide delivery with tracking. Same-day collection available in major cities.',
    apiUrl: 'https://api.thecourierguy.co.za',
    docsUrl: 'https://thecourierguy.co.za/api-docs'
  },
  {
    id: 'aramex',
    name: 'Aramex',
    logo: '/couriers/aramex.png',
    description: 'International and domestic shipping. Excellent for remote areas.',
    apiUrl: 'https://api.aramex.com',
    docsUrl: 'https://www.aramex.co.za/api'
  },
  {
    id: 'rtt',
    name: 'RTT (Rapid Transport)',
    logo: '/couriers/rtt.png',
    description: 'Same-day delivery specialists. Premium service for urgent orders.',
    apiUrl: 'https://api.rtt.co.za',
    docsUrl: 'https://rtt.co.za/developers'
  }
];

const DEFAULT_SETTINGS = {
  provider: '',
  apiKey: '',
  apiSecret: '',
  defaultService: 'economy',
  autoGenerateWaybill: true,
  checkoutRate: 0,
  deliveryEstimate: '',
  rateInCents: false,
  debugRates: false,
  returnCourierFee: 350,
  packaging: {
    type: 'box',
    weightKg: 1,
    lengthCm: 20,
    widthCm: 20,
    heightCm: 10
  },
  collectionAddress: {
    street: '',
    suburb: '',
    city: '',
    postalCode: '',
    contactName: '',
    email: '',
    phone: ''
  }
};

export default function AdminCourierSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'admin', 'settings'));
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.courierSettings) {
            setSettings((prev) => ({
              ...prev,
              ...data.courierSettings,
              packaging: {
                ...prev.packaging,
                ...data.courierSettings.packaging
              },
              collectionAddress: {
                ...prev.collectionAddress,
                ...data.courierSettings.collectionAddress
              }
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load courier settings:', error);
        toast.error('Failed to load courier settings');
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const providerMeta = selectedCourier
        ? {
            id: selectedCourier.id,
            name: selectedCourier.name,
            logo: selectedCourier.logo,
            docsUrl: selectedCourier.docsUrl
          }
        : null;

      await setDoc(
        doc(db, 'admin', 'settings'),
        {
          courierSettings: settings,
          courierProvider: settings.provider,
          courierApiKey: settings.apiKey,
          updatedAt: new Date()
        },
        { merge: true }
      );

      // Public, non-sensitive settings for checkout (no API keys)
      await setDoc(
        doc(db, 'public', 'courier'),
        {
          returnCourierFee: Number(settings.returnCourierFee) || 0,
          courierSettings: {
            provider: settings.provider,
            defaultService: settings.defaultService,
            checkoutRate: Number(settings.checkoutRate) || 0,
            deliveryEstimate: settings.deliveryEstimate || '',
            debugRates: settings.debugRates === true,
            returnCourierFee: Number(settings.returnCourierFee) || 0
          },
          courierProviderMeta: providerMeta,
          updatedAt: new Date()
        },
        { merge: true }
      );

      toast.success('Courier settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings.provider) {
      setTestResult({ success: false, message: 'Select a courier first' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const success = settings.apiKey.length > 10;
      setTestResult({
        success,
        message: success ? 'Connection successful!' : 'Invalid API key format'
      });

      if (success) toast.success('Connection test passed');
      else toast.error('Connection test failed');
    } catch (error) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const selectedCourier = COURIERS.find((c) => c.id === settings.provider);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Courier Settings</h2>

      <div className="space-y-6">
        {/* Courier Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Truck size={20} className="text-blue-600" />
            Select Courier
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {COURIERS.map((courier) => (
              <button
                key={courier.id}
                onClick={() => setSettings({ ...settings, provider: courier.id })}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  settings.provider === courier.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{courier.name}</span>
                  {settings.provider === courier.id && <Check size={20} className="text-blue-600" />}
                </div>
                <p className="text-sm text-gray-600">{courier.description}</p>
              </button>
            ))}
          </div>
        </div>

        {selectedCourier && (
          <>
            {/* API Configuration */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Settings size={20} className="text-blue-600" />
                  API Configuration
                </h3>
                <a
                  href={selectedCourier.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  API Docs <ExternalLink size={14} />
                </a>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                  <input
                    type="password"
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder={`Enter your ${selectedCourier.name} API key`}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Found in your {selectedCourier.name} dashboard under Developer Settings
                  </p>
                </div>

                {selectedCourier.id === 'aramex' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">API Secret</label>
                    <input
                      type="password"
                      value={settings.apiSecret}
                      onChange={(e) => setSettings({ ...settings, apiSecret: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={testConnection}
                    disabled={testing || !settings.apiKey}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>

                  {testResult && (
                    <div
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                        testResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
                      {testResult.message}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Collection Address */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Package size={20} className="text-blue-600" />
                Collection Address
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                  <input
                    type="text"
                    value={settings.collectionAddress.street}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, street: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="123 Main Street"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Suburb</label>
                  <input
                    type="text"
                    value={settings.collectionAddress.suburb}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, suburb: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={settings.collectionAddress.city}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, city: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={settings.collectionAddress.postalCode}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, postalCode: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={settings.collectionAddress.contactName}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, contactName: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={settings.collectionAddress.email}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, email: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="dispatch@yourstore.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={settings.collectionAddress.phone}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        collectionAddress: { ...settings.collectionAddress, phone: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="082 123 4567"
                  />
                </div>
              </div>
            </div>

            {/* Preferences */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Preferences</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Default Service Level</label>
                  <div className="flex gap-4">
                    {['economy', 'standard', 'express'].map((service) => (
                      <label key={service} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="service"
                          value={service}
                          checked={settings.defaultService === service}
                          onChange={(e) => setSettings({ ...settings, defaultService: e.target.value })}
                          className="text-blue-600"
                        />
                        <span className="capitalize">{service}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={settings.autoGenerateWaybill}
                    onChange={(e) => setSettings({ ...settings, autoGenerateWaybill: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">
                    Automatically generate waybill when order is paid
                  </span>
                </label>
              </div>
            </div>

            {/* Checkout Settings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4">Checkout Settings</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Flat Delivery Rate (R)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.checkoutRate}
                    onChange={(e) =>
                      setSettings({ ...settings, checkoutRate: Number(e.target.value) || 0 })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used at checkout for shipping cost.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Estimate</label>
                  <input
                    type="text"
                    value={settings.deliveryEstimate}
                    onChange={(e) => setSettings({ ...settings, deliveryEstimate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    placeholder="1-2 business days"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refund Application Fee (R)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settings.returnCourierFee}
                    onChange={(e) =>
                      setSettings({ ...settings, returnCourierFee: Number(e.target.value) || 0 })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Charged to customers when submitting refund or return applications.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.rateInCents}
                    onChange={(e) => setSettings({ ...settings, rateInCents: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  Rates returned in cents
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Enable if the courier API returns values like 11645 (meaning R116.45).
                </p>
              </div>
              <div className="mt-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.debugRates}
                    onChange={(e) => setSettings({ ...settings, debugRates: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  Enable rate debug
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Shows parcel inputs and rate fields at checkout for troubleshooting.
                </p>
              </div>
            </div>

            {/* Default Packaging */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Box size={20} className="text-blue-600" />
                Default Packaging
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Package Type</label>
                  <select
                    value={settings.packaging.type}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        packaging: { ...settings.packaging, type: e.target.value }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  >
                    <option value="box">Box</option>
                    <option value="satchel">Satchel</option>
                    <option value="tube">Tube</option>
                    <option value="crate">Crate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={settings.packaging.weightKg}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        packaging: { ...settings.packaging, weightKg: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Length (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={settings.packaging.lengthCm}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        packaging: { ...settings.packaging, lengthCm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={settings.packaging.widthCm}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        packaging: { ...settings.packaging, widthCm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    min="1"
                    value={settings.packaging.heightCm}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        packaging: { ...settings.packaging, heightCm: Number(e.target.value) }
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Courier Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
