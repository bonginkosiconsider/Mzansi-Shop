import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, MapPin, Truck } from 'lucide-react';

const createInitialForm = (address) => {
  const safeAddress = address && typeof address === 'object' ? address : {};

  return {
    fullName: safeAddress.fullName || '',
    email: safeAddress.email || '',
    phone: safeAddress.phone || '',
    line1: safeAddress.line1 || '',
    line2: safeAddress.line2 || '',
    city: safeAddress.city || '',
    state: safeAddress.state || '',
    zip: safeAddress.zip || safeAddress.postalCode || '',
    country: safeAddress.country || 'ZA',
    type: safeAddress.type || 'Home',
    isDefault: Boolean(safeAddress.isDefault)
  };
};

const COURIER_STATE_MAP = {
  locked: {
    label: 'Address required',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: MapPin
  },
  loading: {
    label: 'Checking live rates',
    tone: 'border-sky-200 bg-sky-50 text-sky-900',
    icon: Clock3
  },
  ready: {
    label: 'Courier ready',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: CheckCircle2
  },
  error: {
    label: 'Needs attention',
    tone: 'border-rose-200 bg-rose-50 text-rose-900',
    icon: AlertCircle
  }
};

export default function ShippingForm({
  title = 'Shipping Information',
  address,
  onChange,
  methods,
  selectedMethod,
  onMethodChange,
  courierState = 'locked',
  courierMessage = '',
  courierProviderLabel = 'Courier service',
  showDefaultOption = true
}) {
  const [form, setForm] = useState(createInitialForm(address));

  useEffect(() => {
    onChange && onChange(form);
  }, [form, onChange]);

  const handleInput = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const showCourierSection = Array.isArray(methods);
  const stateConfig = COURIER_STATE_MAP[courierState] || COURIER_STATE_MAP.locked;
  const StateIcon = stateConfig.icon;

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {showCourierSection
            ? 'Add the delivery details below so live courier services can be calculated correctly.'
            : 'Add the billing details exactly as they should appear on the order.'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Full Name</label>
          <input
            name="fullName"
            value={form.fullName}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            placeholder="+27 82 123 4567"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Address Type</label>
          <select
            name="type"
            value={form.type}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          >
            <option value="Home">Home</option>
            <option value="Business">Business</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Address Line 1</label>
          <input
            name="line1"
            value={form.line1}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            placeholder="Street address"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Address Line 2</label>
          <input
            name="line2"
            value={form.line2}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            placeholder="Apartment, suburb, complex, suite"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">City</label>
          <input
            name="city"
            value={form.city}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">State/Province</label>
          <input
            name="state"
            value={form.state}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">ZIP/Postal Code</label>
          <input
            name="zip"
            value={form.zip}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Country</label>
          <select
            name="country"
            value={form.country}
            onChange={handleInput}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          >
            <option value="ZA">South Africa</option>
            <option value="US">United States</option>
          </select>
        </div>
        {showDefaultOption && (
          <div className="md:col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="isDefault"
              checked={form.isDefault}
              onChange={handleInput}
            />
            <span className="text-sm text-gray-600">Set as default address</span>
          </div>
        )}
      </div>

      {showCourierSection && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-700 border border-gray-200">
                <Truck size={18} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{courierProviderLabel}</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Enter your address to load available courier services.
                </p>
              </div>
            </div>

            <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${stateConfig.tone}`}>
              <StateIcon size={15} />
              <span className="font-medium">{stateConfig.label}</span>
            </div>
          </div>

          <div className={`rounded-lg border px-3 py-3 text-sm ${stateConfig.tone}`}>
            {courierMessage || 'Complete the address to unlock live courier services.'}
          </div>

          {methods.length > 0 ? (
            <div className="space-y-2">
              {methods.map((method) => {
                const isSelected = selectedMethod === method.id;

                return (
                  <label
                    key={method.id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border bg-white px-4 py-3 transition ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="shippingMethod"
                        value={method.id}
                        checked={isSelected}
                        onChange={() => onMethodChange && onMethodChange(method.id)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{method.label}</p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
                          {method.courier?.serviceName && (
                            <span>{method.courier.serviceName}</span>
                          )}
                          <span>{method.estimate || 'Estimate pending'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        R{Number(method.cost || 0).toFixed(2)}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-4 text-sm text-gray-600">
              Add a complete delivery address above to see courier options.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
