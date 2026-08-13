import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Link } from 'react-router-dom';
import {
  Plus, Search, MapPin, Truck, Edit2, Trash2,
  Globe, Building, Loader
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ShippingZones() {
  const { tenant } = useAuth();
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;

    const q = query(collection(db, 'tenants', tenant.id, 'shippingZones'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const zonesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => a.order - b.order);
      setZones(zonesData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  const deleteZone = async (zoneId) => {
    if (!confirm('Are you sure you want to delete this shipping zone?')) return;

    try {
      await deleteDoc(doc(db, 'tenants', tenant.id, 'shippingZones', zoneId));
      toast.success('Shipping zone deleted');
    } catch (error) {
      toast.error('Failed to delete zone');
    }
  };

  const updateZoneOrder = async (zoneId, newOrder) => {
    try {
      await updateDoc(doc(db, 'tenants', tenant.id, 'shippingZones', zoneId), {
        order: newOrder,
        updatedAt: new Date()
      });
    } catch (error) {
      toast.error('Failed to update order');
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Shipping Zones</h2>
          <p className="text-gray-500">Configure shipping regions and rates</p>
        </div>
        <Link
          to="/sell/dashboard/shipping/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Shipping Zone
        </Link>
      </div>

      {/* Zones List */}
      <div className="space-y-4">
        {zones.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <MapPin size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No shipping zones yet</h3>
            <p className="text-gray-500 mb-4">Create your first shipping zone to start offering delivery options.</p>
            <Link
              to="/sell/dashboard/shipping/new"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              Add Shipping Zone
            </Link>
          </div>
        ) : (
          zones.map((zone, index) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              index={index}
              totalZones={zones.length}
              onDelete={() => deleteZone(zone.id)}
              onOrderChange={(newOrder) => updateZoneOrder(zone.id, newOrder)}
            />
          ))
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h4 className="font-medium text-blue-900 mb-2">Shipping Zone Priority</h4>
        <p className="text-sm text-blue-700">
          Shipping zones are matched in order from top to bottom. A customer’s shipping address will match the first zone
          that contains their location. Make sure to order your zones accordingly.
        </p>
      </div>
    </div>
  );
}

function ZoneCard({ zone, index, totalZones, onDelete, onOrderChange }) {
  const getRegionDisplay = (regions) => {
    if (!regions || regions.length === 0) return 'No regions selected';

    const displays = regions.map(region => {
      if (region.type === 'country') {
        return region.name || region.code;
      } else if (region.type === 'state') {
        return `${region.name || region.code}`;
      }
      return region.name || region.code;
    });

    if (displays.length <= 2) {
      return displays.join(', ');
    }
    return `${displays.slice(0, 2).join(', ')} +${displays.length - 2} more`;
  };

  const getMethodsCount = (methods) => {
    return methods ? methods.length : 0;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Drag Handle */}
            <div className="flex flex-col gap-1 pt-2">
              <button
                onClick={() => index > 0 && onOrderChange(index)}
                disabled={index === 0}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                ▲
              </button>
              <button
                onClick={() => index < totalZones - 1 && onOrderChange(index + 2)}
                disabled={index === totalZones - 1}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                ▼
              </button>
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <MapPin size={20} className="text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900">{zone.name}</h3>
                <span className="text-sm text-gray-500">Zone {index + 1}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Regions:</span>
                  <span className="ml-2">{getRegionDisplay(zone.regions)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Shipping Methods:</span>
                  <span className="ml-2">{getMethodsCount(zone.methods)} methods</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={`/sell/dashboard/shipping/${zone.id}`}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-800 px-3 py-2 rounded hover:bg-blue-50"
            >
              <Edit2 size={16} />
              Edit
            </Link>
            <button
              onClick={onDelete}
              className="flex items-center gap-2 text-red-600 hover:text-red-800 px-3 py-2 rounded hover:bg-red-50"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </div>

        {/* Shipping Methods Preview */}
        {zone.methods && zone.methods.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Shipping Methods:</h4>
            <div className="flex flex-wrap gap-2">
              {zone.methods.map((method, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                >
                  <Truck size={12} />
                  {method.title} - R{method.cost}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}