import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useFiles, 
  useFileUpload, 
  useFileDelete, 
  KnowledgeFile as KnowledgeFileType 
} from '@/lib/api/rag';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';

declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
  }
}

// Focus management hook
const useFocusTrap = (isOpen: boolean) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Save current focus
    previousFocus.current = document.activeElement;
    
    // Focus first focusable element
    const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle keyboard trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (!containerRef.current) return;
      
      const focusableElements = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus.current instanceof HTMLElement) {
        previousFocus.current.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
};

// Generate width style for progress bar
const getProgressWidth = (value: number): React.CSSProperties => {
  const width = Math.min(100, Math.max(0, value));
  return { width: `${width}%` };
};

// Types
type KnowledgeFile = KnowledgeFileType;

interface UploadProgress {
  loaded: number;
  total: number;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface FileStatus {
  fileId: string;
  status: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

// API hooks
const useKnowledgeFiles = () => {
  const { data: files = [], isLoading, error } = useFiles();
  const queryClient = useQueryClient();
  
  const { mutateAsync: uploadFile, isPending: isUploading } = useFileUpload();
  const { mutateAsync: deleteFile, isPending: isDeleting } = useFileDelete();
  
  const handleUpload = async (file: File) => {
    try {
      await uploadFile(
        { 
          file, 
          onProgress: (progress) => {
            // Update progress in the UI
            console.log(`Upload progress: ${progress}%`);
          } 
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
          }
        }
      );
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      return false;
    }
  };
  
  const handleDelete = async (fileId: string) => {
    try {
      await deleteFile(fileId, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
        }
      });
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  };
  
  return {
    files,
    isLoading,
    error,
    uploadFile: handleUpload,
    deleteFile: handleDelete,
    isUploading,
    isDeleting: isDeleting
  };
};

// UI Components
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'outline' | 'ghost', size?: 'sm' | 'md' }> = 
({ children, className = '', variant = 'default', size = 'md', ...props }) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  };
  const sizeStyles = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 py-2',
  };
  
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

interface ProgressProps {
  value: number;
  className?: string;
  'aria-label'?: string;
}

const Progress: React.FC<ProgressProps> = ({ 
  value, 
  className = '',
  'aria-label': ariaLabel = 'Progress'
}) => {
  const progressValue = Math.min(100, Math.max(0, Math.round(value)));
  const progressStyle = getProgressWidth(progressValue);
  
  return (
    <div 
      className={`w-full bg-gray-200 rounded-full h-1.5 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={progressValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div 
        className="bg-blue-600 h-full rounded-full transition-all duration-300 ease-out"
        style={progressStyle}
      >
        <span className="sr-only">{progressValue}% complete</span>
      </div>
    </div>
  );
};

const Badge: React.FC<{ variant?: 'default' | 'success' | 'destructive' | 'processing', className?: string }> = 
({ children, className = '', variant = 'default' }) => {
  const baseStyles = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
  const variantStyles = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    destructive: 'bg-red-100 text-red-800',
    processing: 'bg-blue-100 text-blue-800',
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
};

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...props }) => (
  <input 
    className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props} 
  />
);

// Main Component
export function KnowledgeUploadPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<KnowledgeFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const confirmDialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableElementRef = useRef<HTMLButtonElement>(null);
  const lastFocusableElementRef = useRef<HTMLButtonElement>(null);
  
  // Focus trap for confirm dialog
  const dialogFocusTrapRef = useFocusTrap(isConfirmDialogOpen);
  
  const {
    files: knowledgeFiles = [],
    isLoading,
    uploadFile,
    deleteFile,
    isUploading,
    isDeleting
  } = useKnowledgeFiles();

  // Handle file status updates
  const processingFiles = useMemo(() => {
    const processing: Record<string, FileStatus> = {};
    knowledgeFiles.forEach(file => {
      if (['uploading', 'processing'].includes(file.status)) {
        processing[file.id] = {
          fileId: file.id,
          status: file.status as 'uploading' | 'processing',
          progress: file.status === 'uploading' ? 50 : 75, // Estimate progress
          error: file.error
        };
      }
    });
    return processing;
  }, [knowledgeFiles]);

  const filteredFiles = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return knowledgeFiles.filter(file => 
      file.name.toLowerCase().includes(query) ||
      file.type.toLowerCase().includes(query)
    );
  }, [knowledgeFiles, searchQuery]);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError(null);
    
    // Validate file type
    const validTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'];
    if (!validTypes.includes(file.type)) {
      const errorMsg = `Unsupported file type: ${file.type}. Please upload a PDF, TXT, MD, CSV, or JSON file.`;
      toast.error(errorMsg);
      setUploadError(errorMsg);
      return false;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      const errorMsg = `File too large: ${file.name}. Maximum size is 10MB.`;
      toast.error(errorMsg);
      setUploadError(errorMsg);
      return false;
    }

    try {
      const success = await uploadFile(file);
      if (success) {
        toast.success(`Successfully uploaded ${file.name}`);
        setSelectedFiles(prev => prev.filter(f => f.name !== file.name));
      } else {
        throw new Error('Upload failed');
      }
      return success;
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || `Failed to upload ${file.name}`;
      console.error('Error uploading file:', error);
      toast.error(errorMsg);
      setUploadError(errorMsg);
      return false;
    }
  }, [uploadFile]);
  
  const handleDeleteClick = useCallback((file: KnowledgeFile) => {
    setFileToDelete(file);
    setIsConfirmDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!fileToDelete) return false;
    
    try {
      const success = await deleteFile(fileToDelete.id);
      if (success) {
        toast.success(`Successfully deleted ${fileToDelete.name}`);
      } else {
        throw new Error('Deletion failed');
      }
      setIsConfirmDialogOpen(false);
      setFileToDelete(null);
      return success;
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || `Failed to delete ${fileToDelete.name}`;
      console.error('Error deleting file:', error);
      toast.error(errorMsg);
      setIsConfirmDialogOpen(false);
      setFileToDelete(null);
      return false;
    }
  }, [fileToDelete, deleteFile]);

  const handleCancelDelete = useCallback(() => {
    setIsConfirmDialogOpen(false);
    setFileToDelete(null);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
      
      // Process each file sequentially
      (async () => {
        for (const file of newFiles) {
          await handleFileUpload(file);
        }
      })();
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...newFiles]);
      
      // Process each file sequentially
      for (const file of newFiles) {
        await handleFileUpload(file);
      }
    }
  }, [handleFileUpload]);
  
  // Keyboard shortcuts
  useHotkeys('u', () => {
    fileInputRef.current?.click();
  }, { preventDefault: true, enableOnFormTags: true });
  
  useHotkeys('Escape', () => {
    if (isConfirmDialogOpen) {
      setIsConfirmDialogOpen(false);
    }
  }, { enableOnFormTags: true });
  
  // Focus management for accessibility
  useEffect(() => {
    if (knowledgeFiles.length === 0 && !isLoading) {
      dropZoneRef.current?.focus();
    }
    
    // Set focus to first focusable element when dialog opens
    if (isConfirmDialogOpen && firstFocusableElementRef.current) {
      firstFocusableElementRef.current.focus();
    }
  }, [knowledgeFiles.length, isLoading, isConfirmDialogOpen]);

  const getStatusBadge = (file: KnowledgeFile) => {
    const processingStatus = processingFiles[file.id]?.status;
    const status = processingStatus || file.status;
    const progress = processingFiles[file.id]?.progress;
    
    let badgeVariant: 'default' | 'success' | 'destructive' | 'processing' = 'default';
    let badgeText = status;
    
    if (status === 'processed' || status === 'completed') {
      badgeVariant = 'success';
      badgeText = 'Processed';
    } else if (status === 'processing' || status === 'uploading') {
      badgeVariant = 'processing';
      badgeText = progress ? `Processing (${Math.round(progress)}%)` : 'Processing';
    } else if (status === 'failed') {
      badgeVariant = 'destructive';
      badgeText = file.error ? `Failed: ${file.error}` : 'Failed';
    }
    
    return (
      <div className="flex items-center space-x-2">
        <Badge variant={badgeVariant}>
          {badgeText}
        </Badge>
        {(status === 'processing' || status === 'uploading') && (
          <div className="w-16">
            <div className="w-16">
              <Progress 
                value={progress || 0} 
                className="h-1.5" 
                aria-label={`${file.name} upload progress`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // Show loading state while fetching files
  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center h-64" 
        role="status" 
        aria-live="polite"
        aria-busy="true"
      >
        <div className="text-center">
          <div 
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"
            role="progressbar"
            aria-valuetext="Loading knowledge files"
            aria-label="Loading knowledge files"
          ></div>
          <p id="loading-text" className="mt-4 text-gray-600">
            Loading knowledge files...
          </p>
        </div>
      </div>
    );
  }

  // Render confirm dialog
  const renderConfirmDialog = () => (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      ref={dialogFocusTrapRef}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        ref={confirmDialogRef}
      >
        <h2 
          id="confirm-dialog-title"
          className="text-xl font-semibold mb-4"
        >
          Confirm Deletion
        </h2>
        <p className="mb-6">
          Are you sure you want to delete <strong>{fileToDelete?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            ref={firstFocusableElementRef}
            onClick={handleCancelDelete}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            autoFocus
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            ref={lastFocusableElementRef}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-8">
      {isConfirmDialogOpen && renderConfirmDialog()}
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-4">Knowledge Upload</h1>
        <p className="text-muted-foreground">
          Upload and manage your knowledge base files. Supported formats: PDF, TXT, MD, CSV, JSON
        </p>
      </div>
      
      {/* Upload Area */}
      <div 
        ref={dropZoneRef}
        className={`border-2 border-dashed rounded-lg p-8 mb-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="region"
        aria-labelledby="dropzone-label"
        aria-describedby="dropzone-instructions"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          } else if (e.key === 'Escape' && isDragging) {
            setIsDragging(false);
          }
        }}
      >
        <div className="flex flex-col items-center justify-center space-y-4">
          <div 
            className="rounded-full bg-blue-100 p-3"
            aria-hidden="true"
          >
            <svg 
              className="w-8 h-8 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
              />
            </svg>
            </p>
          )}
          
          {/* File upload instructions */}
          <div className="text-center">
            <p className="text-lg font-medium" id="dropzone-label">
              {isDragging ? 'Drop files to upload' : 'Drag and drop files here'}
            </p>
            <p id="dropzone-instructions" className="sr-only">
              You can upload PDF, TXT, MD, CSV, or JSON files. Maximum file size is 10MB.
              Press the select files button or use the keyboard shortcut 'U' to select files.
            </p>
            <p className="text-sm text-gray-500 my-2" aria-hidden="true">or</p>
            <label 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer transition-colors"
              aria-describedby="file-types-hint"
            >
              Select files
              <input 
                ref={fileInputRef}
                type="file" 
                className="sr-only" 
                multiple 
                onChange={handleFileChange}
                accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json"
                aria-label="Select files to upload"
                aria-describedby="file-types-hint"
                data-testid="file-input"
              />
            </label>
            <p id="file-types-hint" className="mt-2 text-xs text-gray-500">
              Supported formats: PDF, TXT, MD, CSV, JSON (Max 10MB)
            </p>
            {uploadError && (
              <p className="mt-2 text-sm text-red-600" role="alert">
                {uploadError}
              </p>
            )}
          </div>
          
          {/* Keyboard shortcut hint */}
          <div className="text-xs text-gray-500 mt-4">
            <kbd className="px-2 py-1 bg-gray-100 rounded border border-gray-300">U</kbd> to upload files
          </div>
        </div>
      </div>
      
      {/* File List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Knowledge Files
            </h3>
            <div className="flex space-x-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <Input
                  type="text"
                  placeholder="Search files..."
                  className="pl-10 w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                disabled={isLoading}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uploaded
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">
                    {searchQuery ? 'No files match your search' : 'No files uploaded yet'}
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr key={file.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center bg-gray-100 rounded-md">
                          {file.type.includes('pdf') ? (
                            <span className="text-red-500">📄</span>
                          ) : file.type.includes('text') ? (
                            <span className="text-blue-500">📝</span>
                          ) : file.type.includes('json') ? (
                            <span className="text-yellow-500">📋</span>
                          ) : file.type.includes('csv') ? (
                            <span className="text-green-500">📊</span>
                          ) : (
                            <span>📁</span>
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {file.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {new Date(file.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {file.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(file)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(file.updated_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {file.status === 'processed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // TODO: Implement preview functionality
                            alert(`Preview for ${file.name} would open here`);
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="Preview"
                          disabled={isDeleting}
                        >
                          <span className="sr-only">Preview</span>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </Button>
                      )}
                        <button
                          onClick={() => handleDeleteClick(file)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                          disabled={isDeleting}
                        >
                          <span className="sr-only">Delete</span>
                          <svg 
                            className={`h-4 w-4 ${isDeleting ? 'animate-spin' : ''}`} 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            {isDeleting ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            )}
                          </svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default KnowledgeUploadPage;
