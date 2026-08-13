import { Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../hooks/useNotifications';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  CreditCard,
  Settings,
  LogOut,
  Store,
  Bell,
  Menu,
  X,
  Percent,
  MapPin,
  Calculator,
  BarChart3
} from 'lucide-react';

export default function DashboardLayout() {
  const { tenant, logout, user } = useAuth();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRefDesktop = useRef(null);
  const notificationsRefMobile = useRef(null);

  useNotifications(user?.uid);

  useEffect(() => {
    if (!tenant) return;

    const q = query(
      collection(db, 'notifications'),
      where('tenantId', '==', tenant.id),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });

    return unsubscribe;
  }, [tenant]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const desktop = notificationsRefDesktop.current;
      const mobile = notificationsRefMobile.current;
      if (desktop && desktop.contains(event.target)) return;
      if (mobile && mobile.contains(event.target)) return;
      setShowNotifications(false);
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  useEffect(() => {
    setShowNotifications(false);
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
    { path: '/dashboard/products', icon: Package, label: 'Products' },
    { path: '/dashboard/coupons', icon: Percent, label: 'Coupons' },
    { path: '/dashboard/shipping', icon: MapPin, label: 'Shipping' },
    { path: '/dashboard/tax', icon: Calculator, label: 'Tax' },
    { path: '/dashboard/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/dashboard/orders', icon: ShoppingCart, label: 'Orders' },
    { path: '/dashboard/payouts', icon: CreditCard, label: 'Payouts' },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings' }
  ];

  const renderNotifications = (position, ref) => (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 text-gray-600 hover:text-gray-900"
      >
        <Bell size={20} />
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {notifications.length}
          </span>
        )}
      </button>

      {showNotifications && (
        <div
          className={`absolute ${
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } right-0 w-80 bg-white rounded-lg shadow-lg border py-2 z-50`}
        >
          {notifications.length === 0 ? (
            <p className="px-4 py-2 text-sm text-gray-500">No new notifications</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="px-4 py-2 hover:bg-gray-50 border-b last:border-0">
                <p className="text-sm font-medium">{n.type || 'Update'}</p>
                <p className="text-xs text-gray-500">{n.message || 'New activity detected.'}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <header className="md:hidden bg-white shadow-sm sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600">
            <Menu size={20} />
          </button>
          <div className="font-semibold text-gray-900">MzansiShop</div>
          {renderNotifications('bottom', notificationsRefMobile)}
        </div>
      </header>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-50 transform transition-transform md:translate-x-0 md:static md:inset-auto flex flex-col ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">MzansiShop</h1>
              <p className="text-sm text-gray-500 mt-1">{tenant?.name}</p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-500">
              <X size={18} />
            </button>
          </div>

          <nav className="p-4 space-y-1 flex-1 overflow-y-auto min-h-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/dashboard'
                  ? location.pathname === '/dashboard'
                  : location.pathname.startsWith(item.path);

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon size={20} className="shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Notifications</span>
              {renderNotifications('top', notificationsRefDesktop)}
            </div>

            <a
              href={`https://${tenant?.subdomain}.mzansishop.com`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg"
            >
              <Store size={20} className="shrink-0" />
              <span className="font-medium">View Store</span>
            </a>

            <button
              onClick={logout}
              className="flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg w-full"
            >
              <LogOut size={20} className="shrink-0" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
