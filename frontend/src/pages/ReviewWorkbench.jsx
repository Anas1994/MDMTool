import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Warning,
  XCircle,
  MagnifyingGlass,
  Funnel,
  Download,
  Check,
  Plus,
  ArrowLeft,
  CaretDown,
  X
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  getBatches,
  getBatch,
  getBatchResults,
  getStandards,
  approveMapping,
  bulkApproveMappings,
  markUnmapped,
  exportBatch
} from '../lib/api';
import { toast } from 'sonner';

const StatusBadge = ({ status }) => {
  const config = {
    auto: { class: 'status-auto', label: 'Auto', icon: CheckCircle },
    approved: { class: 'status-approved', label: 'Approved', icon: CheckCircle },
    needs_review: { class: 'status-review', label: 'Review', icon: Warning },
    unmapped: { class: 'status-unmapped', label: 'Unmapped', icon: XCircle },
    pending: { class: 'status-review', label: 'Pending', icon: Warning },
  };
  
  const { class: className, label, icon: Icon } = config[status] || config.pending;
  
  return (
    <span className={`status-badge ${className}`} data-testid={`status-badge-${status}`}>
      <Icon size={12} className="mr-1" />
      {label}
    </span>
  );
};

const ConfidenceBar = ({ confidence }) => {
  const percent = Math.round(confidence * 100);
  const level = confidence >= 0.9 ? 'high' : confidence >= 0.75 ? 'medium' : 'low';
  
  return (
    <div className="flex items-center gap-2" data-testid="confidence-bar">
      <div className="confidence-bar w-16">
        <div 
          className={`confidence-bar-fill ${level}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`text-xs font-medium confidence-${level}`}>
        {percent}%
      </span>
    </div>
  );
};

const EditSheet = ({ mapping, standards, onApprove, onClose }) => {
  const [selectedStandard, setSelectedStandard] = useState(
    mapping?.suggested_standard_code || ''
  );
  const [addAsSynonym, setAddAsSynonym] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onApprove(mapping.id, selectedStandard || null, addAsSynonym);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!mapping) return null;

  return (
    <Sheet open={!!mapping} onOpenChange={onClose}>
      <SheetContent className="w-[500px] sm:max-w-[500px]" data-testid="edit-sheet">
        <SheetHeader>
          <SheetTitle>Edit Mapping</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Vendor Value
            </label>
            <p className="mt-1 text-lg font-medium text-slate-900" data-testid="edit-vendor-value">
              {mapping.vendor_value}
            </p>
          </div>
          
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Normalized
            </label>
            <p className="mt-1 text-sm text-slate-600 font-mono bg-slate-50 px-3 py-2 rounded-lg">
              {mapping.normalized_value}
            </p>
          </div>
          
          {mapping.suggested_standard_label && (
            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Suggested Match
              </label>
              <div className="mt-1 flex items-center gap-3">
                <span className="px-3 py-1.5 bg-sky-50 text-sky-700 rounded-lg text-sm font-medium">
                  {mapping.suggested_standard_label}
                </span>
                <ConfidenceBar confidence={mapping.confidence} />
              </div>
            </div>
          )}
          
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
              Select Standard
            </label>
            <Select 
              value={selectedStandard} 
              onValueChange={setSelectedStandard}
              data-testid="standard-select"
            >
              <SelectTrigger data-testid="standard-select-trigger">
                <SelectValue placeholder="Choose a standard..." />
              </SelectTrigger>
              <SelectContent>
                {standards.map((std) => (
                  <SelectItem 
                    key={std.code} 
                    value={std.code}
                    data-testid={`standard-option-${std.code}`}
                  >
                    {std.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Checkbox
              id="add-synonym"
              checked={addAsSynonym}
              onCheckedChange={setAddAsSynonym}
              data-testid="add-synonym-checkbox"
            />
            <label htmlFor="add-synonym" className="text-sm text-slate-600 cursor-pointer">
              Add as new synonym for future matching
            </label>
          </div>
          
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              data-testid="edit-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={!selectedStandard || saving}
              data-testid="edit-save-btn"
            >
              {saving ? 'Saving...' : 'Approve Mapping'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default function ReviewWorkbench() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  
  const [batches, setBatches] = useState([]);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [results, setResults] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editMapping, setEditMapping] = useState(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchResults = useCallback(async (batchIdToFetch) => {
    if (!batchIdToFetch) return;
    
    setLoading(true);
    try {
      const [batchRes, resultsRes] = await Promise.all([
        getBatch(batchIdToFetch),
        getBatchResults(batchIdToFetch, {
          status: statusFilter || undefined,
          matchType: matchTypeFilter || undefined,
          search: search || undefined,
          page,
          limit: 50
        })
      ]);
      
      setCurrentBatch(batchRes.data);
      setResults(resultsRes.data.results);
      setPagination({
        total: resultsRes.data.total,
        pages: resultsRes.data.pages
      });
    } catch (error) {
      toast.error('Failed to load results');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, matchTypeFilter, search, page]);

  useEffect(() => {
    const init = async () => {
      try {
        const [batchesRes, standardsRes] = await Promise.all([
          getBatches(1, 100),
          getStandards()
        ]);
        setBatches(batchesRes.data.batches);
        setStandards(standardsRes.data.standards);
        
        if (batchId) {
          await fetchResults(batchId);
        } else if (batchesRes.data.batches.length > 0) {
          navigate(`/review/${batchesRes.data.batches[0].id}`, { replace: true });
        } else {
          setLoading(false);
        }
      } catch (error) {
        toast.error('Failed to initialize');
        setLoading(false);
      }
    };
    init();
  }, [batchId, navigate]);

  useEffect(() => {
    if (batchId) {
      fetchResults(batchId);
    }
  }, [batchId, fetchResults]);

  const handleApprove = async (mappingId, standardCode, addAsSynonym) => {
    try {
      await approveMapping(mappingId, standardCode, addAsSynonym);
      toast.success('Mapping approved');
      fetchResults(batchId);
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to approve mapping';
      toast.error(message);
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) {
      toast.error('No items selected');
      return;
    }
    
    try {
      const response = await bulkApproveMappings(selectedIds);
      toast.success(`Approved ${response.data.approved_count} mappings`);
      setSelectedIds([]);
      fetchResults(batchId);
    } catch (error) {
      toast.error('Failed to bulk approve');
    }
  };

  const handleMarkUnmapped = async (mappingId) => {
    try {
      await markUnmapped(mappingId);
      toast.success('Marked as unmapped');
      fetchResults(batchId);
    } catch (error) {
      toast.error('Failed to update mapping');
    }
  };

  const handleExport = async () => {
    try {
      const response = await exportBatch(batchId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${currentBatch?.filename || 'export'}_mapped.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded');
    } catch (error) {
      toast.error('Failed to export');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === results.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(results.map(r => r.id));
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setMatchTypeFilter('');
    setPage(1);
  };

  if (loading && !currentBatch) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!batches.length) {
    return (
      <div className="p-8" data-testid="review-empty-state">
        <div className="max-w-md mx-auto text-center py-16">
          <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Warning size={32} weight="duotone" className="text-slate-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">No Batches to Review</h2>
          <p className="text-slate-500 mt-2">Upload a file first to start reviewing mappings</p>
          <Button className="mt-6" onClick={() => navigate('/upload')} data-testid="go-upload-btn">
            Go to Upload
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" data-testid="review-workbench">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/batches')}
            data-testid="back-to-batches-btn"
          >
            <ArrowLeft size={18} />
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[200px] justify-between" data-testid="batch-selector">
                <span className="truncate">{currentBatch?.filename || 'Select Batch'}</span>
                <CaretDown size={16} className="ml-2 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[300px]">
              {batches.map(batch => (
                <DropdownMenuItem
                  key={batch.id}
                  onClick={() => navigate(`/review/${batch.id}`)}
                  data-testid={`batch-option-${batch.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{batch.filename}</p>
                    <p className="text-xs text-slate-500">{batch.unique_values} values</p>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {currentBatch && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-emerald-600 font-medium">{currentBatch.auto_mapped} auto</span>
              <span className="text-amber-600 font-medium">{currentBatch.needs_review} review</span>
              <span className="text-rose-600 font-medium">{currentBatch.unmapped} unmapped</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkApprove}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              data-testid="bulk-approve-btn"
            >
              <Check size={16} className="mr-1" />
              Approve {selectedIds.length}
            </Button>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            data-testid="export-btn"
          >
            <Download size={16} className="mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search values..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
            data-testid="search-input"
          />
        </div>
        
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]" data-testid="status-filter">
            <Funnel size={16} className="mr-2 opacity-50" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="auto">Auto</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="unmapped">Unmapped</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={matchTypeFilter || "all"} onValueChange={(v) => { setMatchTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[150px]" data-testid="match-type-filter">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="exact">Exact</SelectItem>
            <SelectItem value="normalized">Normalized</SelectItem>
            <SelectItem value="keyword">Keyword</SelectItem>
            <SelectItem value="fuzzy">Fuzzy</SelectItem>
            <SelectItem value="no_match">No Match</SelectItem>
          </SelectContent>
        </Select>
        
        {(search || statusFilter || matchTypeFilter) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-filters-btn">
            <X size={16} className="mr-1" />
            Clear
          </Button>
        )}
        
        <div className="ml-auto text-sm text-slate-500">
          {pagination.total} results
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full" data-testid="results-table">
          <thead className="sticky top-0 bg-slate-50 z-[5]">
            <tr>
              <th className="data-table-header w-10">
                <Checkbox
                  checked={selectedIds.length === results.length && results.length > 0}
                  onCheckedChange={toggleSelectAll}
                  data-testid="select-all-checkbox"
                />
              </th>
              <th className="data-table-header">Vendor Value</th>
              <th className="data-table-header">Normalized</th>
              <th className="data-table-header">Suggested</th>
              <th className="data-table-header w-28">Confidence</th>
              <th className="data-table-header w-24">Type</th>
              <th className="data-table-header">Final</th>
              <th className="data-table-header w-24">Status</th>
              <th className="data-table-header w-20">Count</th>
              <th className="data-table-header w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-8">
                  <div className="spinner mx-auto" />
                </td>
              </tr>
            ) : results.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-slate-500">
                  No results found
                </td>
              </tr>
            ) : (
              results.map((row, idx) => (
                <tr 
                  key={row.id} 
                  className={`data-table-row ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                  data-testid={`result-row-${row.id}`}
                >
                  <td className="data-table-cell">
                    <Checkbox
                      checked={selectedIds.includes(row.id)}
                      onCheckedChange={() => toggleSelect(row.id)}
                      data-testid={`select-row-${row.id}`}
                    />
                  </td>
                  <td className="data-table-cell font-medium max-w-[200px] truncate" title={row.vendor_value}>
                    {row.vendor_value}
                  </td>
                  <td className="data-table-cell text-slate-500 font-mono text-xs max-w-[150px] truncate" title={row.normalized_value}>
                    {row.normalized_value}
                  </td>
                  <td className="data-table-cell">
                    {row.suggested_standard_label ? (
                      <span className="px-2 py-1 bg-sky-50 text-sky-700 rounded text-xs font-medium">
                        {row.suggested_standard_label}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="data-table-cell">
                    <ConfidenceBar confidence={row.confidence} />
                  </td>
                  <td className="data-table-cell">
                    <span className="text-xs text-slate-500 capitalize">{row.match_type.replace('_', ' ')}</span>
                  </td>
                  <td className="data-table-cell">
                    {row.final_standard_label ? (
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                        {row.final_standard_label}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="data-table-cell">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="data-table-cell text-center text-slate-500">
                    {row.occurrence_count}
                  </td>
                  <td className="data-table-cell">
                    <div className="flex items-center gap-1">
                      {row.status !== 'approved' && row.status !== 'auto' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                            onClick={() => row.suggested_standard_code && handleApprove(row.id, row.suggested_standard_code, false)}
                            disabled={!row.suggested_standard_code}
                            title="Quick approve"
                            data-testid={`quick-approve-${row.id}`}
                          >
                            <Check size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-sky-600 hover:bg-sky-50"
                            onClick={() => setEditMapping(row)}
                            title="Edit mapping"
                            data-testid={`edit-mapping-${row.id}`}
                          >
                            <Plus size={14} />
                          </Button>
                        </>
                      )}
                      {(row.status === 'approved' || row.status === 'auto') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleMarkUnmapped(row.id)}
                          title="Mark as unmapped"
                          data-testid={`mark-unmapped-${row.id}`}
                        >
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {pagination.pages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              data-testid="prev-page-btn"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
              disabled={page === pagination.pages}
              data-testid="next-page-btn"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Sheet */}
      <EditSheet
        mapping={editMapping}
        standards={standards}
        onApprove={handleApprove}
        onClose={() => setEditMapping(null)}
      />
    </div>
  );
}
