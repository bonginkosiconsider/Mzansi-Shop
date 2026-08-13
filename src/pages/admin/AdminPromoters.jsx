import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Check, Copy, Megaphone, Search, Wallet, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
  buildReferralLink,
  createReferralCodeSuggestion,
  formatBankName,
  formatFollowerCount,
  formatZAR,
  normalizeReferralCode
} from '../../utils/promoters';
import { summarizePromoterSales } from '../../utils/referralSales';

const fmtDate = (value) =>
  value?.toDate?.()?.toLocaleString?.('en-ZA') || value?.toLocaleString?.('en-ZA') || 'Pending';

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

const buildPromoterProductRows = (purchases = []) => {
  const rows = new Map();

  purchases.forEach((purchase) => {
    const paymentStatus = purchase?.paymentStatus || 'pending';
    const createdAt = purchase?.createdAt || null;
    const orderGroupRef = purchase?.orderGroupRef || purchase?.orderGroupId || purchase?.id || '';

    (Array.isArray(purchase?.items) ? purchase.items : []).forEach((item, index) => {
      const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1));
      const unitPrice = Number(item?.price || 0);
      const lineTotal = unitPrice * quantity;
      const productId = item?.productId || item?.id || `${item?.name || 'item'}-${index}`;
      const vendorLabel = item?.vendorLabel || 'Unknown vendor';
      const key = `${vendorLabel}::${productId}`;

      if (!rows.has(key)) {
        rows.set(key, {
          key,
          name: item?.name || 'Item',
          vendorLabel,
          quantity: 0,
          paidQuantity: 0,
          totalValue: 0,
          paidValue: 0,
          orderRefs: new Set(),
          lastSoldAt: createdAt
        });
      }

      const current = rows.get(key);
      current.quantity += quantity;
      current.totalValue += lineTotal;
      if (paymentStatus === 'paid') {
        current.paidQuantity += quantity;
        current.paidValue += lineTotal;
      }
      if (orderGroupRef) {
        current.orderRefs.add(orderGroupRef);
      }

      const currentTime = current.lastSoldAt?.toMillis?.() || current.lastSoldAt?.getTime?.() || 0;
      const nextTime = createdAt?.toMillis?.() || createdAt?.getTime?.() || 0;
      if (nextTime > currentTime) {
        current.lastSoldAt = createdAt;
      }
    });
  });

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      totalValue: Number(row.totalValue.toFixed(2)),
      paidValue: Number(row.paidValue.toFixed(2)),
      orderCount: row.orderRefs.size
    }))
    .sort((a, b) => {
      const qtyDiff = b.quantity - a.quantity;
      if (qtyDiff !== 0) return qtyDiff;
      return b.totalValue - a.totalValue;
    });
};

export default function AdminPromoters() {
  const { user } = useAuth();
  const [apps, setApps] = useState([]);
  const [promoters, setPromoters] = useState([]);
  const [cashoutRequests, setCashoutRequests] = useState([]);
  const [ordersById, setOrdersById] = useState([]);
  const [ordersByCode, setOrdersByCode] = useState([]);
  const [ordersByWalletOwner, setOrdersByWalletOwner] = useState([]);
  const [appSearch, setAppSearch] = useState('');
  const [promoterSearch, setPromoterSearch] = useState('');
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [selectedPromoterId, setSelectedPromoterId] = useState(null);
  const [approvalCode, setApprovalCode] = useState('');
  const [promoterCode, setPromoterCode] = useState('');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const [detailView, setDetailView] = useState('purchases');
  const detailSectionRef = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'promoterApplications'), orderBy('createdAt', 'desc')), (snap) => {
      setApps(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'promoters'), orderBy('createdAt', 'desc')), (snap) => {
      setPromoters(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promoterCashoutRequests'), (snap) => {
      const records = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setCashoutRequests(records);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!selectedPromoterId) {
      setOrdersById([]);
      return undefined;
    }
    const unsub = onSnapshot(query(collection(db, 'orders'), where('promoterId', '==', selectedPromoterId)), (snap) => {
      const rows = snap.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setOrdersById(rows);
    });
    return () => unsub();
  }, [selectedPromoterId]);

  useEffect(() => {
    if (!selectedPromoterId) {
      setOrdersByWalletOwner([]);
      return undefined;
    }
    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('promoterWalletOwnerId', '==', selectedPromoterId)),
      (snap) => {
        const rows = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setOrdersByWalletOwner(rows);
      }
    );
    return () => unsub();
  }, [selectedPromoterId]);

  useEffect(() => {
    const selectedPromoterRecord =
      promoters.find((promoter) => promoter.id === selectedPromoterId) || null;
    const referralCode = normalizeReferralCode(selectedPromoterRecord?.referralCode);

    if (!referralCode) {
      setOrdersByCode([]);
      return undefined;
    }

    const unsub = onSnapshot(
      query(collection(db, 'orders'), where('promoterCode', '==', referralCode)),
      (snap) => {
        const rows = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setOrdersByCode(rows);
      }
    );

    return () => unsub();
  }, [promoters, selectedPromoterId]);

  const pendingApps = useMemo(() => {
    const needle = appSearch.trim().toLowerCase();
    return apps
      .filter((app) => app.status === 'pending')
      .filter((app) =>
        !needle
        || [app.name, app.email, app.socialPlatform, app.socialHandle].filter(Boolean).some((value) =>
          String(value).toLowerCase().includes(needle)
        )
      );
  }, [appSearch, apps]);

  const filteredPromoters = useMemo(() => {
    const needle = promoterSearch.trim().toLowerCase();
    return promoters.filter((promoter) =>
      !needle
      || [promoter.name, promoter.email, promoter.referralCode, promoter.socialHandle].filter(Boolean).some((value) =>
        String(value).toLowerCase().includes(needle)
      )
    );
  }, [promoterSearch, promoters]);

  useEffect(() => {
    if (pendingApps.some((app) => app.id === selectedAppId)) return;
    setSelectedAppId(pendingApps[0]?.id || null);
  }, [pendingApps, selectedAppId]);

  useEffect(() => {
    if (filteredPromoters.some((promoter) => promoter.id === selectedPromoterId)) return;
    setSelectedPromoterId(filteredPromoters[0]?.id || null);
  }, [filteredPromoters, selectedPromoterId]);

  const selectedApp = pendingApps.find((app) => app.id === selectedAppId) || null;
  const selectedPromoter = filteredPromoters.find((promoter) => promoter.id === selectedPromoterId) || null;
  const referredOrders = useMemo(() => {
    const merged = new Map();
    [...ordersById, ...ordersByCode].forEach((order) => {
      if (order?.id) {
        merged.set(order.id, order);
      }
    });

    return Array.from(merged.values()).sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
  }, [ordersByCode, ordersById]);

  const orders = useMemo(() => {
    const merged = new Map();
    [...ordersById, ...ordersByCode, ...ordersByWalletOwner].forEach((order) => {
      if (order?.id) {
        merged.set(order.id, order);
      }
    });

    return Array.from(merged.values()).sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    );
  }, [ordersByCode, ordersById, ordersByWalletOwner]);

  useEffect(() => {
    if (!selectedApp) {
      setApprovalCode('');
      setNotes('');
      return;
    }
    setApprovalCode(
      normalizeReferralCode(selectedApp.referralCode)
      || createReferralCodeSuggestion(selectedApp.socialHandle || selectedApp.name || selectedApp.email)
    );
    setNotes(selectedApp.reviewNotes || '');
  }, [selectedApp]);

  useEffect(() => {
    setPromoterCode(selectedPromoter?.referralCode || '');
  }, [selectedPromoter]);

  useEffect(() => {
    setAmount('');
    setReason('');
  }, [selectedPromoterId]);

  useEffect(() => {
    setDetailView('purchases');
  }, [selectedPromoterId]);

  const stats = useMemo(
    () => ({
      pending: pendingApps.length,
      active: promoters.filter((promoter) => promoter.status === 'active').length,
      revenue: promoters.reduce((sum, promoter) => sum + Number(promoter.referredRevenue || 0), 0),
      credits: promoters.reduce((sum, promoter) => sum + Number(promoter.lifetimeCredited || 0), 0),
      cashouts: cashoutRequests.filter((request) => request.status === 'pending').length
    }),
    [cashoutRequests, pendingApps.length, promoters]
  );
  const activitySummary = useMemo(() => summarizePromoterSales(orders), [orders]);
  const soldProductRows = useMemo(
    () => buildPromoterProductRows(activitySummary.purchases),
    [activitySummary.purchases]
  );
  const selectedPromoterCashouts = useMemo(
    () => cashoutRequests.filter((request) => request.promoterId === selectedPromoterId),
    [cashoutRequests, selectedPromoterId]
  );

  const openDetailView = (view) => {
    setDetailView(view);
    window.requestAnimationFrame(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const reserveCode = async (promoterId, rawCode) => {
    const normalized = normalizeReferralCode(rawCode);
    if (!normalized) throw new Error('Enter a valid referral code.');
    const codeRef = doc(db, 'promoterCodes', normalized);
    const codeSnap = await getDoc(codeRef);
    if (codeSnap.exists() && codeSnap.data()?.promoterId !== promoterId) {
      throw new Error('That referral code is already in use.');
    }
    return { normalized, codeRef, codeSnap };
  };

  const syncPromoterActivationState = async (promoter, nextStatus) => {
    if (!promoter) return;
    const normalizedCode = normalizeReferralCode(promoter.referralCode);
    const batch = writeBatch(db);

    batch.set(
      doc(db, 'promoters', promoter.id),
      {
        status: nextStatus,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    batch.set(
      doc(db, 'promoterApplications', promoter.id),
      {
        status: nextStatus === 'active' ? 'approved' : 'inactive',
        updatedAt: serverTimestamp(),
        reviewedAt: serverTimestamp(),
        reviewedBy: user?.email || 'admin'
      },
      { merge: true }
    );

    if (normalizedCode) {
      batch.set(
        doc(db, 'promoterCodes', normalizedCode),
        {
          code: normalizedCode,
          promoterId: promoter.id,
          status: nextStatus === 'active' ? 'active' : 'inactive',
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();
  };

  const approve = async () => {
    if (!selectedApp) return;
    setBusy('approve');
    try {
      const promoterRef = doc(db, 'promoters', selectedApp.id);
      const promoterSnap = await getDoc(promoterRef);
      const current = promoterSnap.exists() ? promoterSnap.data() : {};
      const oldCode = normalizeReferralCode(current?.referralCode);
      const { normalized, codeRef, codeSnap } = await reserveCode(selectedApp.id, approvalCode);
      const batch = writeBatch(db);

      if (oldCode && oldCode !== normalized) batch.delete(doc(db, 'promoterCodes', oldCode));

      batch.set(
        promoterRef,
        {
          userId: selectedApp.id,
          name: selectedApp.name || current?.name || 'Promoter',
          email: selectedApp.email || current?.email || '',
          phone: selectedApp.phone || current?.phone || '',
          socialPlatform: selectedApp.socialPlatform || current?.socialPlatform || '',
          socialHandle: selectedApp.socialHandle || current?.socialHandle || '',
          profileUrl: selectedApp.profileUrl || current?.profileUrl || '',
          followerCount: Number(selectedApp.followerCount || current?.followerCount || 0),
          bankDetails: {
            accountHolder: selectedApp.bankDetails?.accountHolder || current?.bankDetails?.accountHolder || '',
            bankName: selectedApp.bankDetails?.bankName || current?.bankDetails?.bankName || '',
            accountNumber: selectedApp.bankDetails?.accountNumber || current?.bankDetails?.accountNumber || '',
            branchCode: selectedApp.bankDetails?.branchCode || current?.bankDetails?.branchCode || ''
          },
          referralCode: normalized,
          status: 'active',
          availableBalance: Number(current?.availableBalance || 0),
          lifetimeCredited: Number(current?.lifetimeCredited || 0),
          referredOrderCount: Number(current?.referredOrderCount || 0),
          referredItemCount: Number(current?.referredItemCount || 0),
          referredRevenue: Number(current?.referredRevenue || 0),
          approvedAt: current?.approvedAt || serverTimestamp(),
          approvedBy: user?.email || 'admin',
          createdAt: current?.createdAt || selectedApp.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      batch.set(
        codeRef,
        {
          code: normalized,
          promoterId: selectedApp.id,
          status: 'active',
          createdAt: codeSnap.exists() ? codeSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      batch.set(
        doc(db, 'promoterApplications', selectedApp.id),
        {
          status: 'approved',
          referralCode: normalized,
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.email || 'admin',
          reviewNotes: notes.trim() || null,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      await batch.commit();
      setSelectedPromoterId(selectedApp.id);
      toast.success('Promoter approved.');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to approve promoter.');
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    if (!selectedApp) return;
    setBusy('reject');
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'promoterApplications', selectedApp.id),
        {
          status: 'rejected',
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.email || 'admin',
          reviewNotes: notes.trim() || null,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      await batch.commit();
      toast.success('Application rejected.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to reject application.');
    } finally {
      setBusy('');
    }
  };

  const saveCode = async () => {
    if (!selectedPromoter) return;
    setBusy('code');
    try {
      const oldCode = normalizeReferralCode(selectedPromoter.referralCode);
      const { normalized, codeRef, codeSnap } = await reserveCode(selectedPromoter.id, promoterCode);
      const batch = writeBatch(db);

      if (oldCode && oldCode !== normalized) batch.delete(doc(db, 'promoterCodes', oldCode));

      batch.set(doc(db, 'promoters', selectedPromoter.id), { referralCode: normalized, updatedAt: serverTimestamp() }, { merge: true });
      batch.set(
        codeRef,
        {
          code: normalized,
          promoterId: selectedPromoter.id,
          status: selectedPromoter.status === 'inactive' ? 'inactive' : 'active',
          createdAt: codeSnap.exists() ? codeSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      batch.set(doc(db, 'promoterApplications', selectedPromoter.id), { referralCode: normalized, updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      toast.success('Referral code updated.');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to save referral code.');
    } finally {
      setBusy('');
    }
  };

  const deactivatePromoter = async () => {
    if (!selectedPromoter) return;
    const confirmed = window.confirm(
      `Deactivate promoter account for ${selectedPromoter.name || selectedPromoter.email}? Their referral link will stop working until reactivated.`
    );
    if (!confirmed) return;

    setBusy('deactivate');
    try {
      await syncPromoterActivationState(selectedPromoter, 'inactive');
      toast.success('Promoter account deactivated.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to deactivate promoter.');
    } finally {
      setBusy('');
    }
  };

  const reactivatePromoter = async () => {
    if (!selectedPromoter) return;
    setBusy('reactivate');
    try {
      await syncPromoterActivationState(selectedPromoter, 'active');
      toast.success('Promoter account reactivated.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to reactivate promoter.');
    } finally {
      setBusy('');
    }
  };

  const deletePromoter = async () => {
    if (!selectedPromoter) return;
    const confirmed = window.confirm(
      `Delete promoter account for ${selectedPromoter.name || selectedPromoter.email}? This removes the promoter profile, application, referral code, and manual credit history. Existing orders will remain for historical records.`
    );
    if (!confirmed) return;

    setBusy('delete');
    try {
      const refsToDelete = [
        doc(db, 'promoters', selectedPromoter.id),
        doc(db, 'promoterApplications', selectedPromoter.id)
      ];

      const normalizedCode = normalizeReferralCode(selectedPromoter.referralCode);
      if (normalizedCode) {
        refsToDelete.push(doc(db, 'promoterCodes', normalizedCode));
      }

      const transactionsSnap = await getDocs(
        query(collection(db, 'promoterTransactions'), where('promoterId', '==', selectedPromoter.id))
      );

      transactionsSnap.docs.forEach((docSnap) => {
        refsToDelete.push(docSnap.ref);
      });

      for (let index = 0; index < refsToDelete.length; index += 400) {
        const batch = writeBatch(db);
        refsToDelete.slice(index, index + 400).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }

      setSelectedPromoterId(null);
      toast.success('Promoter account deleted.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete promoter account.');
    } finally {
      setBusy('');
    }
  };

  const credit = async () => {
    if (!selectedPromoter) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter a valid rand amount.');
      return;
    }
    setBusy('credit');
    try {
      const adjustBalance = httpsCallable(functions, 'adjustPromoterBalance');
      await adjustBalance({
        promoterId: selectedPromoter.id,
        amount: parsed,
        reason: reason.trim() || null
      });
      setAmount('');
      setReason('');
      toast.success('Promoter credited.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to credit promoter.');
    } finally {
      setBusy('');
    }
  };

  const deduct = async () => {
    if (!selectedPromoter) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter a valid rand amount.');
      return;
    }
    if (parsed > Number(selectedPromoter.availableBalance || 0)) {
      toast.error('Deduction exceeds the promoter available balance.');
      return;
    }

    setBusy('deduct');
    try {
      const adjustBalance = httpsCallable(functions, 'adjustPromoterBalance');
      await adjustBalance({
        promoterId: selectedPromoter.id,
        amount: -parsed,
        reason: reason.trim() || 'Manual admin deduction'
      });
      setAmount('');
      setReason('');
      toast.success('Promoter balance deducted.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to deduct promoter balance.');
    } finally {
      setBusy('');
    }
  };

  const copyLink = async (referralCode) => {
    const link = buildReferralLink(referralCode);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Referral link copied.');
    } catch (error) {
      toast.error('Failed to copy link.');
    }
  };

  const reviewCashout = async (requestId, action) => {
    setBusy(`cashout-${action}-${requestId}`);
    try {
      const reviewRequest = httpsCallable(functions, 'reviewPromoterCashoutRequest');
      await reviewRequest({ requestId, action });
      toast.success(action === 'paid' ? 'Cashout marked as paid.' : 'Cashout rejected.');
    } catch (error) {
      console.error(error);
      toast.error(getCallableErrorMessage(error, 'Failed to update cashout request.'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
          <Megaphone size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Promoters</h2>
          <p className="text-sm text-gray-500">Approve promoter applications, assign referral codes, and credit rand balances manually.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Pending</p><p className="mt-2 text-3xl font-bold text-gray-900">{stats.pending}</p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Active</p><p className="mt-2 text-3xl font-bold text-gray-900">{stats.active}</p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Sales value</p><p className="mt-2 text-3xl font-bold text-gray-900">{formatZAR(stats.revenue)}</p></div>
        <div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Cashout requests</p><p className="mt-2 text-3xl font-bold text-gray-900">{stats.cashouts}</p></div>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="border-b p-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input value={appSearch} onChange={(event) => setAppSearch(event.target.value)} placeholder="Search pending applications..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
            </div>
            <span className="text-sm text-gray-500">{pendingApps.length}</span>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y">
            {pendingApps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedAppId(app.id)}
                className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${selectedAppId === app.id ? 'bg-blue-50' : ''}`}
              >
                <p className="font-semibold text-gray-900">{app.name || app.email}</p>
                <p className="text-sm text-gray-500">{app.email}</p>
                <p className="text-sm text-gray-600 mt-1">{app.socialPlatform || 'Platform not set'} {app.socialHandle ? `@${app.socialHandle}` : ''}</p>
              </button>
            ))}
            {pendingApps.length === 0 && <div className="px-5 py-10 text-center text-sm text-gray-500">No pending promoter applications.</div>}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          {!selectedApp ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Select an application to review.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedApp.name || 'Applicant'}</h3>
                <p className="text-sm text-gray-500">{selectedApp.email}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Followers</p><p className="mt-1 font-medium text-gray-900">{formatFollowerCount(selectedApp.followerCount || 0)}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Submitted</p><p className="mt-1 font-medium text-gray-900">{fmtDate(selectedApp.createdAt)}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Platform</p><p className="mt-1 font-medium text-gray-900">{selectedApp.socialPlatform || 'Not set'} {selectedApp.socialHandle ? `@${selectedApp.socialHandle}` : ''}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Phone</p><p className="mt-1 font-medium text-gray-900">{selectedApp.phone || 'Not provided'}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Bank</p><p className="mt-1 font-medium text-gray-900">{formatBankName(selectedApp.bankDetails?.bankName)}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Account holder</p><p className="mt-1 font-medium text-gray-900">{selectedApp.bankDetails?.accountHolder || 'Not provided'}</p></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Account number</p><p className="mt-1 font-medium text-gray-900">{selectedApp.bankDetails?.accountNumber || 'Not provided'}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Branch code</p><p className="mt-1 font-medium text-gray-900">{selectedApp.bankDetails?.branchCode || 'Not provided'}</p></div>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 text-sm">
                <p className="text-gray-500">Profile link</p>
                <a href={selectedApp.profileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex break-all text-blue-600 hover:underline">{selectedApp.profileUrl || 'Not provided'}</a>
              </div>
              <div className="rounded-xl border bg-gray-50 p-4 text-sm">
                <p className="text-gray-500">Applicant notes</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">{selectedApp.notes || 'No notes submitted.'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Referral code</label>
                <input value={approvalCode} onChange={(event) => setApprovalCode(event.target.value)} className="w-full px-4 py-3 border rounded-xl uppercase" placeholder="PROMO123" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin notes</label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} className="w-full px-4 py-3 border rounded-xl" placeholder="Approval notes or rejection reason." />
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={approve} disabled={busy === 'approve'} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-60"><Check size={18} />{busy === 'approve' ? 'Approving...' : 'Approve'}</button>
                <button type="button" onClick={reject} disabled={busy === 'reject'} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60"><X size={18} />{busy === 'reject' ? 'Rejecting...' : 'Reject'}</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="border-b p-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input value={promoterSearch} onChange={(event) => setPromoterSearch(event.target.value)} placeholder="Search promoters..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
            </div>
            <span className="text-sm text-gray-500">{filteredPromoters.length}</span>
          </div>
          <div className="max-h-[620px] overflow-y-auto divide-y">
            {filteredPromoters.map((promoter) => (
              <button
                key={promoter.id}
                type="button"
                onClick={() => {
                  setSelectedPromoterId(promoter.id);
                }}
                className={`w-full text-left px-5 py-4 hover:bg-gray-50 ${selectedPromoterId === promoter.id ? 'bg-blue-50' : ''}`}
              >
                <p className="font-semibold text-gray-900">{promoter.name || promoter.email}</p>
                <p className="text-sm text-gray-500">{promoter.email}</p>
                <p className="text-sm text-gray-600 mt-1">{promoter.referralCode || 'No code'} {promoter.socialHandle ? `| @${promoter.socialHandle}` : ''}</p>
                <p className={`mt-1 text-xs font-medium ${promoter.status === 'inactive' ? 'text-red-600' : 'text-emerald-600'}`}>
                  {promoter.status === 'inactive' ? 'Inactive' : 'Active'}
                </p>
              </button>
            ))}
            {filteredPromoters.length === 0 && <div className="px-5 py-10 text-center text-sm text-gray-500">No promoters found.</div>}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          {!selectedPromoter ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Select a promoter to manage.</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedPromoter.name || 'Promoter'}</h3>
                  <p className="text-sm text-gray-500">{selectedPromoter.email}</p>
                  <p className={`mt-1 text-sm font-medium ${selectedPromoter.status === 'inactive' ? 'text-red-600' : 'text-emerald-600'}`}>
                    {selectedPromoter.status === 'inactive' ? 'Inactive account' : 'Active account'}
                  </p>
                </div>
                <button type="button" onClick={() => copyLink(selectedPromoter.referralCode)} disabled={selectedPromoter.status === 'inactive'} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-60"><Copy size={16} />Copy link</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Platform</p><p className="mt-1 font-medium text-gray-900">{selectedPromoter.socialPlatform || 'Not set'} {selectedPromoter.socialHandle ? `@${selectedPromoter.socialHandle}` : ''}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Followers</p><p className="mt-1 font-medium text-gray-900">{formatFollowerCount(selectedPromoter.followerCount || 0)}</p></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Bank</p><p className="mt-1 font-medium text-gray-900">{formatBankName(selectedPromoter.bankDetails?.bankName)}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Account holder</p><p className="mt-1 font-medium text-gray-900">{selectedPromoter.bankDetails?.accountHolder || 'Not provided'}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Account number</p><p className="mt-1 font-medium text-gray-900">{selectedPromoter.bankDetails?.accountNumber || 'Not provided'}</p></div>
                <div className="rounded-xl border bg-gray-50 p-4"><p className="text-gray-500">Branch code</p><p className="mt-1 font-medium text-gray-900">{selectedPromoter.bankDetails?.branchCode || 'Not provided'}</p></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
                <input value={promoterCode} onChange={(event) => setPromoterCode(event.target.value)} className="w-full px-4 py-3 border rounded-xl uppercase" placeholder="PROMO123" />
                <button type="button" onClick={saveCode} disabled={busy === 'code'} className="px-4 py-3 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-60">{busy === 'code' ? 'Saving...' : 'Save code'}</button>
              </div>

              <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm text-gray-700 break-all">{buildReferralLink(selectedPromoter.referralCode)}</div>

              <div className="flex flex-wrap gap-3">
                {selectedPromoter.status === 'inactive' ? (
                  <button
                    type="button"
                    onClick={reactivatePromoter}
                    disabled={busy === 'reactivate'}
                    className="px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy === 'reactivate' ? 'Reactivating...' : 'Reactivate account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={deactivatePromoter}
                    disabled={busy === 'deactivate'}
                    className="px-4 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60"
                  >
                    {busy === 'deactivate' ? 'Deactivating...' : 'Deactivate account'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={deletePromoter}
                  disabled={busy === 'delete'}
                  className="px-4 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60"
                >
                  {busy === 'delete' ? 'Deleting...' : 'Delete account'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <button type="button" onClick={() => openDetailView('purchases')} className={`rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${detailView === 'purchases' ? 'border-blue-500 bg-blue-50' : ''}`}><p className="text-sm text-gray-500">Purchases</p><p className="mt-2 text-2xl font-bold text-gray-900">{activitySummary.purchaseCount}</p><p className="mt-1 text-xs text-gray-500">Paid {activitySummary.paidPurchaseCount} | Pending {activitySummary.pendingCount}</p><p className="mt-3 text-xs font-medium text-blue-700">Click to view purchase groups</p></button>
                <button type="button" onClick={() => openDetailView('products')} className={`rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${detailView === 'products' ? 'border-blue-500 bg-blue-50' : ''}`}><p className="text-sm text-gray-500">Products sold</p><p className="mt-2 text-2xl font-bold text-gray-900">{activitySummary.itemCount}</p><p className="mt-1 text-xs text-gray-500">Paid products {activitySummary.paidItemCount}</p><p className="mt-3 text-xs font-medium text-blue-700">Click to view sold products</p></button>
                <button type="button" onClick={() => openDetailView('products')} className={`rounded-2xl border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 ${detailView === 'products' ? 'border-blue-500 bg-blue-50' : ''}`}><p className="text-sm text-gray-500">Product value</p><p className="mt-2 text-2xl font-bold text-gray-900">{formatZAR(activitySummary.productValue)}</p><p className="mt-1 text-xs text-gray-500">Paid value {formatZAR(activitySummary.paidProductValue)}</p><p className="mt-3 text-xs font-medium text-blue-700">Click to view sold products</p></button>
                <div className="rounded-2xl border p-4"><p className="text-sm text-gray-500">Balance</p><p className="mt-2 text-2xl font-bold text-gray-900">{formatZAR(selectedPromoter.availableBalance || 0)}</p></div>
              </div>

              <div className="rounded-2xl border p-5 space-y-4">
                <div>
                  <h4 className="text-lg font-bold text-gray-900">Cashout requests</h4>
                  <p className="text-sm text-gray-500">Review promoter cashout requests and update the balance correctly.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Available balance</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(selectedPromoter.availableBalance || 0)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Pending cashout</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(selectedPromoter.pendingCashoutBalance || 0)}</p>
                  </div>
                  <div className="rounded-xl border bg-gray-50 px-4 py-3">
                    <p className="text-gray-500">Lifetime cashed out</p>
                    <p className="mt-1 font-semibold text-gray-900">{formatZAR(selectedPromoter.lifetimeCashedOut || 0)}</p>
                  </div>
                </div>

                {selectedPromoterCashouts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-sm text-center text-gray-500">
                    No cashout requests yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {selectedPromoterCashouts.map((request) => (
                      <div key={request.id} className="rounded-2xl border p-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">{formatZAR(request.amount || 0)}</p>
                            <p className="text-sm text-gray-500">
                              {fmtDate(request.createdAt)} | {formatBankName(request.bankDetails?.bankName)}
                            </p>
                            <p className="mt-1 text-sm text-gray-600 capitalize">Status: {request.status || 'pending'}</p>
                          </div>

                          {request.status === 'pending' && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => reviewCashout(request.id, 'paid')}
                                disabled={busy === `cashout-paid-${request.id}`}
                                className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {busy === `cashout-paid-${request.id}` ? 'Saving...' : 'Mark paid'}
                              </button>
                              <button
                                type="button"
                                onClick={() => reviewCashout(request.id, 'rejected')}
                                disabled={busy === `cashout-rejected-${request.id}`}
                                className="px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                              >
                                {busy === `cashout-rejected-${request.id}` ? 'Saving...' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><Wallet size={18} /></div>
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">Manual balance adjustment</h4>
                    <p className="text-sm text-gray-500">Credit or deduct the promoter balance manually.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
                  <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="Amount" />
                  <input value={reason} onChange={(event) => setReason(event.target.value)} className="w-full px-4 py-3 border rounded-xl" placeholder="Reason for the adjustment" />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={credit} disabled={busy === 'credit' || busy === 'deduct'} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60">{busy === 'credit' ? 'Crediting...' : 'Add credit'}</button>
                  <button type="button" onClick={deduct} disabled={busy === 'credit' || busy === 'deduct'} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60">{busy === 'deduct' ? 'Deducting...' : 'Deduct balance'}</button>
                </div>
              </div>

              <div ref={detailSectionRef}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">
                      {detailView === 'products' ? 'Products sold' : 'Promoter purchases'}
                    </h4>
                    <p className="text-sm text-gray-500 mb-4">
                      {detailView === 'products'
                        ? 'Products linked to this promoter referral code or promoter wallet activity.'
                        : 'The totals above include referral-linked orders and purchases made with the promoter balance. Promoter credits still come from referral orders only.'}
                    </p>
                  </div>

                  <div className="inline-flex rounded-xl border bg-gray-50 p-1">
                    <button
                      type="button"
                      onClick={() => setDetailView('purchases')}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${detailView === 'purchases' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      Purchases
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailView('products')}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${detailView === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                      Products sold
                    </button>
                  </div>
                </div>

                {detailView === 'products' ? (
                  soldProductRows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-sm text-center text-gray-500">
                      No sold products for this promoter yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border">
                      <table className="w-full min-w-[760px]">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Product</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Vendor</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Qty</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Paid Qty</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Value</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Paid Value</th>
                            <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Orders</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Last Sold</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {soldProductRows.map((row) => (
                            <tr key={row.key}>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{row.vendorLabel}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{row.quantity}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{row.paidQuantity}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatZAR(row.totalValue)}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatZAR(row.paidValue)}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{row.orderCount}</td>
                              <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(row.lastSoldAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : activitySummary.purchases.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-sm text-center text-gray-500">
                    No promoter purchase activity yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                    {activitySummary.purchases.map((purchase) => (
                      <div key={purchase.id} className="rounded-2xl border p-4 space-y-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="font-semibold text-gray-900">Purchase #{purchase.orderGroupRef}</p>
                              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPaymentTone(purchase.paymentStatus)}`}>
                                {getPaymentLabel(purchase.paymentStatus)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">
                              {purchase.customerEmail || purchase.customerName || 'Unknown customer'} | {fmtDate(purchase.createdAt)}
                            </p>
                            {purchase.vendorNames.length > 0 && (
                              <p className="mt-1 text-sm text-gray-500">
                                Vendors: {purchase.vendorNames.join(', ')}
                              </p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm min-w-[260px]">
                            <div className="rounded-xl bg-gray-50 px-4 py-3">
                              <p className="text-gray-500">Products sold</p>
                              <p className="mt-1 font-semibold text-gray-900">{purchase.itemCount}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-4 py-3">
                              <p className="text-gray-500">Product value</p>
                              <p className="mt-1 font-semibold text-gray-900">{formatZAR(purchase.productTotal)}</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-4 py-3 col-span-2">
                              <p className="text-gray-500">Order total</p>
                              <p className="mt-1 font-semibold text-gray-900">{formatZAR(purchase.orderTotal)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 text-sm text-gray-700">
                          {purchase.items.map((item) => {
                            const quantity = Math.max(1, Number(item.quantity || item.qty || 1));
                            const lineTotal = Number(item.price || 0) * quantity;

                            return (
                              <div key={item._key} className="flex items-start justify-between gap-4 border-b last:border-b-0 pb-3 last:pb-0">
                                <div>
                                  <p className="font-medium text-gray-900">{item.name || 'Item'}</p>
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
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
