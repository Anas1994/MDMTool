import { useState, useEffect } from 'react';
import {
  DownloadSimple,
  Database,
  FileJs,
  FileCsv,
  BookOpen,
  Snowflake,
  Shield,
  ArrowRight,
  CheckCircle,
  Spinner,
  Copy,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import api from '../lib/api';

const LIFECYCLE_COLORS = {
  proposed: 'bg-slate-100 text-slate-700 border-slate-200',
  auto_mapped: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-sky-100 text-sky-700 border-sky-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  retired: 'bg-slate-200 text-slate-500 border-slate-300',
};

export default function MdmEnterprise() {
  const [tab, setTab] = useState('exports');
  const [govStats, setGovStats] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportDomain, setExportDomain] = useState('Disposition');
  const [exporting, setExporting] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, lifecycleRes] = await Promise.all([
        api.get('/mdm/governance/stats'),
        api.get('/mdm/governance/lifecycle'),
      ]);
      setGovStats(statsRes.data);
      setLifecycle(lifecycleRes.data.lifecycle);
    } catch {
      toast.error('Failed to load MDM data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(format);
    try {
      if (format === 'csv') {
        const res = await api.get(`/mdm/exports/${exportDomain}?format=csv`, { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = `mdm_${exportDomain}_mappings.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('CSV exported');
      } else if (format === 'snowflake_schema') {
        const res = await api.get('/mdm/schema/snowflake', { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mdm_snowflake_schema.sql';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Snowflake schema downloaded');
      } else {
        const res = await api.get(`/mdm/exports/${exportDomain}?format=${format}`);
        const data = JSON.stringify(res.data, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mdm_${exportDomain}_${format}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`${format} exported`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const copyApiExample = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} className="animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="p-8" data-testid="mdm-enterprise-page">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">MDM Enterprise</h1>
          <p className="text-slate-500 mt-1">Export, integrate, and govern your master data</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-lg w-fit" data-testid="mdm-tabs">
          {[
            { id: 'exports', label: 'Exports', icon: DownloadSimple },
            { id: 'api', label: 'API Reference', icon: Database },
            { id: 'governance', label: 'Governance', icon: Shield },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
              data-testid={`tab-${t.id}`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ========== EXPORTS TAB ========== */}
        {tab === 'exports' && (
          <div className="space-y-6" data-testid="exports-tab">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm font-medium text-slate-600">Domain:</span>
              <Select value={exportDomain} onValueChange={setExportDomain}>
                <SelectTrigger className="w-48" data-testid="export-domain-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Disposition">Disposition</SelectItem>
                  <SelectItem value="Ward">Ward</SelectItem>
                  <SelectItem value="Specialty">Specialty</SelectItem>
                  <SelectItem value="Gender">Gender</SelectItem>
                  <SelectItem value="Priority">Priority</SelectItem>
                  <SelectItem value="All">All Domains</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { format: 'json', label: 'JSON Export', desc: 'API-ready JSON with standards, mappings, synonyms', icon: FileJs, color: 'text-amber-600' },
                { format: 'csv', label: 'CSV Export', desc: 'Simple mapping table for spreadsheets and ETL', icon: FileCsv, color: 'text-emerald-600' },
                { format: 'business_dictionary', label: 'Business Dictionary', desc: 'Standards, definitions, synonyms, ownership', icon: BookOpen, color: 'text-sky-600' },
                { format: 'snowflake_sql', label: 'Snowflake SQL', desc: 'INSERT statements for Snowflake data warehouse', icon: Snowflake, color: 'text-blue-600' },
              ].map(item => (
                <div key={item.format} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <item.icon size={28} weight="duotone" className={item.color} />
                      <div>
                        <h3 className="font-semibold text-slate-900">{item.label}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    onClick={() => handleExport(item.format)}
                    disabled={exporting === item.format}
                    data-testid={`export-${item.format}-btn`}
                  >
                    {exporting === item.format ? (
                      <Spinner size={16} className="mr-2 animate-spin" />
                    ) : (
                      <DownloadSimple size={16} className="mr-2" />
                    )}
                    Download {item.label}
                  </Button>
                </div>
              ))}
            </div>

            {/* Snowflake Schema Download */}
            <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-xl border border-blue-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Snowflake size={32} weight="duotone" className="text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-slate-900">Snowflake DDL Schema</h3>
                    <p className="text-sm text-slate-600">Complete CREATE TABLE scripts with indexes, views, and sample data</p>
                  </div>
                </div>
                <Button onClick={() => handleExport('snowflake_schema')} data-testid="download-schema-btn">
                  <DownloadSimple size={16} className="mr-2" /> Download Schema
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========== API REFERENCE TAB ========== */}
        {tab === 'api' && (
          <div className="space-y-4" data-testid="api-tab">
            <p className="text-sm text-slate-500 mb-4">REST API endpoints for real-time MDM integration</p>

            {[
              {
                method: 'GET', path: '/api/mdm/domains', desc: 'List all MDM domains',
                sample: '{"domains": [{"name": "Disposition", "description": "ED Discharge Disposition"}]}'
              },
              {
                method: 'GET', path: '/api/mdm/domains/{domain}/standard-values', desc: 'Get standard values for a domain',
                sample: '{"domain": "Disposition", "standards": [{"standard_code": "HOME", "standard_label": "Home"}]}'
              },
              {
                method: 'GET', path: '/api/mdm/domains/{domain}/lookup?source_value=XXX', desc: 'Real-time value lookup',
                sample: '{"resolved": true, "standard_code": "HOME", "standard_label": "Home", "confidence": 1.0, "match_type": "synonym_lookup"}'
              },
              {
                method: 'GET', path: '/api/mdm/domains/{domain}/mappings', desc: 'Get all mappings with filters',
                sample: '{"domain": "Disposition", "mappings": [...], "total": 150}'
              },
              {
                method: 'POST', path: '/api/mdm/mappings', desc: 'Create a new mapping',
                sample: '{"domain_name": "Disposition", "source_value": "Patient went home", "standard_code": "HOME"}'
              },
              {
                method: 'PUT', path: '/api/mdm/mappings/{id}/approve', desc: 'Approve a mapping',
                sample: '{"approved_by": "admin"}'
              },
              {
                method: 'PUT', path: '/api/mdm/mappings/{id}/reject', desc: 'Reject a mapping',
                sample: '{"rejected_by": "admin", "rejection_reason": "Incorrect match"}'
              },
              {
                method: 'GET', path: '/api/mdm/exports/{domain}?format=json|csv|business_dictionary|snowflake_sql', desc: 'Export domain data',
                sample: 'Returns domain mappings in specified format'
              },
            ].map((endpoint, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      endpoint.method === 'GET' ? 'bg-emerald-100 text-emerald-700' :
                      endpoint.method === 'POST' ? 'bg-sky-100 text-sky-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {endpoint.method}
                    </span>
                    <code className="text-sm font-mono text-slate-800">{endpoint.path}</code>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => copyApiExample(endpoint.path)} data-testid={`copy-api-${i}`}>
                    <Copy size={14} />
                  </Button>
                </div>
                <p className="text-sm text-slate-500 mt-2">{endpoint.desc}</p>
                <pre className="mt-2 p-2 bg-slate-50 rounded text-xs font-mono text-slate-600 overflow-x-auto">
                  {endpoint.sample}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* ========== GOVERNANCE TAB ========== */}
        {tab === 'governance' && (
          <div className="space-y-6" data-testid="governance-tab">
            {/* Status Overview */}
            {govStats && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Mapping Status Overview</h3>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {Object.entries(govStats.by_status).map(([status, count]) => (
                    <div key={status} className="text-center p-3 rounded-lg border border-slate-100">
                      <p className="text-2xl font-bold text-slate-900">{count}</p>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium border ${LIFECYCLE_COLORS[status] || LIFECYCLE_COLORS.proposed}`}>
                        {status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Coverage Rate:</span>
                  <span className="font-bold text-emerald-600">{govStats.coverage_rate}%</span>
                </div>
              </div>
            )}

            {/* Lifecycle */}
            {lifecycle && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Status Lifecycle</h3>
                <div className="flex items-center gap-2 flex-wrap mb-6">
                  {lifecycle.statuses.map((s, i) => (
                    <div key={s.code} className="flex items-center gap-2">
                      <div className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${LIFECYCLE_COLORS[s.code]}`}>
                        {s.label}
                      </div>
                      {i < lifecycle.statuses.length - 1 && (
                        <ArrowRight size={16} className="text-slate-300" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {lifecycle.statuses.map(s => (
                    <div key={s.code} className="flex items-start gap-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap ${LIFECYCLE_COLORS[s.code]}`}>
                        {s.label}
                      </span>
                      <span className="text-slate-600">{s.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architecture */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Integration Architecture</h3>
              <pre className="text-xs font-mono text-slate-600 bg-slate-50 p-4 rounded-lg overflow-x-auto whitespace-pre">
{`Source Data (HIS, EMR, Labs)
    |
    v
MDM Matching Engine
    |  Exact -> Normalized -> Keyword -> Fuzzy -> AI
    v
Review & Approval (Governance Lifecycle)
    |  proposed -> auto_mapped -> pending_review -> approved
    v
Master Mapping Repository (MongoDB)
    |
    +---> Snowflake Tables (DIM + BRIDGE)
    |         analytics, reporting, BI dashboards
    |
    +---> REST APIs (/api/mdm/*)
    |         real-time lookup, enrichment
    |
    +---> Integration Layer
    |         ETL batch: read mapping tables
    |         real-time: API lookup during ingestion
    |         exceptions: unmapped -> review queue
    |
    +---> Exports (JSON / CSV / SQL)
    |         data pipelines, external systems
    |
    +---> Business Dictionary
              standards, definitions, synonyms, ownership`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
