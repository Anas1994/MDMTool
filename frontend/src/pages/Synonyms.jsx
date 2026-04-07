import { useState, useEffect } from 'react';
import {
  Plus,
  Database,
  MagnifyingGlass,
  CheckCircle
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { getSynonyms, getStandards, createSynonym } from '../lib/api';
import { toast } from 'sonner';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const RuleTypeBadge = ({ type }) => {
  const colors = {
    exact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    synonym: 'bg-sky-50 text-sky-700 border-sky-200',
    normalized: 'bg-purple-50 text-purple-700 border-purple-200',
    keyword: 'bg-amber-50 text-amber-700 border-amber-200',
    fuzzy: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  
  return (
    <span className={`status-badge ${colors[type] || colors.synonym}`}>
      {type}
    </span>
  );
};

const AddSynonymDialog = ({ standards, onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [sourceValue, setSourceValue] = useState('');
  const [standardCode, setStandardCode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!sourceValue.trim() || !standardCode) {
      toast.error('Please fill all fields');
      return;
    }
    
    setSaving(true);
    try {
      await createSynonym(sourceValue.trim(), standardCode);
      toast.success('Synonym added successfully');
      setSourceValue('');
      setStandardCode('');
      setOpen(false);
      onSuccess();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to add synonym';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-synonym-btn">
          <Plus size={18} className="mr-2" />
          Add Synonym
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="add-synonym-dialog">
        <DialogHeader>
          <DialogTitle>Add New Synonym</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="source-value">Source Value</Label>
            <Input
              id="source-value"
              placeholder="e.g., Patient Discharged Home"
              value={sourceValue}
              onChange={(e) => setSourceValue(e.target.value)}
              data-testid="synonym-source-input"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Standard Mapping</Label>
            <Select value={standardCode} onValueChange={setStandardCode}>
              <SelectTrigger data-testid="synonym-standard-select">
                <SelectValue placeholder="Select a standard..." />
              </SelectTrigger>
              <SelectContent>
                {standards.map((std) => (
                  <SelectItem key={std.code} value={std.code}>
                    {std.label} ({std.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              data-testid="cancel-synonym-btn"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={saving || !sourceValue.trim() || !standardCode}
              data-testid="save-synonym-btn"
            >
              {saving ? 'Saving...' : 'Add Synonym'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function Synonyms() {
  const [synonyms, setSynonyms] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [synonymsRes, standardsRes] = await Promise.all([
        getSynonyms(page, 50),
        getStandards()
      ]);
      setSynonyms(synonymsRes.data.synonyms);
      setPagination({
        total: synonymsRes.data.total,
        pages: synonymsRes.data.pages
      });
      setStandards(standardsRes.data.standards);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page]);

  const filteredSynonyms = search
    ? synonyms.filter(s => 
        s.source_value_raw.toLowerCase().includes(search.toLowerCase()) ||
        s.standard_label.toLowerCase().includes(search.toLowerCase())
      )
    : synonyms;

  return (
    <div className="p-8" data-testid="synonyms-page">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Synonym Mappings</h1>
            <p className="text-slate-500 mt-1">Manage known value mappings for automatic matching</p>
          </div>
          
          <AddSynonymDialog standards={standards} onSuccess={fetchData} />
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search synonyms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="synonym-search"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : synonyms.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Database size={32} weight="duotone" className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">No synonyms yet</h2>
            <p className="text-slate-500 mt-2">Add synonyms to improve automatic matching</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full" data-testid="synonyms-table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="data-table-header">Source Value</th>
                  <th className="data-table-header">Normalized</th>
                  <th className="data-table-header">Standard</th>
                  <th className="data-table-header w-24">Type</th>
                  <th className="data-table-header w-28">Confidence</th>
                  <th className="data-table-header w-32">Approved By</th>
                  <th className="data-table-header w-28">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredSynonyms.map((syn, idx) => (
                  <tr 
                    key={syn.id}
                    className={`data-table-row ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                    data-testid={`synonym-row-${syn.id}`}
                  >
                    <td className="data-table-cell font-medium max-w-[200px] truncate" title={syn.source_value_raw}>
                      {syn.source_value_raw}
                    </td>
                    <td className="data-table-cell text-slate-500 font-mono text-xs max-w-[150px] truncate" title={syn.source_value_normalized}>
                      {syn.source_value_normalized}
                    </td>
                    <td className="data-table-cell">
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                        {syn.standard_label}
                      </span>
                    </td>
                    <td className="data-table-cell">
                      <RuleTypeBadge type={syn.rule_type} />
                    </td>
                    <td className="data-table-cell">
                      <span className="text-sm font-medium text-slate-700">
                        {Math.round(syn.confidence_default * 100)}%
                      </span>
                    </td>
                    <td className="data-table-cell text-slate-500 text-xs">
                      {syn.approved_by}
                    </td>
                    <td className="data-table-cell text-slate-500 text-xs">
                      {formatDate(syn.approved_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                data-testid="synonyms-prev-page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                data-testid="synonyms-next-page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
        
        {/* Standards Reference */}
        <div className="mt-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-4">Standard Dictionary Reference</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {standards.map(std => (
              <div 
                key={std.code}
                className="p-3 bg-white rounded-lg border border-slate-200"
                data-testid={`standard-ref-${std.code}`}
              >
                <p className="font-medium text-slate-900 text-sm">{std.label}</p>
                <p className="text-xs text-slate-500 font-mono">{std.code}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
