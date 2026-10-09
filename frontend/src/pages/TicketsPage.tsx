import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Ticket as TicketIcon, Plus, Search, Filter, MessageSquare, User, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

const priorityColor: Record<string, string> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger',
};

const statusColor: Record<string, string> = {
  OPEN: 'warning', ASSIGNED: 'info', IN_PROGRESS: 'purple', WAITING_FOR_CUSTOMER: 'cyan',
  RESOLVED: 'success', CLOSED: 'default',
};

function CreateTicketModal({ onClose, onCreated }: any) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', category: 'GENERAL' });
  const { isAdmin } = useAuth();

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/tickets', data, {
      headers: { 'Idempotency-Key': `ticket-${Date.now()}-${Math.random()}` }
    }),
    onSuccess: () => { toast.success('Ticket created!'); onCreated(); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create ticket'),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Create Support Ticket</span>
          <button className="btn btn-icon btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Brief description of the issue" id="ticket-title" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={4} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Detailed description..." id="ticket-description" />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-select" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})} id="ticket-priority">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={e => setForm({...form, category: e.target.value})} id="ticket-category">
                  <option value="GENERAL">General</option>
                  <option value="BILLING">Billing</option>
                  <option value="TECHNICAL">Technical</option>
                  <option value="INSTALLATION">Installation</option>
                  <option value="COMPLAINT">Complaint</option>
                  <option value="NETWORK">Network</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.title || !form.description} id="submit-ticket-btn">
            {createMut.isPending ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : null}
            Create Ticket
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const { user, isAdmin, isSupport } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', search, status, priority, page],
    queryFn: () => api.get('/tickets', { params: { search, status, priority, page, limit: 20 } }).then(r => r.data),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: any) => api.put(`/tickets/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['tickets'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update status'),
  });

  const tickets = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Support Tickets" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Support Tickets</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} total tickets</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} id="create-ticket-btn">
            <Plus size={16} /> New Ticket
          </button>
        </div>

        <div className="filters-bar">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              className="form-input search-input"
              placeholder="Search tickets..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              id="ticket-search"
            />
          </div>
          <select className="form-select" style={{ width: 160 }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          <select className="form-select" style={{ width: 160 }} value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}>
            <option value="">All Priority</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Customer</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 20 }} /></td>)}</tr>
                  ))
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state-icon"><TicketIcon size={40} /></div>
                      <div className="empty-state-title">No tickets found</div>
                    </div>
                  </td></tr>
                ) : tickets.map((t: any) => (
                  <tr key={t.id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{t.ticketNumber}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t.customer?.user?.name}</td>
                    <td><span className={`badge badge-${priorityColor[t.priority]}`}>{t.priority}</span></td>
                    <td><span className={`badge badge-${statusColor[t.status]}`}>{t.status.replace('_', ' ')}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.category}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{format(new Date(t.createdAt), 'MMM d')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-icon btn-secondary btn-sm" onClick={() => setSelectedTicket(t)} title="Details" id={`view-ticket-${t.id}`}>
                          <MessageSquare size={13} />
                        </button>
                        {(isAdmin || isSupport) && t.status !== 'CLOSED' && (
                          <select
                            className="form-select"
                            style={{ width: 130, padding: '4px 8px', fontSize: 12 }}
                            value={t.status}
                            onChange={e => updateStatusMut.mutate({ id: t.id, status: e.target.value })}
                            id={`status-select-${t.id}`}
                          >
                            <option value="OPEN">Open</option>
                            <option value="ASSIGNED">Assigned</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="WAITING_FOR_CUSTOMER">Waiting</option>
                            <option value="RESOLVED">Resolved</option>
                            <option value="CLOSED">Closed</option>
                          </select>
                        )}
                      </div>
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

        {showCreate && <CreateTicketModal onClose={() => setShowCreate(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['tickets'] })} />}
      </div>
    </>
  );
}
