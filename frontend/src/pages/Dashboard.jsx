import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChartBar, 
  CheckCircle, 
  Warning, 
  XCircle,
  ArrowRight,
  Upload,
  Database,
  Lightning,
  Brain,
  Intersect,
  TextAa,
  Flask,
  BookOpen
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { getDashboardStats, getBatches, getAnalytics } from '../lib/api';
import { toast } from 'sonner';

const KPICard = ({ title, value, icon: Icon, color, subtext }) => {
  const iconBg = {
    blue: 'bg-sky-100', green: 'bg-emerald-100', amber: 'bg-amber-100', red: 'bg-rose-100', purple: 'bg-purple-100',
  };
  const iconColor = {
    blue: 'text-sky-600', green: 'text-emerald-600', amber: 'text-amber-600', red: 'text-rose-600', purple: 'text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid={`kpi-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {subtext && <p className="text-sm text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${iconBg[color]}`}>
          <Icon size={24} weight="duotone" className={iconColor[color]} />
        </div>
      </div>
    </div>
  );
};

const DonutChart = ({ data, total }) => {
  if (total === 0) return null;
  
  const segments = [
    { key: 'auto', label: 'Auto-Mapped', value: data.auto || 0, color: '#10b981' },
    { key: 'approved', label: 'Approved', value: data.approved || 0, color: '#06b6d4' },
    { key: 'needs_review', label: 'Needs Review', value: data.needs_review || 0, color: '#f59e0b' },
    { key: 'unmapped', label: 'Unmapped', value: data.unmapped || 0, color: '#ef4444' },
  ].filter(s => s.value > 0);

  let cumulative = 0;
  const gradientParts = segments.map(s => {
    const start = cumulative;
    const end = cumulative + (s.value / total) * 100;
    cumulative = end;
    return `${s.color} ${start}% ${end}%`;
  });

  return (
    <div className="flex items-center gap-6" data-testid="donut-chart">
      <div
        className="w-32 h-32 rounded-full flex-shrink-0"
        style={{
          background: `conic-gradient(${gradientParts.join(', ')})`,
          WebkitMask: 'radial-gradient(farthest-side, transparent 60%, #000 61%)',
          mask: 'radial-gradient(farthest-side, transparent 60%, #000 61%)',
        }}
      />
      <div className="space-y-2">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-sm text-slate-600">{s.label}</span>
            <span className="text-sm font-semibold text-slate-900">{s.value}</span>
            <span className="text-xs text-slate-400">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BarChart = ({ data }) => {
  const items = [
    { key: 'exact', label: 'Exact', value: data.exact || 0, color: 'bg-sky-500' },
    { key: 'normalized', label: 'Normalized', value: data.normalized || 0, color: 'bg-teal-500' },
    { key: 'synonym', label: 'Synonym', value: data.synonym || 0, color: 'bg-cyan-500' },
    { key: 'keyword', label: 'Keyword', value: data.keyword || 0, color: 'bg-amber-500' },
    { key: 'fuzzy', label: 'Fuzzy', value: data.fuzzy || 0, color: 'bg-purple-500' },
    { key: 'ai', label: 'AI', value: data.ai || 0, color: 'bg-pink-500' },
    { key: 'no_match', label: 'No Match', value: data.no_match || 0, color: 'bg-slate-400' },
  ].filter(i => i.value > 0);

  const max = Math.max(...items.map(i => i.value), 1);

  return (
    <div className="space-y-2" data-testid="match-type-chart">
      {items.map(item => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20 text-right">{item.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full rounded-full ${item.color} transition-all duration-500`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-slate-700 w-10">{item.value}</span>
        </div>
      ))}
    </div>
  );
};

const ConfidenceHistogram = ({ data }) => {
  if (!data || data.length === 0) return <p className="text-sm text-slate-400">No data yet</p>;
  
  const labels = ['<50%', '50-60%', '60-70%', '70-75%', '75-80%', '80-85%', '85-90%', '90-95%', '95-100%'];
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-28" data-testid="confidence-histogram">
      {data.map((bucket, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[10px] text-slate-500 font-medium">{bucket.count}</span>
          <div
            className="w-full rounded-t bg-sky-400 transition-all duration-500"
            style={{ height: `${(bucket.count / max) * 80}px`, minHeight: bucket.count > 0 ? '4px' : '0' }}
          />
          <span className="text-[9px] text-slate-400 leading-tight text-center">{labels[i] || ''}</span>
        </div>
      ))}
    </div>
  );
};

const BatchPerfRow = ({ batch, navigate }) => {
  const total = (batch.auto_mapped || 0) + (batch.needs_review || 0) + (batch.unmapped || 0);
  const autoRate = total > 0 ? Math.round((batch.auto_mapped / total) * 100) : 0;

  return (
    <tr
      className="hover:bg-slate-50 cursor-pointer transition-colors"
      onClick={() => navigate(`/review/${batch.id}`)}
      data-testid={`batch-row-${batch.id}`}
    >
      <td className="px-4 py-2.5 text-sm font-medium text-slate-900 max-w-[180px] truncate">{batch.filename}</td>
      <td className="px-4 py-2.5 text-sm text-slate-600">{batch.unique_values || 0}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="w-16 bg-slate-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${autoRate >= 80 ? 'bg-emerald-500' : autoRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${autoRate}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-600">{autoRate}%</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-xs text-emerald-600 font-medium">{batch.auto_mapped}</td>
      <td className="px-4 py-2.5 text-xs text-amber-600 font-medium">{batch.needs_review}</td>
      <td className="px-4 py-2.5 text-xs text-rose-600 font-medium">{batch.unmapped}</td>
    </tr>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, batchesRes, analyticsRes] = await Promise.all([
          getDashboardStats(),
          getBatches(1, 5),
          getAnalytics().catch(() => ({ data: null }))
        ]);
        setStats(statsRes.data);
        setRecentBatches(batchesRes.data.batches);
        setAnalytics(analyticsRes.data);
      } catch (error) {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="spinner" />
      </div>
    );
  }

  const hasData = stats && stats.total_values > 0;
  const statusDist = analytics?.status_distribution || {};
  const matchTypeDist = analytics?.match_type_distribution || {};
  const totalMappings = Object.values(statusDist).reduce((a, b) => a + b, 0);

  return (
    <div className="p-8" data-testid="dashboard-page">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">Overview of your mapping activities</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/ingest')} data-testid="new-ingestion-btn">
              <Upload size={16} className="mr-1.5" /> New Ingestion
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/sandbox')} data-testid="sandbox-btn">
              <Flask size={16} className="mr-1.5" /> Test Sandbox
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <KPICard title="Total Values" value={stats?.total_values || 0} icon={ChartBar} color="blue" subtext={`${stats?.total_batches || 0} batches`} />
          <KPICard title="Auto-Mapped" value={stats?.auto_mapped || 0} icon={CheckCircle} color="green"
            subtext={hasData ? `${Math.round((stats.auto_mapped / stats.total_values) * 100)}% success` : '—'} />
          <KPICard title="Needs Review" value={stats?.needs_review || 0} icon={Warning} color="amber" subtext="Requires attention" />
          <KPICard title="Unmapped" value={stats?.unmapped || 0} icon={XCircle} color="red" subtext="No match found" />
          <KPICard title="Standards" value={analytics?.totals?.standards || 0} icon={BookOpen} color="purple"
            subtext={`${analytics?.totals?.synonyms || 0} synonyms`} />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Status Donut */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Status Breakdown</h3>
            {totalMappings > 0 ? (
              <DonutChart data={statusDist} total={totalMappings} />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No mapping data yet</p>
            )}
          </div>

          {/* Match Type Bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Match Type Distribution</h3>
            {Object.keys(matchTypeDist).length > 0 ? (
              <BarChart data={matchTypeDist} />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No matching data yet</p>
            )}
          </div>

          {/* Confidence Histogram */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Confidence Distribution</h3>
            <ConfidenceHistogram data={analytics?.confidence_distribution || []} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Batch Performance Table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Batch Performance</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate('/batches')} data-testid="view-all-batches-btn">
                View all <ArrowRight size={14} className="ml-1" />
              </Button>
            </div>
            {recentBatches.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Batch</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Values</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Auto Rate</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Auto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Review</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Unmapped</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBatches.map(batch => (
                    <BatchPerfRow key={batch.id} batch={batch} navigate={navigate} />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-sm text-slate-400">No batches yet</div>
            )}
          </div>

          {/* Right Column: Top Unmapped + Quick Stats */}
          <div className="space-y-6">
            {/* Top Unmapped */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Top Unmapped Values</h3>
              {analytics?.top_unmapped?.length > 0 ? (
                <div className="space-y-2">
                  {analytics.top_unmapped.slice(0, 6).map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1">
                      <span className="text-sm text-slate-700 truncate max-w-[180px]" title={item.vendor_value}>
                        {item.vendor_value}
                      </span>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        x{item.occurrence_count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No unmapped values</p>
              )}
            </div>

            {/* Quick Engine Stats */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Engine Stats</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-sky-500" />
                    <span className="text-sm text-slate-600">Standards</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{analytics?.totals?.standards || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database size={16} className="text-teal-500" />
                    <span className="text-sm text-slate-600">Synonyms</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{analytics?.totals?.synonyms || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightning size={16} className="text-amber-500" />
                    <span className="text-sm text-slate-600">Keyword Rules</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{analytics?.totals?.keyword_rules || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
