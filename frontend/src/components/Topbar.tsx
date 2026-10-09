import React, { useState, useEffect } from 'react';
import { Bell, Search, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface TopbarProps {
  title: string;
}

export function Topbar({ title }: TopbarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data.data),
    refetchInterval: 30000,
    enabled: !!user,
  });

  const unreadCount = notifData?.count || 0;

  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        <button
          id="notifications-btn"
          className="btn btn-icon btn-secondary"
          style={{ position: 'relative' }}
          onClick={() => navigate('/notifications')}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: '#ef4444',
              color: 'white',
              fontSize: '9px',
              fontWeight: 700,
              padding: '1px 4px',
              borderRadius: '10px',
              minWidth: '14px',
              textAlign: 'center',
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
