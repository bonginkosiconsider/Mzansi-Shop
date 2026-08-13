import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, doc, updateDoc, Timestamp, writeBatch, increment } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getVendorDisplayName } from '../../utils/vendorDisplay';
import { formatOrderReferenceCode, getOrderReferenceCode } from '../../utils/orderReference';
import toast from 'react-hot-toast';

export default function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [sendingOrderEmailId, setSendingOrderEmailId] = useState(null);
  const [verifyingPaymentGroupId, setVerifyingPaymentGroupId] = useState(null);

  useEffect(() => {
    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const vendorsQuery = query(collection(db, 'tenants'));
    const unsubscribeVendors = onSnapshot(vendorsQuery, (snapshot) => {
      setVendors(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribeOrders();
      unsubscribeVendors();
    };
  }, []);

  const vendorLookup = useMemo(() => {
    const map = new Map();
    vendors.forEach((vendor) => {
      map.set(vendor.id, vendor);
    });
    return map;
  }, [vendors]);

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const getOrderVendorId = (order) =>
    order?.tenantId || order?.vendorId || order?.storeId || null;

  const getPaymentGroupKey = (order) =>
    order?.orderGroupId || order?.paymentReference || order?.id || '';

  const getOrderVendorIds = (order) => {
    const ids = new Set();
    const primaryId = getOrderVendorId(order);
    if (primaryId) ids.add(primaryId);
    if (Array.isArray(order?.items)) {
      order.items.forEach((item) => {
        const itemId = item?.tenantId || item?.vendorId || item?.storeId || null;
        if (itemId) ids.add(itemId);
      });
    }
    return Array.from(ids);
  };

  const canVerifyPaymentGroup = (order) => {
    const groupKey = getPaymentGroupKey(order);
    if (!groupKey) return false;

    const groupOrders = orders.filter((candidate) => getPaymentGroupKey(candidate) === groupKey);
    if (groupOrders.length === 0) {
      return (order?.paymentStatus || 'pending') !== 'paid';
    }

    return groupOrders.some((candidate) => (candidate?.paymentStatus || 'pending') !== 'paid');
  };

  const getOrderProductSubtotal = (order) => {
    if (!order) return 0;
    const subtotal = toNumber(order.subtotal);
    const total = toNumber(order.total);
    const shipping = toNumber(order.shippingCost) || toNumber(order?.courier?.cost);
    const target = total > 0 ? Math.max(0, total - (shipping > 0 ? shipping : 0)) : 0;
    const candidates = [];
    if (subtotal > 0) candidates.push(subtotal);
    if (Array.isArray(order.items) && order.items.length > 0) {
      const sumQty = order.items.reduce((acc, item) => {
        const price = toNumber(item?.price);
        const qty = toNumber(item?.quantity) || 1;
        return acc + price * qty;
      }, 0);
      const sumLine = order.items.reduce((acc, item) => acc + toNumber(item?.price), 0);
      [sumQty, sumLine].forEach((value) => {
        if (Number.isFinite(value) && value > 0) candidates.push(value);
      });
    }
    if (candidates.length > 0) {
      if (target > 0) {
        return candidates.reduce((best, value) =>
          Math.abs(value - target) < Math.abs(best - target) ? value : best
        );
      }
      return candidates[0];
    }
    if (target > 0) return target;
    return 0;
  };

  const groupedOrders = useMemo(() => {
    const groups = new Map();
    orders.forEach((order) => {
      const groupId = order.orderGroupId || order.paymentReference || order.id;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          orderGroupId: groupId,
          orderGroupRef: order.orderGroupRef || groupId.slice(-6).toUpperCase(),
          customerEmail: order.customerEmail || 'Unknown',
          createdAt: order.createdAt,
          orders: []
        });
      }
      const group = groups.get(groupId);
      group.orders.push(order);
      if (!group.createdAt || (order.createdAt && order.createdAt > group.createdAt)) {
        group.createdAt = order.createdAt;
      }
    });

    const derivePaymentStatus = (groupOrders) => {
      const statuses = groupOrders.map((o) => o.paymentStatus || 'pending');
      if (statuses.every((s) => s === 'paid')) return 'paid';
      if (statuses.some((s) => s === 'failed')) return 'failed';
      return 'pending';
    };

    const deriveApprovalStatus = (groupOrders) => {
      const statuses = groupOrders.map((o) =>
        o.approvalStatus || (o.vendorVisible ? 'approved' : 'pending')
      );
      if (statuses.every((s) => s === 'approved')) return 'approved';
      if (statuses.some((s) => s === 'rejected')) return 'rejected';
      return 'pending';
    };

    return Array.from(groups.values())
      .map((group) => {
        const productTotal = group.orders.reduce(
          (sum, order) => sum + getOrderProductSubtotal(order),
          0
        );
        const vendorIds = Array.from(
          new Set(
            group.orders.flatMap((order) => getOrderVendorIds(order)).filter(Boolean)
          )
        );
        return {
          ...group,
          displayOrderRef: group.orders.map((order) => getOrderReferenceCode(order)).find(Boolean) || group.orderGroupRef,
          productTotal,
          vendorIds,
          paymentStatus: derivePaymentStatus(group.orders),
          approvalStatus: deriveApprovalStatus(group.orders)
        };
      })
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || a.createdAt || 0;
        const bTime = b.createdAt?.toDate?.() || b.createdAt || 0;
        return bTime - aTime;
      });
  }, [orders]);

  const filteredGroups = useMemo(() => {
    return groupedOrders.filter((group) => {
      if (vendorFilter !== 'all' && !group.vendorIds.includes(vendorFilter)) return false;
      if (statusFilter !== 'all') {
        const matchesStatus = group.orders.some((order) => order.status === statusFilter);
        if (!matchesStatus && group.paymentStatus !== statusFilter && group.approvalStatus !== statusFilter) {
          return false;
        }
      }
      if (search) {
        const needle = search.toLowerCase();
        const groupMatch = group.orderGroupId?.toLowerCase().includes(needle)
          || group.orderGroupRef?.toLowerCase().includes(needle)
          || group.displayOrderRef?.toLowerCase().includes(needle);
        const orderMatch = group.orders.some((order) => order.id?.toLowerCase().includes(needle));
        const emailMatch = group.customerEmail?.toLowerCase().includes(needle);
        const nameMatch = group.orders.some((order) =>
          (order.customerName || '').toLowerCase().includes(needle)
        );
        const vendorMatch = group.orders.some((order) => {
          const vendor = vendorLookup.get(getOrderVendorId(order));
          const vendorName = getVendorDisplayName(vendor, order);
          return vendorName.toLowerCase().includes(needle);
        });
        const itemMatch = group.orders.some((order) =>
          Array.isArray(order.items) && order.items.some((item) =>
            (item.name || '').toLowerCase().includes(needle)
          )
        );
        return groupMatch || orderMatch || emailMatch || nameMatch || vendorMatch || itemMatch;
      }
      return true;
    });
  }, [groupedOrders, vendorFilter, statusFilter, search, vendorLookup]);

  useEffect(() => {
    if (selectedGroupIds.size === 0) return;
    const filteredIds = new Set(filteredGroups.map((group) => group.orderGroupId));
    const next = new Set([...selectedGroupIds].filter((id) => filteredIds.has(id)));
    if (next.size !== selectedGroupIds.size) {
      setSelectedGroupIds(next);
    }
  }, [filteredGroups, selectedGroupIds]);

  const toggleGroupSelection = (groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedGroupIds(new Set(filteredGroups.map((group) => group.orderGroupId)));
    } else {
      setSelectedGroupIds(new Set());
    }
  };

  const openGroup = (group) => {
    if (!group) return;
    if (group.orders.length === 1) {
      setSelectedGroup(null);
      setSelectedOrder(group.orders[0]);
      return;
    }
    setSelectedOrder(null);
    setSelectedGroup(group);
  };

  const deleteSelectedGroups = async () => {
    if (selectedGroupIds.size === 0) return;
    const confirmDelete = window.confirm(
      `Delete ${selectedGroupIds.size} order group(s)? This will permanently remove all orders inside them.`
    );
    if (!confirmDelete) return;

    setIsDeleting(true);
    try {
      const groupsToDelete = groupedOrders.filter((group) => selectedGroupIds.has(group.orderGroupId));
      const ordersToDelete = groupsToDelete.flatMap((group) => group.orders);
      const tenantUpdates = new Map();

      ordersToDelete.forEach((order) => {
        if (order.paymentStatus === 'paid' && order.tenantId) {
          const amount = toNumber(order.total);
          if (amount > 0) {
            const current = tenantUpdates.get(order.tenantId) || { sales: 0, orders: 0 };
            tenantUpdates.set(order.tenantId, {
              sales: current.sales - amount,
              orders: current.orders - 1
            });
          }
        }
      });

      const chunks = [];
      const orderIds = ordersToDelete.map((order) => order.id);
      for (let i = 0; i < orderIds.length; i += 450) {
        chunks.push(orderIds.slice(i, i + 450));
      }
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach((orderId) => {
          batch.delete(doc(db, 'orders', orderId));
        });
        // Update tenant stats
        tenantUpdates.forEach((values, tenantId) => {
          if (values.sales !== 0 || values.orders !== 0) {
            const updateData = {};
            if (values.sales !== 0) updateData.totalSales = increment(values.sales);
            if (values.orders !== 0) updateData.totalOrders = increment(values.orders);
            batch.update(doc(db, 'tenants', tenantId), updateData);
          }
        });
        await batch.commit();
      }
      setSelectedGroupIds(new Set());
    } catch (error) {
      console.error('Failed to delete orders', error);
    } finally {
      setIsDeleting(false);
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

  const formatTimestamp = (value) => {
    if (!value) return '';
    if (typeof value.toDate === 'function') {
      return value.toDate().toLocaleString('en-ZA');
    }
    if (value instanceof Date) {
      return value.toLocaleString('en-ZA');
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString('en-ZA');
  };

  const approveForVendor = async (orderId) => {
    await updateDoc(doc(db, 'orders', orderId), {
      vendorVisible: true,
      approvalStatus: 'approved',
      approvedAt: Timestamp.now(),
      approvedBy: user?.email || 'admin',
      updatedAt: Timestamp.now()
    });
    setSelectedOrder((prev) =>
      prev ? { ...prev, vendorVisible: true, approvalStatus: 'approved' } : prev
    );
  };

  const markPaymentPaid = async (order) => {
    const groupKey = getPaymentGroupKey(order);
    if (!groupKey) return;

    setVerifyingPaymentGroupId(groupKey);
    try {
      const callable = httpsCallable(functions, 'markOrderGroupPaid');
      const response = await callable({
        orderGroupId: order.orderGroupId || order.paymentReference || '',
        orderId: order.id
      });
      const emailResult = response.data?.emailResult || {};
      if (emailResult?.sent) {
        toast.success(`Payment verified and confirmation email sent to ${emailResult.to || order.customerEmail || 'customer'}`);
      } else if (emailResult?.skipped && emailResult.reason === 'already_sent') {
        toast.success('Payment verified. Confirmation email had already been sent.');
      } else if (emailResult?.skipped && emailResult.reason === 'disabled') {
        toast.success('Payment verified. Order emails are currently disabled.');
      } else {
        toast.success('Payment verified and order group marked as paid.');
      }
      setSelectedOrder((prev) =>
        prev
          ? {
              ...prev,
              paymentStatus: 'paid',
              status: 'paid',
              approvalStatus: 'approved',
              vendorVisible: true
            }
          : prev
      );
    } catch (error) {
      console.error('Failed to verify payment group', error);
      toast.error(error?.message || 'Failed to verify payment group');
    } finally {
      setVerifyingPaymentGroupId(null);
    }
  };

  const updateReturnStatus = async (orderId, status) => {
    await updateDoc(doc(db, 'orders', orderId), {
      returnStatus: status,
      returnUpdatedAt: Timestamp.now()
    });
    setSelectedOrder((prev) => (prev ? { ...prev, returnStatus: status } : prev));
  };

  const resendConfirmationEmail = async (order) => {
    if (!order?.id) return;
    setSendingOrderEmailId(order.id);
    try {
      const callable = httpsCallable(functions, 'sendOrderConfirmationEmail');
      const response = await callable({ orderId: order.id });
      if (response.data?.skipped) {
        const reason = response.data.reason === 'already_sent'
          ? 'Confirmation email was already sent for this payment.'
          : response.data.reason === 'disabled'
          ? 'Order email sending is disabled in admin settings.'
          : 'Email was skipped.';
        toast(reason);
      } else {
        toast.success(`Confirmation email sent to ${response.data?.to || order.customerEmail || 'customer'}`);
      }
    } catch (error) {
      console.error('Failed to resend order confirmation email', error);
      toast.error(error?.message || 'Failed to resend order confirmation email');
    } finally {
      setSendingOrderEmailId(null);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">All Orders</h2>

      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="p-4 border-b flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by order number, order ID, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
              <option value="all">All Vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {getVendorDisplayName(vendor)}
                </option>
              ))}
            </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="px-4 pb-4 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span>
            {filteredGroups.length} group{filteredGroups.length === 1 ? '' : 's'}
          </span>
          {selectedGroupIds.size > 0 && (
            <span className="text-gray-800 font-medium">
              {selectedGroupIds.size} selected
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleSelectAll(!(filteredGroups.length > 0 && selectedGroupIds.size === filteredGroups.length))}
            className="px-3 py-1 border rounded hover:bg-gray-100"
          >
            {filteredGroups.length > 0 && selectedGroupIds.size === filteredGroups.length ? 'Clear selection' : 'Select all'}
          </button>
          <button
            type="button"
            onClick={deleteSelectedGroups}
            disabled={selectedGroupIds.size === 0 || isDeleting}
            className="px-3 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting...' : 'Delete selected'}
          </button>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                <input
                  type="checkbox"
                  checked={filteredGroups.length > 0 && selectedGroupIds.size === filteredGroups.length}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              </th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Order Number</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Vendors</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Customer</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Payment</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Approval</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Product Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredGroups.map((group) => {
              const vendorNames = Array.from(
                new Set(
                  group.orders
                    .map((order) => {
                      const vendorId = getOrderVendorId(order);
                      const vendor = vendorId ? vendorLookup.get(vendorId) : null;
                      return getVendorDisplayName(vendor, order);
                    })
                    .filter(Boolean)
                )
              );
              const vendorLabel = vendorNames.length > 2
                ? `${vendorNames.slice(0, 2).join(', ')} +${vendorNames.length - 2}`
                : vendorNames.join(', ');
              return (
                <tr
                  key={group.orderGroupId}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => openGroup(group)}
                >
                  <td className="py-4 px-4 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(group.orderGroupId)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleGroupSelection(group.orderGroupId);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="py-4 px-4 text-sm font-medium">
                    #{group.displayOrderRef}
                    <div className="text-xs text-gray-500">{group.orderGroupId}</div>
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-700">{vendorLabel || '—'}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">{group.customerEmail || 'Unknown'}</td>
                  <td className="py-4 px-4 text-sm text-gray-700">
                    {group.paymentStatus}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-700">
                    {group.approvalStatus}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-900 text-right">
                    R{Number(group.productTotal || 0).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            {filteredGroups.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-500">
                  No orders found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Order #{selectedGroup.displayOrderRef}
                </h3>
                <p className="text-sm text-gray-500">
                  Internal Group ID: {selectedGroup.orderGroupId}
                </p>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-4">
                {selectedGroup.orders.map((order) => {
                  const vendor = vendorLookup.get(getOrderVendorId(order)) || {};
                  return (
                  <div key={order.id} className="border rounded-lg p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {getVendorDisplayName(vendor, order)}
                          </p>
                        <p className="text-sm text-gray-500">
                          Order #{formatOrderReferenceCode(order)} • Payment {order.paymentStatus || 'pending'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          Product total R{getOrderProductSubtotal(order).toFixed(2)}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedGroup(null);
                            setSelectedOrder(order);
                          }}
                          className="px-3 py-1 border rounded text-sm hover:bg-gray-100"
                        >
                          View details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-start">
              <div>
                <h3 className="text-lg font-semibold">
                  Order #{formatOrderReferenceCode(selectedOrder)}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedOrder.createdAt?.toDate?.()?.toLocaleString?.('en-ZA')
                    || selectedOrder.createdAt?.toLocaleString?.('en-ZA')
                    || 'Unknown date'}
                </p>
                {formatOrderReferenceCode(selectedOrder) && (
                  <p className="text-xs text-gray-500">
                    Order number / EFT reference: {formatOrderReferenceCode(selectedOrder)}
                  </p>
                )}
                {selectedOrder.orderGroupId && (
                  <p className="text-xs text-gray-500">
                    Internal group ID: {selectedOrder.orderGroupId}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Vendor */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Vendor</h4>
                  {(() => {
                    const vendor = vendorLookup.get(getOrderVendorId(selectedOrder)) || {};
                    return (
                      <div className="space-y-1 text-sm text-gray-700">
                        <p>Name: {getVendorDisplayName(vendor, selectedOrder)}</p>
                        {(vendor.email || selectedOrder.tenantEmail) && (
                          <p>Email: {vendor.email || selectedOrder.tenantEmail}</p>
                        )}
                      {(vendor.subdomain || selectedOrder.tenantSubdomain) && (
                        <p>Subdomain: {vendor.subdomain || selectedOrder.tenantSubdomain}</p>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Payment */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Payment</h4>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>Status: {selectedOrder.paymentStatus || 'pending'}</p>
                  {(selectedOrder.paymentMethodLabel || selectedOrder.paymentMethod) && (
                    <p>Method: {selectedOrder.paymentMethodLabel || selectedOrder.paymentMethod}</p>
                  )}
                  {formatOrderReferenceCode(selectedOrder) && (
                    <p>Buyer EFT reference: {formatOrderReferenceCode(selectedOrder)}</p>
                  )}
                  {selectedOrder.yocoCheckoutId && <p>Checkout ID: {selectedOrder.yocoCheckoutId}</p>}
                  {selectedOrder.confirmationEmail?.status && (
                    <p className={selectedOrder.confirmationEmail.status === 'failed' ? 'text-red-600' : ''}>
                      Email: {selectedOrder.confirmationEmail.status}
                    </p>
                  )}
                  {selectedOrder.confirmationEmail?.sentAt && (
                    <p>Last sent: {formatTimestamp(selectedOrder.confirmationEmail.sentAt)}</p>
                  )}
                  {selectedOrder.confirmationEmail?.lastError && (
                    <p className="text-red-600">Email error: {selectedOrder.confirmationEmail.lastError}</p>
                  )}
                  {selectedOrder.paymentError && (
                    <p className="text-red-600">Error: {selectedOrder.paymentError}</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canVerifyPaymentGroup(selectedOrder) && (
                    <button
                      onClick={() => markPaymentPaid(selectedOrder)}
                      disabled={verifyingPaymentGroupId === getPaymentGroupKey(selectedOrder)}
                      className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm disabled:opacity-50"
                    >
                      {verifyingPaymentGroupId === getPaymentGroupKey(selectedOrder)
                        ? 'Verifying Payment...'
                        : 'Verify EFT and Mark Group Paid'}
                    </button>
                  )}
                  <button
                    onClick={() => approveForVendor(selectedOrder.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Approve for Vendor
                  </button>
                  <button
                    onClick={() => resendConfirmationEmail(selectedOrder)}
                    disabled={
                      sendingOrderEmailId === selectedOrder.id
                      || !selectedOrder.customerEmail
                      || selectedOrder.paymentStatus !== 'paid'
                    }
                    className="px-3 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 text-sm disabled:opacity-50"
                  >
                    {sendingOrderEmailId === selectedOrder.id ? 'Sending...' : 'Resend Confirmation Email'}
                  </button>
                </div>
              </div>

              {/* Returns */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Returns</h4>
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

              {/* Customer */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-3">Customer</h4>
                {(() => {
                  const address = getAddressFields(selectedOrder);
                  return (
                    <div className="space-y-2 text-sm">
                      <p>Name: {selectedOrder.customerName || 'Unknown'}</p>
                      <p>Email: {selectedOrder.customerEmail || 'No email'}</p>
                      <p>Phone: {selectedOrder.customerPhone || 'No phone'}</p>
                      <p>
                        Address: {address.line1 || 'No address'}
                        {address.line2 ? `, ${address.line2}` : ''}
                        {address.city ? `, ${address.city}` : ''}
                        {address.state ? `, ${address.state}` : ''}
                        {address.postalCode ? ` ${address.postalCode}` : ''}
                        {address.country ? `, ${address.country}` : ''}
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
                      <p className="font-medium">R{(Number(item.price || 0) * item.quantity).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const productSubtotal = getOrderProductSubtotal(selectedOrder);
                  const discount = toNumber(selectedOrder.discount);
                  const refundableTotal = Math.max(0, productSubtotal - discount);
                  return (
                    <div className="pt-4 text-sm text-gray-700 space-y-1">
                      <div className="flex justify-between">
                        <span>Product total</span>
                        <span>R{productSubtotal.toFixed(2)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-green-700">
                          <span>Discount</span>
                          <span>-R{discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-2 text-lg font-bold text-gray-900">
                        <span>Total</span>
                        <span>R{refundableTotal.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Courier fees are not refundable.
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
