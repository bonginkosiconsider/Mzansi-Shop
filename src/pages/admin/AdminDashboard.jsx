import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getVendorDisplayName } from '../../utils/vendorDisplay';
import {
  Users,
  ShoppingBag,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatOrderReferenceCode } from '../../utils/orderReference';

export default function AdminDashboard() {
  const [vendors, setVendors] = useState(null);
  const [orders, setOrders] = useState(null);
  const [totalProducts, setTotalProducts] = useState(0);
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [failedSubscriptions, setFailedSubscriptions] = useState(null);
  const [stats, setStats] = useState({
    totalVendors: 0,
    activeVendors: 0,
    totalOrders: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
    commissionEarned: 0,
    pendingPayouts: 0
  });
  const [changes, setChanges] = useState({
    vendors: null,
    orders: null,
    commission: null
  });
  const [pendingActions, setPendingActions] = useState({
    pendingApprovals: null,
    failedSubscriptions: null
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getDocs(collection(db, 'products'))
      .then((snapshot) => {
        if (active) setTotalProducts(snapshot.size);
      })
      .catch(() => {
        if (active) setTotalProducts(0);
      });

    const unsubscribers = [
      onSnapshot(query(collection(db, 'tenants')), (snapshot) => {
        setVendors(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      }),
      onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
        setOrders(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
      }),
      onSnapshot(doc(db, 'admin', 'settings'), (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : {};
        setCommissionPercent(
          typeof data?.commissionPercent === 'number' ? data.commissionPercent : 5
        );
      }),
      onSnapshot(collection(db, 'subscriptions'), (snapshot) => {
        const failedStatuses = new Set(['failed', 'past_due', 'overdue', 'unpaid']);
        setFailedSubscriptions(
          snapshot.docs.filter((docSnap) =>
            failedStatuses.has(String(docSnap.data().status || '').toLowerCase())
          ).length
        );
      }, () => {
        setFailedSubscriptions(null);
      })
    ];

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(vendors) || !Array.isArray(orders)) return;

    const commissionRate = commissionPercent / 100;
    let revenue = 0;
    let monthlyRevenue = 0;
    let commission = 0;
    let pending = 0;
    const dailySales = {};
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    let currentMonthOrders = 0;
    let previousMonthOrders = 0;
    let currentMonthCommission = 0;
    let previousMonthCommission = 0;

    orders.forEach((data) => {
      const orderTotal = Number(data.total || 0);
      const orderCommission = typeof data.platformFee === 'number'
        ? data.platformFee
        : orderTotal * commissionRate;
      revenue += orderTotal;
      commission += orderCommission;
      pending += Number(data.pendingPayout || 0);

      if (!data.createdAt) return;
      const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt;
      if (!createdAt) return;

      if (createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear()) {
        monthlyRevenue += orderTotal;
        currentMonthOrders += 1;
        currentMonthCommission += orderCommission;
      } else if (createdAt >= previousMonthStart && createdAt < currentMonthStart) {
        previousMonthOrders += 1;
        previousMonthCommission += orderCommission;
      }

      const dayKey = createdAt.toISOString().split('T')[0];
      dailySales[dayKey] = (dailySales[dayKey] || 0) + orderTotal;
    });

    let currentMonthVendors = 0;
    let previousMonthVendors = 0;
    let pendingApprovals = 0;

    vendors.forEach((data) => {
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      const status = String(data.status || '').toLowerCase();
      if (status === 'pending_approval' || status === 'pending') {
        pendingApprovals += 1;
      }
      if (!createdAt) return;
      if (createdAt >= currentMonthStart) {
        currentMonthVendors += 1;
      } else if (createdAt >= previousMonthStart && createdAt < currentMonthStart) {
        previousMonthVendors += 1;
      }
    });

    const chartDataArray = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayKey = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      chartDataArray.push({
        date: dayName,
        sales: dailySales[dayKey] || 0,
        commission: (dailySales[dayKey] || 0) * commissionRate
      });
    }

    setStats({
      totalVendors: vendors.length,
      activeVendors: vendors.filter((vendor) => vendor.isActive).length,
      totalOrders: orders.length,
      totalProducts,
      totalRevenue: revenue,
      monthlyRevenue,
      commissionEarned: commission,
      pendingPayouts: pending
    });

    const buildChange = (current, previous) => {
      if (previous <= 0) return null;
      const delta = ((current - previous) / previous) * 100;
      const sign = delta > 0 ? '+' : '';
      return {
        value: `${sign}${delta.toFixed(1)}% vs last month`,
        type: delta >= 0 ? 'up' : 'down'
      };
    };

    setChanges({
      vendors: buildChange(currentMonthVendors, previousMonthVendors),
      orders: buildChange(currentMonthOrders, previousMonthOrders),
      commission: buildChange(currentMonthCommission, previousMonthCommission)
    });

    setPendingActions({
      pendingApprovals,
      failedSubscriptions
    });

    setChartData(chartDataArray);
    setRecentOrders(orders.slice(0, 10));
    setLoading(false);
  }, [commissionPercent, failedSubscriptions, orders, totalProducts, vendors]);

  const StatCard = ({ title, value, change, changeType, icon: Icon, color }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
        {change && (
          <span className={`flex items-center gap-1 text-sm ${changeType === 'up' ? 'text-green-600' : 'text-red-600'}`}>
            {changeType === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
            {change}
          </span>
        )}
      </div>
      <p className="text-gray-600 text-sm">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );

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
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Platform Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Vendors"
          value={stats.totalVendors}
          change={changes.vendors?.value}
          changeType={changes.vendors?.type}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          change={changes.orders?.value}
          changeType={changes.orders?.type}
          icon={ShoppingBag}
          color="bg-green-500"
        />
        <StatCard
          title="Monthly Sales"
          value={`R${Number(stats.monthlyRevenue || 0).toFixed(2)}`}
          icon={TrendingUp}
          color="bg-indigo-500"
        />
        <StatCard
          title="Commission Earned"
          value={`R${Number(stats.commissionEarned || 0).toFixed(2)}`}
          change={changes.commission?.value}
          changeType={changes.commission?.type}
          icon={CreditCard}
          color="bg-purple-500"
        />
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue and Commission (Last 7 Days)</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickFormatter={(value) => `R${value}`}
              />
              <Tooltip
                formatter={(value, name) => [`R${Number(value).toFixed(2)}`, name === 'sales' ? 'Total Sales' : 'Commission']}
                labelStyle={{ color: '#374151' }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Line
                type="monotone"
                dataKey="sales"
                stroke="#2563eb"
                strokeWidth={3}
                dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2 }}
                name="sales"
              />
              <Line
                type="monotone"
                dataKey="commission"
                stroke="#7c3aed"
                strokeWidth={3}
                dot={{ fill: '#7c3aed', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#7c3aed', strokeWidth: 2 }}
                name="commission"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <AlertCircle size={20} className="text-yellow-500" />
            Pending Actions
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <span className="text-sm">Vendors awaiting approval</span>
              <span className="font-bold text-yellow-700">
                {pendingActions.pendingApprovals ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <span className="text-sm">Failed subscription payments</span>
              <span className="font-bold text-red-700">
                {pendingActions.failedSubscriptions ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm">Pending payouts (today)</span>
              <span className="font-bold text-blue-700">R{Number(stats.pendingPayouts || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border">
          <h3 className="font-semibold mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">#{formatOrderReferenceCode(order)}</p>
                    <p className="text-xs text-gray-500">{getVendorDisplayName(null, order)}</p>
                    <p className="text-xs text-gray-400">
                      Payment: {order.paymentStatus || 'pending'} • Approval: {order.approvalStatus || (order.vendorVisible ? 'approved' : 'pending')}
                    </p>
                  </div>
                <div className="text-right">
                  <p className="text-sm font-bold">R{Number(order.total || 0).toFixed(2)}</p>
                  <p className="text-xs text-green-600">+R{Number(order.platformFee || 0).toFixed(2)}</p>
                </div>
              </div>
            ))}
            {recentOrders.length === 0 && <p className="text-sm text-gray-500">No recent orders.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
