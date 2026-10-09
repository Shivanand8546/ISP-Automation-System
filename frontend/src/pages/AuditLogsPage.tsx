import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { format } from 'date-fns';

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', action, page],
    queryFn: () => api.get('/audit-logs', { params: { action, page, limit: 50 } }).then(r => r.data),
  });

  const logs = data?.data || [];
  const meta = data?.meta;

  const actionColors: Record<string, string> = {
    LOGIN: 'success', LOGOUT: 'default', CREATE: 'info', UPDATE: 'warning', DELETE: 'danger',
  };

  return (
    <>
      <Topbar title="Audit Logs" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Audit Logs</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Complete system activity trail</p>
          </div>
          <select className="form-select" style={{ width: 180 }} value={action} onChange={e => { setAction(e.target.value); setPage(1); }} id="audit-action-filter">
            <option value="">All Actions</option>
            <option value="LOGIN">Login</option>
            <option value="LOGOUT">Logout</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
          </select>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP Address</th>
                  <th>User Agent</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(8)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : logs.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state">
                    <div className="empty-state-title">No audit logs found</div>
                  </div></td></tr>
                ) : logs.map((log: any) => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{log.user?.name || 'System'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.userEmail}</div>
                    </td>
                    <td>
                      <span className={`badge badge-${actionColors[log.action] || 'default'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {log.entityType}
                      {log.entityId && <span style={{ color: 'var(--text-muted)', fontSize: 10, display: 'block', fontFamily: 'JetBrains Mono, monospace' }}>{log.entityId.slice(0, 16)}...</span>}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{log.ipAddress || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 200 }} className="truncate">{log.userAgent?.slice(0, 40) || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{format(new Date(log.createdAt), 'MMM d, HH:mm:ss')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">Showing page {page} of {meta.totalPages} ({meta.total} total)</span>
              <div className="pagination-controls">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                <button className="page-btn" disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
