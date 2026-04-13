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
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { testValueMatching } from '../lib/api';
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

export default function Sandbox() {
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
      setHistory(prev => {
        const next = [{ value: val, result: res.data }, ...prev];
        return next.slice(0, 10);
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleTest();
  };

  const handleHistoryClick = (item) => {
    setInputValue(item.value);
    setResult(item.result);
  };

  const winnerStep = result?.steps?.find(s => s.matched);
  const finalResult = result?.final_result;

  return (
    <div className="p-8" data-testid="sandbox-page">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Rule Testing Sandbox</h1>
          <p className="text-slate-500 mt-1">Type a value to see how the matching engine processes it step by step</p>
        </div>

        {/* Input */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Enter a value to test, e.g., 'Discharged Home', 'LAMA', 'Referred to KFSH'..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10 text-base h-12"
                data-testid="sandbox-input"
              />
            </div>
            <Button
              onClick={handleTest}
              disabled={!inputValue.trim() || loading}
              className="h-12 px-6"
              data-testid="sandbox-test-btn"
            >
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

        {/* Results */}
        {result && (
          <div className="space-y-4 mb-8">
            {/* Pipeline Steps */}
            <div className="grid grid-cols-4 gap-3" data-testid="pipeline-steps">
              {result.steps.map((step) => {
                const Icon = STEP_ICONS[step.step] || ListChecks;
                const colors = STEP_COLORS[step.step];
                const isWinner = winnerStep?.step === step.step;

                return (
                  <div
                    key={step.step}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      isWinner
                        ? colors.active
                        : step.matched
                        ? 'border-slate-300 bg-slate-50'
                        : 'border-slate-200 bg-white opacity-60'
                    }`}
                    data-testid={`step-result-${step.step}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon size={20} weight="duotone" className={isWinner ? colors.icon : 'text-slate-400'} />
                        <span className="text-sm font-semibold text-slate-800">Step {step.step}</span>
                      </div>
                      {step.matched ? (
                        <CheckCircle size={20} weight="fill" className="text-emerald-500" />
                      ) : (
                        <XCircle size={20} weight="fill" className="text-slate-300" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900">{step.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>

                    {step.matched && step.result && (
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-white rounded text-xs font-medium border border-slate-200 text-slate-800">
                            {step.result.standard_code}
                          </span>
                          <span className="text-xs text-slate-600">{step.result.standard_label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-full bg-slate-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                step.result.confidence >= 0.9 ? 'bg-emerald-500' : step.result.confidence >= 0.75 ? 'bg-sky-500' : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.round(step.result.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600 w-10 text-right">
                            {Math.round(step.result.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {isWinner && (
                      <div className="mt-2 text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                        Winner
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Final Result Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6" data-testid="final-result">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Final Result</h3>
              {finalResult?.standard_code ? (
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-900">{finalResult.standard_label}</span>
                      <span className="px-2 py-0.5 bg-slate-100 rounded font-mono text-sm text-slate-600 border border-slate-200">
                        {finalResult.standard_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        finalResult.match_type === 'exact' ? 'bg-sky-100 text-sky-700' :
                        finalResult.match_type === 'normalized' ? 'bg-teal-100 text-teal-700' :
                        finalResult.match_type === 'keyword' ? 'bg-amber-100 text-amber-700' :
                        finalResult.match_type === 'fuzzy' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {finalResult.match_type}
                      </span>
                      <span className={`text-sm font-medium ${
                        finalResult.confidence >= 0.9 ? 'text-emerald-600' :
                        finalResult.confidence >= 0.75 ? 'text-sky-600' :
                        'text-amber-600'
                      }`}>
                        {Math.round(finalResult.confidence * 100)}% confidence
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        finalResult.status === 'auto' ? 'bg-emerald-100 text-emerald-700' :
                        finalResult.status === 'needs_review' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {finalResult.status}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <XCircle size={24} weight="fill" className="text-rose-400" />
                  <div>
                    <p className="font-medium text-slate-900">No Match Found</p>
                    <p className="text-sm text-slate-500">This value would remain unmapped. Consider adding a synonym or keyword rule.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recent Tests</h3>
            <div className="flex flex-wrap gap-2">
              {history.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleHistoryClick(item)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    item.result.final_result?.standard_code
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  data-testid={`history-item-${i}`}
                >
                  {item.value}
                  {item.result.final_result?.standard_code && (
                    <span className="ml-1.5 text-xs opacity-70">
                      → {item.result.final_result.standard_code}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
