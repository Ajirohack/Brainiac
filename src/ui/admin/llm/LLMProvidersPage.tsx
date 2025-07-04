import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { ProviderForm, ProviderFormValues } from '@/components/llm/ProviderForm';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/utils';

// Focus management hook for dialogs
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

// Confirmation Dialog Component
const ConfirmationDialog = ({ 
  isOpen, 
  onConfirm, 
  onCancel, 
  title, 
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  variant = 'destructive'
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}) => {
  const dialogRef = useFocusTrap(isOpen);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      confirmButtonRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-dialog-title"
      aria-describedby="confirmation-dialog-description"
    >
      <div 
        ref={dialogRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 id="confirmation-dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-md"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div id="confirmation-dialog-description" className="text-gray-700 mb-6">
            {description}
          </div>
          <div className="flex justify-end space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              ref={cancelButtonRef}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={onConfirm}
              ref={confirmButtonRef}
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export function LLMProvidersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<Provider | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const firstFocusableElementRef = useRef<HTMLButtonElement>(null);
  const lastFocusableElementRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  
  // Keyboard navigation for the page
  useHotkeys('n', (e) => {
    e.preventDefault();
    setIsFormOpen(true);
    setEditingProvider(null);
  }, { enableOnFormTags: true });
  
  // Focus management when dialogs open/close
  useEffect(() => {
    if (isFormOpen || isDeleteDialogOpen) {
      // Save the currently focused element when a dialog opens
      lastFocusedElementRef.current = document.activeElement as HTMLElement;
    } else if (lastFocusedElementRef.current) {
      // Restore focus when all dialogs are closed
      lastFocusedElementRef.current.focus();
      lastFocusedElementRef.current = null;
    }
    
    // Focus the add button when the form dialog closes
    if (!isFormOpen && !isDeleteDialogOpen && addButtonRef.current && !editingProvider) {
      addButtonRef.current.focus();
    }
  }, [isFormOpen, isDeleteDialogOpen, editingProvider]);
  
  // Handle delete confirmation
  const handleDeleteClick = useCallback((provider: Provider) => {
    setProviderToDelete(provider);
    setIsDeleteDialogOpen(true);
  }, []);
  
  const handleConfirmDelete = useCallback(() => {
    if (!providerToDelete) return;
    
    deleteProvider.mutate(providerToDelete.id, {
      onSuccess: () => {
        toast({
          title: 'Provider deleted',
          description: `${providerToDelete.name} has been deleted.`,
        });
        setIsDeleteDialogOpen(false);
        setProviderToDelete(null);
      }
    });
  }, [providerToDelete, deleteProvider, toast]);
  
  const handleCancelDelete = useCallback(() => {
    setIsDeleteDialogOpen(false);
    setProviderToDelete(null);
  }, []);

  // Fetch providers
  const { data: providers = [], isLoading, error } = useQuery({
    queryKey: ['llm-providers'],
    queryFn: async () => {
      const { data } = await apiClient.get('/api/llm/providers');
      return data;
    },
  });

  // Create provider mutation
  const createProvider = useMutation({
    mutationFn: async (values: ProviderFormValues) => {
      const { data } = await apiClient.post('/api/llm/providers', values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      toast({
        title: 'Provider created',
        description: 'The LLM provider has been created successfully.',
      });
      setIsFormOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to create provider',
        variant: 'destructive',
      });
    },
  });

  // Update provider mutation
  const updateProvider = useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & ProviderFormValues) => {
      const { data } = await apiClient.put(`/api/llm/providers/${id}`, values);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      toast({
        title: 'Provider updated',
        description: 'The LLM provider has been updated successfully.',
      });
      setIsFormOpen(false);
      setEditingProvider(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to update provider',
        variant: 'destructive',
      });
    },
  });

  // Delete provider mutation
  const deleteProvider = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/llm/providers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to delete provider',
        variant: 'destructive',
      });
    },
  });

  // Sync models mutation with better loading states
  const syncProviderModels = useMutation({
    mutationFn: async (providerId: string) => {
      const { data } = await apiClient.post(`/api/llm/providers/${providerId}/sync`);
      return data;
    },
    onMutate: (providerId) => {
      // Show loading state immediately
      toast({
        title: 'Syncing models',
        description: `Syncing models for provider...`,
        duration: 3000,
      });
      return { providerId };
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
      queryClient.invalidateQueries({ queryKey: ['llm-models'] });
      toast({
        title: 'Models synced',
        description: 'The provider models have been synced successfully.',
      });
    },
    onError: (error: any, variables, context) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Failed to sync models',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (values: ProviderFormValues) => {
    if (editingProvider) {
      updateProvider.mutate({ id: editingProvider.id, ...values });
    } else {
      createProvider.mutate(values);
    }
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setIsFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Failed to load providers</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error.message}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render the main content
  return (
    <div className="space-y-6" role="main" aria-labelledby="page-title" aria-describedby="page-description">
      {/* Confirmation Dialog for Delete */}
      <ConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        title="Delete Provider"
        description={`Are you sure you want to delete ${providerToDelete?.name}? This action cannot be undone.`}
        confirmText={deleteProvider.isLoading ? 'Deleting...' : 'Delete'}
        variant="destructive"
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" id="page-title">LLM Providers</h1>
          <p id="page-description" className="text-muted-foreground">
            Manage your LLM providers and their configurations. Press 'N' to add a new provider.
          </p>
        </div>
        <Button 
          ref={addButtonRef}
          onClick={() => {
            setEditingProvider(null);
            setIsFormOpen(true);
          }}
          aria-label="Add new LLM provider"
          aria-describedby="page-description"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>Add Provider</span>
          <span className="sr-only"> (or press 'N')</span>
        </Button>
      </div>

      <Card aria-labelledby="providers-table-title">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle id="providers-table-title">Configured Providers</CardTitle>
              <CardDescription id="providers-table-description">
                List of all LLM providers configured in the system. Use the action buttons to edit, delete, or sync models for each provider.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
                toast({
                  title: 'Refreshing providers',
                  description: 'Fetching the latest provider data...',
                });
              }}
              disabled={isLoading}
              aria-label="Refresh providers list"
              aria-describedby="providers-table-description"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border" role="region" aria-labelledby="providers-table-title" aria-describedby="providers-table-description">
            <Table ref={tableRef} tabIndex={0} aria-label="LLM providers">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Models</TableHead>
                  <TableHead scope="col">Last Updated</TableHead>
                  <TableHead scope="col" className="w-[100px] sr-only sm:not-sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground" role="alert">
                      No providers found. <button 
                        onClick={() => {
                          setEditingProvider(null);
                          setIsFormOpen(true);
                        }} 
                        className="text-blue-600 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                        ref={firstFocusableElementRef}
                      >
                        Add your first provider
                      </button> to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  providers.map((provider: Provider) => (
                    <TableRow key={provider.id}>
                      <th scope="row" className="font-medium">
                        <div className="flex items-center space-x-2">
                          <span>{provider.name}</span>
                          {provider.is_default && (
                            <Badge variant="outline" className="text-xs" aria-label="Default provider">
                              Default
                            </Badge>
                          )}
                        </div>
                      </th>
                      <TableCell>
                        <Badge variant="secondary">
                          {provider.provider_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center">
                          {provider.is_active ? (
                            <span className="flex items-center">
                              <span className="flex h-2 w-2 rounded-full bg-green-500 mr-2" aria-hidden="true" />
                              <span>Active</span>
                              <span className="sr-only">, {provider.name} is active</span>
                            </span>
                          ) : (
                            <span className="flex items-center">
                              <span className="flex h-2 w-2 rounded-full bg-gray-400 mr-2" aria-hidden="true" />
                              <span>Inactive</span>
                              <span className="sr-only">, {provider.name} is inactive</span>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <span>{provider.models_count || 0} models</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              syncProviderModels.mutate(provider.id);
                              toast({
                                title: 'Syncing models',
                                description: `Syncing models for ${provider.name}...`,
                              });
                            }}
                            disabled={syncProviderModels.isLoading}
                            className="h-6 w-6 p-0"
                            aria-label={`Sync models for ${provider.name}`}
                            aria-busy={syncProviderModels.isLoading}
                          >
                            <RefreshCw 
                              className={`h-3 w-3 ${syncProviderModels.isLoading ? 'animate-spin' : ''}`} 
                              aria-hidden="true"
                            />
                            <span className="sr-only">Sync models</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(provider.updated_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(provider)}
                            className="h-8 w-8 p-0"
                            aria-label={`Edit ${provider.name}`}
                            aria-describedby={`provider-${provider.id}-name`}
                            ref={provider.id === providers[0]?.id ? firstFocusableElementRef : null}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Edit {provider.name}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(provider)}
                            className={cn(
                              'h-8 w-8 p-0 text-red-600 hover:text-red-900 hover:bg-red-50',
                              'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
                              deleteProvider.isLoading && 'opacity-50 cursor-not-allowed'
                            )}
                            disabled={deleteProvider.isLoading}
                            aria-label={`Delete ${provider.name}`}
                            aria-busy={deleteProvider.isLoading}
                            aria-describedby={`provider-${provider.id}-name`}
                            ref={provider.id === providers[providers.length - 1]?.id ? lastFocusableElementRef : null}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">Delete {provider.name}</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Provider Form Dialog */}
      <ProviderForm
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
          setIsFormOpen(open);
        }}
        onSubmit={handleSubmit}
        provider={editingProvider}
        isSubmitting={createProvider.isLoading || updateProvider.isLoading}
        onOpenAutoFocus={(e) => {
          // Prevent focus from being stolen by the dialog
          e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          // Return focus to the most appropriate element
          if (editingProvider) {
            // If editing, focus the edit button for the same provider
            const editButton = document.querySelector(`button[aria-label^="Edit ${editingProvider.name}"]`);
            if (editButton instanceof HTMLElement) {
              editButton.focus();
            }
          } else if (addButtonRef.current) {
            // If adding, focus the add button
            addButtonRef.current.focus();
          } else if (tableRef.current) {
            // Fallback to the table
            tableRef.current.focus();
          }
          e.preventDefault();
        }}
      />
    </div>
  );
}

type Provider = {
  id: string;
  name: string;
  provider_type: string;
  is_active: boolean;
  is_default: boolean;
  models_count?: number;
  updated_at: string;
  // Add other provider properties as needed
};
