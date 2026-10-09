import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { FileText, Search } from 'lucide-react';
import { format } from 'date-fns';

export default function InvoicesPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page],
    queryFn: () => api.get('/invoices', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const invoices = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Invoices" />
      <div className="page-content">
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Invoices</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{meta?.total || 0} invoices</p>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Tax</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(8)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : invoices.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-state">
                    <div className="empty-state-icon"><FileText size={40} /></div>
                    <div className="empty-state-title">No invoices found</div>
                  </div></td></tr>
                ) : invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td>
                      <code style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-primary-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                        {inv.invoiceNumber}
                      </code>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{inv.customer?.user?.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{inv.subscription?.plan?.name || '-'}</td>
                    <td>₹{Number(inv.amount).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>₹{Number(inv.tax || 0).toFixed(0)}</td>
                    <td style={{ fontWeight: 700 }}>₹{Number(inv.total).toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${inv.status === 'PAID' ? 'success' : inv.status === 'OVERDUE' ? 'danger' : 'warning'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{format(new Date(inv.createdAt), 'MMM d, yyyy')}</td>
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
