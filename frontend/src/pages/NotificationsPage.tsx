import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Bell, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const typeIcon: Record<string, string> = {
  PAYMENT_SUCCESS: '💳', PLAN_EXPIRED: '📅', PLAN_EXPIRING: '⏰',
  SERVICE_ACTIVATED: '✅', SERVICE_SUSPENDED: '🚫', TICKET_CREATED: '🎫',
  TICKET_RESOLVED: '✔️', TICKET_ASSIGNED: '👷', TECHNICIAN_ASSIGNED: '🔧',
  INSTALLATION_COMPLETED: '🏠', NETWORK_INCIDENT: '⚠️', INCIDENT_RESOLVED: '✅',
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', unreadOnly, page],
    queryFn: () => api.get('/notifications', { params: { unreadOnly, page, limit: 20 } }).then(r => r.data),
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['unread-count'] }); },
  });

  const markAllMut = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => { toast.success('All marked as read'); qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['unread-count'] }); },
  });

  const notifications = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Notifications" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Notifications</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} total</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className={`btn ${unreadOnly ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
              id="unread-filter-btn"
            >
              Unread only
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => markAllMut.mutate()} id="mark-all-read-btn">
              <CheckCheck size={14} /> Mark All Read
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isLoading ? [...Array(5)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
          )) : notifications.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon"><Bell size={40} /></div>
                <div className="empty-state-title">No notifications</div>
                <div className="empty-state-text">You're all caught up!</div>
              </div>
            </div>
          ) : notifications.map((n: any) => (
            <div
              key={n.id}
              className="card"
              style={{ cursor: n.isRead ? 'default' : 'pointer', borderColor: !n.isRead ? 'rgba(99,102,241,0.3)' : undefined, background: !n.isRead ? 'rgba(99,102,241,0.04)' : undefined }}
              onClick={() => !n.isRead && markReadMut.mutate(n.id)}
              id={`notification-${n.id}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ fontSize: 24, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)', borderRadius: 12, flexShrink: 0 }}>
                  {typeIcon[n.type] || '🔔'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</span>
                    {!n.isRead && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0 }} />
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{n.message}</p>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(n.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="pagination" style={{ marginTop: 16 }}>
            <span className="pagination-info">Page {page} of {meta.totalPages}</span>
            <div className="pagination-controls">
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
              <button className="page-btn" disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
