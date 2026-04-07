import { useState, useEffect } from 'react';
import {
  Plus,
  PencilSimple,
  Trash,
  CheckCircle,
  XCircle,
  ArrowCounterClockwise
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
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
import { getStandards, createStandard, updateStandard, deactivateStandard } from '../lib/api';
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

const AddStandardDialog = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim() || !label.trim()) {
      toast.error('Code and Label are required');
      return;
    }
    
    setSaving(true);
    try {
      await createStandard(code.trim(), label.trim(), description.trim());
      toast.success('Standard added successfully');
      setCode('');
      setLabel('');
      setDescription('');
      setOpen(false);
      onSuccess();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to add standard';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="add-standard-btn">
          <Plus size={18} className="mr-2" />
          Add Standard
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="add-standard-dialog">
        <DialogHeader>
          <DialogTitle>Add New Standard</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="std-code">Code</Label>
            <Input
              id="std-code"
              placeholder="e.g., HOSPICE or REHAB_CENTER"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              data-testid="standard-code-input"
            />
            <p className="text-xs text-slate-500">Unique identifier (will be auto-formatted to uppercase)</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="std-label">Label</Label>
            <Input
              id="std-label"
              placeholder="e.g., Hospice Care"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="standard-label-input"
            />
            <p className="text-xs text-slate-500">Human-readable display name</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="std-description">Description (Optional)</Label>
            <Textarea
              id="std-description"
              placeholder="e.g., Patient transferred to hospice care facility"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="standard-description-input"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              data-testid="cancel-standard-btn"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={saving || !code.trim() || !label.trim()}
              data-testid="save-standard-btn"
            >
              {saving ? 'Saving...' : 'Add Standard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EditStandardDialog = ({ standard, onSuccess, onClose }) => {
  const [label, setLabel] = useState(standard?.label || '');
  const [description, setDescription] = useState(standard?.description || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (standard) {
      setLabel(standard.label || '');
      setDescription(standard.description || '');
    }
  }, [standard]);

  const handleSubmit = async () => {
    if (!label.trim()) {
      toast.error('Label is required');
      return;
    }
    
    setSaving(true);
    try {
      await updateStandard(standard.code, { 
        label: label.trim(), 
        description: description.trim() 
      });
      toast.success('Standard updated successfully');
      onSuccess();
      onClose();
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to update standard';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!standard) return null;

  return (
    <Dialog open={!!standard} onOpenChange={onClose}>
      <DialogContent data-testid="edit-standard-dialog">
        <DialogHeader>
          <DialogTitle>Edit Standard: {standard.code}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={standard.code}
              disabled
              className="bg-slate-50"
            />
            <p className="text-xs text-slate-500">Code cannot be changed</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              data-testid="edit-standard-label-input"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="edit-standard-description-input"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={saving || !label.trim()}
              data-testid="update-standard-btn"
            >
              {saving ? 'Saving...' : 'Update Standard'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function Standards() {
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [editingStandard, setEditingStandard] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await getStandards(showInactive);
      setStandards(response.data.standards);
    } catch (error) {
      toast.error('Failed to load standards');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [showInactive]);

  const handleDeactivate = async (code) => {
    try {
      await deactivateStandard(code);
      toast.success(`Standard '${code}' deactivated`);
      fetchData();
    } catch (error) {
      toast.error('Failed to deactivate standard');
    }
  };

  const handleReactivate = async (code) => {
    try {
      await updateStandard(code, { active_flag: true });
      toast.success(`Standard '${code}' reactivated`);
      fetchData();
    } catch (error) {
      toast.error('Failed to reactivate standard');
    }
  };

  const activeStandards = standards.filter(s => s.active_flag !== false);
  const inactiveStandards = standards.filter(s => s.active_flag === false);

  return (
    <div className="p-8" data-testid="standards-page">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Standard Dictionary</h1>
            <p className="text-slate-500 mt-1">Manage standard codes for value mapping</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="show-inactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
                data-testid="show-inactive-toggle"
              />
              <Label htmlFor="show-inactive" className="text-sm text-slate-600 cursor-pointer">
                Show inactive
              </Label>
            </div>
            <AddStandardDialog onSuccess={fetchData} />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner" />
          </div>
        ) : standards.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Plus size={32} weight="duotone" className="text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">No standards yet</h2>
            <p className="text-slate-500 mt-2">Add your first standard code to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Standards */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="font-semibold text-slate-900">
                  Active Standards ({activeStandards.length})
                </h2>
              </div>
              <table className="w-full" data-testid="standards-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="data-table-header">Code</th>
                    <th className="data-table-header">Label</th>
                    <th className="data-table-header">Description</th>
                    <th className="data-table-header w-24">Status</th>
                    <th className="data-table-header w-28">Created</th>
                    <th className="data-table-header w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStandards.map((std, idx) => (
                    <tr 
                      key={std.code}
                      className={`data-table-row ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                      data-testid={`standard-row-${std.code}`}
                    >
                      <td className="data-table-cell">
                        <span className="font-mono text-sm font-medium text-slate-900">
                          {std.code}
                        </span>
                      </td>
                      <td className="data-table-cell font-medium">
                        {std.label}
                      </td>
                      <td className="data-table-cell text-slate-500 text-sm max-w-[300px] truncate" title={std.description}>
                        {std.description || '—'}
                      </td>
                      <td className="data-table-cell">
                        <span className="status-badge status-auto">
                          <CheckCircle size={12} className="mr-1" />
                          Active
                        </span>
                      </td>
                      <td className="data-table-cell text-slate-500 text-xs">
                        {formatDate(std.created_at)}
                      </td>
                      <td className="data-table-cell">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditingStandard(std)}
                            title="Edit"
                            data-testid={`edit-standard-${std.code}`}
                          >
                            <PencilSimple size={16} />
                          </Button>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                title="Deactivate"
                                data-testid={`deactivate-standard-${std.code}`}
                              >
                                <Trash size={16} />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Deactivate Standard?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will deactivate "{std.label}" ({std.code}). 
                                  It won't be available for new mappings but existing mappings will be preserved.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeactivate(std.code)}
                                  className="bg-rose-600 hover:bg-rose-700"
                                >
                                  Deactivate
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Inactive Standards */}
            {showInactive && inactiveStandards.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden opacity-75">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="font-semibold text-slate-600">
                    Inactive Standards ({inactiveStandards.length})
                  </h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="data-table-header">Code</th>
                      <th className="data-table-header">Label</th>
                      <th className="data-table-header">Description</th>
                      <th className="data-table-header w-24">Status</th>
                      <th className="data-table-header w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inactiveStandards.map((std, idx) => (
                      <tr 
                        key={std.code}
                        className={`data-table-row ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                      >
                        <td className="data-table-cell">
                          <span className="font-mono text-sm font-medium text-slate-500">
                            {std.code}
                          </span>
                        </td>
                        <td className="data-table-cell text-slate-500">
                          {std.label}
                        </td>
                        <td className="data-table-cell text-slate-400 text-sm max-w-[300px] truncate">
                          {std.description || '—'}
                        </td>
                        <td className="data-table-cell">
                          <span className="status-badge status-unmapped">
                            <XCircle size={12} className="mr-1" />
                            Inactive
                          </span>
                        </td>
                        <td className="data-table-cell">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-emerald-600 hover:bg-emerald-50"
                            onClick={() => handleReactivate(std.code)}
                            data-testid={`reactivate-standard-${std.code}`}
                          >
                            <ArrowCounterClockwise size={16} className="mr-1" />
                            Reactivate
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Edit Dialog */}
        <EditStandardDialog
          standard={editingStandard}
          onSuccess={fetchData}
          onClose={() => setEditingStandard(null)}
        />
      </div>
    </div>
  );
}
