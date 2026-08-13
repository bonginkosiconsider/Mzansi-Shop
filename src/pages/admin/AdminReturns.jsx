import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, orderBy, query, updateDoc, Timestamp, increment } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { getVendorDisplayName } from '../../utils/vendorDisplay';
import { formatOrderReferenceCode } from '../../utils/orderReference';

const RETURN_STATUSES = ['payment_pending', 'requested', 'approved', 'rejected', 'received', 'refunded', 'cancelled'];

export default function AdminReturns() {
  const [requests, setRequests] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [isBackfilling, setIsBackfilling] = useState(false);

  const formatOrderRef = (request) => formatOrderReferenceCode(request);
  const vendorLookup = useMemo(() => {
    const map = new Map();
    vendors.forEach((vendor) => {
      map.set(vendor.id, vendor);
    });
    return map;
  }, [vendors]);

  useEffect(() => {
    const requestsQuery = query(collection(db, 'refundRequests'), orderBy('createdAt', 'desc'));
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      setRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const vendorsQuery = query(collection(db, 'tenants'));
    const unsubscribeVendors = onSnapshot(vendorsQuery, (snapshot) => {
      setVendors(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const loadCommission = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'admin', 'settings'));
        if (settingsSnap.exists()) {
          const data = settingsSnap.data() || {};
          if (typeof data.commissionPercent === 'number') {
            setCommissionPercent(data.commissionPercent);
          }
        }
      } catch (error) {
        // keep default
      }
    };
    loadCommission();

    return () => {
      unsubscribeRequests();
      unsubscribeVendors();
    };
  }, []);

  const returnRequests = useMemo(() => {
    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) return false;
      return true;
    });
  }, [requests, statusFilter]);

  const updateReturnStatus = async (requestId, orderId, status) => {
    try {
      const target = requests.find((request) => request.id === requestId);
      if (
        target?.returnMethod === 'courier' &&
        !target?.courierFeePaid &&
        ['approved', 'received', 'refunded'].includes(status)
      ) {
        toast.error('Refund application fee must be paid before approving or refunding.');
        return;
      }

      const updates = [
        updateDoc(doc(db, 'refundRequests', requestId), {
          status,
          updatedAt: Timestamp.now()
        }),
        updateDoc(doc(db, 'orders', orderId), {
          returnStatus: status,
          returnRequested: true,
          returnUpdatedAt: Timestamp.now()
        })
      ];

      // If refunding, decrement tenant's totalSales and totalOrders
      if (status === 'refunded' && target?.status !== 'refunded') {
        const refundAmount = getProductTotal(target);
        if (refundAmount > 0 && target.tenantId) {
          updates.push(
            updateDoc(doc(db, 'tenants', target.tenantId), {
              totalSales: increment(-refundAmount),
              totalOrders: increment(-1)
            })
          );
        }
      }

      await Promise.all(updates);
      toast.success(`Return marked as ${status}`);
    } catch (error) {
      console.error('Failed to update return status', error);
      toast.error('Failed to update return status');
    }
  };

  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value).replace(/[^\d.-]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const getProductTotal = (request) => {
    if (!request) return 0;
    const storedSubtotal = toNumber(request.productSubtotal);
    const orderTotal = toNumber(request.orderTotal);
    const shippingCost = toNumber(request.shippingCost);
    const target = orderTotal > 0 ? Math.max(0, orderTotal - (shippingCost > 0 ? shippingCost : 0)) : 0;
    const candidates = [];
    if (storedSubtotal > 0) candidates.push(storedSubtotal);
    if (Array.isArray(request.items) && request.items.length > 0) {
      const sumQty = request.items.reduce((total, item) => {
        const price = toNumber(item?.price);
        const qty = toNumber(item?.quantity) || 1;
        return total + price * qty;
      }, 0);
      const sumLine = request.items.reduce((total, item) => total + toNumber(item?.price), 0);
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

  const getRefundDue = (request) => {
    const productTotal = getProductTotal(request);
    const percent = Number.isFinite(Number(commissionPercent)) ? Number(commissionPercent) : 0;
    const refund = productTotal * (1 - percent / 100);
    return Math.round(refund * 100) / 100;
  };

  const runBackfill = async () => {
    if (isBackfilling) return;
    if (!confirm('Recalculate product totals for all return requests?')) return;
    setIsBackfilling(true);
    try {
      const backfill = httpsCallable(functions, 'backfillRefundProductTotals');
      const result = await backfill({ limit: 2000, dryRun: false });
      const payload = result?.data || {};
      toast.success(`Updated ${payload.updated || 0} of ${payload.scanned || 0} return requests.`);
    } catch (error) {
      console.error('Backfill error', error);
      toast.error(error.message || 'Failed to recalculate totals.');
    } finally {
      setIsBackfilling(false);
    }
  };


  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
          <RefreshCw size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Return Requests</h2>
          <p className="text-sm text-gray-500">Track return requests across all vendors.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border mb-6">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="text-sm text-gray-500">{returnRequests.length} return requests</div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runBackfill}
              className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
              disabled={isBackfilling}
            >
              {isBackfilling ? 'Recalculating...' : 'Fix Product Totals'}
            </button>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="all">All Statuses</option>
              {RETURN_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Order</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Vendor</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Customer</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Reason</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Method</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Application Fee</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Pickup Address</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Product Total</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Refund Due (-{commissionPercent}%)</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {returnRequests.map((request) => (
              <tr key={request.id} className="hover:bg-gray-50">
                <td className="py-3 px-4 text-sm font-medium">#{formatOrderRef(request)}</td>
                <td className="py-3 px-4 text-sm text-gray-700">
                  {getVendorDisplayName(vendorLookup.get(request.tenantId), request, 'n/a')}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700">
                  {request.customerEmail || request.customerName || 'Unknown'}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700">{request.reason || 'n/a'}</td>
                <td className="py-3 px-4 text-sm text-gray-700">{request.returnMethod || 'courier'}</td>
                <td className="py-3 px-4 text-sm text-gray-700">
                  R{Number(request.courierFee || 0).toFixed(2)} {request.courierFeePaid ? '(paid)' : '(unpaid)'}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700">{request.status || 'requested'}</td>
                <td className="py-3 px-4 text-sm text-gray-700">
                  {request.pickupAddress?.line1 || request.pickupAddress?.city
                    ? `${request.pickupAddress?.line1 || ''} ${request.pickupAddress?.city || ''} ${request.pickupAddress?.postalCode || ''}`.trim()
                    : 'n/a'}
                </td>
                <td className="py-3 px-4 text-sm text-gray-900 text-right">
                  R{getProductTotal(request).toFixed(2)}
                </td>
                <td className="py-3 px-4 text-sm text-gray-900 text-right">
                  R{getRefundDue(request).toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex flex-wrap gap-2 justify-end">
                    {RETURN_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => updateReturnStatus(request.id, request.orderId, status)}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-100"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {returnRequests.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-sm text-gray-500">
                  No return requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
