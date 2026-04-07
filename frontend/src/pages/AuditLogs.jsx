import { useState, useEffect } from 'react';
import {
  Upload,
  CheckCircle,
  Stack,
  Download,
  Plus,
  ArrowsClockwise,
  Clock
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { getAuditLogs } from '../lib/api';
import { toast } from 'sonner';

const ActionIcon = ({ action }) => {
  const icons = {
    upload: Upload,
    approve: CheckCircle,
    bulk_approve: Stack,
    override: ArrowsClockwise,
    add_synonym: Plus,
    export: Download,
  };
  
  const Icon = icons[action] || Clock;
  
  const colors = {
    upload: 'bg-sky-100 text-sky-600',
    approve: 'bg-emerald-100 text-emerald-600',
    bulk_approve: 'bg-emerald-100 text-emerald-600',
    override: 'bg-amber-100 text-amber-600',
    add_synonym: 'bg-purple-100 text-purple-600',
    export: 'bg-slate-100 text-slate-600',
  };
  
  return (
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[action] || 'bg-slate-100 text-slate-600'}`}>
      <Icon size={20} weight="duotone" />
    </div>
  );
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatAction = (action) => {
  const labels = {
    upload: 'File Uploaded',
    approve: 'Mapping Approved',
    bulk_approve: 'Bulk Approval',
    override: 'Mapping Overridden',
    add_synonym: 'Synonym Added',
    export: 'Batch Exported',
  };
  return labels[action] || action;
};

const getActionDescription = (log) => {
  const { action, details } = log;
  
  switch (action) {
    case 'upload':
      return `Uploaded "${details.filename}" with ${details.unique_values} unique values`;
    case 'approve':
    case 'override':
      return `Mapped "${details.vendor_value}" to ${details.final_standard}`;
    case 'bulk_approve':
      return `Approved ${details.count} mappings`;
    case 'add_synonym':
      return `Added "${details.source_value}" → ${details.standard_code}`;
    case 'export':
      return `Exported "${details.filename}" (${details.rows} rows)`;
    default:
      return JSON.stringify(details);
  }
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const response = await getAuditLogs(page, 50, actionFilter || null);
        setLogs(response.data.logs);
        setPagination({
          total: response.data.total,
          pages: response.data.pages
        });
      } catch (error) {
        toast.error('Failed to load audit logs');
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [page, actionFilter]);

  return (
    <div className="p-8" data-testid="audit-logs-page">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
            <p className="text-slate-500 mt-1">Track all mapping activities and changes</p>
          </div>
          
          <Select value={actionFilter || "all"} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]" data-testid="action-filter">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="upload">Uploads</SelectItem>
              <SelectItem value="approve">Approvals</SelectItem>
              <SelectItem value="bulk_approve">Bulk Approvals</SelectItem>
              <SelectItem value="override">Overrides</SelectItem>
              <SelectItem value="add_synonym">Synonyms Added</SelectItem>
              <SelectItem value="export">Exports</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Clock size={32} weight="duotone" className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">No activity yet</h2>
            <p className="text-slate-500 mt-2">Activities will appear here as you use the tool</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="divide-y divide-slate-100">
              {logs.map((log, idx) => (
                <div
                  key={log.id}
                  className="p-4 hover:bg-slate-50 transition-colors"
                  data-testid={`audit-log-${log.id}`}
                >
                  <div className="flex items-start gap-4">
                    <ActionIcon action={log.action} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-slate-900">
                            {formatAction(log.action)}
                          </p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {getActionDescription(log)}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400 whitespace-nowrap ml-4">
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="text-slate-400">
                          by <span className="text-slate-600">{log.user}</span>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-400">
                          {log.entity_type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Page {page} of {pagination.pages} ({pagination.total} total)
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="audit-prev-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                data-testid="audit-next-page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
