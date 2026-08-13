import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';

const createInitialSettings = () => ({
  commissionPercent: 5,
  monthlyRent: 100,
  maintenanceMode: false,
  supportEmail: 'support@mzansishop.co.za',
  orderEmails: {
    enabled: false,
    from: 'MzansiShop Orders <orders@mzansishop.co.za>',
    replyTo: 'support@mzansishop.co.za',
    subject: 'Your MzansiShop order {{ORDER_REFERENCE}} is confirmed',
    templateId: ''
  },
  businessAddress: {
    street: '',
    city: '',
    province: '',
    postalCode: '',
    country: 'South Africa',
    phone: '',
    coordinates: { lat: '', lng: '' }
  }
});

const mergeSettings = (saved = {}) => {
  const defaults = createInitialSettings();
  return {
    ...defaults,
    ...saved,
    orderEmails: {
      ...defaults.orderEmails,
      ...(saved.orderEmails || {})
    },
    businessAddress: {
      ...defaults.businessAddress,
      ...(saved.businessAddress || {}),
      coordinates: {
        ...defaults.businessAddress.coordinates,
        ...(saved.businessAddress?.coordinates || {})
      }
    }
  };
};

export default function AdminSettings() {
  const [settings, setSettings] = useState(createInitialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const snapshot = await getDoc(doc(db, 'admin', 'settings'));
        if (snapshot.exists()) {
          setSettings(mergeSettings(snapshot.data() || {}));
        }
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'admin', 'settings'), settings, { merge: true });
      toast.success('Platform settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-200 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Platform Settings</h2>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Commission Percent</label>
          <input
            type="number"
            min="0"
            max="100"
            value={settings.commissionPercent}
            onChange={(e) => setSettings({ ...settings, commissionPercent: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent (R)</label>
          <input
            type="number"
            min="0"
            value={settings.monthlyRent}
            onChange={(e) => setSettings({ ...settings, monthlyRent: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
          <input
            type="email"
            value={settings.supportEmail}
            onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-4 py-2"
          />
        </div>

        <div className="border-t pt-6 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Order Emails</h3>
            <p className="text-sm text-gray-600 mt-1">
              Resend sends order confirmations from the backend. Keep the API key in Firebase secrets and configure the sender, subject, and optional template ID here.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.orderEmails?.enabled || false}
              onChange={(e) => setSettings({
                ...settings,
                orderEmails: {
                  ...settings.orderEmails,
                  enabled: e.target.checked
                }
              })}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Enable order confirmation emails</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input
              type="text"
              value={settings.orderEmails?.from || ''}
              onChange={(e) => setSettings({
                ...settings,
                orderEmails: {
                  ...settings.orderEmails,
                  from: e.target.value
                }
              })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="MzansiShop Orders <orders@mzansishop.co.za>"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To Address</label>
            <input
              type="email"
              value={settings.orderEmails?.replyTo || ''}
              onChange={(e) => setSettings({
                ...settings,
                orderEmails: {
                  ...settings.orderEmails,
                  replyTo: e.target.value
                }
              })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="support@mzansishop.co.za"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Subject</label>
            <input
              type="text"
              value={settings.orderEmails?.subject || ''}
              onChange={(e) => setSettings({
                ...settings,
                orderEmails: {
                  ...settings.orderEmails,
                  subject: e.target.value
                }
              })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="Your MzansiShop order {{ORDER_REFERENCE}} is confirmed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Supported placeholders: <code>{'{{ORDER_REFERENCE}}'}</code>, <code>{'{{order_id}}'}</code>, <code>{'{{CUSTOMER_NAME}}'}</code>, <code>{'{{customer_name}}'}</code>, <code>{'{{TOTAL}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{ORDER_DATE}}'}</code>.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resend Template ID</label>
            <input
              type="text"
              value={settings.orderEmails?.templateId || ''}
              onChange={(e) => setSettings({
                ...settings,
                orderEmails: {
                  ...settings.orderEmails,
                  templateId: e.target.value
                }
              })}
              className="w-full border border-gray-300 rounded-lg px-4 py-2"
              placeholder="f3b9756c-f4f4-44da-bc00-9f7903c8a83f"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to use the built-in HTML email. If you use a Resend template, publish it first and use these variable names: <code>CUSTOMER_NAME</code>, <code>customer_name</code>, <code>ORDER_REFERENCE</code>, <code>order_id</code>, <code>ORDER_DATE</code>, <code>PAYMENT_METHOD</code>, <code>PRODUCT_NAME</code>, <code>product_name</code>, <code>ITEM_LINES</code>, <code>TOTAL</code>, <code>amount</code>, <code>SUPPORT_EMAIL</code>, <code>VIEW_ORDER_URL</code>, <code>view_order_url</code>, <code>SHIPPING_ADDRESS</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
            className="rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700">Enable maintenance mode</span>
        </div>

        {/* Business Address Section */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Business Address</h3>
          <p className="text-sm text-gray-600 mb-4">This address will be used as the pickup location for courier deliveries</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={settings.businessAddress?.street || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, street: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="123 Main Street"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={settings.businessAddress?.city || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, city: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="Johannesburg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
              <input
                type="text"
                value={settings.businessAddress?.province || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, province: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="Gauteng"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input
                type="text"
                value={settings.businessAddress?.postalCode || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, postalCode: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="2000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input
                type="text"
                value={settings.businessAddress?.country || 'South Africa'}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, country: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Business Phone</label>
              <input
                type="tel"
                value={settings.businessAddress?.phone || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: { ...settings.businessAddress, phone: e.target.value }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="+27 11 123 4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude (Optional)</label>
              <input
                type="text"
                value={settings.businessAddress?.coordinates?.lat || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: {
                    ...settings.businessAddress,
                    coordinates: { ...settings.businessAddress.coordinates, lat: e.target.value }
                  }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="-26.2041"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude (Optional)</label>
              <input
                type="text"
                value={settings.businessAddress?.coordinates?.lng || ''}
                onChange={(e) => setSettings({
                  ...settings,
                  businessAddress: {
                    ...settings.businessAddress,
                    coordinates: { ...settings.businessAddress.coordinates, lng: e.target.value }
                  }
                })}
                className="w-full border border-gray-300 rounded-lg px-4 py-2"
                placeholder="28.0473"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
