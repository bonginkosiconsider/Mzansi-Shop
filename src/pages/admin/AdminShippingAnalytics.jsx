import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { BarChart3, TrendingUp, Package, DollarSign, Clock, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminShippingAnalytics() {
  const [analytics, setAnalytics] = useState({
    totalShipments: 0,
    totalRevenue: 0,
    averageCost: 0,
    methodUsage: [],
    deliveryPerformance: [],
    recentShipments: []
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d'); // 7d, 30d, 90d

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // Get orders with shipping data
      const ordersRef = collection(db, 'orders');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const ordersQuery = query(
        ordersRef,
        where('createdAt', '>=', thirtyDaysAgo),
        orderBy('createdAt', 'desc')
      );

      const ordersSnap = await getDocs(ordersQuery);
      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Calculate analytics
      const totalShipments = orders.length;
      const totalRevenue = orders.reduce((sum, order) => sum + (order.shippingCost || 0), 0);
      const averageCost = totalShipments > 0 ? totalRevenue / totalShipments : 0;

      // Method usage
      const methodUsage = {};
      orders.forEach(order => {
        const method = order.shippingMethod || 'Unknown';
        methodUsage[method] = (methodUsage[method] || 0) + 1;
      });

      const methodUsageArray = Object.entries(methodUsage).map(([method, count]) => ({
        method,
        count,
        percentage: totalShipments > 0 ? (count / totalShipments * 100).toFixed(1) : 0
      })).sort((a, b) => b.count - a.count);

      // Delivery performance (mock data for now - would need actual tracking data)
      const deliveryPerformance = [
        { status: 'Delivered', count: Math.floor(totalShipments * 0.85), percentage: 85 },
        { status: 'In Transit', count: Math.floor(totalShipments * 0.10), percentage: 10 },
        { status: 'Delayed', count: Math.floor(totalShipments * 0.03), percentage: 3 },
        { status: 'Failed', count: Math.floor(totalShipments * 0.02), percentage: 2 }
      ];

      // Recent shipments
      const recentShipments = orders.slice(0, 10).map(order => ({
        id: order.id,
        customer: order.customerName || 'Unknown',
        method: order.shippingMethod || 'Unknown',
        cost: order.shippingCost || 0,
        status: order.status || 'Processing',
        date: order.createdAt?.toDate?.() || new Date()
      }));

      setAnalytics({
        totalShipments,
        totalRevenue,
        averageCost,
        methodUsage: methodUsageArray,
        deliveryPerformance,
        recentShipments
      });

    } catch (error) {
      console.error('Failed to load analytics:', error);
      toast.error('Failed to load shipping analytics');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => `R${amount.toFixed(2)}`;
  const formatDate = (date) => date.toLocaleDateString();

  if (loading) {
    return <div className="text-center py-8">Loading shipping analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Shipping Analytics</h1>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-2 border rounded-lg"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Shipments</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.totalShipments}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Shipping Revenue</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.totalRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Average Cost</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(analytics.averageCost)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Methods</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.methodUsage.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shipping Method Usage */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Shipping Method Usage</h3>
          <div className="space-y-4">
            {analytics.methodUsage.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No shipping data available</p>
            ) : (
              analytics.methodUsage.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-gray-900">{item.method}</span>
                      <span className="text-sm text-gray-500">{item.count} shipments</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500">{item.percentage}%</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Delivery Performance */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Delivery Performance</h3>
          <div className="space-y-4">
            {analytics.deliveryPerformance.map((item, index) => {
              const getStatusColor = (status) => {
                switch (status) {
                  case 'Delivered': return 'bg-green-600';
                  case 'In Transit': return 'bg-blue-600';
                  case 'Delayed': return 'bg-yellow-600';
                  case 'Failed': return 'bg-red-600';
                  default: return 'bg-gray-600';
                }
              };

              const getStatusIcon = (status) => {
                switch (status) {
                  case 'Delivered': return <CheckCircle size={16} />;
                  case 'Failed': return <XCircle size={16} />;
                  default: return <Clock size={16} />;
                }
              };

              return (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-1 rounded ${getStatusColor(item.status).replace('bg-', 'bg-opacity-20 bg-')}`}>
                      {getStatusIcon(item.status)}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{item.status}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-900">{item.count}</span>
                    <div className="text-xs text-gray-500">{item.percentage}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Shipments */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Recent Shipments</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analytics.recentShipments.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No recent shipments
                  </td>
                </tr>
              ) : (
                analytics.recentShipments.map((shipment) => (
                  <tr key={shipment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {shipment.id.slice(-8)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {shipment.customer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shipment.method}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(shipment.cost)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        shipment.status === 'Delivered'
                          ? 'bg-green-100 text-green-800'
                          : shipment.status === 'Processing'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {shipment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(shipment.date)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}