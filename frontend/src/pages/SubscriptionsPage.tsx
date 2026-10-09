import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Activity } from 'lucide-react';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

export default function SubscriptionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['subscriptions', status, page],
    queryFn: () => api.get('/subscriptions', { params: { status, page, limit: 20 } }).then(r => r.data),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.post(`/subscriptions/${id}/cancel`, { reason: 'Cancelled by admin' }),
    onSuccess: () => { toast.success('Subscription cancelled'); qc.invalidateQueries({ queryKey: ['subscriptions'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const subscriptions = data?.data || [];
  const meta = data?.meta;

  const statusColor: Record<string, string> = {
    ACTIVE: 'success', EXPIRED: 'warning', CANCELLED: 'danger',
    PENDING: 'info', SUSPENDED: 'default',
  };

  return (
    <>
      <Topbar title="Subscriptions" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Subscriptions</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} total</p>
          </div>
          <select className="form-select" style={{ width: 160 }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} id="sub-status-filter">
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="PENDING">Pending</option>
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
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Auto Renew</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : subscriptions.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state">
                    <div className="empty-state-icon"><Activity size={40} /></div>
                    <div className="empty-state-title">No subscriptions</div>
                  </div></td></tr>
                ) : subscriptions.map((sub: any) => (
                  <tr key={sub.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{sub.customer?.user?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub.customer?.customerCode}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{sub.plan?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>₹{Number(sub.plan?.price || 0).toLocaleString()}/mo</div>
                    </td>
                    <td><span className={`badge badge-${statusColor[sub.status] || 'default'}`}>{sub.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub.startDate ? format(new Date(sub.startDate), 'MMM d, yyyy') : '—'}</td>
                    <td style={{
                      fontSize: 12,
                      color: sub.endDate && new Date(sub.endDate) < new Date() ? '#ef4444' : 'var(--text-muted)'
                    }}>
                      {sub.endDate ? format(new Date(sub.endDate), 'MMM d, yyyy') : '—'}
                    </td>
                    <td>
                      <span className={`badge ${sub.autoRenew ? 'badge-success' : 'badge-default'}`}>
                        {sub.autoRenew ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      {sub.status === 'ACTIVE' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => { if (confirm('Cancel subscription?')) cancelMut.mutate(sub.id); }}
                          id={`cancel-sub-${sub.id}`}
                        >
                          Cancel
                        </button>
                      )}
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
