import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Copy, CreditCard, Megaphone, Package, ShoppingBag } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import { buildReferralLink, formatBankName, formatFollowerCount, formatZAR, normalizeReferralCode } from '../../utils/promoters';
import { summarizePromoterSales } from '../../utils/referralSales';

const formatDateTime = (value) =>
  value?.toDate?.()?.toLocaleString?.('en-ZA')
  || value?.toLocaleString?.('en-ZA')
  || 'Pending';

const getPaymentTone = (status) => {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const getPaymentLabel = (status) => {
  if (status === 'paid') return 'Paid';
  if (status === 'failed') return 'Failed';
  return 'Pending';
};

const getCallableErrorMessage = (error, fallback) =>
  error?.details
  || error?.message
  || error?.code
  || fallback;

export default function PromoterDashboard() {
  const { user } = useAuth();
  const [promoter, setPromoter] = useState(null);
  const [application, setApplication] = useState(null);
  const [referralOrdersById, setReferralOrdersById] = useState([]);
  const [referralOrdersByCode, setReferralOrdersByCode] = useState([]);
  const [referralOrdersByWalletOwner, setReferralOrdersByWalletOwner] = useState([]);
  const [cashoutRequests, setCashoutRequests] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [cashoutAmount, setCashoutAmount] = useState('');
  const [cashoutBusy, setCashoutBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPromoter(null);
      setApplication(null);
      setReferralOrdersById([]);
      setReferralOrdersByCode([]);
      setReferralOrdersByWalletOwner([]);
      setCashoutRequests([]);
      setTransactions([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribers = [];
    let remaining = 6;

    const finishLoading = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setLoading(false);
      }
    };

    unsubscribers.push(
      onSnapshot(
        doc(db, 'promoters', user.uid),
        (snapshot) => {
          setPromoter(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          finishLoading();
        },
        () => {
          setPromoter(null);
          finishLoading();
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        doc(db, 'promoterApplications', user.uid),
        (snapshot) => {
          setApplication(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
          finishLoading();
        },
        () => {
          setApplication(null);
          finishLoading();
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'orders'), where('promoterId', '==', user.uid)),
        (snapshot) => {
          const records = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });
          setReferralOrdersById(records);
          finishLoading();
        },
        () => {
          setReferralOrdersById([]);
          finishLoading();
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'orders'), where('promoterWalletOwnerId', '==', user.uid)),
        (snapshot) => {
          const records = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });
          setReferralOrdersByWalletOwner(records);
          finishLoading();
        },
        () => {
          setReferralOrdersByWalletOwner([]);
          finishLoading();
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'promoterCashoutRequests'), where('promoterId', '==', user.uid)),
        (snapshot) => {
          const records = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });
          setCashoutRequests(records);
          finishLoading();
        },
        () => {
          setCashoutRequests([]);
          finishLoading();
        }
      )
    );

    unsubscribers.push(
      onSnapshot(
        query(collection(db, 'promoterTransactions'), where('promoterId', '==', user.uid)),
        (snapshot) => {
          const records = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
            .sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return bTime - aTime;
            });
          setTransactions(records);
          finishLoading();
        },
        () => {
          setTransactions([]);
          finishLoading();
        }
      )
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  useEffect(() => {
    const referralCode = normalizeReferralCode(promoter?.referralCode);
    if (!user || !referralCode) {
      setReferralOrdersByCode([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'orders'), where('promoterCode', '==', referralCode)),
      (snapshot) => {
        const records = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
          });
        setReferralOrdersByCode(records);
      },
      () => {
        setReferralOrdersByCode([]);
      }
    );

    return () => unsubscribe();
  }, [promoter?.referralCode, user]);

  const promoterActivity = useMemo(() => {
    const merged = new Map();
    [...referralOrdersById, ...referralOrdersByCode, ...referralOrdersByWalletOwner].forEach((order) => {
      if (order?.id) {
        merged.set(order.id, order);
      }
    });

    return Array.from(merged.values()).sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }, [referralOrdersByCode, referralOrdersById, referralOrdersByWalletOwner]);

  const referralLink = useMemo(
    () => (promoter?.referralCode ? buildReferralLink(promoter.referralCode) : ''),
    [promoter?.referralCode]
  );
  const activitySummary = useMemo(
    () => summarizePromoterSales(promoterActivity),
    [promoterActivity]
  );
  const availableBalance = Number(promoter?.availableBalance || 0);
  const pendingCashoutBalance = Number(promoter?.pendingCashoutBalance || 0);
  const walletHeldBalance = Number(promoter?.walletHeldBalance || 0);
  const lifetimeCashedOut = Number(promoter?.lifetimeCashedOut || 0);
  const hasCompleteBankDetails = Boolean(
    promoter?.bankDetails?.accountHolder
    && promoter?.bankDetails?.bankName
    && promoter?.bankDetails?.accountNumber
    && promoter?.bankDetails?.branchCode
  );

  const handleCopyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Referral link copied.');
    } catch (error) {
      toast.error('Failed to copy referral link.');
    }
  };

  const handleCashoutRequest = async () => {
    const amount = Number(cashoutAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid cashout amount.');
      return;
    }
    if (amount > availableBalance) {
      toast.error('Cashout amount exceeds your available balance.');
      return;
    }

    setCashoutBusy(true);
    try {
      const requestCashout = httpsCallable(functions, 'requestPromoterCashout');
      await requestCashout({ amount });
      setCashoutAmount('');
      toast.success('Cashout request submitted.');
    } catch (error) {
      toast.error(getCallableErrorMessage(error, 'Failed to request cashout.'));
    } finally {
      setCashoutBusy(false);
    }
  };

  const promoterStatus = promoter?.status === 'inactive'
    ? 'inactive'
    : promoter?.status === 'active'
      ? 'approved'
      : application?.status || 'not_started';

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-700 text-white p-8 sm:p-10">
            <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
              <Megaphone size={16} />
              Promoter Dashboard
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Track your referral performance</h1>
              <p className="mt-3 text-base sm:text-lg text-slate-200">
                This dashboard shows your approved referral code, live referred purchases, items sold, and the rand balance credited to your account.
              </p>
            </div>
          </div>
        </section>

        {loading && (
          <section className="bg-white rounded-2xl border shadow-sm p-8 text-gray-500">
            Loading promoter dashboard...
          </section>
        )}

        {!loading && promoterStatus !== 'approved' && (
          <section className="bg-white rounded-2xl border shadow-sm p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {promoterStatus === 'pending'
                  ? 'Application under review'
                  : promoterStatus === 'rejected'
                    ? 'Application needs updates'
                    : promoterStatus === 'inactive'
                      ? 'Promoter account deactivated'
                      : 'You are not approved yet'}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {promoterStatus === 'pending'
                  ? 'Your application is waiting for manual review by admin.'
                  : promoterStatus === 'rejected'
                    ? application?.reviewNotes || 'Your application was not approved yet.'
                    : promoterStatus === 'inactive'
                      ? application?.reviewNotes || 'Your promoter account has been deactivated by admin.'
                      : 'Apply to become a promoter to get your referral code and dashboard metrics.'}
              </p>
            </div>

            {application && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 p-4">
                  <p className="text-gray-500">Platform</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {application.socialPlatform || 'Not submitted'} {application.socialHandle ? `@${application.socialHandle}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border bg-gray-50 p-4">
                  <p className="text-gray-500">Followers</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {formatFollowerCount(application.followerCount || 0)}
                  </p>
                </div>
                <div className="rounded-xl border bg-gray-50 p-4">
                  <p className="text-gray-500">Last update</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {formatDateTime(application.updatedAt || application.createdAt)}
                  </p>
                </div>
              </div>
            )}

            {promoterStatus !== 'inactive' && (
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/promoters/apply"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                >
                  {promoterStatus === 'rejected' ? 'Update application' : 'Apply now'}
                </Link>
              </div>
            )}
          </section>
        )}

        {!loading && promoterStatus === 'approved' && promoter && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Purchases made</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{activitySummary.purchaseCount}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Paid {activitySummary.paidPurchaseCount} | Pending {activitySummary.pendingCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-blue-100 text-blue-700 p-2">
                    <ShoppingBag size={20} />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Products sold</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{activitySummary.itemCount}</p>
                    <p className="mt-1 text-xs text-gray-500">Paid products {activitySummary.paidItemCount}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-100 text-emerald-700 p-2">
                    <Package size={20} />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Credited balance</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">{formatZAR(availableBalance)}</p>
                  </div>
                  <div className="rounded-xl bg-violet-100 text-violet-700 p-2">
                    <CreditCard size={20} />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Referral link</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Share this link in your content. Orders paid through your referral code will update this dashboard automatically.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                  >
                    <Copy size={16} />
                    Copy
                  </button>
                </div>

                <div className="rounded-2xl border bg-gray-50 p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Referral code</p>
                      <p className="mt-1 font-semibold text-gray-900">{promoter.referralCode || 'Pending'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Platform</p>
                      <p className="mt-1 font-semibold text-gray-900">
                        {promoter.socialPlatform || 'Not set'} {promoter.socialHandle ? `@${promoter.socialHandle}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-700 break-all">
                    {referralLink || 'Your referral link will appear here.'}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Account summary</h2>
                  <p className="mt-1 text-sm text-gray-500">Cashout-ready promoter balance and payout details</p>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Name</p>
                    <p className="mt-1 font-semibold text-gray-900">{promoter.name || user?.displayName || 'Promoter'}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Email</p>
                    <p className="mt-1 font-semibold text-gray-900">{promoter.email || user?.email || 'No email'}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Followers submitted</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatFollowerCount(promoter.followerCount || 0)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Lifetime credited</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(promoter.lifetimeCredited || 0)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Pending cashout</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(pendingCashoutBalance)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Wallet reserved in checkout</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(walletHeldBalance)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Lifetime cashed out</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(lifetimeCashedOut)}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Cashout</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Request a cashout from your available balance, or use that same balance during checkout before paying the remainder by direct EFT.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Available now</p>
                  <p className="text-2xl font-bold text-gray-900">{formatZAR(availableBalance)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Bank</p>
                  <p className="mt-1 font-semibold text-gray-900">{formatBankName(promoter?.bankDetails?.bankName)}</p>
                </div>
                <div className="rounded-xl border bg-gray-50 px-4 py-3">
                  <p className="text-gray-500">Account holder</p>
                  <p className="mt-1 font-semibold text-gray-900">{promoter?.bankDetails?.accountHolder || 'Not provided'}</p>
                </div>
              </div>

              {!hasCompleteBankDetails && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Complete your bank details with admin before requesting a cashout.
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cashoutAmount}
                  onChange={(event) => setCashoutAmount(event.target.value)}
                  className="w-full px-4 py-3 border rounded-xl"
                  placeholder="Amount"
                />
                <button
                  type="button"
                  onClick={handleCashoutRequest}
                  disabled={cashoutBusy || availableBalance <= 0 || !hasCompleteBankDetails}
                  className="px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {cashoutBusy ? 'Requesting...' : 'Request cashout'}
                </button>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900">Cashout history</h3>
                <p className="mt-1 text-sm text-gray-500">Pending, paid, and rejected cashout requests</p>
              </div>

              {cashoutRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-sm text-gray-500 text-center">
                  No cashout requests yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Bank</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cashoutRequests.map((request) => (
                        <tr key={request.id}>
                          <td className="py-3 px-4 text-sm text-gray-700">{formatDateTime(request.createdAt)}</td>
                          <td className="py-3 px-4 text-sm text-gray-700 capitalize">{request.status || 'pending'}</td>
                          <td className="py-3 px-4 text-sm text-gray-700">{formatBankName(request.bankDetails?.bankName)}</td>
                          <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">{formatZAR(request.amount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Promoter purchases</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    The totals above include orders linked to your referral code and any checkout paid with your promoter balance.
                    Credited balance only increases on referral orders.
                    {activitySummary.pendingCount > 0 ? ` ${activitySummary.pendingCount} purchase${activitySummary.pendingCount === 1 ? '' : 's'} still pending payment.` : ''}
                  </p>
                </div>
              </div>

              {activitySummary.purchases.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-sm text-gray-500 text-center">
                  No promoter purchase activity yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {activitySummary.purchases.map((purchase) => (
                    <div key={purchase.id} className="rounded-2xl border p-5 space-y-4">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="text-lg font-semibold text-gray-900">
                              Purchase #{purchase.orderGroupRef}
                            </p>
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPaymentTone(purchase.paymentStatus)}`}>
                              {getPaymentLabel(purchase.paymentStatus)}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            {purchase.customerEmail || purchase.customerName || 'Customer'}
                            {' | '}
                            {formatDateTime(purchase.createdAt)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm min-w-[220px]">
                          <div className="rounded-xl bg-gray-50 px-4 py-3">
                            <p className="text-gray-500">Products sold</p>
                            <p className="mt-1 font-semibold text-gray-900">{purchase.itemCount}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {purchase.items.map((item) => {
                          const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
                          const lineTotal = Number(item.price || 0) * quantity;

                          return (
                            <div key={item._key} className="flex items-start justify-between gap-4 border-b last:border-b-0 pb-3 last:pb-0">
                              <div>
                                <p className="font-medium text-gray-900">{item.name || 'Product'}</p>
                                <p className="text-sm text-gray-500">
                                  Qty {quantity}
                                  {item.vendorLabel ? ` | ${item.vendorLabel}` : ''}
                                </p>
                              </div>
                              <p className="font-semibold text-gray-900">{formatZAR(lineTotal)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-2xl border shadow-sm p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Balance history</h2>
                  <p className="mt-1 text-sm text-gray-500">Credits, deductions, cashouts, and promoter wallet purchases</p>
                </div>
              </div>

              {transactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-sm text-gray-500 text-center">
                  No balance activity yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Reason</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Added by</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="py-3 px-4 text-sm text-gray-700">{formatDateTime(transaction.createdAt)}</td>
                          <td className="py-3 px-4 text-sm text-gray-700">{transaction.reason || 'Balance activity'}</td>
                          <td className="py-3 px-4 text-sm text-gray-700">{transaction.createdBy || 'Admin'}</td>
                          <td className="py-3 px-4 text-sm text-right font-semibold text-gray-900">
                            {formatZAR(transaction.amount || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <ShopFooter />
    </div>
  );
}
