import React, { useState, useEffect } from 'react';
import './SystemOverview.css';

interface SystemOverviewProps {
  onRefresh?: () => void;
  onProviderClick?: (providerId: string) => void;
  onMetricClick?: (metricType: string) => void;
}

interface SystemMetrics {
  totalRequests: number;
  activeProviders: number;
  documentsProcessed: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  memoryUsage: number;
  cpuUsage: number;
  diskUsage: number;
  networkTraffic: number;
}

interface ProviderStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  model: string;
  requestsToday: number;
  averageResponseTime: number;
  lastUsed: string;
}

interface RecentActivity {
  id: string;
  type: 'request' | 'upload' | 'error' | 'system';
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

const SystemOverview: React.FC<SystemOverviewProps> = ({
  onRefresh,
  onProviderClick,
  onMetricClick
}) => {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    totalRequests: 1247,
    activeProviders: 3,
    documentsProcessed: 89,
    averageResponseTime: 2.3,
    successRate: 98.5,
    errorRate: 1.5,
    memoryUsage: 67,
    cpuUsage: 45,
    diskUsage: 23,
    networkTraffic: 156
  });

  const [providers, setProviders] = useState<ProviderStatus[]>([
    {
      id: 'openai',
      name: 'OpenAI',
      status: 'online',
      model: 'gpt-4',
      requestsToday: 456,
      averageResponseTime: 1.8,
      lastUsed: '2 minutes ago'
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      status: 'online',
      model: 'claude-3-sonnet',
      requestsToday: 234,
      averageResponseTime: 2.1,
      lastUsed: '5 minutes ago'
    },
    {
      id: 'mistral',
      name: 'Mistral',
      status: 'warning',
      model: 'mistral-large',
      requestsToday: 89,
      averageResponseTime: 3.2,
      lastUsed: '15 minutes ago'
    }
  ]);

  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([
    {
      id: '1',
      type: 'request',
      message: 'Chat completion request processed successfully',
      timestamp: '2 minutes ago',
      severity: 'success'
    },
    {
      id: '2',
      type: 'upload',
      message: 'Document "API_Documentation.pdf" uploaded and processed',
      timestamp: '5 minutes ago',
      severity: 'info'
    },
    {
      id: '3',
      type: 'error',
      message: 'Mistral API connection timeout',
      timestamp: '8 minutes ago',
      severity: 'warning'
    },
    {
      id: '4',
      type: 'system',
      message: 'System backup completed successfully',
      timestamp: '15 minutes ago',
      severity: 'success'
    }
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Fetch system metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/metrics');
        const data = await response.json();
        setMetrics(data.metrics);
        setProviders(data.providers);
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Handle refresh
  const handleRefresh = () => {
    onRefresh?.();
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'offline':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'success':
        return '#10b981';
      case 'info':
        return '#3b82f6';
      case 'warning':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  // Get activity icon
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'request':
        return '💬';
      case 'upload':
        return '📤';
      case 'error':
        return '❌';
      case 'system':
        return '⚙️';
      default:
        return '📢';
    }
  };

  return (
    <div className="system-overview">
      {/* Header */}
      <div className="overview-header">
        <div className="header-left">
          <h1 className="overview-title">System Overview</h1>
          <p className="overview-subtitle">
            Real-time monitoring and performance metrics
          </p>
        </div>
        <div className="header-right">
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <span className="refresh-icon">🔄</span>
            <span className="refresh-text">Refresh</span>
          </button>
          <div className="last-updated">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="metrics-grid">
        <div className="metric-card primary" onClick={() => onMetricClick?.('requests')}>
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.totalRequests.toLocaleString()}</div>
            <div className="metric-label">Total Requests</div>
            <div className="metric-trend positive">+12% from yesterday</div>
          </div>
        </div>

        <div className="metric-card" onClick={() => onMetricClick?.('providers')}>
          <div className="metric-icon">🤖</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.activeProviders}</div>
            <div className="metric-label">Active Providers</div>
            <div className="metric-trend neutral">All operational</div>
          </div>
        </div>

        <div className="metric-card" onClick={() => onMetricClick?.('documents')}>
          <div className="metric-icon">📚</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.documentsProcessed}</div>
            <div className="metric-label">Documents Processed</div>
            <div className="metric-trend positive">+5 today</div>
          </div>
        </div>

        <div className="metric-card" onClick={() => onMetricClick?.('performance')}>
          <div className="metric-icon">⚡</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.averageResponseTime}s</div>
            <div className="metric-label">Avg Response Time</div>
            <div className="metric-trend negative">+0.2s from avg</div>
          </div>
        </div>

        <div className="metric-card" onClick={() => onMetricClick?.('success')}>
          <div className="metric-icon">✅</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.successRate}%</div>
            <div className="metric-label">Success Rate</div>
            <div className="metric-trend positive">+0.5% from yesterday</div>
          </div>
        </div>

        <div className="metric-card" onClick={() => onMetricClick?.('errors')}>
          <div className="metric-icon">❌</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.errorRate}%</div>
            <div className="metric-label">Error Rate</div>
            <div className="metric-trend negative">+0.1% from yesterday</div>
          </div>
        </div>
      </div>

      {/* System Resources */}
      <div className="resources-section">
        <h2 className="section-title">System Resources</h2>
        <div className="resources-grid">
          <div className="resource-card">
            <div className="resource-header">
              <span className="resource-icon">🧠</span>
              <span className="resource-name">Memory Usage</span>
            </div>
            <div className="resource-progress">
              <div 
                className="progress-bar"
                style={{ width: `${metrics.memoryUsage}%` }}
              ></div>
            </div>
            <div className="resource-value">{metrics.memoryUsage}%</div>
          </div>

          <div className="resource-card">
            <div className="resource-header">
              <span className="resource-icon">⚙️</span>
              <span className="resource-name">CPU Usage</span>
            </div>
            <div className="resource-progress">
              <div 
                className="progress-bar"
                style={{ width: `${metrics.cpuUsage}%` }}
              ></div>
            </div>
            <div className="resource-value">{metrics.cpuUsage}%</div>
          </div>

          <div className="resource-card">
            <div className="resource-header">
              <span className="resource-icon">💾</span>
              <span className="resource-name">Disk Usage</span>
            </div>
            <div className="resource-progress">
              <div 
                className="progress-bar"
                style={{ width: `${metrics.diskUsage}%` }}
              ></div>
            </div>
            <div className="resource-value">{metrics.diskUsage}%</div>
          </div>

          <div className="resource-card">
            <div className="resource-header">
              <span className="resource-icon">🌐</span>
              <span className="resource-name">Network Traffic</span>
            </div>
            <div className="resource-progress">
              <div 
                className="progress-bar"
                style={{ width: `${Math.min(metrics.networkTraffic / 2, 100)}%` }}
              ></div>
            </div>
            <div className="resource-value">{metrics.networkTraffic} MB/s</div>
          </div>
        </div>
      </div>

      {/* Provider Status */}
      <div className="providers-section">
        <h2 className="section-title">Provider Status</h2>
        <div className="providers-grid">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="provider-card"
              onClick={() => onProviderClick?.(provider.id)}
            >
              <div className="provider-header">
                <div className="provider-info">
                  <span className="provider-name">{provider.name}</span>
                  <span className="provider-model">{provider.model}</span>
                </div>
                <div 
                  className="status-indicator"
                  style={{ backgroundColor: getStatusColor(provider.status) }}
                >
                  {provider.status === 'online' ? '🟢' : 
                   provider.status === 'warning' ? '🟡' : '🔴'}
                </div>
              </div>
              <div className="provider-metrics">
                <div className="metric">
                  <span className="metric-label">Requests Today</span>
                  <span className="metric-value">{provider.requestsToday}</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Avg Response</span>
                  <span className="metric-value">{provider.averageResponseTime}s</span>
                </div>
                <div className="metric">
                  <span className="metric-label">Last Used</span>
                  <span className="metric-value">{provider.lastUsed}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="activity-section">
        <h2 className="section-title">Recent Activity</h2>
        <div className="activity-list">
          {recentActivity.map((activity) => (
            <div key={activity.id} className="activity-item">
              <div className="activity-icon">
                <span style={{ color: getSeverityColor(activity.severity) }}>
                  {getActivityIcon(activity.type)}
                </span>
              </div>
              <div className="activity-content">
                <div className="activity-message">{activity.message}</div>
                <div className="activity-time">{activity.timestamp}</div>
              </div>
              <div 
                className="severity-indicator"
                style={{ backgroundColor: getSeverityColor(activity.severity) }}
              ></div>
            </div>
          ))}
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span className="loading-text">Updating metrics...</span>
        </div>
      )}
    </div>
  );
};

export default SystemOverview; 