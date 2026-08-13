import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';

export default function Account() {
  const { user, logout, sendVerificationEmail, refreshUser } = useAuth();
  const location = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [promoter, setPromoter] = useState(null);
  const [promoterApplication, setPromoterApplication] = useState(null);

  useEffect(() => {
    if (!user) return;
    setIsRefreshing(true);
    refreshUser()
      .catch(() => null)
      .finally(() => setIsRefreshing(false));
  }, [user, refreshUser]);

  useEffect(() => {
    if (!user) return;
    const loadPromoterData = async () => {
      try {
        const [promoterSnap, applicationSnap] = await Promise.all([
          getDoc(doc(db, 'promoters', user.uid)),
          getDoc(doc(db, 'promoterApplications', user.uid))
        ]);
        setPromoter(promoterSnap.exists() ? promoterSnap.data() : null);
        setPromoterApplication(applicationSnap.exists() ? applicationSnap.data() : null);
      } catch (error) {
        setPromoter(null);
        setPromoterApplication(null);
      }
    };
    loadPromoterData();
  }, [user]);

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const handleResend = async () => {
    setIsSending(true);
    try {
      await sendVerificationEmail();
      toast.success('Verification email sent. Please check your inbox.');
    } catch (error) {
      toast.error(error.message || 'Failed to send verification email');
    } finally {
      setIsSending(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUser();
      toast.success('Account status refreshed');
    } catch (error) {
      toast.error('Failed to refresh account status');
    } finally {
      setIsRefreshing(false);
    }
  };

  const promoterStatus = promoter?.status === 'inactive'
    ? 'Deactivated'
    : promoter?.status === 'active'
      ? 'Approved'
      : promoterApplication?.status === 'pending'
        ? 'Pending review'
        : promoterApplication?.status === 'rejected'
          ? 'Needs changes'
          : 'Not applied';

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader categories={[]} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Your Account</h1>
              <p className="text-sm text-gray-500">Manage your profile and verification</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Sign out
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-gray-500">Name</p>
              <p className="font-medium text-gray-900">{user.displayName || 'Customer'}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium text-gray-900">{user.email}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-gray-500">Promoter Status</p>
              <p className="font-medium text-gray-900">
                {promoterStatus}
              </p>
            </div>
            {promoter?.status === 'active' && (
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-gray-500">Promoter Balance</p>
                <p className="font-medium text-gray-900">
                  R{Number(promoter.availableBalance || 0).toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <div className="p-4 border rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-gray-500">Email verification</p>
              <p className={`font-medium ${user.emailVerified ? 'text-green-600' : 'text-orange-600'}`}>
                {user.emailVerified ? 'Verified' : 'Not verified'}
              </p>
              {!user.emailVerified && (
                <p className="text-xs text-red-600 font-semibold mt-1">
                  If the email isn't in your inbox, check your spam folder.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!user.emailVerified && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isSending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSending ? 'Sending...' : 'Resend verification'}
                </button>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh status'}
              </button>
            </div>
          </div>

          {!user.emailVerified && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              Your email is not verified yet. You can still place orders, but verification is recommended. After you verify, click "Refresh status".
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Link
              to={promoter?.status === 'active' ? '/promoters/dashboard' : '/promoters/apply'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              {promoter?.status === 'active'
                ? 'Promoter Dashboard'
                : promoter?.status === 'inactive'
                  ? 'Promoter Status'
                  : 'Apply as Promoter'}
            </Link>
            <Link
              to="/orders"
              className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-medium hover:bg-yellow-500"
            >
              View Orders
            </Link>
            <Link
              to="/"
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
      <ShopFooter />
    </div>
  );
}
