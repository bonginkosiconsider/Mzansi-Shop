import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Percent, Edit2, Trash2,
  MapPin, Building, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TaxRates() {
  const { tenant } = useAuth();
  const [rates, setRates] = useState([]);
  const [filteredRates, setFilteredRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    country: 'all'
  });
  const [selectedRates, setSelectedRates] = useState([]);

  useEffect(() => {
    if (!tenant) return;

    const q = query(collection(db, 'tenants', tenant.id, 'taxRates'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ratesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.priority - b.priority);
      setRates(ratesData);
      setFilteredRates(ratesData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    let result = rates;

    if (filters.search) {
      result = result.filter(r =>
        r.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        r.country?.toLowerCase().includes(filters.search.toLowerCase()) ||
        r.state?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.country !== 'all') {
      result = result.filter(r => r.country === filters.country);
    }

    setFilteredRates(result);
  }, [filters, rates]);

  const handleBulkAction = async (action) => {
    if (selectedRates.length === 0) {
      toast.error('Select tax rates first');
      return;
    }

    try {
      switch(action) {
        case 'delete':
          for (const id of selectedRates) {
            await deleteDoc(doc(db, 'tenants', tenant.id, 'taxRates', id));
          }
          toast.success(`${selectedRates.length} tax rates deleted`);
          break;
      }
      setSelectedRates([]);
    } catch (error) {
      toast.error('Action failed');
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tax Rates</h2>
          <p className="text-gray-500">Configure tax rates for different regions</p>
        </div>
        <Link
          to="/sell/dashboard/tax/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Tax Rate
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-gray-900">{rates.length}</p>
          <p className="text-sm text-gray-500">Total Tax Rates</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-green-600">
            {rates.filter(r => r.country === 'ZA').length}
          </p>
          <p className="text-sm text-gray-500">South African Rates</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-blue-600">
            {rates.filter(r => r.shipping).length}
          </p>
          <p className="text-sm text-gray-500">Apply to Shipping</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-yellow-600">
            {rates.filter(r => r.compound).length}
          </p>
          <p className="text-sm text-gray-500">Compound Rates</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search tax rates..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={filters.country}
            onChange={(e) => setFilters({...filters, country: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Countries</option>
            <option value="ZA">South Africa</option>
            <option value="US">United States</option>
            <option value="GB">United Kingdom</option>
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedRates.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm text-gray-600">{selectedRates.length} selected</span>
            <button onClick={() => handleBulkAction('delete')} className="text-sm text-red-600 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Tax Rates Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-4 p-4">
                <input
                  type="checkbox"
                  checked={selectedRates.length === filteredRates.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRates(filteredRates.map(r => r.id));
                    } else {
                      setSelectedRates([]);
                    }
                  }}
                />
              </th>
              <th className="text-left p-4">Location</th>
              <th className="text-left p-4">Tax Name</th>
              <th className="text-left p-4">Rate</th>
              <th className="text-left p-4">Priority</th>
              <th className="text-left p-4">Shipping</th>
              <th className="text-left p-4">Compound</th>
              <th className="text-left p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredRates.map(rate => (
              <tr key={rate.id} className="hover:bg-gray-50">
                <td className="p-4">
                  <input
                    type="checkbox"
                    checked={selectedRates.includes(rate.id)}
                    onChange={(e) => {
                      if (selectedRates.includes(rate.id)) {
                        setSelectedRates(selectedRates.filter(id => id !== rate.id));
                      } else {
                        setSelectedRates([...selectedRates, rate.id]);
                      }
                    }}
                  />
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-gray-400" />
                    <div>
                      <div className="font-medium">{rate.country}</div>
                      {rate.state && <div className="text-sm text-gray-500">{rate.state}</div>}
                      {rate.postcode && <div className="text-sm text-gray-500">{rate.postcode}</div>}
                      {rate.city && <div className="text-sm text-gray-500">{rate.city}</div>}
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span className="font-medium">{rate.name}</span>
                </td>
                <td className="p-4">
                  <span className="font-medium">{rate.rate}%</span>
                </td>
                <td className="p-4">
                  <span className="text-sm">{rate.priority}</span>
                </td>
                <td className="p-4">
                  {rate.shipping ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                      No
                    </span>
                  )}
                </td>
                <td className="p-4">
                  {rate.compound ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                      Yes
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                      No
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <Link to={`/sell/dashboard/tax/${rate.id}`} className="text-blue-600 hover:text-blue-800">
                      <Edit2 size={18} />
                    </Link>
                    <button className="text-red-600 hover:text-red-800">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h4 className="font-medium text-blue-900 mb-2">Tax Rate Priority</h4>
        <p className="text-sm text-blue-700">
          Tax rates are applied in order of priority. Lower numbers have higher priority.
          Compound rates are calculated on top of other taxes.
        </p>
      </div>
    </div>
  );
}