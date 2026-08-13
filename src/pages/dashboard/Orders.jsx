import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  Search,
  MapPin,
  Phone,
  Mail,
  Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatOrderReferenceCode } from '../../utils/orderReference';

const STATUS_STEPS = ['pending', 'paid', 'shipped', 'delivered'];

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800',
  paid: 'bg-yellow-100 text-yellow-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
};

const STATUS_ICONS = {
  pending: Clock,
  paid: Clock,
  shipped: Truck,
  delivered: CheckCircle,
  cancelled: Package
};

export default function Orders() {
  const { tenant } = useAuth();
  const { id: orderId } = useParams();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [trackingInfo, setTrackingInfo] = useState({ waybillNumber: '', trackingUrl: '' });

  useEffect(() => {
    if (!tenant) return;

    const q = query(
      collection(db, 'orders'),
      where('tenantId', '==', tenant.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          status: data.status || 'pending',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        };
      });
      setOrders(ordersData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    let filtered = orders;

    if (statusFilter !== 'all') {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (o) =>
          o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.customerEmail?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  }, [orders, statusFilter, searchQuery]);

  useEffect(() => {
    if (!orderId) return;
    const match = orders.find((order) => order.id === orderId);
    if (match) {
      setSelectedOrder(match);
    }
  }, [orderId, orders]);

  useEffect(() => {
    if (!selectedOrder) return;
    setTrackingInfo({
      waybillNumber: selectedOrder.waybillNumber || '',
      trackingUrl: selectedOrder.trackingUrl || ''
    });
  }, [selectedOrder]);

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
        ...(newStatus === 'shipped' && { shippedAt: Timestamp.now() }),
        ...(newStatus === 'delivered' && { deliveredAt: Timestamp.now() })
      });

      toast.success(`Order marked as ${newStatus}`);
      setSelectedOrder(null);
    } catch (error) {
      toast.error('Failed to update status');
      console.error(error);
    }
  };

  const saveTracking = async () => {
    if (!selectedOrder) return;
    try {
      await updateDoc(doc(db, 'orders', selectedOrder.id), {
        waybillNumber: trackingInfo.waybillNumber || null,
        trackingUrl: trackingInfo.trackingUrl || null,
        updatedAt: Timestamp.now()
      });
      toast.success('Tracking updated');
    } catch (error) {
      toast.error('Failed to update tracking');
      console.error(error);
    }
  };

  const getStatusColor = (status) => STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';

  const getStatusIcon = (status) => {
    const Icon = STATUS_ICONS[status] || Package;
    return <Icon size={16} />;
  };

  const updateReturnStatus = async (orderId, status) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        returnStatus: status,
        returnUpdatedAt: Timestamp.now()
      });
      toast.success(`Return marked as ${status}`);
      setSelectedOrder((prev) => (prev ? { ...prev, returnStatus: status } : prev));
    } catch (error) {
      toast.error('Failed to update return status');
      console.error(error);
    }
  };

  const formatDimensions = (item) => {
    if (!item) return '';
    if (typeof item.dimensions === 'string' && item.dimensions.trim()) {
      return item.dimensions;
    }
    const dims = item.dimensions && typeof item.dimensions === 'object' ? item.dimensions : {};
    const length = item.length ?? dims.length ?? dims.lengthCm;
    const width = item.width ?? dims.width ?? dims.widthCm;
    const height = item.height ?? dims.height ?? dims.heightCm;
    if (length || width || height) {
      return `${length ?? 'n/a'} x ${width ?? 'n/a'} x ${height ?? 'n/a'} cm`;
    }
    return '';
  };

  const formatWeight = (item) => {
    const weight = item?.weight ?? item?.weightKg;
    return weight !== undefined && weight !== null && weight !== ''
      ? `${weight} kg`
      : '';
  };

  const getAddressFields = (order) => {
    const address = order?.customerAddress || order?.shippingAddress || {};
    return {
      line1: address.street || address.line1 || '',
      line2: address.suburb || address.line2 || '',
      city: address.city || '',
      state: address.state || address.province || '',
      postalCode: address.postalCode || address.zip || '',
      country: address.country || ''
    };
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-gray-200 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const newToday = orders.filter(
    (o) => o.createdAt && o.createdAt > new Date(Date.now() - 86400000)
  ).length;
  const pendingCount = orders.filter((o) => ['pending', 'paid'].includes(o.status)).length;
  const shippedCount = orders.filter((o) => o.status === 'shipped').length;
  const totalCount = orders.length;

  const stats = [
    { label: 'New Today', value: newToday, bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Pending', value: pendingCount, bg: 'bg-yellow-50', border: 'border-yellow-200' },
    { label: 'Shipped', value: shippedCount, bg: 'bg-purple-50', border: 'border-purple-200' },
    { label: 'Total', value: totalCount, bg: 'bg-gray-50', border: 'border-gray-200' }
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>

        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 w-full sm:w-64"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, idx) => (
          <div key={idx} className={`p-4 rounded-lg border ${stat.bg} ${stat.border}`}>
            <p className="text-sm text-gray-600">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No orders found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredOrders.map((order) => (
              <div
                key={order.id}
                className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">#{formatOrderReferenceCode(order)}</p>
                      <p className="text-sm text-gray-500">
                        {order.createdAt?.toLocaleDateString('en-ZA')} - {order.items?.length || 0} items
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-gray-900">R{Number(order.total || 0).toFixed(2)}</p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                        order.status
                      )}`}
                    >
                      {order.status}
                    </span>
                    {order.paymentStatus && order.paymentStatus !== 'paid' && (
                      <p className="text-xs text-orange-600 mt-1">Payment: {order.paymentStatus}</p>
                    )}
                  </div>
                </div>

                {order.waybillNumber && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <Truck size={14} />
                    Waybill: {order.waybillNumber}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Order #{formatOrderReferenceCode(selectedOrder)}
                </h3>
                <p className="text-sm text-gray-500">
                  Placed on {selectedOrder.createdAt?.toLocaleString('en-ZA')}
                </p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">
                X
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Payment */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Payment</h4>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>Status: {selectedOrder.paymentStatus || 'pending'}</p>
                  {selectedOrder.paymentMethod && <p>Method: {selectedOrder.paymentMethod}</p>}
                  {selectedOrder.yocoCheckoutId && <p>Checkout ID: {selectedOrder.yocoCheckoutId}</p>}
                  {selectedOrder.paymentError && (
                    <p className="text-red-600">Error: {selectedOrder.paymentError}</p>
                  )}
                </div>
              </div>
              {/* Status Flow */}
              <div className="flex items-center justify-between">
                {STATUS_STEPS.map((status, idx) => {
                  const currentIndex = STATUS_STEPS.indexOf(selectedOrder?.status || 'pending');
                  const isActive = currentIndex >= idx;
                  const isComplete = currentIndex > idx;
                  return (
                    <div key={status} className="flex items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isActive ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      {idx < STATUS_STEPS.length - 1 && (
                        <div className={`w-12 h-1 ${isComplete ? 'bg-blue-600' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Customer Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Customer Details</h4>
                {(() => {
                  const address = getAddressFields(selectedOrder);
                  return (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Mail size={16} className="text-gray-400" />
                    {selectedOrder.customerEmail || 'No email'}
                  </p>
                  <p className="flex items-center gap-2">
                    <Phone size={16} className="text-gray-400" />
                    {selectedOrder.customerPhone || 'No phone'}
                  </p>
                  <p className="flex items-start gap-2">
                    <MapPin size={16} className="text-gray-400 mt-0.5" />
                    <span>
                      {address.line1 || 'No address'}
                      {address.line2 && (
                        <>
                          <br />
                          {address.line2}
                        </>
                      )}
                      <br />
                      {address.city}
                      {address.state ? `, ${address.state}` : ''}
                      {address.postalCode ? ` ${address.postalCode}` : ''}
                      {address.country ? `, ${address.country}` : ''}
                    </span>
                  </p>
                </div>
                  );
                })()}
              </div>

              {/* Items */}
              <div>
                <h4 className="font-medium mb-3">Items</h4>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b">
                      <div className="flex items-center gap-3">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            loading="lazy"
                            decoding="async"
                            className="w-12 h-12 object-cover rounded"
                          />
                        )}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          {item.sku && <p className="text-xs text-gray-500">SKU: {item.sku}</p>}
                          {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                            <p className="text-xs text-gray-500">
                              {Object.entries(item.selectedVariations)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(', ')}
                            </p>
                          )}
                          {(formatDimensions(item) || formatWeight(item)) && (
                            <p className="text-xs text-gray-500">
                              {formatDimensions(item)}
                              {formatDimensions(item) && formatWeight(item) ? ' • ' : ''}
                              {formatWeight(item)}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="font-medium">R{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-4 text-lg font-bold">
                  <span>Total</span>
                  <span>R{Number(selectedOrder.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Tracking */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Shipping</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Waybill number"
                    value={trackingInfo.waybillNumber}
                    onChange={(e) =>
                      setTrackingInfo({ ...trackingInfo, waybillNumber: e.target.value })
                    }
                    className="border border-blue-200 rounded-lg px-3 py-2 bg-white"
                  />
                  <input
                    type="url"
                    placeholder="Tracking URL"
                    value={trackingInfo.trackingUrl}
                    onChange={(e) =>
                      setTrackingInfo({ ...trackingInfo, trackingUrl: e.target.value })
                    }
                    className="border border-blue-200 rounded-lg px-3 py-2 bg-white"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={saveTracking}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Save Tracking
                  </button>
                  {selectedOrder.trackingUrl && (
                    <a
                      href={selectedOrder.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm hover:underline"
                    >
                      Track shipment →
                    </a>
                  )}
                </div>
              </div>

              {/* Returns */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Returns</h4>
                <div className="text-sm text-gray-700 mb-3">
                  Status: {selectedOrder.returnStatus || 'none'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {['requested', 'approved', 'rejected', 'received', 'refunded'].map((status) => (
                    <button
                      key={status}
                      onClick={() => updateReturnStatus(selectedOrder.id, status)}
                      className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                {selectedOrder.status === 'pending' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'paid')}
                    className="flex-1 bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700"
                  >
                    Mark as Paid
                  </button>
                )}
                {selectedOrder.status === 'paid' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'shipped')}
                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700"
                  >
                    Mark as Shipped
                  </button>
                )}
                {selectedOrder.status === 'shipped' && (
                  <button
                    onClick={() => updateOrderStatus(selectedOrder.id, 'delivered')}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700"
                  >
                    Mark as Delivered
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Printer size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
