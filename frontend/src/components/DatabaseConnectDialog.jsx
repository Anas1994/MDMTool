import { useState, useEffect } from 'react';
import {
  Database,
  Lightning,
  CheckCircle,
  XCircle,
  Spinner,
  Table as TableIcon,
  ArrowLeft,
  DownloadSimple,
  Plugs,
  FloppyDisk,
  Trash,
} from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import {
  getConnections,
  createConnection,
  testConnection,
  deleteConnection,
  getConnectionTables,
  getConnectionTableColumns,
  importTableFromDb,
} from '../lib/api';

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
  { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
  { value: 'sqlite', label: 'SQLite', defaultPort: null },
];

const DEFAULT_FORM = {
  name: '',
  db_type: '',
  host: '',
  port: '',
  database: '',
  username: '',
  password: '',
  ssl_enabled: false,
};

export default function DatabaseConnectDialog({ open, onOpenChange, sessionId, onTableImported }) {
  const [view, setView] = useState('list'); // list | form | tables | columns
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);

  // Table browsing state
  const [activeConnectionId, setActiveConnectionId] = useState(null);
  const [activeConnectionName, setActiveConnectionName] = useState('');
  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedSchema, setSelectedSchema] = useState('public');
  const [columns, setColumns] = useState([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open) {
      loadConnections();
      setView('list');
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setForm({ ...DEFAULT_FORM });
    setTestResult(null);
    setActiveConnectionId(null);
    setActiveConnectionName('');
    setTables([]);
    setSelectedTable(null);
    setColumns([]);
  };

  const loadConnections = async () => {
    setLoadingConnections(true);
    try {
      const res = await getConnections();
      setConnections(res.data.connections || []);
    } catch {
      setConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleDbTypeChange = (val) => {
    const dbType = DB_TYPES.find(d => d.value === val);
    setForm(prev => ({
      ...prev,
      db_type: val,
      port: dbType?.defaultPort ? String(dbType.defaultPort) : '',
      host: val === 'sqlite' ? '' : prev.host,
      username: val === 'sqlite' ? '' : prev.username,
      password: val === 'sqlite' ? '' : prev.password,
    }));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        db_type: form.db_type,
        host: form.host || null,
        port: form.port ? parseInt(form.port) : null,
        database: form.database,
        username: form.username || null,
        password: form.password || null,
        ssl_enabled: form.ssl_enabled,
      };
      const res = await testConnection(payload);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.detail || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    if (!form.name.trim() || !form.db_type || !form.database.trim()) {
      toast.error('Please fill in Name, DB Type, and Database');
      return;
    }
    setSaving(true);
    try {
      const params = {
        name: form.name,
        db_type: form.db_type,
        database: form.database,
        host: form.host || null,
        port: form.port ? parseInt(form.port) : null,
        username: form.username || null,
        password: form.password || null,
        ssl_enabled: form.ssl_enabled,
      };
      const res = await createConnection(params);
      toast.success('Connection saved');
      const newConn = res.data.connection;
      setConnections(prev => [...prev, newConn]);
      // Go to tables view
      setActiveConnectionId(newConn.id);
      setActiveConnectionName(newConn.name);
      setView('tables');
      await loadTables(newConn.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConnection = async (connId) => {
    try {
      await deleteConnection(connId);
      setConnections(prev => prev.filter(c => c.id !== connId));
      toast.success('Connection deleted');
    } catch {
      toast.error('Failed to delete connection');
    }
  };

  const handleBrowseTables = async (conn) => {
    setActiveConnectionId(conn.id);
    setActiveConnectionName(conn.name);
    setView('tables');
    await loadTables(conn.id);
  };

  const loadTables = async (connId) => {
    setLoadingTables(true);
    setTables([]);
    try {
      const res = await getConnectionTables(connId);
      setTables(res.data.tables || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to fetch tables');
    } finally {
      setLoadingTables(false);
    }
  };

  const handleSelectTable = async (tableName, schema) => {
    setSelectedTable(tableName);
    setSelectedSchema(schema);
    setView('columns');
    setLoadingColumns(true);
    try {
      const res = await getConnectionTableColumns(activeConnectionId, tableName, schema);
      setColumns(res.data.columns || []);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to fetch columns');
    } finally {
      setLoadingColumns(false);
    }
  };

  const handleImport = async () => {
    if (!sessionId || !activeConnectionId || !selectedTable) return;
    setImporting(true);
    try {
      const res = await importTableFromDb(sessionId, activeConnectionId, selectedTable, 10000, selectedSchema);
      const imported = res.data.table;
      toast.success(`Imported "${imported.table_name}" — ${imported.rows} rows, ${imported.columns} columns`);
      onTableImported(imported);
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to import table');
    } finally {
      setImporting(false);
    }
  };

  const canTest = form.db_type && form.database;
  const canSave = form.name && form.db_type && form.database;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto" data-testid="db-connect-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Database size={22} weight="duotone" className="text-sky-600" />
            {view === 'list' && 'Database Connections'}
            {view === 'form' && 'New Connection'}
            {view === 'tables' && (
              <span>Tables — <span className="text-sky-600">{activeConnectionName}</span></span>
            )}
            {view === 'columns' && (
              <span>Columns — <span className="text-sky-600">{selectedTable}</span></span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ========== LIST VIEW ========== */}
        {view === 'list' && (
          <div className="space-y-4" data-testid="db-connection-list-view">
            <Button onClick={() => { setForm({ ...DEFAULT_FORM }); setTestResult(null); setView('form'); }} className="w-full" data-testid="new-connection-btn">
              <Plugs size={18} className="mr-2" /> New Connection
            </Button>

            {loadingConnections ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size={24} className="animate-spin text-slate-400" />
              </div>
            ) : connections.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                No saved connections yet. Create one above.
              </div>
            ) : (
              <div className="space-y-2">
                {connections.map(conn => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-sky-300 transition-colors"
                    data-testid={`saved-connection-${conn.id}`}
                  >
                    <div
                      className="flex items-center gap-3 cursor-pointer flex-1"
                      onClick={() => handleBrowseTables(conn)}
                    >
                      <Database size={22} weight="duotone" className="text-slate-500" />
                      <div>
                        <p className="font-medium text-sm text-slate-900">{conn.name}</p>
                        <p className="text-xs text-slate-500">
                          {conn.db_type} — {conn.db_type === 'sqlite' ? conn.database : `${conn.host}:${conn.port}/${conn.database}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-500 hover:bg-rose-50"
                      onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.id); }}
                      data-testid={`delete-connection-${conn.id}`}
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== NEW CONNECTION FORM ========== */}
        {view === 'form' && (
          <div className="space-y-4" data-testid="db-connection-form">
            <Button variant="ghost" size="sm" onClick={() => setView('list')} className="text-slate-500 -ml-2">
              <ArrowLeft size={16} className="mr-1" /> Back to list
            </Button>

            <div className="space-y-3">
              <div>
                <Label>Connection Name</Label>
                <Input
                  placeholder="e.g., Production PostgreSQL"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  data-testid="conn-name-input"
                />
              </div>

              <div>
                <Label>Database Type</Label>
                <Select value={form.db_type} onValueChange={handleDbTypeChange}>
                  <SelectTrigger data-testid="conn-db-type-select">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {DB_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.db_type && form.db_type !== 'sqlite' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label>Host</Label>
                    <Input
                      placeholder="localhost"
                      value={form.host}
                      onChange={e => setForm(p => ({ ...p, host: e.target.value }))}
                      data-testid="conn-host-input"
                    />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      placeholder="5432"
                      value={form.port}
                      onChange={e => setForm(p => ({ ...p, port: e.target.value }))}
                      data-testid="conn-port-input"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label>{form.db_type === 'sqlite' ? 'Database File Path' : 'Database Name'}</Label>
                <Input
                  placeholder={form.db_type === 'sqlite' ? '/path/to/database.db' : 'my_database'}
                  value={form.database}
                  onChange={e => setForm(p => ({ ...p, database: e.target.value }))}
                  data-testid="conn-database-input"
                />
              </div>

              {form.db_type && form.db_type !== 'sqlite' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Username</Label>
                    <Input
                      placeholder="user"
                      value={form.username}
                      onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                      data-testid="conn-username-input"
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      placeholder="password"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      data-testid="conn-password-input"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SSL Toggle (for non-SQLite) */}
            {form.db_type && form.db_type !== 'sqlite' && (
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <Switch
                  checked={form.ssl_enabled}
                  onCheckedChange={v => setForm(p => ({ ...p, ssl_enabled: v }))}
                  data-testid="conn-ssl-toggle"
                />
                <div>
                  <Label className="text-sm font-medium">SSL / TLS Encryption</Label>
                  <p className="text-xs text-slate-500">Required for cloud-hosted databases (Aiven, AWS RDS, etc.)</p>
                </div>
              </div>
            )}

            {/* Test + Result */}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={!canTest || testing}
                data-testid="test-connection-btn"
              >
                {testing ? <Spinner size={16} className="mr-2 animate-spin" /> : <Lightning size={16} className="mr-2" />}
                Test Connection
              </Button>
              {testResult && (
                <div className="flex items-center gap-1.5 text-sm">
                  {testResult.success ? (
                    <>
                      <CheckCircle size={18} className="text-emerald-500" weight="fill" />
                      <span className="text-emerald-600">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={18} className="text-rose-500" weight="fill" />
                      <span className="text-rose-600 truncate max-w-[280px]">{testResult.message}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <Button
              onClick={handleSaveConnection}
              disabled={!canSave || saving}
              className="w-full"
              data-testid="save-connection-btn"
            >
              {saving ? <Spinner size={16} className="mr-2 animate-spin" /> : <FloppyDisk size={16} className="mr-2" />}
              Save & Browse Tables
            </Button>
          </div>
        )}

        {/* ========== TABLES VIEW ========== */}
        {view === 'tables' && (
          <div className="space-y-4" data-testid="db-tables-view">
            <Button variant="ghost" size="sm" onClick={() => { setView('list'); setTables([]); }} className="text-slate-500 -ml-2">
              <ArrowLeft size={16} className="mr-1" /> Back to connections
            </Button>

            {loadingTables ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size={28} className="animate-spin text-sky-500" />
                <span className="ml-3 text-sm text-slate-500">Fetching tables...</span>
              </div>
            ) : tables.length === 0 ? (
              <div className="text-center py-12 text-sm text-slate-500">No tables found in this database.</div>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {tables.map(t => (
                  <div
                    key={`${t.schema}.${t.name}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-sky-50 hover:border-sky-300 cursor-pointer transition-colors"
                    onClick={() => handleSelectTable(t.name, t.schema)}
                    data-testid={`db-table-${t.name}`}
                  >
                    <div className="flex items-center gap-2">
                      <TableIcon size={18} weight="duotone" className="text-slate-400" />
                      <span className="text-sm font-medium text-slate-900">{t.name}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">{t.schema}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== COLUMNS PREVIEW VIEW ========== */}
        {view === 'columns' && (
          <div className="space-y-4" data-testid="db-columns-view">
            <Button variant="ghost" size="sm" onClick={() => { setView('tables'); setColumns([]); setSelectedTable(null); }} className="text-slate-500 -ml-2">
              <ArrowLeft size={16} className="mr-1" /> Back to tables
            </Button>

            {loadingColumns ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size={28} className="animate-spin text-sky-500" />
                <span className="ml-3 text-sm text-slate-500">Fetching columns...</span>
              </div>
            ) : (
              <>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-slate-600">Column</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-600">Type</th>
                        <th className="px-4 py-2 text-left font-medium text-slate-600">Nullable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col, idx) => (
                        <tr key={col.name} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-4 py-2 font-medium text-slate-900">{col.name}</td>
                          <td className="px-4 py-2 text-slate-600">{col.db_type}</td>
                          <td className="px-4 py-2 text-slate-500">{col.nullable ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Button
                  onClick={handleImport}
                  disabled={importing || columns.length === 0}
                  className="w-full bg-sky-600 hover:bg-sky-700"
                  data-testid="import-table-btn"
                >
                  {importing ? (
                    <><Spinner size={16} className="mr-2 animate-spin" /> Importing...</>
                  ) : (
                    <><DownloadSimple size={16} className="mr-2" /> Import "{selectedTable}" into Session</>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
