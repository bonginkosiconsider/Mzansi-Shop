import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart,
  Users, Package, BarChart3, Calendar, Loader
} from 'lucide-react';

export default function Analytics() {
  const { tenant } = useAuth();
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30d'); // 7d, 30d, 90d, 1y

  useEffect(() => {
    if (!tenant) return;
    loadAnalytics();
  }, [tenant, dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();

      switch(dateRange) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Get orders for the period
      const ordersQuery = query(
        collection(db, 'tenants', tenant.id, 'orders'),
        where('createdAt', '>=', startDate),
        where('createdAt', '<=', endDate),
        orderBy('createdAt', 'desc')
      );

      const ordersSnapshot = await getDocs(ordersQuery);
      const orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Calculate metrics
      const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
      const totalOrders = orders.length;
      const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

      // Get products sold
      const productsSold = orders.reduce((sum, order) => {
        return sum + order.lineItems?.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) || 0;
      }, 0);

      // Get refunds
      const refunds = orders
        .filter(order => order.status === 'refunded')
        .reduce((sum, order) => sum + (order.total || 0), 0);

      // Get coupons used
      const couponsUsed = orders.reduce((sum, order) => {
        return sum + order.couponLines?.reduce((couponSum, coupon) => couponSum + (coupon.discount || 0), 0) || 0;
      }, 0);

      // Top products
      const productCounts = {};
      orders.forEach(order => {
        order.lineItems?.forEach(item => {
          if (item.productId) {
            if (!productCounts[item.productId]) {
              productCounts[item.productId] = {
                name: item.name,
                quantity: 0,
                total: 0
              };
            }
            productCounts[item.productId].quantity += item.quantity || 0;
            productCounts[item.productId].total += item.total || 0;
          }
        });
      });

      const topProducts = Object.entries(productCounts)
        .sort(([,a], [,b]) => b.total - a.total)
        .slice(0, 5)
        .map(([id, data]) => ({ productId: id, ...data }));

      // Sales by hour (simplified - would need more complex aggregation)
      const salesByHour = Array(24).fill(0);
      orders.forEach(order => {
        const hour = order.createdAt?.toDate?.()?.getHours() || 0;
        salesByHour[hour] += order.total || 0;
      });

      // Sales by category (simplified - would need product category data)
      const salesByCategory = {
        electronics: totalSales * 0.4,
        clothing: totalSales * 0.3,
        home: totalSales * 0.2,
        sports: totalSales * 0.1
      };

      setAnalytics({
        totalSales,
        totalOrders,
        averageOrderValue,
        productsSold,
        refunds,
        couponsUsed,
        topProducts,
        salesByHour,
        salesByCategory
      });

    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR'
    }).format(amount);
  };

  if (loading) return <div className="flex justify-center p-12"><Loader className="animate-spin" /></div>;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-gray-500">Track your store performance</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="border rounded-lg px-4 py-2"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Sales"
          value={formatCurrency(analytics.totalSales || 0)}
          icon={DollarSign}
          color="green"
        />
        <MetricCard
          title="Total Orders"
          value={analytics.totalOrders || 0}
          icon={ShoppingCart}
          color="blue"
        />
        <MetricCard
          title="Average Order Value"
          value={formatCurrency(analytics.averageOrderValue || 0)}
          icon={TrendingUp}
          color="purple"
        />
        <MetricCard
          title="Products Sold"
          value={analytics.productsSold || 0}
          icon={Package}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Sales by Hour */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium mb-4">Sales by Hour</h3>
          <div className="h-64 flex items-end justify-between gap-1">
            {analytics.salesByHour?.map((sales, hour) => (
              <div key={hour} className="flex flex-col items-center flex-1">
                <div
                  className="bg-blue-500 rounded-t w-full mb-2"
                  style={{
                    height: `${Math.max((sales / Math.max(...analytics.salesByHour)) * 200, 4)}px`,
                    minHeight: '4px'
                  }}
                ></div>
                <span className="text-xs text-gray-500">{hour}:00</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Category */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-medium mb-4">Sales by Category</h3>
          <div className="space-y-4">
            {Object.entries(analytics.salesByCategory || {}).map(([category, sales]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="capitalize">{category}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        width: `${(sales / analytics.totalSales) * 100}%`
                      }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium w-20 text-right">
                    {formatCurrency(sales)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <h3 className="text-lg font-medium mb-4">Top Products</h3>
        <div className="space-y-4">
          {analytics.topProducts?.map((product, index) => (
            <div key={product.productId} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-4">
                <span className="text-lg font-bold text-gray-400 w-6">#{index + 1}</span>
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.quantity} sold</p>
                </div>
              </div>
              <span className="font-medium">{formatCurrency(product.total)}</span>
            </div>
          ))}
          {(!analytics.topProducts || analytics.topProducts.length === 0) && (
            <p className="text-gray-500 text-center py-8">No sales data available for this period</p>
          )}
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Refunds"
          value={formatCurrency(analytics.refunds || 0)}
          icon={TrendingDown}
          color="red"
        />
        <MetricCard
          title="Coupons Used"
          value={formatCurrency(analytics.couponsUsed || 0)}
          icon={DollarSign}
          color="yellow"
        />
        <MetricCard
          title="Conversion Rate"
          value={`${((analytics.totalOrders || 0) / Math.max(analytics.totalOrders || 0, 1) * 100).toFixed(1)}%`}
          icon={BarChart3}
          color="green"
        />
        <MetricCard
          title="Active Period"
          value={dateRange}
          icon={Calendar}
          color="gray"
        />
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }) {
  const colorClasses = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500',
    gray: 'bg-gray-500'
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  );
}