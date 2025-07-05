/**
 * Chat Interface - Main chat component for CAI Platform
 * 
 * Provides real-time messaging, processing mode selection, file uploads,
 * and response streaming for interacting with the AI system.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import ProcessingModeSelector from './ProcessingModeSelector';
import MessageBubble from './MessageBubble';
import { useChat } from '../../hooks/useChat';
import { useWebSocket } from '../../hooks/useWebSocket';
import './ChatInterface.css';

interface ChatInterfaceProps {
  className?: string;
  initialMode?: string;
  onModeChange?: (mode: string) => void;
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  processingMode?: string;
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
    confidence?: number;
  };
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    url?: string;
  }>;
  status?: 'sending' | 'sent' | 'error' | 'streaming';
  error?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  className = '',
  initialMode = 'balanced',
  onModeChange
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [processingMode, setProcessingMode] = useState(initialMode);
  const [isTyping, setIsTyping] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const { sendMessage, isStreaming, streamData } = useChat();
  const { connect, disconnect, send } = useWebSocket();

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Connect to WebSocket on mount
  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (error: string) => {
      setError(error);
      setIsConnected(false);
    };

    const handleMessage = (data: any) => {
      if (data.type === 'chat_message') {
        handleIncomingMessage(data);
      } else if (data.type === 'typing_indicator') {
        setIsTyping(data.isTyping);
      }
    };

    // Connect to WebSocket
    connect({
      onConnect: handleConnect,
      onDisconnect: handleDisconnect,
      onError: handleError,
      onMessage: handleMessage
    });

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Handle incoming messages from WebSocket
  const handleIncomingMessage = (data: any) => {
    const newMessage: Message = {
      id: data.id || `msg_${Date.now()}`,
      type: 'assistant',
      content: data.content || '',
      timestamp: new Date(data.timestamp || Date.now()),
      processingMode: data.processingMode,
      metadata: data.metadata,
      status: 'sent'
    };

    setMessages(prev => [...prev, newMessage]);
  };

  // Handle sending a new message
  const handleSendMessage = async (content: string, attachments: File[] = []) => {
    if (!content.trim() && attachments.length === 0) return;

    const messageId = `msg_${Date.now()}`;
    const userMessage: Message = {
      id: messageId,
      type: 'user',
      content: content.trim(),
      timestamp: new Date(),
      processingMode,
      status: 'sending',
      attachments: attachments.map((file, index) => ({
        id: `att_${Date.now()}_${index}`,
        name: file.name,
        type: file.type,
        size: file.size
      }))
    };

    // Add user message to chat
    setMessages(prev => [...prev, userMessage]);

    try {
      // Send message to backend
      const response = await sendMessage({
        content: content.trim(),
        processingMode,
        attachments,
        messageId
      });

      // Update user message status
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'sent' }
          : msg
      ));

      // Handle streaming response
      if (response.stream) {
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          type: 'assistant',
          content: '',
          timestamp: new Date(),
          processingMode,
          status: 'streaming'
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Handle streaming data
        if (streamData) {
          streamData(response.streamId, (chunk: any) => {
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessage.id
                ? { ...msg, content: msg.content + (chunk.content || '') }
                : msg
            ));
          }, () => {
            // Stream complete
            setMessages(prev => prev.map(msg => 
              msg.id === assistantMessage.id
                ? { ...msg, status: 'sent' }
                : msg
            ));
          });
        }
      } else {
        // Non-streaming response
        const assistantMessage: Message = {
          id: `assistant_${Date.now()}`,
          type: 'assistant',
          content: response.content || '',
          timestamp: new Date(),
          processingMode,
          metadata: response.metadata,
          status: 'sent'
        };

        setMessages(prev => [...prev, assistantMessage]);
      }

    } catch (err) {
      // Handle error
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, status: 'error', error: err instanceof Error ? err.message : 'Failed to send message' }
          : msg
      ));

      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  // Handle processing mode change
  const handleModeChange = (mode: string) => {
    setProcessingMode(mode);
    onModeChange?.(mode);
  };

  // Handle file upload
  const handleFileUpload = (files: File[]) => {
    // Validate files
    const validFiles = files.filter(file => {
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setError(`File ${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // Add system message for file upload
    const uploadMessage: Message = {
      id: `upload_${Date.now()}`,
      type: 'system',
      content: `Uploaded ${validFiles.length} file(s): ${validFiles.map(f => f.name).join(', ')}`,
      timestamp: new Date(),
      status: 'sent'
    };

    setMessages(prev => [...prev, uploadMessage]);
  };

  // Clear chat history
  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  // Export chat history
  const handleExportChat = () => {
    const chatData = {
      messages: messages.map(msg => ({
        type: msg.type,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        processingMode: msg.processingMode,
        metadata: msg.metadata
      })),
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`chat-interface ${className}`}>
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <h2>CAI Platform Chat</h2>
          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span className="status-text">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        <div className="chat-header-right">
          <ProcessingModeSelector
            currentMode={processingMode}
            onModeChange={handleModeChange}
          />
          
          <div className="chat-actions">
            <button 
              onClick={handleClearChat}
              className="btn btn-secondary btn-sm"
              title="Clear chat history"
            >
              🗑️ Clear
            </button>
            <button 
              onClick={handleExportChat}
              className="btn btn-secondary btn-sm"
              title="Export chat history"
            >
              📤 Export
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="chat-error">
          <span className="error-message">{error}</span>
          <button 
            onClick={() => setError(null)}
            className="error-close"
          >
            ×
          </button>
        </div>
      )}

      {/* Messages Container */}
      <div className="chat-messages" ref={chatContainerRef}>
        <MessageList 
          messages={messages}
          isTyping={isTyping}
          processingMode={processingMode}
        />
        
        {/* Typing Indicator */}
        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="typing-text">AI is thinking...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <div className="chat-input-container">
        <ChatInput
          onSendMessage={handleSendMessage}
          onFileUpload={handleFileUpload}
          disabled={!isConnected || isStreaming}
          processingMode={processingMode}
          placeholder={`Ask me anything... (${processingMode} mode)`}
        />
      </div>

      {/* Connection Status Footer */}
      <div className="chat-footer">
        <div className="footer-info">
          <span className="message-count">
            {messages.length} messages
          </span>
          <span className="mode-indicator">
            Mode: {processingMode}
          </span>
        </div>
        
        <div className="footer-actions">
          {!isConnected && (
            <button 
              onClick={() => connect()}
              className="btn btn-primary btn-sm"
            >
              🔄 Reconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInterface; 