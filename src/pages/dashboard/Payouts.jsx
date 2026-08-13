import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Wallet, ArrowDownLeft, Calendar, Download, TrendingUp, Clock } from 'lucide-react';

export default function Payouts() {
  const { tenant } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalEarned: 0,
    pendingPayout: 0,
    thisMonth: 0,
    lastPayout: null
  });

  useEffect(() => {
    if (!tenant) return;

    const q = query(
      collection(db, 'payouts'),
      where('tenantId', '==', tenant.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const payoutsData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate ? docSnap.data().createdAt.toDate() : docSnap.data().createdAt
      }));
      setPayouts(payoutsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    if (!tenant) return;
    const thisMonth = calculateThisMonth(payouts);
    setStats({
      totalEarned: (tenant.totalSales || 0) * 0.95,
      pendingPayout: tenant.pendingPayout || 0,
      thisMonth,
      lastPayout: tenant.lastPayoutDate?.toDate ? tenant.lastPayoutDate.toDate() : tenant.lastPayoutDate || null
    });
  }, [tenant, payouts]);

  const calculateThisMonth = (payoutsList) => {
    const now = new Date();
    return payoutsList
      .filter((p) => p.createdAt && p.createdAt.getMonth() === now.getMonth() && p.createdAt.getFullYear() === now.getFullYear())
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  };

  const nextPayoutDate = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(8, 0, 0, 0);
    if (now > next) next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Payouts</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <Wallet size={24} className="opacity-75" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded">Lifetime</span>
          </div>
          <p className="text-sm opacity-75">Total Earned</p>
          <p className="text-2xl font-bold">R{stats.totalEarned.toFixed(2)}</p>
        </div>

        <div className="bg-white border border-gray-200 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <Clock size={24} className="text-yellow-500" />
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">Pending</span>
          </div>
          <p className="text-sm text-gray-500">Next Payout</p>
          <p className="text-2xl font-bold text-gray-900">R{stats.pendingPayout.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-1">
            Scheduled: {nextPayoutDate().toLocaleDateString('en-ZA')}
          </p>
        </div>

        <div className="bg-white border border-gray-200 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp size={24} className="text-green-500" />
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">This Month</span>
          </div>
          <p className="text-sm text-gray-500">Monthly Earnings</p>
          <p className="text-2xl font-bold text-gray-900">R{stats.thisMonth.toFixed(2)}</p>
        </div>

        <div className="bg-white border border-gray-200 p-6 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <Calendar size={24} className="text-purple-500" />
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">Last</span>
          </div>
          <p className="text-sm text-gray-500">Last Payout</p>
          <p className="text-2xl font-bold text-gray-900">
            {stats.lastPayout ? stats.lastPayout.toLocaleDateString('en-ZA') : 'None'}
          </p>
        </div>
      </div>

      {/* Payout Schedule Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <Calendar size={20} className="text-blue-600" />
        </div>
        <div>
          <h3 className="font-medium text-blue-900">Daily Payouts</h3>
          <p className="text-sm text-blue-700 mt-1">
            You receive payouts automatically every weekday at 8:00 AM. Weekends are processed on Monday.
            Minimum payout: R50.
          </p>
        </div>
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold">Payout History</h3>
          <button className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
            <Download size={16} />
            Export CSV
          </button>
        </div>

        {payouts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Wallet size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No payouts yet</p>
            <p className="text-sm mt-1">Your first payout will appear here after your first sale</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Reference</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Orders</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {payouts.map((payout) => (
                <tr key={payout.id} className="hover:bg-gray-50">
                  <td className="py-4 px-4 text-sm text-gray-900">
                    {payout.createdAt?.toLocaleDateString('en-ZA')}
                  </td>
                  <td className="py-4 px-4 text-sm font-mono text-gray-500">
                    {payout.id.slice(-8).toUpperCase()}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-900">{payout.orderCount} orders</td>
                  <td className="py-4 px-4 text-sm font-medium text-gray-900 text-right">
                    R{Number(payout.amount || 0).toFixed(2)}
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        payout.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {payout.status === 'completed' ? <ArrowDownLeft size={12} /> : <Clock size={12} />}
                      {payout.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Commission Breakdown */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="font-semibold mb-4">Fee Structure</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Monthly Rent</span>
            <span className="font-medium">R100.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Platform Commission</span>
            <span className="font-medium">5% per sale</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Payment Processing</span>
            <span className="font-medium">~2.5% (included in 5%)</span>
          </div>
          <div className="border-t pt-3 flex justify-between font-semibold">
            <span>You Keep</span>
            <span className="text-green-600">95% of every sale</span>
          </div>
        </div>
      </div>
    </div>
  );
}
