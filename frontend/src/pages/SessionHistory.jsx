import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  Clock,
  Trash,
  ArrowRight,
  Plus,
  CheckCircle,
  Spinner,
  Warning,
  File,
  DownloadSimple,
  UploadSimple
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import { getSessions, deleteSession, exportSession, importSession } from '../lib/api';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  draft: { label: 'Draft', class: 'bg-slate-100 text-slate-700 border-slate-200', icon: File },
  ready: { label: 'Ready', class: 'bg-sky-50 text-sky-700 border-sky-200', icon: Clock },
  processing: { label: 'Processing', class: 'bg-amber-50 text-amber-700 border-amber-200', icon: Spinner },
  completed: { label: 'Completed', class: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
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

const SessionCard = ({ session, onDelete, onResume, onExport }) => {
  const status = STATUS_CONFIG[session.status] || STATUS_CONFIG.draft;
  const StatusIcon = status.icon;
  const tableCount = session.tables?.length || 0;
  const columnCount = session.tables?.reduce((sum, t) => sum + (t.columns?.length || 0), 0) || 0;
  
  return (
    <div 
      className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all"
      data-testid={`session-card-${session.id}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <FolderOpen size={24} weight="duotone" className="text-sky-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{session.name}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {tableCount} {tableCount === 1 ? 'table' : 'tables'} • {columnCount} columns
            </p>
            {session.description && (
              <p className="text-xs text-slate-400 mt-1">{session.description}</p>
            )}
          </div>
        </div>
        
        <span className={`status-badge border ${status.class}`}>
          <StatusIcon size={12} className={`mr-1 ${session.status === 'processing' ? 'animate-spin' : ''}`} />
          {status.label}
        </span>
      </div>
      
      {/* Tables Preview */}
      {session.tables?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {session.tables.slice(0, 3).map((table, idx) => (
            <span 
              key={idx}
              className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs"
            >
              {table.table_name}
            </span>
          ))}
          {session.tables.length > 3 && (
            <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded text-xs">
              +{session.tables.length - 3} more
            </span>
          )}
        </div>
      )}
      
      <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-100">
        <p className="text-xs text-slate-400">
          Created {formatDate(session.created_at)}
        </p>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExport(session.id, session.name)}
            title="Export session"
            data-testid={`export-session-${session.id}`}
          >
            <DownloadSimple size={16} />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-50"
                data-testid={`delete-session-${session.id}`}
              >
                <Trash size={16} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{session.name}" and all its tables.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(session.id)}
                  className="bg-rose-600 hover:bg-rose-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {session.status !== 'completed' && (
            <Button
              size="sm"
              onClick={() => onResume(session)}
              data-testid={`resume-session-${session.id}`}
            >
              Resume
              <ArrowRight size={16} className="ml-1" />
            </Button>
          )}
          
          {session.status === 'completed' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResume(session)}
              data-testid={`view-session-${session.id}`}
            >
              View Details
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function SessionHistory() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await getSessions(page, 10);
      setSessions(response.data.sessions);
      setPagination({
        total: response.data.total,
        pages: response.data.pages
      });
    } catch (error) {
      toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [page]);

  const handleDelete = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      toast.success('Session deleted');
      fetchSessions();
    } catch (error) {
      toast.error('Failed to delete session');
    }
  };

  const handleResume = (session) => {
    navigate('/ingest', { state: { resumeSession: session } });
  };

  const handleExport = async (sessionId, sessionName) => {
    try {
      const response = await exportSession(sessionId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `session_${sessionName.replace(/\s+/g, '_')}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Session exported');
    } catch (error) {
      toast.error('Failed to export session');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      toast.error('Please select a JSON file');
      return;
    }
    
    setImporting(true);
    try {
      const response = await importSession(file);
      toast.success(`Imported: ${response.data.session.name} (${response.data.session.tables_count} tables)`);
      fetchSessions();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to import session');
    } finally {
      setImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="p-8" data-testid="session-history-page">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ingestion Sessions</h1>
            <p className="text-slate-500 mt-1">View and manage your data ingestion sessions</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              id="import-session"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById('import-session').click()}
              disabled={importing}
              data-testid="import-session-btn"
            >
              <UploadSimple size={18} className="mr-2" />
              {importing ? 'Importing...' : 'Import'}
            </Button>
            <Button onClick={() => navigate('/ingest')} data-testid="new-session-btn">
              <Plus size={18} className="mr-2" />
              New Session
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FolderOpen size={32} weight="duotone" className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">No sessions yet</h2>
            <p className="text-slate-500 mt-2">Create your first ingestion session to get started</p>
            <Button className="mt-6" onClick={() => navigate('/ingest')} data-testid="first-session-btn">
              <Plus size={18} className="mr-2" />
              New Session
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map(session => (
              <SessionCard
                key={session.id}
                session={session}
                onDelete={handleDelete}
                onResume={handleResume}
                onExport={handleExport}
              />
            ))}
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
                data-testid="sessions-prev-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                data-testid="sessions-next-page"
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
