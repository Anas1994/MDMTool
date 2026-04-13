import { useState, useEffect } from 'react';
import {
  Lightning,
  Plus,
  Trash,
  PencilSimple,
  X,
  Check,
  ArrowsLeftRight,
  Spinner,
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  getKeywordRules,
  createKeywordRule,
  updateKeywordRule,
  deleteKeywordRule,
  getStandards,
} from '../lib/api';
import { toast } from 'sonner';

const EMPTY_FORM = {
  rule_type: 'simple',
  keywords: '',
  required_keywords: '',
  exclude_keywords: '',
  standard_code: '',
  confidence: 0.85,
};

export default function KeywordRules() {
  const [rules, setRules] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesRes, standardsRes] = await Promise.all([
        getKeywordRules(true),
        getStandards(),
      ]);
      setRules(rulesRes.data.rules || []);
      setStandards(standardsRes.data.standards || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      rule_type: rule.rule_type || 'simple',
      keywords: (rule.keywords || []).join(', '),
      required_keywords: (rule.required_keywords || []).join(', '),
      exclude_keywords: (rule.exclude_keywords || []).join(', '),
      standard_code: rule.standard_code,
      confidence: rule.confidence,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.standard_code) {
      toast.error('Please select a standard code');
      return;
    }
    if (form.rule_type === 'simple' && !form.keywords.trim()) {
      toast.error('Please enter at least one keyword');
      return;
    }
    if (form.rule_type === 'compound' && !form.required_keywords.trim()) {
      toast.error('Please enter required keywords for compound rule');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        rule_type: form.rule_type,
        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
        required_keywords: form.required_keywords.split(',').map(k => k.trim()).filter(Boolean),
        exclude_keywords: form.exclude_keywords.split(',').map(k => k.trim()).filter(Boolean),
        standard_code: form.standard_code,
        confidence: parseFloat(form.confidence),
      };

      if (editingRule) {
        await updateKeywordRule(editingRule.id, payload);
        toast.success('Rule updated');
      } else {
        await createKeywordRule(payload);
        toast.success('Rule created');
      }
      setDialogOpen(false);
      await loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId) => {
    try {
      await deleteKeywordRule(ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggleActive = async (rule) => {
    try {
      await updateKeywordRule(rule.id, { active: !rule.active });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
      toast.success(rule.active ? 'Rule deactivated' : 'Rule activated');
    } catch {
      toast.error('Failed to update rule');
    }
  };

  const getConfidenceColor = (c) => {
    if (c >= 0.9) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (c >= 0.8) return 'bg-sky-100 text-sky-700 border-sky-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} className="animate-spin text-sky-500" />
      </div>
    );
  }

  const simpleRules = rules.filter(r => r.rule_type !== 'compound');
  const compoundRules = rules.filter(r => r.rule_type === 'compound');

  return (
    <div className="p-8" data-testid="keyword-rules-page">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Keyword Rules</h1>
            <p className="text-slate-500 mt-1">
              Define pattern-based matching rules. Keywords are matched against normalized input values.
            </p>
          </div>
          <Button onClick={openCreate} data-testid="create-rule-btn">
            <Plus size={18} className="mr-2" /> New Rule
          </Button>
        </div>

        {/* Simple Rules */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">
            Simple Rules ({simpleRules.length})
          </h2>
          <p className="text-sm text-slate-500 mb-4">Match when any keyword appears in the input value</p>

          {simpleRules.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <Lightning size={32} className="mx-auto text-slate-300" />
              <p className="text-slate-500 mt-2">No simple keyword rules yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {simpleRules.map(rule => (
                <div
                  key={rule.id}
                  className={`bg-white rounded-lg border p-4 transition-colors ${rule.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
                  data-testid={`rule-${rule.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">
                          {rule.standard_code}
                        </Badge>
                        <span className="text-sm text-slate-600">{rule.standard_label}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getConfidenceColor(rule.confidence)}`}>
                          {Math.round(rule.confidence * 100)}%
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rule.keywords.map((kw, i) => (
                          <span key={i} className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded text-xs border border-sky-200">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Switch
                        checked={rule.active}
                        onCheckedChange={() => handleToggleActive(rule)}
                        data-testid={`toggle-rule-${rule.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(rule)}
                        data-testid={`edit-rule-${rule.id}`}
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500 hover:bg-rose-50"
                        onClick={() => handleDelete(rule.id)}
                        data-testid={`delete-rule-${rule.id}`}
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Compound Rules */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">
            Compound Rules ({compoundRules.length})
          </h2>
          <p className="text-sm text-slate-500 mb-4">Match when all required keywords appear AND no excluded keywords appear</p>

          {compoundRules.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <ArrowsLeftRight size={32} className="mx-auto text-slate-300" />
              <p className="text-slate-500 mt-2">No compound rules yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {compoundRules.map(rule => (
                <div
                  key={rule.id}
                  className={`bg-white rounded-lg border p-4 transition-colors ${rule.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
                  data-testid={`rule-${rule.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-xs">
                          {rule.standard_code}
                        </Badge>
                        <span className="text-sm text-slate-600">{rule.standard_label}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getConfidenceColor(rule.confidence)}`}>
                          {Math.round(rule.confidence * 100)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500">Required:</span>
                          {(rule.required_keywords || []).map((kw, i) => (
                            <span key={i} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs border border-emerald-200">
                              {kw}
                            </span>
                          ))}
                        </div>
                        {rule.exclude_keywords?.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-slate-500">Exclude:</span>
                            {rule.exclude_keywords.map((kw, i) => (
                              <span key={i} className="px-2 py-0.5 bg-rose-50 text-rose-700 rounded text-xs border border-rose-200">
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Switch
                        checked={rule.active}
                        onCheckedChange={() => handleToggleActive(rule)}
                        data-testid={`toggle-rule-${rule.id}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(rule)}
                        data-testid={`edit-rule-${rule.id}`}
                      >
                        <PencilSimple size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-500 hover:bg-rose-50"
                        onClick={() => handleDelete(rule.id)}
                        data-testid={`delete-rule-${rule.id}`}
                      >
                        <Trash size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]" data-testid="keyword-rule-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Keyword Rule' : 'New Keyword Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Rule Type */}
            <div>
              <Label>Rule Type</Label>
              <Select value={form.rule_type} onValueChange={v => setForm(p => ({ ...p, rule_type: v }))}>
                <SelectTrigger data-testid="rule-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple — match any keyword</SelectItem>
                  <SelectItem value="compound">Compound — require all + exclude</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Keywords (simple) */}
            {form.rule_type === 'simple' && (
              <div>
                <Label>Keywords (comma-separated)</Label>
                <Input
                  placeholder="e.g., transfer, transferred, moved to"
                  value={form.keywords}
                  onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))}
                  data-testid="keywords-input"
                />
                <p className="text-xs text-slate-500 mt-1">If any keyword appears in the value, it matches</p>
              </div>
            )}

            {/* Required + Exclude (compound) */}
            {form.rule_type === 'compound' && (
              <>
                <div>
                  <Label>Required Keywords (comma-separated)</Label>
                  <Input
                    placeholder="e.g., icu, adult"
                    value={form.required_keywords}
                    onChange={e => setForm(p => ({ ...p, required_keywords: e.target.value }))}
                    data-testid="required-keywords-input"
                  />
                  <p className="text-xs text-slate-500 mt-1">ALL must appear in the value</p>
                </div>
                <div>
                  <Label>Exclude Keywords (comma-separated)</Label>
                  <Input
                    placeholder="e.g., pediatric, neonatal"
                    value={form.exclude_keywords}
                    onChange={e => setForm(p => ({ ...p, exclude_keywords: e.target.value }))}
                    data-testid="exclude-keywords-input"
                  />
                  <p className="text-xs text-slate-500 mt-1">NONE must appear in the value</p>
                </div>
              </>
            )}

            {/* Standard Code */}
            <div>
              <Label>Maps to Standard</Label>
              <Select value={form.standard_code} onValueChange={v => setForm(p => ({ ...p, standard_code: v }))}>
                <SelectTrigger data-testid="standard-code-select">
                  <SelectValue placeholder="Select standard..." />
                </SelectTrigger>
                <SelectContent>
                  {standards.map(s => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Confidence */}
            <div>
              <Label>Confidence ({Math.round(form.confidence * 100)}%)</Label>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.01"
                value={form.confidence}
                onChange={e => setForm(p => ({ ...p, confidence: parseFloat(e.target.value) }))}
                className="w-full mt-1 accent-sky-600"
                data-testid="confidence-slider"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full"
              data-testid="save-rule-btn"
            >
              {saving ? <Spinner size={16} className="mr-2 animate-spin" /> : <Check size={16} className="mr-2" />}
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
