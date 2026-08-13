import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  Send,
  Users,
  XCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';

const AUDIENCES = [
  { value: 'registered_users', label: 'All signed-up users' }
];

const DEFAULT_FORM = {
  audience: 'registered_users',
  title: '',
  subject: 'MzansiShop update',
  templateId: '',
  from: 'MzansiShop Updates <updates@mzansishop.co.za>',
  replyTo: 'support@mzansishop.co.za',
  message: '',
  ctaLabel: '',
  ctaUrl: 'https://mzansishop.co.za',
  testEmail: '',
  excludedEmails: ''
};

const STATUS_STYLES = {
  sent: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sending: 'bg-blue-50 text-blue-700 border-blue-200',
  partial_failed: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200'
};

const formatNumber = (value) => Number(value || 0).toLocaleString('en-ZA');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const parseEmailList = (value) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter((email) => email && email.includes('@'))
    )
  ).sort();

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = value?.toDate?.() || (value instanceof Date ? value : new Date(value));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-ZA');
};

const getStatusLabel = (status) =>
  String(status || 'unknown').replace(/_/g, ' ');

export default function AdminUpdates() {
  const { user } = useAuth();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [preview, setPreview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [campaignSending, setCampaignSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    setForm((current) => (
      current.testEmail ? current : { ...current, testEmail: user.email }
    ));
  }, [user?.email]);

  useEffect(() => {
    const campaignsQuery = query(
      collection(db, 'adminUpdateCampaigns'),
      orderBy('createdAt', 'desc'),
      limit(12)
    );

    return onSnapshot(campaignsQuery, (snapshot) => {
      setCampaigns(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
    });
  }, []);

  const excludedEmails = parseEmailList(form.excludedEmails);
  const excludedEmailSet = new Set(excludedEmails);
  const filteredRecipients = recipients.filter((recipient) => {
    const needle = recipientSearch.trim().toLowerCase();
    if (!needle) return true;
    return recipient.email.toLowerCase().includes(needle)
      || (recipient.name || '').toLowerCase().includes(needle);
  });

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'audience' || field === 'excludedEmails') setPreview(null);
    setConfirmSend(false);
  };

  const setExcludedEmails = (emails) => {
    updateForm('excludedEmails', Array.from(new Set(emails.map(normalizeEmail).filter(Boolean))).sort().join('\n'));
  };

  const toggleExcludedEmail = (email) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;

    const next = new Set(excludedEmails);
    if (next.has(normalized)) {
      next.delete(normalized);
    } else {
      next.add(normalized);
    }
    setExcludedEmails(Array.from(next));
  };

  const excludeVisibleRecipients = () => {
    const next = new Set(excludedEmails);
    filteredRecipients.forEach((recipient) => next.add(normalizeEmail(recipient.email)));
    setExcludedEmails(Array.from(next));
  };

  const loadRecipients = async () => {
    setRecipientsLoading(true);
    try {
      const callable = httpsCallable(functions, 'getAdminUpdateRecipientList');
      const response = await callable({ audience: form.audience });
      setRecipients(response.data?.recipients || []);
    } catch (error) {
      console.error('Failed to load registered emails', error);
      toast.error(error?.message || 'Failed to load registered emails');
    } finally {
      setRecipientsLoading(false);
    }
  };

  const buildPayload = (audienceOverride) => ({
    audience: audienceOverride || form.audience,
    title: form.title,
    subject: form.subject,
    templateId: form.templateId,
    from: form.from,
    replyTo: form.replyTo,
    message: form.message,
    ctaLabel: form.ctaLabel,
    ctaUrl: form.ctaUrl,
    testEmail: form.testEmail,
    excludedEmails: form.excludedEmails,
    confirmSend: true
  });

  const validateContent = () => {
    if (!form.subject.trim()) {
      toast.error('Subject is required');
      return false;
    }
    if (!form.from.trim()) {
      toast.error('From address is required');
      return false;
    }
    if (!form.templateId.trim() && !form.message.trim()) {
      toast.error('Add a Resend template ID or write a message');
      return false;
    }
    return true;
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      await loadRecipients();
      const callable = httpsCallable(functions, 'getAdminUpdateAudiencePreview');
      const response = await callable({
        audience: form.audience,
        testEmail: form.testEmail,
        excludedEmails: form.excludedEmails
      });
      setPreview(response.data || null);
    } catch (error) {
      console.error('Failed to load update audience preview', error);
      toast.error(error?.message || 'Failed to load audience count');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    loadRecipients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendTest = async () => {
    if (!validateContent()) return;
    if (!form.testEmail.trim()) {
      toast.error('Test email is required');
      return;
    }

    setTestSending(true);
    try {
      const callable = httpsCallable(functions, 'sendAdminUpdateEmail');
      const response = await callable(buildPayload('test'));
      toast.success(`Test email sent to ${form.testEmail}`);
      setCampaigns((current) => current);
      return response.data;
    } catch (error) {
      console.error('Failed to send test update email', error);
      toast.error(error?.message || 'Failed to send test email');
      return null;
    } finally {
      setTestSending(false);
    }
  };

  const sendCampaign = async () => {
    if (!validateContent()) return;
    if (!confirmSend) {
      toast.error('Confirm the campaign send first');
      return;
    }

    const confirmMessage = preview?.uniqueRecipients
      ? `Send this update to ${formatNumber(preview.uniqueRecipients)} unique recipient(s)?`
      : 'Send this update to the selected audience?';
    if (!window.confirm(confirmMessage)) return;

    setCampaignSending(true);
    try {
      const callable = httpsCallable(functions, 'sendAdminUpdateEmail');
      const response = await callable(buildPayload());
      const data = response.data || {};
      toast.success(`Update sent to ${formatNumber(data.sent)} recipient(s)`);
      setConfirmSend(false);
      setPreview(null);
    } catch (error) {
      console.error('Failed to send update campaign', error);
      toast.error(error?.message || 'Failed to send update');
    } finally {
      setCampaignSending(false);
    }
  };

  const selectedAudience = AUDIENCES.find((item) => item.value === form.audience);
  const sendDisabled = campaignSending || testSending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Updates</h2>
          <p className="mt-1 text-sm text-gray-600">
            Send Resend template updates to everyone who signed up. Emails are deduplicated before sending.
          </p>
        </div>
        <button
          type="button"
          onClick={loadPreview}
          disabled={previewLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={previewLoading ? 'animate-spin' : ''} />
          Refresh audience
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="bg-white rounded-xl border shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Audience</label>
              <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-900">
                All signed-up users
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateForm('title', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="Weekend special"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exclude Emails</label>
            <div className="rounded-lg border border-gray-200">
              <div className="flex flex-col gap-3 border-b border-gray-200 p-3 md:flex-row md:items-center">
                <input
                  type="search"
                  value={recipientSearch}
                  onChange={(event) => setRecipientSearch(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2"
                  placeholder="Search registered emails..."
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={loadRecipients}
                    disabled={recipientsLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw size={15} className={recipientsLoading ? 'animate-spin' : ''} />
                    Reload
                  </button>
                  <button
                    type="button"
                    onClick={excludeVisibleRecipients}
                    disabled={filteredRecipients.length === 0}
                    className="rounded-lg border border-amber-200 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                  >
                    Exclude visible
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcludedEmails([])}
                    disabled={excludedEmails.length === 0}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {recipientsLoading && (
                  <div className="p-4 text-sm text-gray-500">Loading registered emails...</div>
                )}
                {!recipientsLoading && filteredRecipients.length === 0 && (
                  <div className="p-4 text-sm text-gray-500">
                    {recipients.length === 0 ? 'No registered emails found.' : 'No emails match your search.'}
                  </div>
                )}
                {!recipientsLoading && filteredRecipients.map((recipient) => {
                  const checked = excludedEmailSet.has(normalizeEmail(recipient.email));
                  return (
                    <label
                      key={recipient.email}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50 ${checked ? 'bg-amber-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleExcludedEmail(recipient.email)}
                        className="rounded border-gray-300 text-amber-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">{recipient.email}</span>
                        {recipient.name && (
                          <span className="block truncate text-xs text-gray-500">{recipient.name}</span>
                        )}
                      </span>
                      {checked && (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                          Excluded
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {formatNumber(excludedEmails.length)} selected for exclusion from {formatNumber(recipients.length)} registered email{recipients.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={form.subject}
              onChange={(event) => updateForm('subject', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2"
              placeholder="MzansiShop update"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resend Template ID</label>
            <input
              type="text"
              value={form.templateId}
              onChange={(event) => updateForm('templateId', event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2"
              placeholder="f3b9756c-f4f4-44da-bc00-9f7903c8a83f"
            />
            <p className="mt-1 text-xs text-gray-500">
              Template variables: <code>CUSTOMER_NAME</code>, <code>EMAIL</code>, <code>UPDATE_TITLE</code>, <code>MESSAGE</code>, <code>CTA_URL</code>, <code>SUPPORT_EMAIL</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="text"
                value={form.from}
                onChange={(event) => updateForm('from', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="MzansiShop Updates <updates@mzansishop.co.za>"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To</label>
              <input
                type="email"
                value={form.replyTo}
                onChange={(event) => updateForm('replyTo', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="support@mzansishop.co.za"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={form.message}
              onChange={(event) => updateForm('message', event.target.value)}
              rows={7}
              className="w-full rounded-lg border border-gray-300 px-4 py-2"
              placeholder="Write the update here, or use this as the MESSAGE variable in your Resend template."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA Label</label>
              <input
                type="text"
                value={form.ctaLabel}
                onChange={(event) => updateForm('ctaLabel', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="Shop now"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CTA URL</label>
              <input
                type="url"
                value={form.ctaUrl}
                onChange={(event) => updateForm('ctaUrl', event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2"
                placeholder="https://mzansishop.co.za/deals"
              />
            </div>
          </div>

          <div className="border-t pt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
              <input
                type="email"
                value={form.testEmail}
                onChange={(event) => updateForm('testEmail', event.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2"
                placeholder="test@example.com"
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={sendDisabled}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
              >
                <Mail size={16} />
                {testSending ? 'Sending test...' : 'Send test'}
              </button>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <label className="text-sm text-amber-900">
                <input
                  type="checkbox"
                  checked={confirmSend}
                  onChange={(event) => setConfirmSend(event.target.checked)}
                  className="mr-2 rounded border-amber-300 text-amber-700"
                />
                I confirm this update should be sent to {selectedAudience?.label || 'all signed-up users'}, excluding the emails listed above.
              </label>
            </div>

            <button
              type="button"
              onClick={sendCampaign}
              disabled={sendDisabled || !confirmSend}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Send size={16} />
              {campaignSending ? 'Sending update...' : 'Send update'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">Audience</h3>
                <p className="text-sm text-gray-500">{selectedAudience?.label}</p>
              </div>
              <Users size={22} className="text-blue-600" />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Will send to</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {preview ? formatNumber(preview.uniqueRecipients) : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Source records</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {preview ? formatNumber(preview.sourceTotal) : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Excluded</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {preview ? formatNumber(preview.excludedRecipients) : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Exclude not found</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {preview ? formatNumber(preview.unmatchedExcludedEmails) : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">Duplicates</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {preview ? formatNumber(preview.duplicateEmails) : '-'}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">No email</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {preview ? formatNumber(preview.skippedMissingEmail) : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h3 className="font-semibold text-gray-900">Recent Sends</h3>
            <div className="mt-4 space-y-3">
              {campaigns.length === 0 && (
                <p className="text-sm text-gray-500">No update campaigns sent yet.</p>
              )}
              {campaigns.map((campaign) => {
                const statusClass = STATUS_STYLES[campaign.status] || 'bg-gray-50 text-gray-700 border-gray-200';
                const StatusIcon = campaign.status === 'failed' || campaign.status === 'partial_failed'
                  ? XCircle
                  : CheckCircle2;

                return (
                  <div key={campaign.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-gray-900">{campaign.title || campaign.subject}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {campaign.audienceLabel || campaign.audience} • {formatTimestamp(campaign.createdAt)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${statusClass}`}>
                        <StatusIcon size={12} />
                        {getStatusLabel(campaign.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <span>Recipients: {formatNumber(campaign.recipientCount)}</span>
                      <span>Sent: {formatNumber(campaign.sentCount)}</span>
                      <span>Failed: {formatNumber(campaign.failedCount)}</span>
                      <span>Excluded: {formatNumber(campaign.excludedRecipients)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
