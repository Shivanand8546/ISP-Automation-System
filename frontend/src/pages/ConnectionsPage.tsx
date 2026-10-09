import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Wifi } from 'lucide-react';
import { format } from 'date-fns';

const statusColor: Record<string, string> = {
  ACTIVE: 'success', SUSPENDED: 'danger', EXPIRED: 'warning',
  PENDING: 'info', CANCELLED: 'default', INSTALLATION_REQUIRED: 'purple',
};

export default function ConnectionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['connections', status, page],
    queryFn: () => api.get('/connections', { params: { status, page, limit: 20 } }).then(r => r.data),
  });

  const connections = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Connections" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Internet Connections</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} total</p>
          </div>
          <select className="form-select" style={{ width: 200 }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} id="conn-status-filter">
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="EXPIRED">Expired</option>
            <option value="INSTALLATION_REQUIRED">Needs Installation</option>
          </select>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>IP Address</th>
                  <th>Address</th>
                  <th>Activated</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : connections.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state">
                    <div className="empty-state-icon"><Wifi size={40} /></div>
                    <div className="empty-state-title">No connections found</div>
                  </div></td></tr>
                ) : connections.map((conn: any) => (
                  <tr key={conn.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{conn.customer?.user?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{conn.customer?.customerCode}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{conn.plan?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{conn.plan?.speedMbps} Mbps</div>
                    </td>
                    <td><span className={`badge badge-${statusColor[conn.status] || 'default'}`}>{conn.status.replace('_', ' ')}</span></td>
                    <td><code style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{conn.ipAddress || '—'}</code></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 200 }} className="truncate">{conn.installationAddress}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{conn.activatedAt ? format(new Date(conn.activatedAt), 'MMM d, yyyy') : '—'}</td>
                    <td style={{ fontSize: 12, color: conn.expiresAt && new Date(conn.expiresAt) < new Date() ? '#ef4444' : 'var(--text-muted)' }}>
                      {conn.expiresAt ? format(new Date(conn.expiresAt), 'MMM d, yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {meta && meta.totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">Page {page} of {meta.totalPages}</span>
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
