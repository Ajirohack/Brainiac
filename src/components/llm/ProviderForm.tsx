import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

// Define the form schema using Zod
const providerFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider_type: z.enum([
    'openai',
    'anthropic',
    'mistral',
    'ollama',
    'groq',
    'huggingface',
    'openrouter',
    'other',
  ]),
  base_url: z.string().url('Must be a valid URL').or(z.literal('')),
  api_key: z.string({
    required_error: 'API key is required when creating a new provider',
  }),
  config: z.record(z.any()).optional(),
  is_active: z.boolean().default(true),
});

type ProviderFormValues = z.infer<typeof providerFormSchema>;

// Import provider configurations
import { getProviderConfigs } from '@/config/llmProviders';

// Get provider types from configuration
const PROVIDER_TYPES = Object.entries(getProviderConfigs()).map(([key, config]) => ({
  value: key,
  label: config.name || key.charAt(0).toUpperCase() + key.slice(1),
  defaultUrl: config.baseUrl || '',
  supportsCustomUrl: config.supportsCustomUrl !== false,
  requiresApiKey: config.requiresApiKey !== false,
}));

// Add 'other' provider type for custom providers
PROVIDER_TYPES.push({
  value: 'other',
  label: 'Other',
  defaultUrl: '',
  supportsCustomUrl: true,
  requiresApiKey: true,
});

interface ProviderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProviderFormValues) => void;
  provider?: any;
  isSubmitting: boolean;
}

export function ProviderForm({
  open,
  onOpenChange,
  onSubmit,
  provider,
  isSubmitting,
}: ProviderFormProps) {
  const [isEditing, setIsEditing] = useState(!!provider);
  const [selectedProviderType, setSelectedProviderType] = useState<string>(
    provider?.provider_type || 'openai'
  );

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      name: provider?.name || '',
      provider_type: (provider?.provider_type as any) || 'openai',
      base_url: provider?.base_url || '',
      api_key: '', // Don't pre-fill API key for security
      config: provider?.config || {},
      is_active: provider?.is_active ?? true,
    },
  });

  // Update form when provider changes
  useEffect(() => {
    if (provider) {
      const providerConfig = getProviderConfigs()[provider.provider_type] || {};
      form.reset({
        name: provider.name,
        provider_type: provider.provider_type,
        base_url: provider.base_url || providerConfig.baseUrl || '',
        api_key: '', // Don't pre-fill API key for security
        config: provider.config || {},
        is_active: provider.is_active,
      });
      setSelectedProviderType(provider.provider_type);
      setIsEditing(true);
    } else {
      form.reset({
        name: '',
        provider_type: 'openai',
        base_url: '',
        api_key: '',
        config: {},
        is_active: true,
      });
      setSelectedProviderType('openai');
      setIsEditing(false);
    }
  }, [provider, form]);

  // Handle provider type change
  const handleProviderTypeChange = (value: string) => {
    setSelectedProviderType(value);
    const provider = PROVIDER_TYPES.find((p) => p.value === value);
    if (provider) {
      const providerConfig = getProviderConfigs()[value] || {};
      if (provider.defaultUrl) {
        form.setValue('base_url', provider.defaultUrl);
      } else if (providerConfig.baseUrl) {
        form.setValue('base_url', providerConfig.baseUrl);
      } else {
        form.setValue('base_url', '');
      }
      
      // Set default name if not already set
      if (!form.getValues('name') || form.getValues('name') === '') {
        form.setValue('name', provider.label);
      }
    }
  };

  const handleSubmit = (values: ProviderFormValues) => {
    try {
      // If editing and API key is empty, remove it from the submission
      if (isEditing && !values.api_key) {
        const { api_key, ...valuesWithoutKey } = values;
        onSubmit(valuesWithoutKey);
      } else {
        onSubmit(values);
      }
    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: 'Error',
        description: 'An error occurred while submitting the form',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Provider' : 'Add New Provider'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the LLM provider details.'
                : 'Configure a new LLM provider to start using it in your applications.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name <span className="text-red-500">*</span>
              </Label>
              <div className="col-span-3">
                <Input
                  id="name"
                  placeholder="e.g., OpenAI Production"
                  className={`col-span-3 ${
                    form.formState.errors.name ? 'border-red-500' : ''
                  }`}
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-sm text-red-500">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="provider_type" className="text-right">
                Provider Type <span className="text-red-500">*</span>
              </Label>
              <div className="col-span-3">
                <Select
                  value={form.watch('provider_type')}
                  onValueChange={(value) => {
                    form.setValue('provider_type', value as any);
                    setSelectedProviderType(value);
                  }}
                  disabled={isEditing}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a provider type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.provider_type && (
                  <p className="mt-1 text-sm text-red-500">
                    {form.formState.errors.provider_type.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="base_url" className="text-right mt-2">
                Base URL
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="base_url"
                  placeholder="e.g., https://api.openai.com/v1"
                  className={`w-full ${
                    form.formState.errors.base_url ? 'border-red-500' : ''
                  }`}
                  {...form.register('base_url')}
                />
                {form.formState.errors.base_url ? (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.base_url.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default URL for the selected provider
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="api_key" className="text-right mt-2">
                API Key {!isEditing && <span className="text-red-500">*</span>}
              </Label>
              <div className="col-span-3 space-y-1">
                <Input
                  id="api_key"
                  type="password"
                  placeholder={
                    isEditing ? 'Leave empty to keep existing key' : 'Enter your API key'
                  }
                  className={`w-full ${
                    form.formState.errors.api_key ? 'border-red-500' : ''
                  }`}
                  {...form.register('api_key', {
                    required: !isEditing ? 'API key is required' : false,
                  })}
                />
                {form.formState.errors.api_key ? (
                  <p className="text-sm text-red-500">
                    {form.formState.errors.api_key.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isEditing
                      ? 'Leave empty to keep the existing API key'
                     : 'Your API key will be encrypted and stored securely'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="is_active" className="text-right">
                Status
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={form.watch('is_active')}
                  onCheckedChange={(checked) =>
                    form.setValue('is_active', checked, { shouldDirty: true })
                  }
                />
                <Label htmlFor="is_active" className="!m-0">
                  {form.watch('is_active') ? 'Active' : 'Inactive'}
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="config" className="text-right mt-2">
                Configuration
              </Label>
              <div className="col-span-3 space-y-2">
                <Label className="text-sm font-medium">Advanced Settings</Label>
                <Textarea
                  id="config"
                  placeholder={
                    '{\n  "timeout": 30000,\n  "max_retries": 3\n}'
                  }
                  className="font-mono text-xs h-32"
                  {...form.register('config', {
                    setValueAs: (value) => {
                      try {
                        return value ? JSON.parse(value) : {};
                      } catch (error) {
                        return {};
                      }
                    },
                  })}
                />
                <p className="text-xs text-muted-foreground">
                  Enter any additional configuration as a JSON object. This will be merged with the default configuration.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {isEditing ? 'Updating...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Update Provider'
              ) : (
                'Create Provider'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
