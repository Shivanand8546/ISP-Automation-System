import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

const severityColor: Record<string, string> = {
  LOW: 'default', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'danger',
};

const statusColor: Record<string, string> = {
  OPEN: 'danger', INVESTIGATING: 'warning', IDENTIFIED: 'info',
  MONITORING: 'purple', RESOLVED: 'success', CLOSED: 'default',
};

export default function IncidentsPage() {
  const { isAdmin, isSupport } = useAuth();
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM', affectedArea: '' });
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', page],
    queryFn: () => api.get('/incidents', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/incidents', form),
    onSuccess: () => { toast.success('Incident created'); setShowCreate(false); qc.invalidateQueries({ queryKey: ['incidents'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed'),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: any) => api.put(`/incidents/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['incidents'] }); },
  });

  const incidents = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Incidents" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Network Incidents</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} total incidents</p>
          </div>
          {(isAdmin || isSupport) && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)} id="create-incident-btn">
              <Plus size={16} /> Create Incident
            </button>
          )}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Affected Area</th>
                  <th>Device</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : incidents.length === 0 ? (
                  <tr><td colSpan={7}><div className="empty-state">
                    <div className="empty-state-icon"><AlertTriangle size={40} /></div>
                    <div className="empty-state-title">No incidents</div>
                    <div className="empty-state-text">Network is all good 🎉</div>
                  </div></td></tr>
                ) : incidents.map((inc: any) => (
                  <tr key={inc.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{inc.title}</div>
                      {inc.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{inc.description.slice(0, 60)}...</div>}
                    </td>
                    <td><span className={`badge badge-${severityColor[inc.severity]}`}>{inc.severity}</span></td>
                    <td><span className={`badge badge-${statusColor[inc.status]}`}>{inc.status}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inc.affectedArea || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{inc.device?.name || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{format(new Date(inc.createdAt), 'MMM d, HH:mm')}</td>
                    <td>
                      {(isAdmin || isSupport) && inc.status !== 'CLOSED' && (
                        <select
                          className="form-select"
                          style={{ width: 140, padding: '4px 8px', fontSize: 12 }}
                          value={inc.status}
                          onChange={e => updateStatusMut.mutate({ id: inc.id, status: e.target.value })}
                          id={`incident-status-${inc.id}`}
                        >
                          <option value="OPEN">Open</option>
                          <option value="INVESTIGATING">Investigating</option>
                          <option value="IDENTIFIED">Identified</option>
                          <option value="MONITORING">Monitoring</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
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

        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Create Incident</span>
                <button className="btn btn-icon btn-secondary btn-sm" onClick={() => setShowCreate(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Title</label>
                    <input className="form-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Incident title" id="incident-title" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} id="incident-desc" />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="form-label">Severity</label>
                      <select className="form-select" value={form.severity} onChange={e => setForm({...form, severity: e.target.value})} id="incident-severity">
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Affected Area</label>
                      <input className="form-input" value={form.affectedArea} onChange={e => setForm({...form, affectedArea: e.target.value})} placeholder="e.g. Andheri West" id="incident-area" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => createMut.mutate()} disabled={!form.title || createMut.isPending} id="submit-incident-btn">
                  Create Incident
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
