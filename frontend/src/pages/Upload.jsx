import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Upload as UploadIcon, 
  File, 
  X, 
  CheckCircle,
  Warning,
  FileXls,
  FileCsv,
  ArrowRight
} from '@phosphor-icons/react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { uploadFile } from '../lib/api';
import { toast } from 'sonner';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [columnName, setColumnName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const validateAndSetFile = (selectedFile) => {
    const validTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    const validExtensions = ['.csv', '.xls', '.xlsx'];
    
    const hasValidExtension = validExtensions.some(ext => 
      selectedFile.name.toLowerCase().endsWith(ext)
    );
    
    if (!validTypes.includes(selectedFile.type) && !hasValidExtension) {
      toast.error('Invalid file type. Please upload a CSV or Excel file.');
      return;
    }
    
    if (selectedFile.size > 100 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 100MB.');
      return;
    }
    
    setFile(selectedFile);
    setResult(null);
  };

  const handleFileInput = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }
    
    if (!columnName.trim()) {
      toast.error('Please enter the column name to process');
      return;
    }
    
    setUploading(true);
    try {
      const response = await uploadFile(file, columnName.trim());
      setResult(response.data);
      toast.success('File processed successfully!');
    } catch (error) {
      const message = error.response?.data?.detail || 'Failed to upload file';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setColumnName('');
    setResult(null);
  };

  const getFileIcon = () => {
    if (!file) return UploadIcon;
    if (file.name.endsWith('.csv')) return FileCsv;
    return FileXls;
  };

  const FileIcon = getFileIcon();

  return (
    <div className="p-8" data-testid="upload-page">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Upload File</h1>
          <p className="text-slate-500 mt-1">Upload a CSV or Excel file to standardize values</p>
        </div>

        {!result ? (
          <div className="space-y-6">
            {/* Drop Zone */}
            <div
              className={`upload-zone ${isDragging ? 'upload-zone-active' : ''} ${file ? 'border-emerald-400 bg-emerald-50/50' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
              data-testid="upload-dropzone"
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.xls,.xlsx"
                onChange={handleFileInput}
                className="hidden"
                data-testid="file-input"
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                    <FileIcon size={32} weight="duotone" className="text-emerald-600" />
                  </div>
                  <p className="font-medium text-slate-900">{file.name}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    data-testid="remove-file-btn"
                  >
                    <X size={16} className="mr-1" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mb-4">
                    <UploadIcon size={32} weight="duotone" className="text-slate-400" />
                  </div>
                  <p className="font-medium text-slate-900">Drop your file here</p>
                  <p className="text-sm text-slate-500 mt-1">or click to browse</p>
                  <p className="text-xs text-slate-400 mt-3">CSV, XLS, XLSX up to 100MB</p>
                </div>
              )}
            </div>

            {/* Column Name Input */}
            <div className="space-y-2">
              <Label htmlFor="column-name" className="text-slate-700">
                Column Name to Process
              </Label>
              <Input
                id="column-name"
                placeholder="e.g., DISCHARGE_DESTINATION"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                className="text-base"
                data-testid="column-name-input"
              />
              <p className="text-xs text-slate-500">
                Enter the exact column name from your file that contains values to standardize
              </p>
            </div>

            {/* Upload Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleUpload}
              disabled={!file || !columnName.trim() || uploading}
              data-testid="upload-submit-btn"
            >
              {uploading ? (
                <>
                  <div className="spinner mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <UploadIcon size={20} className="mr-2" />
                  Process File
                </>
              )}
            </Button>
          </div>
        ) : (
          /* Results */
          <div className="space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <CheckCircle size={28} weight="duotone" className="text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">Processing Complete</h2>
                  <p className="text-sm text-slate-500">{result.filename}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">Total Rows</p>
                  <p className="text-2xl font-bold text-slate-900">{result.total_values.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-slate-500">Unique Values</p>
                  <p className="text-2xl font-bold text-slate-900">{result.unique_values.toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Auto-Mapped</span>
                  </div>
                  <span className="font-bold text-emerald-700">{result.auto_mapped}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2">
                    <Warning size={20} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">Needs Review</span>
                  </div>
                  <span className="font-bold text-amber-700">{result.needs_review}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <div className="flex items-center gap-2">
                    <File size={20} className="text-rose-600" />
                    <span className="text-sm font-medium text-rose-700">Unmapped</span>
                  </div>
                  <span className="font-bold text-rose-700">{result.unmapped}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetForm}
                data-testid="upload-another-btn"
              >
                Upload Another
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate(`/review/${result.batch_id}`)}
                data-testid="review-results-btn"
              >
                Review Results
                <ArrowRight size={18} className="ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
