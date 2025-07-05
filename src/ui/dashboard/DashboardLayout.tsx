/**
 * Dashboard Layout - Main application layout for CAI Platform
 * 
 * Provides the overall structure with navigation, header, and content areas
 * for the Cognitive Agentic Intelligence Platform interface.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import SystemOverview from './SystemOverview';
import QuickActions from './QuickActions';
import RecentActivity from './RecentActivity';
import { useAuth } from '../../hooks/useAuth';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  children?: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { systemStatus, refreshStatus } = useSystemStatus();

  useEffect(() => {
    // Check authentication on mount
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Initialize dashboard
    initializeDashboard();
  }, [isAuthenticated, navigate]);

  const initializeDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load initial data
      await Promise.all([
        refreshStatus(),
        // Add other initialization tasks here
      ]);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize dashboard');
      console.error('Dashboard initialization error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSidebarToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleRefresh = () => {
    initializeDashboard();
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Loading CAI Platform...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-container">
          <h2>Dashboard Error</h2>
          <p>{error}</p>
          <button onClick={handleRefresh} className="btn btn-primary">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed}
        onToggle={handleSidebarToggle}
        user={user}
        systemStatus={systemStatus}
      />

      {/* Main Content Area */}
      <div className="dashboard-main">
        {/* Header */}
        <Header 
          user={user}
          systemStatus={systemStatus}
          onLogout={handleLogout}
          onRefresh={handleRefresh}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={handleSidebarToggle}
        />

        {/* Dashboard Content */}
        <div className="dashboard-content">
          {/* Main Dashboard View */}
          {location.pathname === '/dashboard' && (
            <div className="dashboard-home">
              <div className="dashboard-grid">
                {/* System Overview */}
                <div className="dashboard-card system-overview">
                  <SystemOverview 
                    systemStatus={systemStatus}
                    onRefresh={refreshStatus}
                  />
                </div>

                {/* Quick Actions */}
                <div className="dashboard-card quick-actions">
                  <QuickActions 
                    user={user}
                    systemStatus={systemStatus}
                  />
                </div>

                {/* Recent Activity */}
                <div className="dashboard-card recent-activity">
                  <RecentActivity />
                </div>

                {/* Performance Metrics */}
                <div className="dashboard-card performance-metrics">
                  <h3>Performance Metrics</h3>
                  <div className="metrics-grid">
                    <div className="metric">
                      <span className="metric-value">
                        {systemStatus?.performance?.responseTime || 'N/A'}
                      </span>
                      <span className="metric-label">Avg Response Time</span>
                    </div>
                    <div className="metric">
                      <span className="metric-value">
                        {systemStatus?.performance?.throughput || 'N/A'}
                      </span>
                      <span className="metric-label">Requests/min</span>
                    </div>
                    <div className="metric">
                      <span className="metric-value">
                        {systemStatus?.performance?.errorRate || '0'}%
                      </span>
                      <span className="metric-label">Error Rate</span>
                    </div>
                    <div className="metric">
                      <span className="metric-value">
                        {systemStatus?.performance?.uptime || 'N/A'}
                      </span>
                      <span className="metric-label">Uptime</span>
                    </div>
                  </div>
                </div>

                {/* System Health */}
                <div className="dashboard-card system-health">
                  <h3>System Health</h3>
                  <div className="health-indicators">
                    <div className={`health-indicator ${systemStatus?.health?.overall || 'unknown'}`}>
                      <span className="indicator-dot"></span>
                      <span className="indicator-label">Overall</span>
                    </div>
                    <div className={`health-indicator ${systemStatus?.health?.brain || 'unknown'}`}>
                      <span className="indicator-dot"></span>
                      <span className="indicator-label">Cognitive Brain</span>
                    </div>
                    <div className={`health-indicator ${systemStatus?.health?.agents || 'unknown'}`}>
                      <span className="indicator-dot"></span>
                      <span className="indicator-label">Agent Council</span>
                    </div>
                    <div className={`health-indicator ${systemStatus?.health?.rag || 'unknown'}`}>
                      <span className="indicator-dot"></span>
                      <span className="indicator-label">RAG System</span>
                    </div>
                  </div>
                </div>

                {/* Active Sessions */}
                <div className="dashboard-card active-sessions">
                  <h3>Active Sessions</h3>
                  <div className="sessions-list">
                    {systemStatus?.sessions?.map((session, index) => (
                      <div key={index} className="session-item">
                        <div className="session-info">
                          <span className="session-user">{session.user}</span>
                          <span className="session-time">{session.duration}</span>
                        </div>
                        <div className="session-status">
                          <span className={`status-badge ${session.status}`}>
                            {session.status}
                          </span>
                        </div>
                      </div>
                    )) || (
                      <p className="no-sessions">No active sessions</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Route Content */}
          {location.pathname !== '/dashboard' && (
            <div className="route-content">
              {children || <Outlet />}
            </div>
          )}
        </div>
      </div>

      {/* Notification Area */}
      <div className="notification-area" id="notification-area">
        {/* Notifications will be rendered here */}
      </div>
    </div>
  );
};

export default DashboardLayout; 