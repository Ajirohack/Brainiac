import React, { useState, useEffect } from 'react';
import './Sidebar.css';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

interface SystemStatus {
  status: 'online' | 'offline' | 'warning';
  message: string;
  timestamp: string;
}

interface ProviderStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  model: string;
  lastUsed: string;
}

const Sidebar: React.FC<SidebarProps> = ({
  isCollapsed,
  onToggle,
  activeSection,
  onSectionChange
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    status: 'online',
    message: 'All systems operational',
    timestamp: new Date().toISOString()
  });

  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([
    {
      name: 'OpenAI',
      status: 'connected',
      model: 'gpt-4',
      lastUsed: '2 minutes ago'
    },
    {
      name: 'Anthropic',
      status: 'connected',
      model: 'claude-3-sonnet',
      lastUsed: '5 minutes ago'
    },
    {
      name: 'Mistral',
      status: 'disconnected',
      model: 'mistral-large',
      lastUsed: 'Never'
    }
  ]);

  const [isLoading, setIsLoading] = useState(false);

  // Navigation sections
  const sections = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: '📊',
      description: 'System overview and metrics'
    },
    {
      id: 'chat',
      name: 'Chat Interface',
      icon: '💬',
      description: 'AI conversation interface'
    },
    {
      id: 'providers',
      name: 'LLM Providers',
      icon: '🤖',
      description: 'Manage AI model providers'
    },
    {
      id: 'knowledge',
      name: 'Knowledge Base',
      icon: '📚',
      description: 'Upload and manage documents'
    },
    {
      id: 'agents',
      name: 'AI Agents',
      icon: '🧠',
      description: 'Configure and monitor agents'
    },
    {
      id: 'rag',
      name: 'RAG System',
      icon: '🔍',
      description: 'Retrieval-augmented generation'
    },
    {
      id: 'monitoring',
      name: 'Monitoring',
      icon: '📈',
      description: 'System performance and logs'
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: '⚙️',
      description: 'System configuration'
    }
  ];

  // Check system status
  useEffect(() => {
    const checkSystemStatus = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        setSystemStatus({
          status: data.status === 'healthy' ? 'online' : 'warning',
          message: data.message || 'System operational',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        setSystemStatus({
          status: 'offline',
          message: 'System unavailable',
          timestamp: new Date().toISOString()
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Check provider statuses
  useEffect(() => {
    const checkProviderStatuses = async () => {
      try {
        const response = await fetch('/api/providers/status');
        const data = await response.json();
        
        if (data.providers) {
          setProviderStatuses(data.providers);
        }
      } catch (error) {
        console.error('Failed to fetch provider statuses:', error);
      }
    };

    checkProviderStatuses();
    const interval = setInterval(checkProviderStatuses, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'offline':
      case 'disconnected':
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
      case 'connected':
        return '🟢';
      case 'warning':
        return '🟡';
      case 'offline':
      case 'disconnected':
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo-section">
          <div className="logo">
            <span className="logo-icon">🧠</span>
            {!isCollapsed && <span className="logo-text">Brainiac</span>}
          </div>
          <button 
            className="collapse-button"
            onClick={onToggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>
      </div>

      {/* System Status */}
      {!isCollapsed && (
        <div className="system-status">
          <div className="status-header">
            <h3>System Status</h3>
            {isLoading && <div className="loading-spinner"></div>}
          </div>
          <div className="status-indicator">
            <span className="status-icon">{getStatusIcon(systemStatus.status)}</span>
            <span className="status-text">{systemStatus.message}</span>
          </div>
          <div className="status-timestamp">
            Last updated: {new Date(systemStatus.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="sidebar-nav">
        <ul className="nav-list">
          {sections.map((section) => (
            <li key={section.id} className="nav-item">
              <button
                className={`nav-button ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => onSectionChange(section.id)}
                title={isCollapsed ? section.name : undefined}
              >
                <span className="nav-icon">{section.icon}</span>
                {!isCollapsed && (
                  <div className="nav-content">
                    <span className="nav-name">{section.name}</span>
                    <span className="nav-description">{section.description}</span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Provider Status */}
      {!isCollapsed && (
        <div className="provider-status">
          <h3>Provider Status</h3>
          <div className="provider-list">
            {providerStatuses.map((provider, index) => (
              <div key={index} className="provider-item">
                <div className="provider-header">
                  <span className="provider-name">{provider.name}</span>
                  <span 
                    className="provider-status-indicator"
                    style={{ backgroundColor: getStatusColor(provider.status) }}
                  >
                    {getStatusIcon(provider.status)}
                  </span>
                </div>
                <div className="provider-details">
                  <span className="provider-model">{provider.model}</span>
                  <span className="provider-last-used">{provider.lastUsed}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {!isCollapsed && (
        <div className="quick-actions">
          <h3>Quick Actions</h3>
          <div className="action-buttons">
            <button className="action-button primary">
              <span className="action-icon">➕</span>
              <span className="action-text">Add Provider</span>
            </button>
            <button className="action-button secondary">
              <span className="action-icon">📤</span>
              <span className="action-text">Upload Document</span>
            </button>
            <button className="action-button secondary">
              <span className="action-icon">🔧</span>
              <span className="action-text">System Config</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="footer-info">
            <div className="version-info">
              <span className="version-text">v1.0.0</span>
            </div>
            <div className="user-info">
              <span className="user-avatar">👤</span>
              <span className="user-name">Admin</span>
            </div>
          </div>
        )}
        <button className="logout-button" title="Logout">
          <span className="logout-icon">🚪</span>
          {!isCollapsed && <span className="logout-text">Logout</span>}
        </button>
      </div>
    </div>
  );
};

export default Sidebar; 