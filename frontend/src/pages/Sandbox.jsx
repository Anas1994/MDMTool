import { useState } from 'react';
import {
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  ArrowRight,
  Spinner,
  Lightning,
  TextAa,
  ListChecks,
  Intersect,
  ListBullets,
  Download,
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { testValueMatching, bulkTestMatching } from '../lib/api';
import { toast } from 'sonner';

const STEP_ICONS = {
  1: TextAa,
  2: TextAa,
  3: Lightning,
  4: Intersect,
};

const STEP_COLORS = {
  1: { active: 'border-sky-500 bg-sky-50', icon: 'text-sky-600' },
  2: { active: 'border-teal-500 bg-teal-50', icon: 'text-teal-600' },
  3: { active: 'border-amber-500 bg-amber-50', icon: 'text-amber-600' },
  4: { active: 'border-purple-500 bg-purple-50', icon: 'text-purple-600' },
};

const MATCH_TYPE_COLORS = {
  exact: 'bg-sky-100 text-sky-700',
  normalized: 'bg-teal-100 text-teal-700',
  keyword: 'bg-amber-100 text-amber-700',
  fuzzy: 'bg-purple-100 text-purple-700',
  ai: 'bg-pink-100 text-pink-700',
  no_match: 'bg-slate-100 text-slate-500',
};

// ========== SINGLE TEST TAB ==========
const SingleTest = () => {
  const [inputValue, setInputValue] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  const handleTest = async () => {
    const val = inputValue.trim();
    if (!val) return;
    setLoading(true);
    try {
      const res = await testValueMatching(val);
      setResult(res.data);
      setHistory(prev => [{ value: val, result: res.data }, ...prev].slice(0, 10));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const winnerStep = result?.steps?.find(s => s.matched);
  const finalResult = result?.final_result;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlass size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Enter a value to test, e.g., 'Discharged Home', 'LAMA'..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTest()}
              className="pl-10 text-base h-12"
              data-testid="sandbox-input"
            />
          </div>
          <Button onClick={handleTest} disabled={!inputValue.trim() || loading} className="h-12 px-6" data-testid="sandbox-test-btn">
            {loading ? <Spinner size={18} className="mr-2 animate-spin" /> : <ArrowRight size={18} className="mr-2" />}
            Test
          </Button>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-500">Normalized:</span>
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700" data-testid="normalized-value">
              {result.normalized_value}
            </span>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-4 gap-3" data-testid="pipeline-steps">
            {result.steps.map((step) => {
              const Icon = STEP_ICONS[step.step] || ListChecks;
              const colors = STEP_COLORS[step.step];
              const isWinner = winnerStep?.step === step.step;
              return (
                <div key={step.step} className={`rounded-xl border-2 p-4 transition-all ${isWinner ? colors.active : step.matched ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white opacity-60'}`} data-testid={`step-result-${step.step}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon size={20} weight="duotone" className={isWinner ? colors.icon : 'text-slate-400'} />
                      <span className="text-sm font-semibold text-slate-800">Step {step.step}</span>
                    </div>
                    {step.matched ? <CheckCircle size={20} weight="fill" className="text-emerald-500" /> : <XCircle size={20} weight="fill" className="text-slate-300" />}
                  </div>
                  <p className="text-sm font-medium text-slate-900">{step.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                  {step.matched && step.result && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 bg-white rounded text-xs font-medium border border-slate-200 text-slate-800">{step.result.standard_code}</span>
                        <span className="text-xs text-slate-600">{step.result.standard_label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${step.result.confidence >= 0.9 ? 'bg-emerald-500' : step.result.confidence >= 0.75 ? 'bg-sky-500' : 'bg-amber-500'}`} style={{ width: `${Math.round(step.result.confidence * 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium text-slate-600 w-10 text-right">{Math.round(step.result.confidence * 100)}%</span>
                      </div>
                    </div>
                  )}
                  {isWinner && <div className="mt-2 text-xs font-semibold text-emerald-600 uppercase tracking-wider">Winner</div>}
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="final-result">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Final Result</h3>
            {finalResult?.standard_code ? (
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-900">{finalResult.standard_label}</span>
                    <span className="px-2 py-0.5 bg-slate-100 rounded font-mono text-sm text-slate-600 border border-slate-200">{finalResult.standard_code}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${MATCH_TYPE_COLORS[finalResult.match_type] || MATCH_TYPE_COLORS.no_match}`}>{finalResult.match_type}</span>
                    <span className={`text-sm font-medium ${finalResult.confidence >= 0.9 ? 'text-emerald-600' : finalResult.confidence >= 0.75 ? 'text-sky-600' : 'text-amber-600'}`}>{Math.round(finalResult.confidence * 100)}% confidence</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${finalResult.status === 'auto' ? 'bg-emerald-100 text-emerald-700' : finalResult.status === 'needs_review' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{finalResult.status}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <XCircle size={24} weight="fill" className="text-rose-400" />
                <div>
                  <p className="font-medium text-slate-900">No Match Found</p>
                  <p className="text-sm text-slate-500">This value would remain unmapped.</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Tests</h3>
          <div className="flex flex-wrap gap-2">
            {history.map((item, i) => (
              <button key={i} onClick={() => { setInputValue(item.value); setResult(item.result); }}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${item.result.final_result?.standard_code ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                data-testid={`history-item-${i}`}>
                {item.value}
                {item.result.final_result?.standard_code && <span className="ml-1.5 text-xs opacity-70">→ {item.result.final_result.standard_code}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ========== BULK TEST TAB ==========
const BulkTest = () => {
  const [textInput, setTextInput] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleBulkTest = async () => {
    const values = textInput.split('\n').map(v => v.trim()).filter(Boolean);
    if (values.length === 0) {
      toast.error('Enter at least one value');
      return;
    }
    if (values.length > 500) {
      toast.error('Maximum 500 values per bulk test');
      return;
    }
    setLoading(true);
    try {
      const res = await bulkTestMatching(values);
      setResults(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk test failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!results?.results) return;
    const headers = ['Value', 'Normalized', 'Standard Code', 'Standard Label', 'Confidence', 'Match Type', 'Status'];
    const rows = results.results.map(r => [
      r.value, r.normalized, r.standard_code || '', r.standard_label || '',
      Math.round(r.confidence * 100) + '%', r.match_type, r.status,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_test_results.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const summary = results?.summary;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <label className="text-sm font-medium text-slate-700 mb-2 block">Paste values (one per line)</label>
        <textarea
          className="w-full h-40 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          placeholder={"Discharged Home\nLAMA\nReferred to KFSH\nAdmitted to Adult ICU\nPatient expired\nSome unknown value"}
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          data-testid="bulk-input"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-slate-500">
            {textInput.split('\n').filter(v => v.trim()).length} values
          </span>
          <Button onClick={handleBulkTest} disabled={loading || !textInput.trim()} data-testid="bulk-test-btn">
            {loading ? <Spinner size={16} className="mr-2 animate-spin" /> : <ListBullets size={16} className="mr-2" />}
            {loading ? 'Testing...' : 'Test All'}
          </Button>
        </div>
      </div>

      {results && summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-3" data-testid="bulk-summary">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{summary.total}</p>
              <p className="text-xs text-slate-500 mt-1">Total Tested</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{summary.matched}</p>
              <p className="text-xs text-emerald-600 mt-1">Matched ({summary.total > 0 ? Math.round((summary.matched / summary.total) * 100) : 0}%)</p>
            </div>
            <div className="bg-rose-50 rounded-xl border border-rose-200 p-4 text-center">
              <p className="text-2xl font-bold text-rose-700">{summary.unmapped}</p>
              <p className="text-xs text-rose-600 mt-1">Unmapped</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 mb-1.5">By Match Type</p>
              <div className="space-y-1">
                {Object.entries(summary.by_type).filter(([, v]) => v > 0).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MATCH_TYPE_COLORS[type] || MATCH_TYPE_COLORS.no_match}`}>{type}</span>
                    <span className="text-xs font-semibold text-slate-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Results ({results.results.length})</h3>
              <Button variant="outline" size="sm" onClick={handleExportCsv} data-testid="export-csv-btn">
                <Download size={14} className="mr-1.5" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm" data-testid="bulk-results-table">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Value</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Standard</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Confidence</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50/50'}>
                      <td className="px-4 py-2 text-slate-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-2 font-medium text-slate-900 max-w-[200px] truncate" title={r.value}>{r.value}</td>
                      <td className="px-4 py-2">
                        {r.standard_code ? (
                          <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded text-xs font-medium border border-sky-200">{r.standard_label || r.standard_code}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 bg-slate-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${r.confidence >= 0.9 ? 'bg-emerald-500' : r.confidence >= 0.75 ? 'bg-sky-500' : r.confidence > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} style={{ width: `${Math.round(r.confidence * 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-600">{Math.round(r.confidence * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${MATCH_TYPE_COLORS[r.match_type] || MATCH_TYPE_COLORS.no_match}`}>{r.match_type}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.status === 'auto' ? 'bg-emerald-100 text-emerald-700' : r.status === 'needs_review' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ========== MAIN SANDBOX PAGE ==========
export default function Sandbox() {
  const [tab, setTab] = useState('single');

  return (
    <div className="p-8" data-testid="sandbox-page">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Rule Testing Sandbox</h1>
          <p className="text-slate-500 mt-1">Test values against the matching engine</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit" data-testid="sandbox-tabs">
          <button
            onClick={() => setTab('single')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            data-testid="tab-single"
          >
            <MagnifyingGlass size={16} className="inline mr-1.5 -mt-0.5" />
            Single Test
          </button>
          <button
            onClick={() => setTab('bulk')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'bulk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            data-testid="tab-bulk"
          >
            <ListBullets size={16} className="inline mr-1.5 -mt-0.5" />
            Bulk Test
          </button>
        </div>

        {tab === 'single' && <SingleTest />}
        {tab === 'bulk' && <BulkTest />}
      </div>
    </div>
  );
}
