import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Filter, MoreVertical, Edit2, Trash2,
  Copy, Percent, DollarSign, Calendar, Users, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';

const COUPON_TYPES = [
  { value: 'percent', label: 'Percentage discount', icon: Percent },
  { value: 'fixed_cart', label: 'Fixed cart discount', icon: DollarSign },
  { value: 'fixed_product', label: 'Fixed product discount', icon: DollarSign }
];

export default function Coupons() {
  const { tenant } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [filteredCoupons, setFilteredCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    type: 'all',
    status: 'all'
  });
  const [selectedCoupons, setSelectedCoupons] = useState([]);

  useEffect(() => {
    if (!tenant) return;

    const q = query(collection(db, 'tenants', tenant.id, 'coupons'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const couponsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCoupons(couponsData);
      setFilteredCoupons(couponsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    let result = coupons;

    if (filters.search) {
      result = result.filter(c =>
        c.code?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    if (filters.type !== 'all') {
      result = result.filter(c => c.type === filters.type);
    }

    if (filters.status !== 'all') {
      const now = new Date();
      if (filters.status === 'active') {
        result = result.filter(c => !c.expiryDate || new Date(c.expiryDate) > now);
      } else if (filters.status === 'expired') {
        result = result.filter(c => c.expiryDate && new Date(c.expiryDate) <= now);
      }
    }

    setFilteredCoupons(result);
  }, [filters, coupons]);

  const handleBulkAction = async (action) => {
    if (selectedCoupons.length === 0) {
      toast.error('Select coupons first');
      return;
    }

    try {
      switch(action) {
        case 'delete':
          for (const id of selectedCoupons) {
            await deleteDoc(doc(db, 'tenants', tenant.id, 'coupons', id));
          }
          toast.success(`${selectedCoupons.length} coupons deleted`);
          break;
      }
      setSelectedCoupons([]);
    } catch (error) {
      toast.error('Action failed');
    }
  };

  const duplicateCoupon = async (coupon) => {
    try {
      const newCoupon = {
        ...coupon,
        code: `${coupon.code}_COPY`,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      delete newCoupon.id;

      await addDoc(collection(db, 'tenants', tenant.id, 'coupons'), newCoupon);
      toast.success('Coupon duplicated');
    } catch (error) {
      toast.error('Duplication failed');
    }
  };

  const getStatusBadge = (coupon) => {
    const now = new Date();
    const isExpired = coupon.expiryDate && new Date(coupon.expiryDate) <= now;
    const isUsedUp = coupon.usageLimit && coupon.usageCount >= coupon.usageLimit;

    if (isExpired) return { label: 'Expired', color: 'red' };
    if (isUsedUp) return { label: 'Used Up', color: 'gray' };
    return { label: 'Active', color: 'green' };
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Coupons</h2>
          <p className="text-gray-500">Manage discount codes and promotions</p>
        </div>
        <Link
          to="/sell/dashboard/coupons/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add New Coupon
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
          <p className="text-sm text-gray-500">Total Coupons</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-green-600">
            {coupons.filter(c => {
              const now = new Date();
              return !c.expiryDate || new Date(c.expiryDate) > now;
            }).length}
          </p>
          <p className="text-sm text-gray-500">Active</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-red-600">
            {coupons.filter(c => c.expiryDate && new Date(c.expiryDate) <= new Date()).length}
          </p>
          <p className="text-sm text-gray-500">Expired</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <p className="text-2xl font-bold text-blue-600">
            {coupons.reduce((sum, c) => sum + (c.usageCount || 0), 0)}
          </p>
          <p className="text-sm text-gray-500">Total Uses</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search coupons..."
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Types</option>
            {COUPON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value})}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedCoupons.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm text-gray-600">{selectedCoupons.length} selected</span>
            <button onClick={() => handleBulkAction('delete')} className="text-sm text-red-600 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Coupons Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-4 p-4">
                <input
                  type="checkbox"
                  checked={selectedCoupons.length === filteredCoupons.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCoupons(filteredCoupons.map(c => c.id));
                    } else {
                      setSelectedCoupons([]);
                    }
                  }}
                />
              </th>
              <th className="text-left p-4">Code</th>
              <th className="text-left p-4">Type</th>
              <th className="text-left p-4">Amount</th>
              <th className="text-left p-4">Usage</th>
              <th className="text-left p-4">Expiry</th>
              <th className="text-left p-4">Status</th>
              <th className="text-left p-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredCoupons.map(coupon => {
              const status = getStatusBadge(coupon);
              const TypeIcon = COUPON_TYPES.find(t => t.value === coupon.type)?.icon || Percent;

              return (
                <tr key={coupon.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedCoupons.includes(coupon.id)}
                      onChange={(e) => {
                        if (selectedCoupons.includes(coupon.id)) {
                          setSelectedCoupons(selectedCoupons.filter(id => id !== coupon.id));
                        } else {
                          setSelectedCoupons([...selectedCoupons, coupon.id]);
                        }
                      }}
                    />
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-gray-900">{coupon.code}</div>
                    <div className="text-sm text-gray-500">{coupon.description}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <TypeIcon size={16} className="text-gray-400" />
                      <span className="text-sm capitalize">{coupon.type.replace('_', ' ')}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="font-medium">
                      {coupon.type === 'percent' ? `${coupon.amount}%` : `R${coupon.amount}`}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">
                      <div>{coupon.usageCount || 0} used</div>
                      {coupon.usageLimit && (
                        <div className="text-gray-500">of {coupon.usageLimit}</div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {coupon.expiryDate ? (
                      <div className="text-sm">
                        {new Date(coupon.expiryDate).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full bg-${status.color}-100 text-${status.color}-800`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Link to={`/sell/dashboard/coupons/${coupon.id}`} className="text-blue-600 hover:text-blue-800">
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => duplicateCoupon(coupon)}
                        className="text-gray-600 hover:text-gray-800"
                        title="Duplicate"
                      >
                        <Copy size={18} />
                      </button>
                      <button className="text-red-600 hover:text-red-800">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}