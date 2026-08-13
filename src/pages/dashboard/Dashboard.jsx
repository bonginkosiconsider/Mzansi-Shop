import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { TrendingUp, Package, ShoppingCart, DollarSign, Users, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function Dashboard() {
  const { user, tenant } = useAuth();
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    totalProducts: 0,
    pendingPayout: 0,
    monthlyRevenue: 0
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [salesTrend, setSalesTrend] = useState(null);

  useEffect(() => {
    if (!tenant?.id) return;

    // Fetch products count
    const productsQuery = query(
      collection(db, 'tenants', tenant.id, 'products'),
      where('isActive', '==', true)
    );

    // Fetch orders
    const ordersQuery = query(
      collection(db, 'orders'),
      where('tenantId', '==', tenant.id)
    );

    const ordersUnsub = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecentOrders(orders.slice(0, 5).sort((a, b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));

      // Calculate stats
      const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
      const totalOrders = orders.length;
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      let currentMonthSales = 0;
      let previousMonthSales = 0;
      
      setStats(prev => ({
        ...prev,
        totalSales,
        totalOrders,
        monthlyRevenue: totalSales
      }));

      // Generate chart data
      const monthlyData = {};
      orders.forEach(order => {
        const date = order.createdAt?.toDate?.() || order.createdAt;
        if (date) {
          if (date >= currentMonthStart) {
            currentMonthSales += order.total || 0;
          } else if (date >= previousMonthStart && date < currentMonthStart) {
            previousMonthSales += order.total || 0;
          }
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          monthlyData[month] = (monthlyData[month] || 0) + (order.total || 0);
        }
      });

      setChartData(Object.entries(monthlyData).map(([name, value]) => ({ name, value })));
      if (previousMonthSales > 0) {
        const change = ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100;
        const sign = change > 0 ? '+' : '';
        setSalesTrend(`${sign}${change.toFixed(1)}% vs last month`);
      } else {
        setSalesTrend(null);
      }
    });

    getDocs(productsQuery).then(snapshot => {
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStats(prev => ({ ...prev, totalProducts: products.length }));
      setTopProducts(products.slice(0, 3));
    });

    return ordersUnsub;
  }, [tenant?.id]);

  const StatCard = ({ icon: Icon, label, value, trend }) => (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><TrendingUp size={12} />{trend}</p>}
        </div>
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <Icon size={24} className="text-blue-600" />
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Dashboard Overview</h2>
        <p className="text-gray-600 mt-1">Welcome to your vendor dashboard, {tenant?.name}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard icon={DollarSign} label="Total Sales" value={`R${stats.totalSales.toFixed(2)}`} trend={salesTrend} />
        <StatCard icon={ShoppingCart} label="Total Orders" value={stats.totalOrders} />
        <StatCard icon={Package} label="Products" value={stats.totalProducts} />
        <StatCard icon={DollarSign} label="Pending Payout" value={`R${(tenant?.pendingPayout || 0).toFixed(2)}`} />
        <StatCard icon={Users} label="Store Status" value={tenant?.isActive ? 'Active' : 'Pending'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Revenue</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `R${value.toFixed(2)}`} />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No sales data yet
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Top Products</h3>
          <div className="space-y-4">
            {topProducts.length > 0 ? (
              topProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between pb-4 border-b">
                  <div>
                    <p className="font-medium text-gray-900">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.sku}</p>
                  </div>
                  <p className="font-bold text-blue-600">R{product.price?.toFixed(2)}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No products yet. <a href="/sell/dashboard/products/new" className="text-blue-600 hover:underline">Add your first product</a></p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Orders</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Order ID</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Customer</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Total</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map((order) => (
                  <tr key={order.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{order.id.slice(0, 8)}...</td>
                    <td className="py-3 px-4 text-gray-600">{order.customerName || 'Guest'}</td>
                    <td className="py-3 px-4 font-semibold text-gray-900">R{order.total?.toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        order.status === 'completed' ? 'bg-green-100 text-green-800' :
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.status || 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-gray-500">No orders yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a href="/sell/dashboard/products/new" className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-center transition">
            <Package size={24} className="mx-auto mb-2 text-blue-600" />
            <p className="font-medium text-gray-900">Add Product</p>
          </a>
          <a href="/sell/dashboard/coupons/new" className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 text-center transition">
            <AlertCircle size={24} className="mx-auto mb-2 text-green-600" />
            <p className="font-medium text-gray-900">Create Coupon</p>
          </a>
          <a href="/sell/dashboard/shipping" className="p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 text-center transition">
            <ShoppingCart size={24} className="mx-auto mb-2 text-purple-600" />
            <p className="font-medium text-gray-900">Shipping Zones</p>
          </a>
          <a href="/sell/dashboard/analytics" className="p-4 border-2 border-orange-200 rounded-lg hover:bg-orange-50 text-center transition">
            <TrendingUp size={24} className="mx-auto mb-2 text-orange-600" />
            <p className="font-medium text-gray-900">Analytics</p>
          </a>
        </div>
      </div>
    </div>
  );
}
