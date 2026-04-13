import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Check,
  Upload,
  Table,
  TextAa,
  Funnel,
  ListChecks,
  Plus,
  X,
  File,
  FileCsv,
  FileXls,
  CaretRight,
  CaretDown,
  ArrowRight,
  Spinner,
  Database,
  Eye,
  EyeSlash
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  createSession,
  uploadToSession,
  createManualTable,
  deleteTable,
  addColumnToTable,
  saveFieldDefinitions,
  processSession,
  getDomains,
  getSession as fetchSessionApi,
  getTablePreview
} from '../lib/api';
import { toast } from 'sonner';
import DatabaseConnectDialog from '../components/DatabaseConnectDialog';

const STEPS = [
  { id: 1, name: 'Connect', icon: Upload },
  { id: 2, name: 'Discover', icon: Table },
  { id: 3, name: 'Define Fields', icon: TextAa },
  { id: 4, name: 'Standardization Gate', icon: Funnel },
  { id: 5, name: 'Domain & Reference', icon: ListChecks },
];

const TYPE_COLORS = {
  string: 'bg-sky-100 text-sky-700 border-sky-200',
  numeric: 'bg-purple-100 text-purple-700 border-purple-200',
  date: 'bg-amber-100 text-amber-700 border-amber-200',
  boolean: 'bg-teal-100 text-teal-700 border-teal-200',
};

const DOMAIN_SUGGESTIONS = {
  disposition: 'Disposition',
  discharge: 'Disposition',
  ward: 'Ward',
  unit: 'Ward',
  specialty: 'Specialty',
  spec: 'Specialty',
  department: 'Specialty',
  status: 'Status',
  state: 'Status',
  priority: 'Priority',
  urgency: 'Priority',
  gender: 'Gender',
  sex: 'Gender',
  country: 'Country',
  nation: 'Country',
};

// Stepper Component
const Stepper = ({ currentStep, completedSteps }) => (
  <div className="flex items-center justify-center mb-8" data-testid="stepper">
    {STEPS.map((step, index) => {
      const isCompleted = completedSteps.includes(step.id);
      const isActive = currentStep === step.id;
      const isUpcoming = !isCompleted && !isActive;
      
      return (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                isCompleted
                  ? 'bg-emerald-500 text-white'
                  : isActive
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border-2 border-slate-300 text-slate-400'
              }`}
              data-testid={`step-${step.id}`}
            >
              {isCompleted ? <Check size={18} weight="bold" /> : step.id}
            </div>
            <span className={`mt-2 text-xs font-medium ${isActive ? 'text-sky-600' : 'text-slate-500'}`}>
              {step.name}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`w-16 h-0.5 mx-2 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
          )}
        </div>
      );
    })}
  </div>
);

// Step 1: Connect
const ConnectStep = ({ session, tables, onCreateSession, onUploadFile, onCreateTable, onDeleteTable, onTableImported, onNext }) => {
  const [sessionName, setSessionName] = useState(session?.name || '');
  const [newTableName, setNewTableName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dbDialogOpen, setDbDialogOpen] = useState(false);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleUpload(file);
    }
  }, [session]);

  const handleUpload = async (file) => {
    if (!session) {
      toast.error('Please enter a session name first');
      return;
    }
    setUploading(true);
    try {
      await onUploadFile(file);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateTable = async () => {
    if (!newTableName.trim()) return;
    if (!session) {
      toast.error('Please enter a session name first');
      return;
    }
    setCreating(true);
    try {
      await onCreateTable(newTableName.trim());
      setNewTableName('');
    } finally {
      setCreating(false);
    }
  };

  const handleSessionCreate = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }
    await onCreateSession(sessionName.trim());
  };

  return (
    <div className="space-y-6" data-testid="connect-step">
      {/* Session Name */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <Label className="text-base font-medium text-slate-900">Session Name</Label>
        <div className="flex gap-3 mt-2">
          <Input
            placeholder="e.g., Q3 Hospital Data"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            disabled={!!session}
            className="flex-1"
            data-testid="session-name-input"
          />
          {!session && (
            <Button onClick={handleSessionCreate} data-testid="create-session-btn">
              Create Session
            </Button>
          )}
        </div>
        {session && (
          <p className="text-sm text-emerald-600 mt-2">Session created: {session.name}</p>
        )}
      </div>

      {session && (
        <>
          {/* Upload, Manual & Database Options */}
          <div className="grid grid-cols-3 gap-4">
            {/* Upload File Card */}
            <div
              className={`bg-white rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                isDragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 hover:border-sky-400 hover:bg-slate-50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('ingest-file-input').click()}
              data-testid="upload-zone"
            >
              <input
                id="ingest-file-input"
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(e) => e.target.files[0] && handleUpload(e.target.files[0])}
              />
              {uploading ? (
                <Spinner size={32} className="mx-auto animate-spin text-sky-600" />
              ) : (
                <Upload size={32} weight="duotone" className="mx-auto text-slate-400" />
              )}
              <p className="mt-3 font-medium text-slate-900">Upload File</p>
              <p className="text-sm text-slate-500 mt-1">Drag & drop CSV or Excel</p>
            </div>

            {/* Connect to Database Card */}
            <div
              className="bg-white rounded-xl border-2 border-dashed border-slate-300 p-8 text-center cursor-pointer transition-all hover:border-sky-400 hover:bg-slate-50"
              onClick={() => setDbDialogOpen(true)}
              data-testid="connect-db-zone"
            >
              <Database size={32} weight="duotone" className="mx-auto text-slate-400" />
              <p className="mt-3 font-medium text-slate-900">Connect Database</p>
              <p className="text-sm text-slate-500 mt-1">PostgreSQL, MySQL, SQLite</p>
            </div>

            {/* Manual Table Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <Table size={32} weight="duotone" className="text-slate-400" />
              <p className="mt-3 font-medium text-slate-900">Create Table Manually</p>
              <div className="flex gap-2 mt-3">
                <Input
                  placeholder="Table name"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="flex-1"
                  data-testid="manual-table-input"
                />
                <Button
                  size="sm"
                  onClick={handleCreateTable}
                  disabled={!newTableName.trim() || creating}
                  data-testid="add-table-btn"
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          </div>

          {/* Database Connect Dialog */}
          <DatabaseConnectDialog
            open={dbDialogOpen}
            onOpenChange={setDbDialogOpen}
            sessionId={session?.id}
            onTableImported={onTableImported}
          />

          {/* Tables List */}
          {tables.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-medium text-slate-900 mb-4">Tables in this session ({tables.length})</h3>
              <div className="space-y-2">
                {tables.map((table) => (
                  <div
                    key={table.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                    data-testid={`table-item-${table.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {table.source_filename?.startsWith('db://') ? (
                        <Database size={24} weight="duotone" className="text-sky-600" />
                      ) : table.source_filename?.endsWith('.csv') ? (
                        <FileCsv size={24} weight="duotone" className="text-emerald-600" />
                      ) : table.source_filename ? (
                        <FileXls size={24} weight="duotone" className="text-emerald-600" />
                      ) : (
                        <Table size={24} weight="duotone" className="text-slate-500" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">{table.table_name}</p>
                        <p className="text-xs text-slate-500">
                          {table.source_filename || 'Manual'} • {table.columns?.length || 0} columns
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => onDeleteTable(table.id)}
                      data-testid={`delete-table-${table.id}`}
                    >
                      <X size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Next Button */}
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!session || tables.length === 0}
          data-testid="next-step-btn"
        >
          Next
          <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 2: Discover Tables
const DiscoverStep = ({ tables, sessionId, onAddColumn, onBack, onNext }) => {
  const [expandedTables, setExpandedTables] = useState(tables.map(t => t.id));
  const [newColumnName, setNewColumnName] = useState({});
  const [newColumnType, setNewColumnType] = useState({});
  const [previewData, setPreviewData] = useState({});
  const [previewLoading, setPreviewLoading] = useState({});
  const [previewVisible, setPreviewVisible] = useState({});

  const toggleTable = (tableId) => {
    setExpandedTables(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  const handleAddColumn = async (tableId) => {
    const name = newColumnName[tableId];
    const type = newColumnType[tableId] || 'string';
    if (!name?.trim()) return;
    
    await onAddColumn(tableId, name.trim(), type);
    setNewColumnName(prev => ({ ...prev, [tableId]: '' }));
    setNewColumnType(prev => ({ ...prev, [tableId]: 'string' }));
  };

  const togglePreview = async (tableId) => {
    if (previewVisible[tableId]) {
      setPreviewVisible(prev => ({ ...prev, [tableId]: false }));
      return;
    }
    // Load preview data if not already loaded
    if (!previewData[tableId]) {
      setPreviewLoading(prev => ({ ...prev, [tableId]: true }));
      try {
        const res = await getTablePreview(sessionId, tableId, 20);
        setPreviewData(prev => ({ ...prev, [tableId]: res.data }));
      } catch {
        toast.error('Failed to load data preview');
      } finally {
        setPreviewLoading(prev => ({ ...prev, [tableId]: false }));
      }
    }
    setPreviewVisible(prev => ({ ...prev, [tableId]: true }));
  };

  const allTablesHaveColumns = tables.every(t => t.columns?.length > 0);

  return (
    <div className="space-y-4" data-testid="discover-step">
      {tables.map((table) => {
        const preview = previewData[table.id];
        const isPreviewVisible = previewVisible[table.id];
        const isPreviewLoading = previewLoading[table.id];

        return (
          <div key={table.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
              onClick={() => toggleTable(table.id)}
            >
              <div className="flex items-center gap-3">
                {expandedTables.includes(table.id) ? (
                  <CaretDown size={20} className="text-slate-500" />
                ) : (
                  <CaretRight size={20} className="text-slate-500" />
                )}
                <div>
                  <p className="font-medium text-slate-900">{table.table_name}</p>
                  <p className="text-xs text-slate-500">{table.columns?.length || 0} columns</p>
                </div>
              </div>
              {/* Data Preview Toggle */}
              {table.source_filename && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-500 hover:text-sky-600"
                  onClick={(e) => { e.stopPropagation(); togglePreview(table.id); }}
                  data-testid={`preview-toggle-${table.id}`}
                >
                  {isPreviewLoading ? (
                    <Spinner size={16} className="animate-spin mr-1.5" />
                  ) : isPreviewVisible ? (
                    <EyeSlash size={16} className="mr-1.5" />
                  ) : (
                    <Eye size={16} className="mr-1.5" />
                  )}
                  {isPreviewVisible ? 'Hide Data' : 'Preview Data'}
                </Button>
              )}
            </div>

            {expandedTables.includes(table.id) && (
              <div className="border-t border-slate-200 p-4 space-y-3">
                {/* Data Preview Table */}
                {isPreviewVisible && preview && (
                  <div className="mb-4 border border-sky-200 rounded-lg overflow-hidden" data-testid={`data-preview-${table.id}`}>
                    <div className="px-4 py-2 bg-sky-50 border-b border-sky-200 flex items-center justify-between">
                      <span className="text-sm font-medium text-sky-700">
                        Data Preview — {preview.total_rows} total rows (showing {preview.data.length})
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-80">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200 w-10">#</th>
                            {preview.columns.map(col => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-200 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.data.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-3 py-1.5 text-slate-400 border-b border-slate-100">{idx + 1}</td>
                              {preview.columns.map(col => (
                                <td key={col} className="px-3 py-1.5 text-slate-700 border-b border-slate-100 whitespace-nowrap max-w-[200px] truncate">
                                  {String(row[col] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Column list */}
                {table.columns?.map((col, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{col.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[col.inferred_type] || TYPE_COLORS.string}`}>
                          {col.inferred_type}
                        </span>
                      </div>
                      {col.sample_values?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {col.sample_values.slice(0, 5).map((val, i) => (
                            <span key={i} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs">
                              {val.length > 30 ? val.substring(0, 30) + '...' : val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add Column (for manual tables) */}
                {!table.source_filename && (
                  <div className="flex gap-2 mt-3 p-3 border border-dashed border-slate-300 rounded-lg">
                    <Input
                      placeholder="Column name"
                      value={newColumnName[table.id] || ''}
                      onChange={(e) => setNewColumnName(prev => ({ ...prev, [table.id]: e.target.value }))}
                      className="flex-1"
                      data-testid={`add-column-name-${table.id}`}
                    />
                    <Select
                      value={newColumnType[table.id] || 'string'}
                      onValueChange={(v) => setNewColumnType(prev => ({ ...prev, [table.id]: v }))}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">String</SelectItem>
                        <SelectItem value="numeric">Numeric</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="boolean">Boolean</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => handleAddColumn(table.id)} data-testid={`add-column-btn-${table.id}`}>
                      <Plus size={16} className="mr-1" /> Add
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="back-btn">Back</Button>
        <Button onClick={onNext} disabled={!allTablesHaveColumns} data-testid="next-step-btn">
          Next <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 3: Define Fields
const DefineFieldsStep = ({ tables, fieldDefinitions, setFieldDefinitions, onBack, onNext }) => {
  const updateField = (tableId, columnName, key, value) => {
    setFieldDefinitions(prev => {
      const newDefs = { ...prev };
      if (!newDefs[tableId]) newDefs[tableId] = {};
      if (!newDefs[tableId][columnName]) {
        const col = tables.find(t => t.id === tableId)?.columns?.find(c => c.name === columnName);
        newDefs[tableId][columnName] = {
          data_type: col?.inferred_type || 'string',
          standardize: col?.inferred_type === 'string',
          store_as_is: col?.inferred_type !== 'string',
        };
      }
      newDefs[tableId][columnName][key] = value;
      if (key === 'standardize') {
        newDefs[tableId][columnName].store_as_is = !value;
      }
      return newDefs;
    });
  };

  const getFieldDef = (tableId, col) => {
    return fieldDefinitions[tableId]?.[col.name] || {
      data_type: col.inferred_type || 'string',
      standardize: col.inferred_type === 'string',
      store_as_is: col.inferred_type !== 'string',
    };
  };

  return (
    <div className="space-y-6" data-testid="define-fields-step">
      {tables.map((table) => (
        <div key={table.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="font-semibold text-slate-900">{table.table_name}</h3>
          </div>
          <div className="p-4 space-y-4">
            {table.columns?.map((col) => {
              const def = getFieldDef(table.id, col);
              return (
                <div key={col.name} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{col.name}</p>
                      {col.sample_values?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {col.sample_values.slice(0, 3).map((val, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded text-xs">
                              {val.length > 20 ? val.substring(0, 20) + '...' : val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <Select
                        value={def.data_type}
                        onValueChange={(v) => updateField(table.id, col.name, 'data_type', v)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="numeric">Numeric</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={def.standardize}
                          onCheckedChange={(v) => updateField(table.id, col.name, 'standardize', v)}
                          data-testid={`standardize-toggle-${col.name}`}
                        />
                        <Label className="text-sm text-slate-600">
                          {def.standardize ? 'Standardize' : 'Store as-is'}
                        </Label>
                      </div>
                    </div>
                  </div>
                  {/* Notes/Comments field */}
                  <div className="mt-3">
                    <Input
                      placeholder="Add notes or documentation for this field..."
                      value={def.notes || ''}
                      onChange={(e) => updateField(table.id, col.name, 'notes', e.target.value)}
                      className="text-sm bg-white"
                      data-testid={`field-notes-${col.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="back-btn">Back</Button>
        <Button onClick={onNext} data-testid="next-step-btn">
          Next <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 4: Standardization Gate with Drag & Drop
const StandardizationGateStep = ({ tables, fieldDefinitions, setFieldDefinitions, onBack, onNext }) => {
  const [draggedField, setDraggedField] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const standardizeFields = [];
  const storeAsIsFields = [];

  tables.forEach(table => {
    table.columns?.forEach(col => {
      const def = fieldDefinitions[table.id]?.[col.name] || {
        standardize: col.inferred_type === 'string',
      };
      const field = { tableId: table.id, tableName: table.table_name, column: col, def };
      if (def.standardize) {
        standardizeFields.push(field);
      } else {
        storeAsIsFields.push(field);
      }
    });
  });

  const toggleField = (tableId, columnName) => {
    setFieldDefinitions(prev => {
      const newDefs = { ...prev };
      if (!newDefs[tableId]) newDefs[tableId] = {};
      const current = newDefs[tableId][columnName]?.standardize ?? true;
      newDefs[tableId][columnName] = {
        ...newDefs[tableId][columnName],
        standardize: !current,
        store_as_is: current,
      };
      return newDefs;
    });
  };

  const handleDragStart = (e, field, fromStandardize) => {
    setDraggedField({ ...field, fromStandardize });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${field.tableId}|${field.column.name}`);
  };

  const handleDragOver = (e, target) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e, toStandardize) => {
    e.preventDefault();
    setDropTarget(null);
    
    if (draggedField && draggedField.fromStandardize !== toStandardize) {
      toggleField(draggedField.tableId, draggedField.column.name);
    }
    setDraggedField(null);
  };

  const handleDragEnd = () => {
    setDraggedField(null);
    setDropTarget(null);
  };

  const FieldChip = ({ field, isStandardize }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, field, isStandardize)}
      onDragEnd={handleDragEnd}
      className={`flex items-center justify-between p-3 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
        isStandardize ? 'bg-sky-50 hover:bg-sky-100' : 'bg-slate-50 hover:bg-slate-100'
      } ${draggedField?.tableId === field.tableId && draggedField?.column.name === field.column.name ? 'opacity-50 scale-95' : ''}`}
      data-testid={`field-chip-${field.column.name}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-8 bg-slate-300 rounded-full cursor-grab" />
        <div>
          <span className="text-sm font-medium text-slate-900">{field.column.name}</span>
          <span className="text-xs text-slate-500 ml-2">({field.tableName})</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => toggleField(field.tableId, field.column.name)}
        className="text-slate-500 hover:text-slate-700 ml-2"
        data-testid={`toggle-field-${field.column.name}`}
      >
        <ArrowRight size={16} className={isStandardize ? '' : 'rotate-180'} />
      </Button>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="gate-step">
      <div className="bg-slate-50 rounded-xl p-4 text-center">
        <p className="text-lg font-medium text-slate-900">
          <span className="text-sky-600">{standardizeFields.length}</span> fields will be standardized across{' '}
          <span className="text-sky-600">{new Set(standardizeFields.map(f => f.tableId)).size}</span> tables
        </p>
        <p className="text-sm text-slate-500 mt-1">Drag fields between columns or use arrow buttons</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Standardize Column */}
        <div 
          className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
            dropTarget === 'standardize' ? 'border-sky-500 bg-sky-50/50' : 'border-slate-200'
          }`}
          onDragOver={(e) => handleDragOver(e, 'standardize')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, true)}
          data-testid="standardize-drop-zone"
        >
          <div className="px-4 py-3 bg-sky-50 border-b border-sky-200">
            <h3 className="font-semibold text-sky-700">Will be Standardized ({standardizeFields.length})</h3>
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-auto min-h-[200px]">
            {standardizeFields.map((field) => (
              <FieldChip key={`${field.tableId}-${field.column.name}`} field={field} isStandardize={true} />
            ))}
            {standardizeFields.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                Drag fields here to standardize
              </div>
            )}
          </div>
        </div>

        {/* Store as-is Column */}
        <div 
          className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
            dropTarget === 'store' ? 'border-slate-500 bg-slate-50/50' : 'border-slate-200'
          }`}
          onDragOver={(e) => handleDragOver(e, 'store')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, false)}
          data-testid="store-drop-zone"
        >
          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200">
            <h3 className="font-semibold text-slate-700">Will be Stored as-is ({storeAsIsFields.length})</h3>
          </div>
          <div className="p-4 space-y-2 max-h-96 overflow-auto min-h-[200px]">
            {storeAsIsFields.map((field) => (
              <FieldChip key={`${field.tableId}-${field.column.name}`} field={field} isStandardize={false} />
            ))}
            {storeAsIsFields.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                Drag fields here to store as-is
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="back-btn">Back</Button>
        <Button onClick={onNext} data-testid="next-step-btn">
          Next <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>
    </div>
  );
};

// Step 5: Domain & Reference
const DomainReferenceStep = ({ tables, fieldDefinitions, setFieldDefinitions, domains, onBack, onProcess }) => {
  const [processing, setProcessing] = useState(false);

  const standardizeFields = [];
  tables.forEach(table => {
    table.columns?.forEach(col => {
      const def = fieldDefinitions[table.id]?.[col.name];
      if (def?.standardize) {
        standardizeFields.push({ tableId: table.id, tableName: table.table_name, column: col });
      }
    });
  });

  const suggestDomain = (columnName) => {
    const lower = columnName.toLowerCase();
    for (const [key, domain] of Object.entries(DOMAIN_SUGGESTIONS)) {
      if (lower.includes(key)) return domain;
    }
    return '';
  };

  const updateDomain = (tableId, columnName, domain) => {
    setFieldDefinitions(prev => {
      const newDefs = { ...prev };
      if (!newDefs[tableId]) newDefs[tableId] = {};
      newDefs[tableId][columnName] = {
        ...newDefs[tableId][columnName],
        domain,
        custom_references: domain === 'Custom' ? (newDefs[tableId][columnName]?.custom_references || []) : undefined,
      };
      return newDefs;
    });
  };

  const updateCustomRefs = (tableId, columnName, refs) => {
    setFieldDefinitions(prev => {
      const newDefs = { ...prev };
      if (!newDefs[tableId]) newDefs[tableId] = {};
      newDefs[tableId][columnName] = {
        ...newDefs[tableId][columnName],
        custom_references: refs,
      };
      return newDefs;
    });
  };

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await onProcess();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="domain-step">
      {standardizeFields.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-slate-500">No fields marked for standardization</p>
        </div>
      ) : (
        tables.map((table) => {
          const tableFields = standardizeFields.filter(f => f.tableId === table.id);
          if (tableFields.length === 0) return null;
          
          return (
            <div key={table.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900">{table.table_name}</h3>
              </div>
              <div className="p-4 space-y-4">
                {tableFields.map(({ column }) => {
                  const def = fieldDefinitions[table.id]?.[column.name] || {};
                  const selectedDomain = def.domain || suggestDomain(column.name);
                  const domainRefs = selectedDomain && selectedDomain !== 'Custom' ? domains[selectedDomain] : [];

                  return (
                    <div key={column.name} className="p-4 bg-slate-50 rounded-lg">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{column.name}</p>
                          {column.sample_values?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {column.sample_values.slice(0, 5).map((val, i) => (
                                <span key={i} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs">
                                  {val.length > 25 ? val.substring(0, 25) + '...' : val}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Select
                          value={selectedDomain}
                          onValueChange={(v) => updateDomain(table.id, column.name, v)}
                        >
                          <SelectTrigger className="w-40" data-testid={`domain-select-${column.name}`}>
                            <SelectValue placeholder="Select domain" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Disposition">Disposition</SelectItem>
                            <SelectItem value="Ward">Ward</SelectItem>
                            <SelectItem value="Specialty">Specialty</SelectItem>
                            <SelectItem value="Status">Status</SelectItem>
                            <SelectItem value="Priority">Priority</SelectItem>
                            <SelectItem value="Gender">Gender</SelectItem>
                            <SelectItem value="Country">Country</SelectItem>
                            <SelectItem value="Custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Domain References Preview */}
                      {selectedDomain && selectedDomain !== 'Custom' && domainRefs.length > 0 && (
                        <div className="mt-3 p-3 bg-white rounded border border-slate-200">
                          <p className="text-xs font-medium text-slate-500 mb-2">Golden Reference Values:</p>
                          <div className="flex flex-wrap gap-1">
                            {domainRefs.map((ref, i) => (
                              <span key={i} className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs">
                                {ref}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Custom References Input */}
                      {selectedDomain === 'Custom' && (
                        <div className="mt-3">
                          <Input
                            placeholder="Enter custom values separated by commas"
                            defaultValue={def.custom_references?.join(', ') || ''}
                            onBlur={(e) => {
                              const refs = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              updateCustomRefs(table.id, column.name, refs);
                            }}
                            data-testid={`custom-refs-${column.name}`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} data-testid="back-btn">Back</Button>
        <Button
          onClick={handleProcess}
          disabled={processing || standardizeFields.length === 0}
          className="bg-sky-600 hover:bg-sky-700"
          data-testid="run-matching-btn"
        >
          {processing ? (
            <>
              <Spinner size={18} className="mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>Run Matching Engine</>
          )}
        </Button>
      </div>
    </div>
  );
};

// Main Wizard Component
export default function IngestionWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [session, setSession] = useState(null);
  const [tables, setTables] = useState([]);
  const [fieldDefinitions, setFieldDefinitions] = useState({});
  const [domains, setDomains] = useState({});

  // Handle session resume from history page
  useEffect(() => {
    const resumeSession = location.state?.resumeSession;
    if (resumeSession) {
      setSession(resumeSession);
      setTables(resumeSession.tables || []);
      
      // Initialize field definitions from existing table columns
      const defs = {};
      resumeSession.tables?.forEach(table => {
        defs[table.id] = {};
        table.columns?.forEach(col => {
          defs[table.id][col.name] = {
            data_type: col.data_type || col.inferred_type || 'string',
            standardize: col.standardize ?? (col.inferred_type === 'string'),
            store_as_is: col.store_as_is ?? (col.inferred_type !== 'string'),
            domain: col.domain || null,
          };
        });
      });
      setFieldDefinitions(defs);
      
      // Set appropriate step based on session state
      if (resumeSession.tables?.length > 0) {
        setCompletedSteps([1]);
        setCurrentStep(2);
      }
      
      toast.success(`Resumed session: ${resumeSession.name}`);
      
      // Clear the state to prevent re-loading on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    getDomains().then(res => setDomains(res.data.domains)).catch(() => {});
  }, []);

  const handleCreateSession = async (name) => {
    try {
      const response = await createSession(name);
      setSession(response.data.session);
      toast.success('Session created');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create session');
    }
  };

  const handleUploadFile = async (file) => {
    try {
      const response = await uploadToSession(session.id, file);
      const newTable = response.data.table;
      setTables(prev => [...prev, newTable]);
      toast.success(`Uploaded: ${newTable.table_name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload file');
    }
  };

  const handleCreateTable = async (tableName) => {
    try {
      const response = await createManualTable(session.id, tableName);
      setTables(prev => [...prev, { ...response.data.table, columns: [] }]);
      toast.success(`Created table: ${tableName}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create table');
    }
  };

  const handleDeleteTable = async (tableId) => {
    try {
      await deleteTable(session.id, tableId);
      setTables(prev => prev.filter(t => t.id !== tableId));
      toast.success('Table removed');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete table');
    }
  };

  const handleTableImportedFromDb = (importedTable) => {
    setTables(prev => [...prev, {
      id: importedTable.id,
      table_name: importedTable.table_name,
      source_filename: importedTable.source,
      columns: [],
    }]);
    // Re-fetch session to get full column data
    if (session?.id) {
      fetchSessionApi(session.id).then(res => {
        setTables(res.data.tables || []);
      }).catch(() => {});
    }
  };

  const handleAddColumn = async (tableId, name, type) => {
    try {
      const response = await addColumnToTable(session.id, tableId, name, type);
      setTables(prev => prev.map(t => {
        if (t.id === tableId) {
          return { ...t, columns: [...(t.columns || []), response.data.column] };
        }
        return t;
      }));
      toast.success(`Column "${name}" added`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add column');
    }
  };

  const handleProcess = async () => {
    try {
      // Save field definitions for each table
      for (const table of tables) {
        const tableDefs = fieldDefinitions[table.id] || {};
        const fields = Object.entries(tableDefs).map(([column_name, def]) => ({
          column_name,
          data_type: def.data_type || 'string',
          standardize: def.standardize ?? false,
          domain: def.domain || null,
          store_as_is: def.store_as_is ?? true,
          custom_references: def.custom_references || null,
          notes: def.notes || null,
        }));
        
        if (fields.length > 0) {
          await saveFieldDefinitions(session.id, table.id, fields);
        }
      }

      // Process through matching engine
      const response = await processSession(session.id);
      const { batch_ids, fields_processed } = response.data;
      
      toast.success(`Processing complete — ${fields_processed} fields sent to matching engine`);
      
      if (batch_ids.length > 0) {
        navigate(`/review/${batch_ids[0]}`);
      } else {
        navigate('/batches');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process session');
    }
  };

  const goToStep = (step) => {
    if (step < currentStep) {
      setCurrentStep(step);
    } else if (step === currentStep + 1) {
      setCompletedSteps(prev => [...new Set([...prev, currentStep])]);
      setCurrentStep(step);
    }
  };

  return (
    <div className="p-8" data-testid="ingestion-wizard">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">New Ingestion</h1>
          <p className="text-slate-500 mt-1">Configure data sources and field mappings</p>
        </div>

        <Stepper currentStep={currentStep} completedSteps={completedSteps} />

        {currentStep === 1 && (
          <ConnectStep
            session={session}
            tables={tables}
            onCreateSession={handleCreateSession}
            onUploadFile={handleUploadFile}
            onCreateTable={handleCreateTable}
            onDeleteTable={handleDeleteTable}
            onTableImported={handleTableImportedFromDb}
            onNext={() => goToStep(2)}
          />
        )}

        {currentStep === 2 && (
          <DiscoverStep
            tables={tables}
            sessionId={session?.id}
            onAddColumn={handleAddColumn}
            onBack={() => setCurrentStep(1)}
            onNext={() => goToStep(3)}
          />
        )}

        {currentStep === 3 && (
          <DefineFieldsStep
            tables={tables}
            fieldDefinitions={fieldDefinitions}
            setFieldDefinitions={setFieldDefinitions}
            onBack={() => setCurrentStep(2)}
            onNext={() => goToStep(4)}
          />
        )}

        {currentStep === 4 && (
          <StandardizationGateStep
            tables={tables}
            fieldDefinitions={fieldDefinitions}
            setFieldDefinitions={setFieldDefinitions}
            onBack={() => setCurrentStep(3)}
            onNext={() => goToStep(5)}
          />
        )}

        {currentStep === 5 && (
          <DomainReferenceStep
            tables={tables}
            fieldDefinitions={fieldDefinitions}
            setFieldDefinitions={setFieldDefinitions}
            domains={domains}
            onBack={() => setCurrentStep(4)}
            onProcess={handleProcess}
          />
        )}
      </div>
    </div>
  );
}
