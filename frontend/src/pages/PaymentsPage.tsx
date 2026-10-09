import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { CreditCard, Plus, Search, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

function PaymentModal({ onClose, onDone }: any) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [subscriptionId, setSubscriptionId] = useState('');

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['subscriptions-for-payment'],
    queryFn: () => api.get('/subscriptions', { params: { limit: 100 } }).then(r => r.data.data),
  });

  const { data: paymentConfig } = useQuery({
    queryKey: ['payment-config'],
    queryFn: () => api.get('/payments/config').then(r => r.data.data),
  });

  const payMut = useMutation({
    mutationFn: (data: any) => api.post('/payments', data, {
      headers: { 'Idempotency-Key': uuidv4() }
    }),
    onSuccess: (response) => {
      const payment = response.data.data;
      onDone();
      if (payment.provider === 'UPI_MANUAL' || payment.status !== 'SUCCESS') {
        onClose();
        navigate(`/payments/${payment.paymentId}/status`);
        return;
      }
      toast.success('Payment confirmed by the server');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Payment failed'),
  });

  const selectedSubscription = subscriptions.find((subscription: any) => subscription.id === subscriptionId);
  const selectedPlan = selectedSubscription?.plan;

  const createPayment = () => {
    if (!selectedSubscription) return;
    payMut.mutate({
      subscriptionId: selectedSubscription.id,
      ...(user?.role === 'CUSTOMER' ? {} : { customerId: selectedSubscription.customerId }),
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Pay Subscription</span>
          <button className="btn btn-icon btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Subscription</label>
              <select className="form-select" value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)} id="pay-subscription-select">
                <option value="">Select subscription...</option>
                {subscriptions.filter((subscription: any) => subscription.status !== 'CANCELLED').map((subscription: any) => (
                  <option key={subscription.id} value={subscription.id}>
                    {subscription.customer?.user?.name || 'My account'} — {subscription.plan?.name} ({subscription.status})
                  </option>
                ))}
              </select>
            </div>
            {selectedPlan && (
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Payment Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Plan', selectedPlan.name],
                    ['Amount', `₹${Number(selectedPlan.price).toLocaleString()}`],
                    ['Billing cycle', `${selectedPlan.billingCycleDays} days`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, padding: 10, background: 'rgba(16,185,129,0.1)', borderRadius: 8, fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {paymentConfig?.provider === 'UPI_MANUAL'
                    ? 'UPI transfer stays pending until the server verifies your payment reference.'
                    : paymentConfig?.provider === 'MOCK'
                      ? 'Simulation mode: no money will be transferred.'
                      : `Payment provider: ${paymentConfig?.provider || 'Loading...'}`}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={createPayment}
            disabled={!selectedSubscription || !selectedPlan || payMut.isPending}
            id="process-payment-btn"
          >
            {payMut.isPending ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '💳'} Continue to payment
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  const { isAdmin, isSupport, isCustomer } = useAuth();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page],
    queryFn: () => api.get('/payments', { params: { page, limit: 20 } }).then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: () => api.get('/payments/stats').then(r => r.data.data),
    enabled: isAdmin || isSupport,
  });

  const payments = data?.data || [];
  const meta = data?.meta;

  return (
    <>
      <Topbar title="Payments" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Payments</h2>
            {statsData && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                Total Revenue: ₹{Number(statsData.totalRevenue || 0).toLocaleString('en-IN')} • {statsData.totalPayments} transactions
              </p>
            )}
          </div>
          {(isAdmin || isSupport || isCustomer) && (
            <button className="btn btn-primary" onClick={() => setShowModal(true)} id="new-payment-btn">
              <Plus size={16} /> Process Payment
            </button>
          )}
        </div>

        {statsData && (
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
            <div className="stat-card green">
              <div className="stat-icon green"><CreditCard size={18} /></div>
              <div className="stat-value">₹{(Number(statsData.monthlyRevenue || 0) / 1000).toFixed(0)}K</div>
              <div className="stat-label">This Month</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-icon blue"><CreditCard size={18} /></div>
              <div className="stat-value">{statsData.successCount}</div>
              <div className="stat-label">Successful</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-icon yellow"><CreditCard size={18} /></div>
              <div className="stat-value">{statsData.pendingCount}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon red"><CreditCard size={18} /></div>
              <div className="stat-value">{statsData.failedCount}</div>
              <div className="stat-label">Failed</div>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 0 }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Transaction ID</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? [...Array(5)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j}><div className="skeleton" style={{ height: 18 }} /></td>)}</tr>
                )) : payments.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-title">No payments found</div></div></td></tr>
                ) : payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.customer?.user?.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.customer?.customerCode}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: p.status === 'SUCCESS' ? '#10b981' : undefined }}>₹{Number(p.amount).toLocaleString()}</td>
                    <td>
                      <span className={`badge badge-${p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.provider}</td>
                    <td><code style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{p.transactionId?.slice(0, 24)}...</code></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{format(new Date(p.createdAt), 'MMM d, yyyy HH:mm')}</td>
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

        {showModal && <PaymentModal onClose={() => setShowModal(false)} onDone={() => qc.invalidateQueries({ queryKey: ['payments'] })} />}
      </div>
    </>
  );
}
