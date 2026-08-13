import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, Navigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  CreditCard,
  Settings,
  LogOut,
  Shield,
  Tag,
  Percent,
  Wallet,
  Truck,
  BarChart3,
  UserPlus,
  Mail,
  Megaphone,
  RefreshCw
} from 'lucide-react';
import { db } from '../../firebase';

const ADMIN_ORDERS_SEEN_STORAGE_KEY = 'mzansi_admin_orders_seen_at';
const BADGE_FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPaidOrder = (order) =>
  String(order?.paymentStatus || order?.status || '').toLowerCase() === 'paid';

const getPaidOrderEventTime = (order) =>
  getTimestampMs(order?.paidAt)
  || getTimestampMs(order?.approvedAt)
  || getTimestampMs(order?.updatedAt)
  || getTimestampMs(order?.createdAt);

const readSeenTimestamp = (storageKey) => {
  if (typeof window === 'undefined') return Date.now() - BADGE_FALLBACK_WINDOW_MS;

  const stored = Number(window.localStorage.getItem(storageKey));
  if (Number.isFinite(stored) && stored > 0) {
    return stored;
  }

  const fallback = Date.now() - BADGE_FALLBACK_WINDOW_MS;
  window.localStorage.setItem(storageKey, String(fallback));
  return fallback;
};

const writeSeenTimestamp = (storageKey) => {
  const nextValue = Date.now();
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey, String(nextValue));
  }
  return nextValue;
};

export default function AdminLayout() {
  const { user, logout, isAdmin, loading, adminLoading } = useAuth();
  const location = useLocation();
  const [paidOrderGroupTimes, setPaidOrderGroupTimes] = useState([]);
  const [pendingVendorApplications, setPendingVendorApplications] = useState(0);
  const [pendingPromoterApplications, setPendingPromoterApplications] = useState(0);
  const [ordersSeenAt, setOrdersSeenAt] = useState(() => readSeenTimestamp(ADMIN_ORDERS_SEEN_STORAGE_KEY));

  // In development, allow access to admin panel for testing
  const isDevelopment = import.meta.env.DEV;
  const canAccess = Boolean(user) && (isAdmin || isDevelopment);

  useEffect(() => {
    if (!canAccess) return undefined;

    const unsubscribeOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const groupedTimes = new Map();

      snapshot.docs.forEach((docSnap) => {
        const order = { id: docSnap.id, ...docSnap.data() };
        if (!isPaidOrder(order)) return;

        const groupId = order.orderGroupId || order.paymentReference || order.id;
        const eventTime = getPaidOrderEventTime(order);
        const currentTime = groupedTimes.get(groupId) || 0;

        if (eventTime > currentTime) {
          groupedTimes.set(groupId, eventTime);
        }
      });

      setPaidOrderGroupTimes(Array.from(groupedTimes.values()));
    });

    const unsubscribeVendorApplications = onSnapshot(
      query(collection(db, 'tenants'), where('status', '==', 'pending_approval')),
      (snapshot) => {
        setPendingVendorApplications(snapshot.size);
      }
    );

    const unsubscribePromoterApplications = onSnapshot(
      query(collection(db, 'promoterApplications'), where('status', '==', 'pending')),
      (snapshot) => {
        setPendingPromoterApplications(snapshot.size);
      }
    );

    return () => {
      unsubscribeOrders();
      unsubscribeVendorApplications();
      unsubscribePromoterApplications();
    };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    if (!location.pathname.startsWith('/admin/orders')) return;

    setOrdersSeenAt(writeSeenTimestamp(ADMIN_ORDERS_SEEN_STORAGE_KEY));
  }, [canAccess, location.pathname, paidOrderGroupTimes.length]);

  if (loading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading admin...
      </div>
    );
  }

  if (!canAccess) {
    return <Navigate to="/" replace />;
  }

  const isOnOrdersPage = location.pathname.startsWith('/admin/orders');
  const newOrdersBadge = isOnOrdersPage
    ? 0
    : paidOrderGroupTimes.filter((eventTime) => eventTime > ordersSeenAt).length;

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
    {
      path: '/admin/applications',
      icon: Users,
      label: 'Applications',
      badge: pendingVendorApplications
    },
    { path: '/admin/vendors', icon: Users, label: 'Vendors' },
    { path: '/admin/couriers', icon: UserPlus, label: 'Couriers' },
    { path: '/admin/courier-settings', icon: Truck, label: 'Courier Settings' },
    { path: '/admin/categories', icon: Tag, label: 'Categories' },
    { path: '/admin/payment-methods', icon: Wallet, label: 'Payment Methods' },
    { path: '/admin/shipping-zones', icon: Truck, label: 'Shipping Zones' },
    { path: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/admin/shipping-analytics', icon: BarChart3, label: 'Shipping Analytics' },
    { path: '/admin/coupons', icon: Percent, label: 'Coupons' },
    { path: '/admin/orders', icon: ShoppingCart, label: 'All Orders', badge: newOrdersBadge },
    { path: '/admin/updates', icon: Mail, label: 'Updates' },
    { path: '/admin/returns', icon: RefreshCw, label: 'Returns' },
    { path: '/admin/payouts', icon: CreditCard, label: 'Payouts' },
    {
      path: '/admin/promoters',
      icon: Megaphone,
      label: 'Promoters',
      badge: pendingPromoterApplications
    },
    { path: '/admin/settings', icon: Settings, label: 'Settings' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-gray-900 text-white fixed h-full flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield size={24} className="text-yellow-400" />
            <span className="text-xl font-bold">Admin</span>
          </div>
        </div>

        <nav className="p-4 space-y-1 flex-1 overflow-y-auto min-h-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === '/admin'
                ? location.pathname === '/admin'
                : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={20} className="shrink-0" />
                  <span className="font-medium truncate">{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span className="inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white w-full"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8">
        <Outlet />
      </main>
    </div>
  );
}
