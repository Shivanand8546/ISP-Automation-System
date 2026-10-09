import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Wrench } from 'lucide-react';

export default function TechniciansPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['technicians', page],
    queryFn: () => api.get('/technicians', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const { data: workload } = useQuery({
    queryKey: ['technician-workload'],
    queryFn: () => api.get('/technicians/workload').then(r => r.data.data),
  });

  const technicians = data?.data || [];
  const meta = data?.meta;

  const statusColor: Record<string, string> = {
    AVAILABLE: 'success', BUSY: 'warning', ON_LEAVE: 'default', INACTIVE: 'danger',
  };

  return (
    <>
      <Topbar title="Technicians" />
      <div className="page-content">
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Technician Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Workload distribution and assignments</p>
        </div>

        {/* Workload Cards */}
        {workload && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
            {workload.map((tech: any) => (
              <div key={tech.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div className="user-avatar">{tech.name?.charAt(0)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{tech.name}</div>
                    <span className={`badge badge-${statusColor[tech.status] || 'default'}`} style={{ fontSize: 10 }}>{tech.status}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>Tickets: <strong style={{ color: 'var(--text-primary)' }}>{tech.activeTickets}</strong></span>
                  <span>Installs: <strong style={{ color: 'var(--text-primary)' }}>{tech.activeInstallations}</strong></span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${tech.workload > 8 ? 'red' : tech.workload > 5 ? 'yellow' : 'green'}`}
                    style={{ width: `${Math.min((tech.workload / 10) * 100, 100)}%` }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{tech.workload}/10 capacity</div>
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>Service Areas</th>
                  <th>Active Tickets</th>
                  <th>Active Installs</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(4)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : technicians.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state">
                    <div className="empty-state-icon"><Wrench size={40} /></div>
                    <div className="empty-state-title">No technicians found</div>
                  </div></td></tr>
                ) : technicians.map((tech: any) => (
                  <tr key={tech.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{tech.name?.charAt(0)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{tech.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tech.user?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tech.phone}</td>
                    <td><span className={`badge badge-${statusColor[tech.status] || 'default'}`}>{tech.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {tech.serviceArea?.slice(0, 2).map((area: string) => (
                          <span key={area} style={{ fontSize: 11, background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary-light)', padding: '2px 8px', borderRadius: 20 }}>{area}</span>
                        ))}
                        {tech.serviceArea?.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{tech.serviceArea.length - 2}</span>}
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 700, color: tech._count?.tickets > 7 ? '#ef4444' : '#10b981' }}>{tech._count?.tickets || 0}</span></td>
                    <td><span style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>{tech._count?.installations || 0}</span></td>
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
