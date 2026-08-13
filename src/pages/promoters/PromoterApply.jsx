import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, Clock3, Megaphone, ShieldCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import ShopHeader from '../../components/shop/ShopHeader';
import ShopFooter from '../../components/shop/ShopFooter';
import {
  BANK_OPTIONS,
  MIN_PROMOTER_FOLLOWERS,
  SOCIAL_PLATFORMS,
  buildReferralLink,
  formatBankName,
  formatFollowerCount
} from '../../utils/promoters';

const EMPTY_FORM = {
  name: '',
  phone: '',
  socialPlatform: '',
  socialHandle: '',
  profileUrl: '',
  followerCount: '',
  accountHolder: '',
  bankName: '',
  accountNumber: '',
  branchCode: '',
  notes: ''
};

const getApplicationErrorMessage = (error) => {
  if (error?.code === 'permission-denied') {
    return 'Application submission is blocked by Firestore permissions. Retry after the latest rules are deployed.';
  }
  if (error?.code === 'unavailable') {
    return 'Network error while submitting. Check your connection and try again.';
  }
  return error?.message || 'Failed to submit application.';
};

export default function PromoterApply() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [application, setApplication] = useState(null);
  const [promoter, setPromoter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      setApplication(null);
      setPromoter(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubscribers = [];
    let remaining = 2;

    const finishLoading = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setLoading(false);
      }
    };

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

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      name: application?.name || user.displayName || '',
      phone: application?.phone || '',
      socialPlatform: application?.socialPlatform || '',
      socialHandle: application?.socialHandle || '',
      profileUrl: application?.profileUrl || '',
      followerCount: application?.followerCount ? String(application.followerCount) : '',
      accountHolder: application?.bankDetails?.accountHolder || promoter?.bankDetails?.accountHolder || '',
      bankName: application?.bankDetails?.bankName || promoter?.bankDetails?.bankName || '',
      accountNumber: application?.bankDetails?.accountNumber || promoter?.bankDetails?.accountNumber || '',
      branchCode: application?.bankDetails?.branchCode || promoter?.bankDetails?.branchCode || '',
      notes: application?.notes || ''
    });
  }, [application, promoter, user]);

  const applicationStatus = promoter?.status === 'inactive'
    ? 'inactive'
    : promoter?.status === 'active'
      ? 'approved'
      : application?.status || 'not_started';
  const referralLink = promoter?.referralCode ? buildReferralLink(promoter.referralCode) : '';
  const canSubmitApplication = !loading && !!user && !['pending', 'approved', 'inactive'].includes(applicationStatus);

  const statusMeta = useMemo(() => {
    if (applicationStatus === 'approved') {
      return {
        title: 'You are approved',
        description: 'Your promoter account is active. Use your dashboard to track sales and your balance.',
        icon: CheckCircle2,
        tone: 'green'
      };
    }

    if (applicationStatus === 'pending') {
      return {
        title: 'Application under review',
        description: 'We review promoter applications manually before issuing a referral code.',
        icon: Clock3,
        tone: 'amber'
      };
    }

    if (applicationStatus === 'rejected') {
      return {
        title: 'Application needs changes',
        description: application?.reviewNotes || 'Please update your details and submit again.',
        icon: XCircle,
        tone: 'red'
      };
    }

    if (applicationStatus === 'inactive') {
      return {
        title: 'Promoter account deactivated',
        description: application?.reviewNotes || 'Your promoter account has been deactivated by admin. Contact admin if it should be restored.',
        icon: XCircle,
        tone: 'red'
      };
    }

    return {
      title: 'Apply to become a promoter',
      description: 'Share your referral link, bring sales to MzansiShop, and get credited manually in rands.',
      icon: Megaphone,
      tone: 'blue'
    };
  }, [application?.reviewNotes, applicationStatus]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) {
      toast.error('Please sign in before applying.');
      return;
    }

    const followerCount = Number(form.followerCount);
    if (!form.socialPlatform || !form.socialHandle || !form.profileUrl) {
      toast.error('Complete your platform, handle, and profile link.');
      return;
    }
    if (!form.accountHolder || !form.bankName || !form.accountNumber || !form.branchCode) {
      toast.error('Complete all banking details before applying.');
      return;
    }
    if (!Number.isFinite(followerCount) || followerCount < MIN_PROMOTER_FOLLOWERS) {
      toast.error(`You need at least ${MIN_PROMOTER_FOLLOWERS} followers to apply.`);
      return;
    }

    setSubmitting(true);
    try {
      await setDoc(
        doc(db, 'promoterApplications', user.uid),
        {
          userId: user.uid,
          email: user.email || '',
          name: form.name.trim() || user.displayName || user.email || 'Promoter applicant',
          phone: form.phone.trim(),
          socialPlatform: form.socialPlatform,
          socialHandle: form.socialHandle.trim().replace(/^@/, ''),
          profileUrl: form.profileUrl.trim(),
          followerCount,
          bankDetails: {
            accountHolder: form.accountHolder.trim(),
            bankName: form.bankName,
            accountNumber: form.accountNumber.trim(),
            branchCode: form.branchCode.trim()
          },
          notes: form.notes.trim(),
          status: 'pending',
          reviewedAt: null,
          reviewedBy: null,
          reviewNotes: null,
          createdAt: application?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      toast.success(application?.status === 'rejected' ? 'Application resubmitted.' : 'Application submitted.');
    } catch (error) {
      console.error('Failed to submit promoter application', error);
      toast.error(getApplicationErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const StatusIcon = statusMeta.icon;

  return (
    <div className="min-h-screen bg-gray-100">
      <ShopHeader />

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-emerald-800 text-white p-8 sm:p-10">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium">
              <Megaphone size={16} />
              Promoter Program
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">Turn your audience into paid referrals</h1>
              <p className="mt-3 text-base sm:text-lg text-blue-100">
                If you have at least {formatFollowerCount(MIN_PROMOTER_FOLLOWERS)} followers on any social platform,
                you can apply to become a MzansiShop promoter. We review applications manually, approve qualifying accounts,
                and issue a referral code that links sales back to you.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="font-semibold">Minimum audience</p>
                <p className="mt-1 text-blue-100">{formatFollowerCount(MIN_PROMOTER_FOLLOWERS)}+ followers</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="font-semibold">Review process</p>
                <p className="mt-1 text-blue-100">Manual approval by admin</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="font-semibold">Promoter dashboard</p>
                <p className="mt-1 text-blue-100">Track sales counts and credited rand balance</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6">
          <div className="bg-white rounded-2xl shadow-sm border p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div
                className={`mt-1 rounded-xl p-2 ${
                  statusMeta.tone === 'green'
                    ? 'bg-green-100 text-green-700'
                    : statusMeta.tone === 'amber'
                      ? 'bg-amber-100 text-amber-700'
                      : statusMeta.tone === 'red'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                }`}
              >
                <StatusIcon size={20} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{statusMeta.title}</h2>
                <p className="mt-1 text-sm text-gray-600">{statusMeta.description}</p>
              </div>
            </div>

            {!user && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-4">
                <p className="text-sm text-blue-900">
                  Sign in with your customer account first so your application, approval, and dashboard stay tied to one profile.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/login"
                    state={{ from: { pathname: '/promoters/apply' } }}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-100"
                  >
                    Create account
                  </Link>
                </div>
              </div>
            )}

            {applicationStatus === 'approved' && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-green-800 font-medium">Referral code</p>
                    <p className="mt-1 text-gray-900 font-semibold">{promoter?.referralCode || 'Pending'}</p>
                  </div>
                  <div>
                    <p className="text-green-800 font-medium">Platform</p>
                    <p className="mt-1 text-gray-900">
                      {promoter?.socialPlatform || application?.socialPlatform || 'Not set'}{' '}
                      {promoter?.socialHandle || application?.socialHandle
                        ? `@${promoter?.socialHandle || application?.socialHandle}`
                        : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-green-800 font-medium">Bank</p>
                    <p className="mt-1 text-gray-900">
                      {formatBankName(promoter?.bankDetails?.bankName || application?.bankDetails?.bankName)}
                    </p>
                  </div>
                  <div>
                    <p className="text-green-800 font-medium">Account ending</p>
                    <p className="mt-1 text-gray-900">
                      {(promoter?.bankDetails?.accountNumber || application?.bankDetails?.accountNumber)
                        ? `****${String(promoter?.bankDetails?.accountNumber || application?.bankDetails?.accountNumber).slice(-4)}`
                        : 'Not provided'}
                    </p>
                  </div>
                </div>
                {referralLink && (
                  <div className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-700 break-all">
                    {referralLink}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/promoters/dashboard"
                    className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700"
                  >
                    Open promoter dashboard
                  </Link>
                </div>
              </div>
            )}

            {applicationStatus === 'pending' && application && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-amber-800 font-medium">Platform</p>
                    <p className="mt-1 text-gray-900">
                      {application.socialPlatform} @{application.socialHandle}
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-800 font-medium">Followers</p>
                    <p className="mt-1 text-gray-900">{formatFollowerCount(application.followerCount)}</p>
                  </div>
                  <div>
                    <p className="text-amber-800 font-medium">Profile link</p>
                    <a
                      href={application.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex text-blue-700 hover:underline break-all"
                    >
                      {application.profileUrl}
                    </a>
                  </div>
                  <div>
                    <p className="text-amber-800 font-medium">Submitted</p>
                    <p className="mt-1 text-gray-900">
                      {application.updatedAt?.toDate?.()?.toLocaleString?.('en-ZA')
                        || application.createdAt?.toDate?.()?.toLocaleString?.('en-ZA')
                        || 'Just now'}
                    </p>
                  </div>
                  <div>
                    <p className="text-amber-800 font-medium">Bank</p>
                    <p className="mt-1 text-gray-900">{formatBankName(application.bankDetails?.bankName)}</p>
                  </div>
                  <div>
                    <p className="text-amber-800 font-medium">Account ending</p>
                    <p className="mt-1 text-gray-900">
                      {application.bankDetails?.accountNumber
                        ? `****${String(application.bankDetails.accountNumber).slice(-4)}`
                        : 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {canSubmitApplication && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      placeholder="e.g. 072 123 4567"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                    <select
                      value={form.socialPlatform}
                      onChange={(event) => setForm((current) => ({ ...current, socialPlatform: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      required
                    >
                      <option value="">Choose a platform</option>
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Social handle</label>
                    <input
                      type="text"
                      value={form.socialHandle}
                      onChange={(event) => setForm((current) => ({ ...current, socialHandle: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      placeholder="@yourhandle"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Profile link</label>
                    <input
                      type="url"
                      value={form.profileUrl}
                      onChange={(event) => setForm((current) => ({ ...current, profileUrl: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      placeholder="https://..."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Follower count</label>
                    <input
                      type="number"
                      min={MIN_PROMOTER_FOLLOWERS}
                      step="1"
                      value={form.followerCount}
                      onChange={(event) => setForm((current) => ({ ...current, followerCount: event.target.value }))}
                      className="w-full px-4 py-3 border rounded-xl"
                      placeholder="1000"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Banking details</h3>
                    <p className="mt-1 text-sm text-gray-500">These details are required so admin can pay out your promoter earnings manually.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account holder</label>
                      <input
                        type="text"
                        value={form.accountHolder}
                        onChange={(event) => setForm((current) => ({ ...current, accountHolder: event.target.value }))}
                        className="w-full px-4 py-3 border rounded-xl"
                        placeholder="Account holder name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                      <select
                        value={form.bankName}
                        onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
                        className="w-full px-4 py-3 border rounded-xl"
                        required
                      >
                        <option value="">Choose a bank</option>
                        {BANK_OPTIONS.map((bank) => (
                          <option key={bank.value} value={bank.value}>
                            {bank.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account number</label>
                      <input
                        type="text"
                        value={form.accountNumber}
                        onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
                        className="w-full px-4 py-3 border rounded-xl"
                        placeholder="Account number"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch code</label>
                      <input
                        type="text"
                        value={form.branchCode}
                        onChange={(event) => setForm((current) => ({ ...current, branchCode: event.target.value }))}
                        className="w-full px-4 py-3 border rounded-xl"
                        placeholder="Branch code"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes for review</label>
                  <textarea
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="w-full px-4 py-3 border rounded-xl"
                    rows={4}
                    placeholder="Tell us how you plan to promote MzansiShop."
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Applications are reviewed manually. Approval is based on your audience size, profile quality, and whether
                  your public handle matches what you submit here.
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting
                    ? 'Submitting...'
                    : application?.status === 'rejected'
                      ? 'Resubmit application'
                      : 'Submit application'}
                </button>
              </form>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl bg-blue-100 text-blue-700 p-2">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">How it works</h2>
                  <p className="text-sm text-gray-500">Manual review, referral code, and tracked sales</p>
                </div>
              </div>
              <ol className="space-y-4 text-sm text-gray-700">
                <li>
                  <span className="font-semibold text-gray-900">1. Apply with your public profile.</span>
                  We require at least {formatFollowerCount(MIN_PROMOTER_FOLLOWERS)} followers, a live profile link, and your banking details for manual payouts.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">2. Admin reviews the application.</span>
                  Approval and verification are handled manually from the admin panel.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">3. Get your referral link.</span>
                  Approved promoters receive a referral code and dashboard access.
                </li>
                <li>
                  <span className="font-semibold text-gray-900">4. Track sales, not product details.</span>
                  Your dashboard shows sales counts, items sold, and credited rand balance without exposing customer or product details.
                </li>
              </ol>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <h2 className="text-xl font-bold text-gray-900">Quick access</h2>
              <div className="mt-4 space-y-3 text-sm">
                <Link
                  to="/promoters/dashboard"
                  className="block rounded-xl border border-gray-200 px-4 py-3 hover:border-blue-300 hover:bg-blue-50"
                >
                  Open promoter dashboard
                </Link>
                <Link
                  to="/sell"
                  className="block rounded-xl border border-gray-200 px-4 py-3 hover:border-blue-300 hover:bg-blue-50"
                >
                  Want to sell products instead? Become a vendor
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <ShopFooter />
    </div>
  );
}
