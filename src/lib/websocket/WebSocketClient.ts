import { useEffect, useRef, useCallback, useReducer } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type WebSocketState = {
  isConnected: boolean;
  reconnectAttempts: number;
  fileStatus: Record<string, FileStatus>;
};

type FileStatus = {
  fileId: string;
  status: 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  timestamp: string;
};

type WebSocketEventHandlers = {
  onFileStatusUpdate?: (status: FileStatus) => void;
  onConnectionChange?: (isConnected: boolean) => void;
  onError?: (error: Error) => void;
};

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds

const initialState: WebSocketState = {
  isConnected: false,
  reconnectAttempts: 0,
  fileStatus: {},
};

function websocketReducer(state: WebSocketState, action: any): WebSocketState {
  switch (action.type) {
    case 'CONNECTION_ESTABLISHED':
      return {
        ...state,
        isConnected: true,
        reconnectAttempts: 0, // Reset reconnect attempts on successful connection
      };
    case 'CONNECTION_LOST':
      return {
        ...state,
        isConnected: false,
      };
    case 'RECONNECT_ATTEMPT':
      return {
        ...state,
        reconnectAttempts: state.reconnectAttempts + 1,
      };
    case 'FILE_STATUS_UPDATE':
      return {
        ...state,
        fileStatus: {
          ...state.fileStatus,
          [action.payload.fileId]: {
            ...state.fileStatus[action.payload.fileId],
            ...action.payload,
          },
        },
      };
    default:
      return state;
  }
}

export function useWebSocket(eventHandlers: WebSocketEventHandlers = {}) {
  const { token } = useAuth();
  const [state, dispatch] = useReducer(websocketReducer, initialState);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    if (!token) return;
    
    // Clear any existing reconnection attempts
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = undefined;
    }

    // Don't try to reconnect if we've exceeded max attempts
    if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('Max reconnection attempts reached');
      eventHandlers.onError?.(new Error('Could not connect to server'));
      return;
    }

    // If we're already connected, don't connect again
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Create WebSocket URL with auth token
    const wsUrl = new URL('/ws', window.location.href);
    wsUrl.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('token', token);

    const socket = new WebSocket(wsUrl.toString());

    socket.onopen = () => {
      if (!isMounted.current) {
        socket.close();
        return;
      }
      
      console.log('WebSocket connected');
      dispatch({ type: 'CONNECTION_ESTABLISHED' });
      eventHandlers.onConnectionChange?.(true);
    };

    socket.onmessage = (event) => {
      if (!isMounted.current) return;
      
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        switch (message.type) {
          case 'fileStatus':
            handleFileStatus(message);
            break;
          case 'connection':
            console.log('WebSocket connection confirmed:', message.status);
            break;
          default:
            console.warn('Unknown WebSocket message type:', message.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    socket.onclose = (event) => {
      if (!isMounted.current) return;
      
      console.log('WebSocket closed:', event.code, event.reason);
      dispatch({ type: 'CONNECTION_LOST' });
      eventHandlers.onConnectionChange?.(false);
      
      // Attempt to reconnect
      if (event.code !== 1000) { // Don't reconnect if closed normally
        dispatch({ type: 'RECONNECT_ATTEMPT' });
        console.log(`Attempting to reconnect (${state.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        reconnectTimeout.current = setTimeout(() => {
          if (isMounted.current) {
            connect();
          }
        }, RECONNECT_DELAY);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      eventHandlers.onError?.(error as unknown as Error);
    };

    ws.current = socket;
  }, [token, state.reconnectAttempts, eventHandlers]);

  const handleFileStatus = (message: WebSocketMessage) => {
    const { fileId, status, progress, error, timestamp } = message;
    
    const fileStatus: FileStatus = {
      fileId,
      status,
      progress,
      error,
      timestamp,
    };
    
    dispatch({ type: 'FILE_STATUS_UPDATE', payload: fileStatus });
    eventHandlers.onFileStatusUpdate?.(fileStatus);
    
    // Show toast notifications for important status changes
    if (status === 'completed') {
      toast({
        title: 'File processed',
        description: `Processing completed for file: ${fileId}`,
        variant: 'default',
      });
    } else if (status === 'failed') {
      toast({
        title: 'Processing failed',
        description: `Failed to process file: ${error || 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  // Connect on mount and when token changes
  useEffect(() => {
    isMounted.current = true;
    
    if (token) {
      connect();
    }
    
    return () => {
      isMounted.current = false;
      
      // Clean up WebSocket connection
      if (ws.current) {
        ws.current.close(1000, 'Component unmounted');
        ws.current = null;
      }
      
      // Clear any pending reconnection attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [token, connect]);

  // Get the current status of a file
  const getFileStatus = useCallback((fileId: string): FileStatus | undefined => {
    return state.fileStatus[fileId];
  }, [state.fileStatus]);

  return {
    isConnected: state.isConnected,
    reconnectAttempts: state.reconnectAttempts,
    getFileStatus,
  };
}

// WebSocket provider component
type WebSocketProviderProps = {
  children: React.ReactNode;
  onFileStatusUpdate?: (status: FileStatus) => void;
  onConnectionChange?: (isConnected: boolean) => void;
  onError?: (error: Error) => void;
};

export function WebSocketProvider({ 
  children, 
  onFileStatusUpdate, 
  onConnectionChange,
  onError,
}: WebSocketProviderProps) {
  useWebSocket({
    onFileStatusUpdate,
    onConnectionChange,
    onError,
  });
  
  return <>{children}</>;
}
