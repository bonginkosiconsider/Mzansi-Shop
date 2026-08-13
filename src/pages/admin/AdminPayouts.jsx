import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, updateDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { CheckCircle, Clock, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { getVendorDisplayName } from '../../utils/vendorDisplay';

export default function AdminPayouts() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [commissionRate, setCommissionRate] = useState(0.05);

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const loadCommission = async () => {
      try {
        const settingsSnap = await getDoc(doc(db, 'admin', 'settings'));
        if (settingsSnap.exists() && typeof settingsSnap.data().commissionPercent === 'number') {
          setCommissionRate(settingsSnap.data().commissionPercent);
        }
      } catch (error) {
        // fallback to default
      }
    };
    loadCommission();
  }, []);

  const rows = useMemo(() => {
    const map = new Map();
    orders.forEach((order) => {
      const isPaid = order.paymentStatus === 'paid' || order.status === 'paid';
      if (!isPaid) return;

      const isCompleted = order.payoutStatus === 'completed';
      if (statusFilter === 'pending' && isCompleted) return;
      if (statusFilter === 'completed' && !isCompleted) return;

      const tenantId = order.tenantId || 'unknown';
      const entry = map.get(tenantId) || {
        tenantId,
        tenantName: getVendorDisplayName(null, order),
        gross: 0,
        commission: 0,
        courier: 0,
        net: 0,
        orderIds: [],
        status: isCompleted ? 'completed' : 'pending'
      };

      const gross = Number(order.total || 0);
      const commission = typeof order.platformFee === 'number'
        ? Number(order.platformFee)
        : gross * commissionRate;
      const courierCost = Number(order.shippingCost ?? 0);
      const vendorPayable = typeof order.vendorPayout === 'number'
        ? Number(order.vendorPayout)
        : gross - commission - courierCost;
      const net = vendorPayable;

      entry.gross += gross;
      entry.commission += commission;
      entry.courier += courierCost;
      entry.net += net;
      entry.orderIds.push(order.id);
      map.set(tenantId, entry);
    });

    return Array.from(map.values());
  }, [orders, statusFilter, commissionRate]);

  const pendingTotal = useMemo(() => {
    return rows
      .filter((row) => row.status !== 'completed')
      .reduce((sum, row) => sum + (row.net || 0), 0);
  }, [rows]);

  const pendingCourierTotal = useMemo(() => {
    return rows
      .filter((row) => row.status !== 'completed')
      .reduce((sum, row) => sum + (row.courier || 0), 0);
  }, [rows]);

  const markPaid = async (orderIds) => {
    try {
      await Promise.all(
        orderIds.map((orderId) =>
          updateDoc(doc(db, 'orders', orderId), {
            payoutStatus: 'completed',
            paidAt: new Date()
          })
        )
      );
      toast.success('Payout marked as completed');
    } catch (error) {
      toast.error('Failed to update payout');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Payouts Control</h2>

      <div className="bg-white rounded-xl shadow-sm border mb-6 p-4 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Pending Payouts (after {Math.round(commissionRate * 100)}% commission & courier)
          </p>
          <p className="text-2xl font-bold text-gray-900">R{Number(pendingTotal || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">
            Courier set-aside: R{Number(pendingCourierTotal || 0).toFixed(2)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-4 py-2"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Reference</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tenant</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Gross</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Commission</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Courier</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Vendor Payable</th>
              <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.tenantId} className="hover:bg-gray-50">
                <td className="py-4 px-4 text-sm font-mono text-gray-600">
                  {row.tenantId.slice(-8).toUpperCase()}
                </td>
                <td className="py-4 px-4 text-sm text-gray-700">{row.tenantName}</td>
                <td className="py-4 px-4 text-sm text-gray-900">R{row.gross.toFixed(2)}</td>
                <td className="py-4 px-4 text-sm text-gray-900">R{row.commission.toFixed(2)}</td>
                <td className="py-4 px-4 text-sm text-gray-900">R{row.courier.toFixed(2)}</td>
                <td className="py-4 px-4 text-sm text-gray-900">R{row.net.toFixed(2)}</td>
                <td className="py-4 px-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      row.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {row.status === 'completed' ? <CheckCircle size={12} /> : <Clock size={12} />}
                    {row.status || 'pending'}
                  </span>
                </td>
                <td className="py-4 px-4 text-right">
                  {row.status !== 'completed' && (
                    <button
                      onClick={() => markPaid(row.orderIds)}
                      className="px-3 py-1 rounded text-sm bg-green-100 text-green-700 hover:bg-green-200"
                    >
                      Mark Paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-gray-500">
                  No payouts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
