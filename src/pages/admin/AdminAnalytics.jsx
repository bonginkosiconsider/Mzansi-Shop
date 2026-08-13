import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { BarChart3, Eye, Globe, Mail, MapPin, MonitorSmartphone, Users, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { db } from '../../firebase';
import { buildVisitorRows, formatDateTime, getRangeStartDate } from '../../utils/visitorAnalytics';

const RANGE_OPTIONS = [7, 14, 30];

const FUNNEL_STAGES = [
  { key: 'landing', label: 'Landing' },
  { key: 'product', label: 'Product' },
  { key: 'cart', label: 'Cart' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'purchase', label: 'Purchase' }
];

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatDayLabel = (dayKey) => {
  if (!dayKey) return '';
  const date = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dayKey;
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
};

const readableError = (error) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '').split('\n')[0];

  if (code.includes('permission-denied')) {
    return 'Permission denied loading analytics. Deploy latest Firestore rules and confirm this account is admin.';
  }
  if (code.includes('failed-precondition') || /index/i.test(message)) {
    return 'Analytics query requires a Firestore index/config update. Deploy rules/indexes and retry.';
  }
  return message ? `Failed to load analytics data: ${message}` : 'Failed to load analytics data.';
};

function StatCard({ icon: Icon, title, value, subtitle, caption, onClick }) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'div';
  const actionProps = interactive ? { type: 'button', onClick } : {};

  return (
    <Tag
      {...actionProps}
      className={`bg-white p-5 rounded-xl shadow-sm border transition ${
        interactive ? 'text-left hover:border-blue-200 hover:shadow-md cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{title}</p>
        <Icon size={18} className="text-blue-600" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {caption && <p className="text-xs text-blue-700 mt-2">{caption}</p>}
    </Tag>
  );
}

export default function AdminAnalytics() {
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [series, setSeries] = useState([]);
  const [topPages, setTopPages] = useState([]);
  const [topLocations, setTopLocations] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [visitorExplorerReady, setVisitorExplorerReady] = useState(false);
  const [visitorExplorerOpen, setVisitorExplorerOpen] = useState(false);
  const [selectedVisitorKey, setSelectedVisitorKey] = useState(null);
  const [visitorSearch, setVisitorSearch] = useState('');
  const [totals, setTotals] = useState({
    pageViews: 0,
    uniqueVisitors: 0,
    sessions: 0,
    conversionRate: 0
  });

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      setError('');
      setWarning('');

      try {
        const daySnap = await getDocs(collection(db, 'analyticsDaily'));
        const allDayDocs = daySnap.docs.map((docSnap) => ({
          id: docSnap.id,
          ref: docSnap.ref,
          ...docSnap.data(),
          dayKey: docSnap.data()?.dayKey || docSnap.id
        }));
        const dayDocs = allDayDocs
          .sort((a, b) => String(b.dayKey).localeCompare(String(a.dayKey)))
          .slice(0, rangeDays);
        const sortedDays = [...dayDocs].sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
        const chartSeries = sortedDays.map((day) => ({
          dayKey: day.dayKey,
          label: formatDayLabel(day.dayKey),
          pageViews: toNumber(day.pageViews),
          uniqueVisitors: toNumber(day.uniqueVisitors),
          sessions: toNumber(day.sessions)
        }));

        const pageMap = new Map();
        const locationMap = new Map();
        const funnelMap = new Map();
        let detailReadFailed = false;

        await Promise.all(dayDocs.map(async (day) => {
          try {
            const [pagesSnap, locationsSnap, funnelSnap] = await Promise.all([
              getDocs(collection(day.ref, 'pages')),
              getDocs(collection(day.ref, 'locations')),
              getDocs(collection(day.ref, 'funnels'))
            ]);

            pagesSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              pageMap.set(data.path || '/', (pageMap.get(data.path || '/') || 0) + toNumber(data.views));
            });
            locationsSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              locationMap.set(data.label || 'Unknown', (locationMap.get(data.label || 'Unknown') || 0) + toNumber(data.views));
            });
            funnelSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              funnelMap.set(data.stage || docSnap.id, (funnelMap.get(data.stage || docSnap.id) || 0) + toNumber(data.views));
            });
          } catch (detailError) {
            detailReadFailed = true;
            console.warn('Analytics detail read failed for day', day.dayKey, detailError);
          }
        }));

        const totalPageViews = chartSeries.reduce((sum, row) => sum + row.pageViews, 0);
        const summaryUniqueVisitors = chartSeries.reduce((sum, row) => sum + row.uniqueVisitors, 0);
        const summarySessions = chartSeries.reduce((sum, row) => sum + row.sessions, 0);

        let visitorReadFailed = false;
        let visitorRows = [];
        let uniqueVisitorsTotal = summaryUniqueVisitors;
        let sessionsTotal = summarySessions;

        try {
          const rangeStart = getRangeStartDate(rangeDays);
          const eventsSnap = await getDocs(query(
            collection(db, 'analyticsEvents'),
            where('createdAt', '>=', Timestamp.fromDate(rangeStart)),
            orderBy('createdAt', 'desc')
          ));
          const events = eventsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          const userIds = Array.from(new Set(events.map((event) => event.userId).filter(Boolean)));
          const customerEntries = await Promise.all(userIds.map(async (userId) => {
            try {
              const customerSnap = await getDoc(doc(db, 'customers', userId));
              return [userId, customerSnap.exists() ? customerSnap.data() : null];
            } catch (customerError) {
              console.warn('Failed to read customer profile for visitor', userId, customerError);
              return [userId, null];
            }
          }));
          const customerMap = new Map(customerEntries.filter(([, value]) => Boolean(value)));
          visitorRows = buildVisitorRows(events, customerMap);
          uniqueVisitorsTotal = visitorRows.length;
          const trackedSessions = new Set(events.map((event) => event.sessionKey).filter(Boolean)).size;
          sessionsTotal = trackedSessions || summarySessions;
        } catch (visitorError) {
          visitorReadFailed = true;
          console.warn('Visitor detail read failed', visitorError);
        }

        const pages = Array.from(pageMap.entries()).map(([path, views]) => ({ path, views }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);
        const locations = Array.from(locationMap.entries()).map(([label, views]) => ({ label, views }))
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);
        const funnelRows = FUNNEL_STAGES.map((stage) => ({
          key: stage.key,
          stage: stage.label,
          views: funnelMap.get(stage.key) || 0
        }));
        const landingViews = funnelMap.get('landing') || uniqueVisitorsTotal;
        const purchaseViews = funnelMap.get('purchase') || 0;
        const conversionRate = landingViews > 0 ? (purchaseViews / landingViews) * 100 : 0;
        const warnings = [];
        if (detailReadFailed) warnings.push('Detailed page, location, or funnel breakdown is unavailable for some days.');
        if (visitorReadFailed) warnings.push('Unique visitor drill-down is unavailable right now.');

        if (!cancelled) {
          setSeries(chartSeries);
          setTopPages(pages);
          setTopLocations(locations);
          setFunnel(funnelRows);
          setVisitors(visitorRows);
          setVisitorExplorerReady(!visitorReadFailed);
          setTotals({
            pageViews: totalPageViews,
            uniqueVisitors: uniqueVisitorsTotal,
            sessions: sessionsTotal,
            conversionRate
          });
          setWarning(warnings.join(' '));
        }
      } catch (loadError) {
        console.error('Failed to load analytics', loadError);
        if (!cancelled) {
          setSeries([]);
          setTopPages([]);
          setTopLocations([]);
          setFunnel([]);
          setVisitors([]);
          setVisitorExplorerReady(false);
          setTotals({ pageViews: 0, uniqueVisitors: 0, sessions: 0, conversionRate: 0 });
          setError(readableError(loadError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [rangeDays]);

  const maxListDenominator = useMemo(() => Math.max(totals.pageViews, 1), [totals.pageViews]);
  const contactableVisitors = useMemo(
    () => visitors.filter((visitor) => visitor.reachable).length,
    [visitors]
  );
  const filteredVisitors = useMemo(() => {
    const needle = visitorSearch.trim().toLowerCase();
    if (!needle) return visitors;

    return visitors.filter((visitor) => {
      const haystack = [
        visitor.label,
        visitor.displayName,
        visitor.contactEmail,
        visitor.visitorKey,
        visitor.deviceLabel,
        visitor.browserLabel,
        visitor.osLabel,
        visitor.topLocationLabel,
        visitor.topSource,
        ...visitor.pageHistory.map((page) => page.path)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [visitorSearch, visitors]);
  const selectedVisitor = useMemo(
    () => filteredVisitors.find((visitor) => visitor.visitorKey === selectedVisitorKey) || null,
    [filteredVisitors, selectedVisitorKey]
  );

  useEffect(() => {
    if (!visitorExplorerOpen) return;
    if (filteredVisitors.length === 0) {
      setSelectedVisitorKey(null);
      return;
    }
    if (!filteredVisitors.some((visitor) => visitor.visitorKey === selectedVisitorKey)) {
      setSelectedVisitorKey(filteredVisitors[0].visitorKey);
    }
  }, [filteredVisitors, selectedVisitorKey, visitorExplorerOpen]);

  const openVisitorExplorer = () => {
    if (!visitorExplorerReady) return;
    setVisitorExplorerOpen(true);
    setSelectedVisitorKey((current) => current || visitors[0]?.visitorKey || null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Visitor Analytics</h2>
          <p className="text-sm text-gray-500">Traffic, locations, visitor journeys, and conversion funnel.</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`px-3 py-2 rounded-lg text-sm border ${
                rangeDays === days
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {warning && <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 text-yellow-800 px-4 py-3 text-sm">{warning}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Eye} title="Page Views" value={totals.pageViews.toLocaleString('en-ZA')} subtitle={`Last ${rangeDays} days`} />
        <StatCard
          icon={Users}
          title="Unique Visitors"
          value={totals.uniqueVisitors.toLocaleString('en-ZA')}
          subtitle={`Last ${rangeDays} days`}
          caption={visitorExplorerReady ? `${contactableVisitors.toLocaleString('en-ZA')} visitors have contact email` : 'Visitor drill-down unavailable'}
          onClick={visitorExplorerReady ? openVisitorExplorer : undefined}
        />
        <StatCard icon={BarChart3} title="Sessions" value={totals.sessions.toLocaleString('en-ZA')} subtitle={`Last ${rangeDays} days`} />
        <StatCard icon={Globe} title="Checkout Conversion" value={`${totals.conversionRate.toFixed(1)}%`} subtitle="Landing to purchase" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm border p-4 xl:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Visitors and Page Views</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="uniqueVisitors" stroke="#2563eb" strokeWidth={2} />
                <Line type="monotone" dataKey="pageViews" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Funnel</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="views" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Pages</h3>
          <div className="space-y-3">
            {topPages.map((row) => (
              <div key={row.path} className="flex items-center justify-between border-b pb-2 last:border-0">
                <p className="text-sm text-gray-700 truncate pr-3">{row.path}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{row.views.toLocaleString('en-ZA')}</p>
                  <p className="text-xs text-gray-500">{((row.views / maxListDenominator) * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {topPages.length === 0 && <p className="text-sm text-gray-500">No page data yet.</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Locations</h3>
          <div className="space-y-3">
            {topLocations.map((row) => (
              <div key={row.label} className="flex items-center justify-between border-b pb-2 last:border-0">
                <p className="text-sm text-gray-700 truncate pr-3">{row.label}</p>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{row.views.toLocaleString('en-ZA')}</p>
                  <p className="text-xs text-gray-500">{((row.views / maxListDenominator) * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {topLocations.length === 0 && <p className="text-sm text-gray-500">No location data yet.</p>}
          </div>
        </div>
      </div>

      {visitorExplorerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Unique Visitors</h3>
                <p className="text-sm text-gray-500">
                  Last {rangeDays} days. Click a visitor to inspect pages, device, location, and contact info.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={visitorSearch}
                  onChange={(event) => setVisitorSearch(event.target.value)}
                  placeholder="Search email, device, location, page..."
                  className="w-full lg:w-80 px-3 py-2 border rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => setVisitorExplorerOpen(false)}
                  className="p-2 rounded-lg border text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className="border-r overflow-y-auto">
                <div className="px-4 py-3 border-b bg-gray-50 text-sm text-gray-600">
                  {filteredVisitors.length.toLocaleString('en-ZA')} visitor
                  {filteredVisitors.length === 1 ? '' : 's'}
                </div>

                {filteredVisitors.length === 0 ? (
                  <div className="p-6 text-sm text-gray-500">No visitors match the current search.</div>
                ) : (
                  filteredVisitors.map((visitor) => {
                    const active = visitor.visitorKey === selectedVisitorKey;
                    return (
                      <button
                        key={visitor.visitorKey}
                        type="button"
                        onClick={() => setSelectedVisitorKey(visitor.visitorKey)}
                        className={`w-full text-left px-4 py-4 border-b transition ${
                          active ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{visitor.label}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {visitor.contactEmail || visitor.visitorKey}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                              visitor.reachable
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {visitor.reachable ? 'Email ready' : 'Anonymous'}
                          </span>
                        </div>

                        <div className="mt-3 space-y-1 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <MonitorSmartphone size={13} className="text-gray-400" />
                            <span>{visitor.deviceLabel}</span>
                            <span className="text-gray-400">•</span>
                            <span>{visitor.browserLabel}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin size={13} className="text-gray-400" />
                            <span className="truncate">{visitor.topLocationLabel}</span>
                          </div>
                          <p>
                            {visitor.totalPageViews.toLocaleString('en-ZA')} page views
                            {' '}•{' '}
                            {visitor.uniquePageCount.toLocaleString('en-ZA')} pages
                          </p>
                          <p>Last seen {formatDateTime(visitor.lastSeenAt)}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="overflow-y-auto">
                {!selectedVisitor ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500 p-8">
                    Select a visitor to inspect the pages they viewed.
                  </div>
                ) : (
                  <div className="p-6 space-y-6">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                      <div>
                        <h4 className="text-2xl font-semibold text-gray-900">{selectedVisitor.label}</h4>
                        <p className="text-sm text-gray-500">Visitor ID: {selectedVisitor.visitorKey}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          First seen {formatDateTime(selectedVisitor.firstSeenAt)}
                          {' '}•{' '}
                          Last seen {formatDateTime(selectedVisitor.lastSeenAt)}
                        </p>
                      </div>

                      {selectedVisitor.contactEmail ? (
                        <a
                          href={`mailto:${selectedVisitor.contactEmail}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm"
                        >
                          <Mail size={16} />
                          Email visitor
                        </a>
                      ) : (
                        <div className="rounded-lg border px-4 py-2 text-sm text-gray-500">
                          No direct contact details stored for this visitor.
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Page Views</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {selectedVisitor.totalPageViews.toLocaleString('en-ZA')}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Unique Pages</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {selectedVisitor.uniquePageCount.toLocaleString('en-ZA')}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Sessions</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {selectedVisitor.sessionCount.toLocaleString('en-ZA')}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <p className="text-xs uppercase tracking-wide text-gray-500">Top Source</p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">{selectedVisitor.topSource}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="bg-white rounded-xl border p-5">
                        <h5 className="text-lg font-semibold text-gray-900 mb-4">Visitor Details</h5>
                        <div className="space-y-3 text-sm text-gray-700">
                          <div className="flex items-start gap-3">
                            <MonitorSmartphone size={16} className="text-gray-400 mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">{selectedVisitor.deviceLabel}</p>
                              <p>{selectedVisitor.deviceCategory} • {selectedVisitor.osLabel} • {selectedVisitor.browserLabel}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <MapPin size={16} className="text-gray-400 mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">{selectedVisitor.topLocationLabel}</p>
                              <p className="text-gray-500">Approximate location from IP geolocation headers.</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Mail size={16} className="text-gray-400 mt-0.5" />
                            <div>
                              <p className="font-medium text-gray-900">
                                {selectedVisitor.contactEmail || 'No email available'}
                              </p>
                              <p className="text-gray-500">
                                {selectedVisitor.contactEmail
                                  ? 'This visitor can be contacted directly by email.'
                                  : 'Anonymous visitors cannot be contacted unless they sign in or leave contact details elsewhere.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border p-5">
                        <h5 className="text-lg font-semibold text-gray-900 mb-4">Location History</h5>
                        <div className="space-y-3">
                          {selectedVisitor.locationHistory.map((location) => (
                            <div key={location.label} className="flex items-center justify-between border-b pb-2 last:border-0">
                              <div className="min-w-0 pr-4">
                                <p className="text-sm font-medium text-gray-900 truncate">{location.label}</p>
                                <p className="text-xs text-gray-500">Last seen {formatDateTime(location.lastSeenAt)}</p>
                              </div>
                              <p className="text-sm font-semibold text-gray-900">
                                {location.views.toLocaleString('en-ZA')}
                              </p>
                            </div>
                          ))}
                          {selectedVisitor.locationHistory.length === 0 && (
                            <p className="text-sm text-gray-500">No location history available.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border p-5">
                      <h5 className="text-lg font-semibold text-gray-900 mb-4">Pages Visited</h5>
                      <div className="space-y-3">
                        {selectedVisitor.pageHistory.map((page) => (
                          <div key={page.path} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b pb-3 last:border-0">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{page.path}</p>
                              <p className="text-xs text-gray-500 truncate">{page.title || 'No page title captured'}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                First seen {formatDateTime(page.firstSeenAt)}
                                {' '}•{' '}
                                Last seen {formatDateTime(page.lastSeenAt)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-semibold text-gray-900">
                                {page.views.toLocaleString('en-ZA')} views
                              </p>
                            </div>
                          </div>
                        ))}
                        {selectedVisitor.pageHistory.length === 0 && (
                          <p className="text-sm text-gray-500">No page history available.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
