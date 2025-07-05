import React, { useState, useEffect } from 'react';
import './Header.css';

interface HeaderProps {
  currentSection: string;
  breadcrumbs: string[];
  onSearch?: (query: string) => void;
  onNotificationClick?: (notificationId: string) => void;
  onUserMenuAction?: (action: string) => void;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface User {
  name: string;
  email: string;
  avatar: string;
  role: string;
}

const Header: React.FC<HeaderProps> = ({
  currentSection,
  breadcrumbs,
  onSearch,
  onNotificationClick,
  onUserMenuAction
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'info',
      title: 'System Update',
      message: 'New features have been deployed',
      timestamp: '2 minutes ago',
      read: false
    },
    {
      id: '2',
      type: 'warning',
      title: 'Provider Alert',
      message: 'Mistral API connection unstable',
      timestamp: '5 minutes ago',
      read: false
    },
    {
      id: '3',
      type: 'success',
      title: 'Document Processed',
      message: 'Knowledge base updated successfully',
      timestamp: '10 minutes ago',
      read: true
    }
  ]);

  const [user, setUser] = useState<User>({
    name: 'Admin User',
    email: 'admin@brainiac.ai',
    avatar: '👤',
    role: 'Administrator'
  });

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Calculate unread notifications
  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length;
    setUnreadCount(unread);
  }, [notifications]);

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery.trim());
    }
  };

  // Mark notification as read
  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  // Mark all notifications as read
  const markAllAsRead = () => {
    setNotifications(prev => 
      prev.map(n => ({ ...n, read: true }))
    );
  };

  // Get notification icon
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'info':
        return 'ℹ️';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'success':
        return '✅';
      default:
        return '📢';
    }
  };

  // Get notification color
  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'info':
        return '#3b82f6';
      case 'warning':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      case 'success':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return timestamp;
  };

  return (
    <header className="dashboard-header">
      {/* Left Section - Breadcrumbs */}
      <div className="header-left">
        <nav className="breadcrumb-nav">
          <ol className="breadcrumb-list">
            {breadcrumbs.map((crumb, index) => (
              <li key={index} className="breadcrumb-item">
                {index > 0 && <span className="breadcrumb-separator">/</span>}
                <span className="breadcrumb-text">{crumb}</span>
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="section-title">{currentSection}</h1>
      </div>

      {/* Center Section - Search */}
      <div className="header-center">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search across the platform..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Right Section - Actions */}
      <div className="header-right">
        {/* Quick Actions */}
        <div className="quick-actions">
          <button className="action-button" title="Add Provider">
            <span className="action-icon">➕</span>
          </button>
          <button className="action-button" title="Upload Document">
            <span className="action-icon">📤</span>
          </button>
          <button className="action-button" title="System Config">
            <span className="action-icon">⚙️</span>
          </button>
        </div>

        {/* Notifications */}
        <div className="notifications-container">
          <button
            className="notifications-button"
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            <span className="notifications-icon">🔔</span>
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="notifications-dropdown">
              <div className="notifications-header">
                <h3>Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    className="mark-all-read"
                    onClick={markAllAsRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notifications-list">
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`notification-item ${!notification.read ? 'unread' : ''}`}
                      onClick={() => {
                        markAsRead(notification.id);
                        onNotificationClick?.(notification.id);
                      }}
                    >
                      <div className="notification-icon">
                        <span style={{ color: getNotificationColor(notification.type) }}>
                          {getNotificationIcon(notification.type)}
                        </span>
                      </div>
                      <div className="notification-content">
                        <div className="notification-title">{notification.title}</div>
                        <div className="notification-message">{notification.message}</div>
                        <div className="notification-time">{formatTimestamp(notification.timestamp)}</div>
                      </div>
                      {!notification.read && <div className="unread-indicator"></div>}
                    </div>
                  ))
                ) : (
                  <div className="no-notifications">
                    <span className="no-notifications-icon">📭</span>
                    <span className="no-notifications-text">No notifications</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="user-menu-container">
          <button
            className="user-menu-button"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <span className="user-avatar">{user.avatar}</span>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-role">{user.role}</span>
            </div>
            <span className="user-menu-arrow">▼</span>
          </button>

          {showUserMenu && (
            <div className="user-menu-dropdown">
              <div className="user-menu-header">
                <span className="user-menu-avatar">{user.avatar}</span>
                <div className="user-menu-details">
                  <span className="user-menu-name">{user.name}</span>
                  <span className="user-menu-email">{user.email}</span>
                </div>
              </div>
              <div className="user-menu-actions">
                <button
                  className="user-menu-action"
                  onClick={() => {
                    onUserMenuAction?.('profile');
                    setShowUserMenu(false);
                  }}
                >
                  <span className="action-icon">👤</span>
                  <span className="action-text">Profile</span>
                </button>
                <button
                  className="user-menu-action"
                  onClick={() => {
                    onUserMenuAction?.('settings');
                    setShowUserMenu(false);
                  }}
                >
                  <span className="action-icon">⚙️</span>
                  <span className="action-text">Settings</span>
                </button>
                <button
                  className="user-menu-action"
                  onClick={() => {
                    onUserMenuAction?.('help');
                    setShowUserMenu(false);
                  }}
                >
                  <span className="action-icon">❓</span>
                  <span className="action-text">Help</span>
                </button>
                <div className="user-menu-divider"></div>
                <button
                  className="user-menu-action logout"
                  onClick={() => {
                    onUserMenuAction?.('logout');
                    setShowUserMenu(false);
                  }}
                >
                  <span className="action-icon">🚪</span>
                  <span className="action-text">Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Click outside handlers */}
      {(showNotifications || showUserMenu) && (
        <div
          className="click-outside-overlay"
          onClick={() => {
            setShowNotifications(false);
            setShowUserMenu(false);
          }}
        />
      )}
    </header>
  );
};

export default Header; 