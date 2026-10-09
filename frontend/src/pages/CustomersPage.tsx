import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Users, Search, Filter, Plus, Eye, UserX, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'success', SUSPENDED: 'danger', INACTIVE: 'default',
  };
  return <span className={`badge badge-${map[status] || 'default'}`}>{status}</span>;
}

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, status, page],
    queryFn: () => api.get('/customers', { params: { search, status, page, limit: 20 } }).then(r => r.data),
    placeholderData: (prev) => prev,
  });

  const suspendMut = useMutation({
    mutationFn: (id: string) => api.post(`/customers/${id}/suspend`),
    onSuccess: () => { toast.success('Customer suspended'); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: () => toast.error('Failed to suspend customer'),
  });

  const activateMut = useMutation({
    mutationFn: (id: string) => api.post(`/customers/${id}/activate`),
    onSuccess: () => { toast.success('Customer activated'); qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: () => toast.error('Failed to activate customer'),
  });

  const customers = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Customers" />
      <div className="page-content">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Customer Management</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              {meta?.total || 0} total customers
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search customers..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              id="customer-search"
            />
          </div>
          <select
            className="form-select"
            style={{ width: 160 }}
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            id="status-filter"
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        {/* Table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Code</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Connection</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      {[...Array(7)].map((_, j) => (
                        <td key={j}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td>
                      ))}
                    </tr>
                  ))
                ) : customers.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon"><Users size={40} /></div>
                      <div className="empty-state-title">No customers found</div>
                      <div className="empty-state-text">Try adjusting your search</div>
                    </div>
                  </td></tr>
                ) : customers.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                          {c.user?.name?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.user?.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><code style={{ fontSize: 12, background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 4, color: 'var(--color-primary-light)' }}>{c.customerCode}</code></td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.phone || '-'}</td>
                    <td>{statusBadge(c.status)}</td>
                    <td>
                      {c.connections?.[0] ? (
                        <div>
                          <span className={`badge badge-${c.connections[0].status === 'ACTIVE' ? 'success' : 'warning'}`}>{c.connections[0].status}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.connections[0].plan?.name}</div>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No connection</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {format(new Date(c.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-icon btn-secondary btn-sm"
                          onClick={() => navigate(`/customers/${c.id}`)}
                          title="View"
                          id={`view-customer-${c.id}`}
                        >
                          <Eye size={14} />
                        </button>
                        {c.status === 'ACTIVE' ? (
                          <button
                            className="btn btn-icon btn-danger btn-sm"
                            onClick={() => suspendMut.mutate(c.id)}
                            title="Suspend"
                            id={`suspend-customer-${c.id}`}
                          >
                            <UserX size={14} />
                          </button>
                        ) : (
                          <button
                            className="btn btn-icon btn-success btn-sm"
                            onClick={() => activateMut.mutate(c.id)}
                            title="Activate"
                            id={`activate-customer-${c.id}`}
                          >
                            <UserCheck size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, meta.total)} of {meta.total}
              </span>
              <div className="pagination-controls">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                {[...Array(Math.min(meta.totalPages, 5))].map((_, i) => (
                  <button
                    key={i}
                    className={`page-btn ${page === i + 1 ? 'active' : ''}`}
                    onClick={() => setPage(i + 1)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button className="page-btn" disabled={page === meta.totalPages} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
