import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChartBar, 
  CheckCircle, 
  Warning, 
  XCircle,
  ArrowRight,
  Upload,
  Database
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { getDashboardStats, getBatches } from '../lib/api';
import { toast } from 'sonner';

const KPICard = ({ title, value, icon: Icon, color, subtext }) => {
  const colorClasses = {
    blue: 'bg-sky-50 text-sky-600 border-sky-200',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    red: 'bg-rose-50 text-rose-600 border-rose-200',
  };

  const iconBg = {
    blue: 'bg-sky-100',
    green: 'bg-emerald-100',
    amber: 'bg-amber-100',
    red: 'bg-rose-100',
  };

  return (
    <div className="kpi-card" data-testid={`kpi-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value.toLocaleString()}</p>
          {subtext && <p className="text-sm text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${iconBg[color]}`}>
          <Icon size={24} weight="duotone" className={colorClasses[color].split(' ')[1]} />
        </div>
      </div>
    </div>
  );
};

const RecentBatchCard = ({ batch, onClick }) => {
  const total = batch.auto_mapped + batch.needs_review + batch.unmapped;
  const autoPercent = total > 0 ? Math.round((batch.auto_mapped / total) * 100) : 0;
  
  return (
    <div 
      className="p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
      data-testid={`recent-batch-${batch.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">{batch.filename}</p>
          <p className="text-sm text-slate-500 mt-0.5">
            {batch.unique_values} unique values
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <span className={`status-badge ${batch.status === 'completed' ? 'status-auto' : 'status-review'}`}>
            {batch.status}
          </span>
        </div>
      </div>
      
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Auto-mapped</span>
          <span>{autoPercent}%</span>
        </div>
        <div className="confidence-bar">
          <div 
            className={`confidence-bar-fill ${autoPercent >= 80 ? 'high' : autoPercent >= 50 ? 'medium' : 'low'}`}
            style={{ width: `${autoPercent}%` }}
          />
        </div>
      </div>
      
      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className="text-emerald-600">{batch.auto_mapped} auto</span>
        <span className="text-amber-600">{batch.needs_review} review</span>
        <span className="text-rose-600">{batch.unmapped} unmapped</span>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, batchesRes] = await Promise.all([
          getDashboardStats(),
          getBatches(1, 5)
        ]);
        setStats(statsRes.data);
        setRecentBatches(batchesRes.data.batches);
      } catch (error) {
        toast.error('Failed to load dashboard data');
        console.error(error);
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

  return (
    <div className="p-8" data-testid="dashboard-page">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Overview of your mapping activities</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Total Values"
            value={stats?.total_values || 0}
            icon={ChartBar}
            color="blue"
            subtext={`${stats?.total_batches || 0} batches`}
          />
          <KPICard
            title="Auto-Mapped"
            value={stats?.auto_mapped || 0}
            icon={CheckCircle}
            color="green"
            subtext={hasData ? `${Math.round((stats.auto_mapped / stats.total_values) * 100)}% success` : '0% success'}
          />
          <KPICard
            title="Needs Review"
            value={stats?.needs_review || 0}
            icon={Warning}
            color="amber"
            subtext="Requires attention"
          />
          <KPICard
            title="Unmapped"
            value={stats?.unmapped || 0}
            icon={XCircle}
            color="red"
            subtext="No match found"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Batches */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Recent Batches</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/batches')}
                data-testid="view-all-batches-btn"
              >
                View all
                <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
            
            {recentBatches.length > 0 ? (
              <div className="space-y-3">
                {recentBatches.map((batch) => (
                  <RecentBatchCard
                    key={batch.id}
                    batch={batch}
                    onClick={() => navigate(`/review/${batch.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state bg-white rounded-xl border border-slate-200">
                <Database size={48} weight="duotone" className="text-slate-300 mb-4" />
                <p className="text-slate-600 font-medium">No batches yet</p>
                <p className="text-slate-400 text-sm mt-1">Upload a file to get started</p>
                <Button
                  className="mt-4"
                  onClick={() => navigate('/upload')}
                  data-testid="dashboard-upload-btn"
                >
                  <Upload size={16} className="mr-2" />
                  Upload File
                </Button>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Button
                className="w-full justify-start"
                onClick={() => navigate('/upload')}
                data-testid="quick-upload-btn"
              >
                <Upload size={18} className="mr-3" />
                Upload New File
              </Button>
              
              {stats?.needs_review > 0 && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-amber-200 text-amber-700 hover:bg-amber-50"
                  onClick={() => navigate('/review')}
                  data-testid="quick-review-btn"
                >
                  <Warning size={18} className="mr-3" />
                  Review {stats.needs_review} Pending
                </Button>
              )}
              
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate('/synonyms')}
                data-testid="quick-synonyms-btn"
              >
                <Database size={18} className="mr-3" />
                Manage Synonyms ({stats?.total_synonyms || 0})
              </Button>
            </div>

            {/* Stats Summary */}
            <div className="mt-6 p-4 bg-slate-50 rounded-xl">
              <h3 className="font-medium text-slate-900 text-sm mb-3">System Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Batches</span>
                  <span className="font-medium text-slate-900">{stats?.total_batches || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Mappings</span>
                  <span className="font-medium text-slate-900">{stats?.total_mappings || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Synonyms</span>
                  <span className="font-medium text-slate-900">{stats?.total_synonyms || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
