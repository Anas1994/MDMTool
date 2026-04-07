import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileCsv,
  FileXls,
  CheckCircle,
  Clock,
  ArrowRight,
  Download,
  Trash
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { getBatches, exportBatch } from '../lib/api';
import { toast } from 'sonner';

const BatchCard = ({ batch, onReview, onExport }) => {
  const total = batch.auto_mapped + batch.needs_review + batch.unmapped;
  const autoPercent = total > 0 ? Math.round((batch.auto_mapped / total) * 100) : 0;
  const isExcel = batch.filename?.endsWith('.xlsx') || batch.filename?.endsWith('.xls');
  const FileIcon = isExcel ? FileXls : FileCsv;
  
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

  return (
    <div 
      className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-all"
      data-testid={`batch-card-${batch.id}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileIcon size={24} weight="duotone" className="text-slate-600" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 truncate">{batch.filename}</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Column: <span className="font-medium text-slate-700">{batch.column_name}</span>
              </p>
            </div>
            <span className={`status-badge flex-shrink-0 ${batch.status === 'completed' ? 'status-auto' : 'status-review'}`}>
              {batch.status === 'completed' ? (
                <><CheckCircle size={12} className="mr-1" />Completed</>
              ) : (
                <><Clock size={12} className="mr-1" />Processing</>
              )}
            </span>
          </div>
          
          <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Total Rows</p>
              <p className="font-semibold text-slate-900">{batch.total_values.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-500">Unique</p>
              <p className="font-semibold text-slate-900">{batch.unique_values.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-slate-500">Auto-mapped</p>
              <p className="font-semibold text-emerald-600">{batch.auto_mapped}</p>
            </div>
            <div>
              <p className="text-slate-500">Needs Review</p>
              <p className="font-semibold text-amber-600">{batch.needs_review}</p>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Mapping Progress</span>
              <span>{autoPercent}% auto-mapped</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full flex">
                <div 
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${(batch.auto_mapped / Math.max(total, 1)) * 100}%` }}
                />
                <div 
                  className="bg-amber-500 transition-all"
                  style={{ width: `${(batch.needs_review / Math.max(total, 1)) * 100}%` }}
                />
                <div 
                  className="bg-rose-500 transition-all"
                  style={{ width: `${(batch.unmapped / Math.max(total, 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {formatDate(batch.created_at)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onExport(batch.id); }}
                data-testid={`export-batch-${batch.id}`}
              >
                <Download size={16} className="mr-1" />
                Export
              </Button>
              <Button
                size="sm"
                onClick={() => onReview(batch.id)}
                data-testid={`review-batch-${batch.id}`}
              >
                Review
                <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function BatchHistory() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  useEffect(() => {
    const fetchBatches = async () => {
      setLoading(true);
      try {
        const response = await getBatches(page, 10);
        setBatches(response.data.batches);
        setPagination({
          total: response.data.total,
          pages: response.data.pages
        });
      } catch (error) {
        toast.error('Failed to load batches');
      } finally {
        setLoading(false);
      }
    };
    fetchBatches();
  }, [page]);

  const handleExport = async (batchId) => {
    try {
      const response = await exportBatch(batchId);
      const batch = batches.find(b => b.id === batchId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${batch?.filename || 'export'}_mapped.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded');
    } catch (error) {
      toast.error('Failed to export');
    }
  };

  return (
    <div className="p-8" data-testid="batch-history-page">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Batch History</h1>
            <p className="text-slate-500 mt-1">View and manage your uploaded batches</p>
          </div>
          <Button onClick={() => navigate('/upload')} data-testid="new-upload-btn">
            New Upload
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileCsv size={32} weight="duotone" className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">No batches yet</h2>
            <p className="text-slate-500 mt-2">Upload your first file to get started</p>
            <Button className="mt-6" onClick={() => navigate('/upload')} data-testid="first-upload-btn">
              Upload File
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map(batch => (
              <BatchCard
                key={batch.id}
                batch={batch}
                onReview={(id) => navigate(`/review/${id}`)}
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
                data-testid="batch-prev-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                data-testid="batch-next-page"
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
