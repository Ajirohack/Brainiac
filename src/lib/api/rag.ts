import axios, { AxiosError } from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = '/api/rag';

// Types
export interface KnowledgeFile {
  id: string;
  name: string;
  type: 'pdf' | 'txt' | 'md' | 'zip' | 'other';
  size: number;
  status: 'uploading' | 'processing' | 'processed' | 'failed';
  chunks_count?: number;
  created_at: string;
  updated_at: string;
  error?: string;
  processed_at?: string;
}

export interface SearchResult {
  content: string;
  metadata: {
    source: string;
    page?: number;
    chunk?: number;
    [key: string]: any;
  };
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
}

// API Client Functions

export const uploadFile = async (file: File, onUploadProgress?: (progressEvent: ProgressEvent) => void) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await axios.post<KnowledgeFile>(
    `${API_BASE_URL}/upload`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    }
  );

  return response.data;
};

export const getFiles = async (): Promise<KnowledgeFile[]> => {
  const response = await axios.get<KnowledgeFile[]>(`${API_BASE_URL}/files`);
  return response.data;
};

export const getFile = async (fileId: string): Promise<KnowledgeFile> => {
  const response = await axios.get<KnowledgeFile>(`${API_BASE_URL}/files/${fileId}`);
  return response.data;
};

export const deleteFile = async (fileId: string): Promise<void> => {
  await axios.delete(`${API_BASE_URL}/files/${fileId}`);
};

export const searchKnowledge = async (query: string, k: number = 4): Promise<SearchResponse> => {
  const response = await axios.post<SearchResponse>(`${API_BASE_URL}/query`, {
    query,
    k,
  });
  return response.data;
};

// React Query Hooks

export const useFiles = () => {
  return useQuery<KnowledgeFile[], AxiosError>({
    queryKey: ['knowledge-files'],
    queryFn: getFiles,
    refetchOnWindowFocus: false,
  });
};

export const useFile = (fileId: string) => {
  return useQuery<KnowledgeFile, AxiosError>({
    queryKey: ['knowledge-file', fileId],
    queryFn: () => getFile(fileId),
    enabled: !!fileId,
  });
};

export const useFileUpload = () => {
  const queryClient = useQueryClient();
  
  return useMutation<KnowledgeFile, AxiosError, { file: File; onProgress?: (progress: number) => void }>({
    mutationFn: async ({ file, onProgress }) => {
      return uploadFile(file, (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      });
    },
    onSuccess: () => {
      // Invalidate and refetch files list
      queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
    },
  });
};

export const useFileDelete = () => {
  const queryClient = useQueryClient();
  
  return useMutation<void, AxiosError, string>({
    mutationFn: deleteFile,
    onSuccess: () => {
      // Invalidate and refetch files list
      queryClient.invalidateQueries({ queryKey: ['knowledge-files'] });
    },
  });
};

export const useSearchKnowledge = (query: string, k: number = 4) => {
  return useQuery<SearchResponse, AxiosError>({
    queryKey: ['knowledge-search', query, k],
    queryFn: () => searchKnowledge(query, k),
    enabled: !!query.trim(),
    retry: false,
  });
};
