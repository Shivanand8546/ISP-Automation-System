import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import api from '../lib/api';

export default function PaymentStatusPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [utr, setUtr] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const appLaunchAttempted = useRef(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['payment-status', id],
    queryFn: async () => {
      const response = await api.get(`/payments/${id}`);
      return response.data.data;
    },
    enabled: !!id,
    retry: 1,
    refetchInterval: query => ['PENDING', 'AWAITING_VERIFICATION'].includes(query.state.data?.status) ? 5000 : false,
  });

  const submitUtr = useMutation({
    mutationFn: () => api.post(`/payments/${id}/utr`, { utr }),
    onSuccess: () => {
      setUtr('');
      toast.success('Payment reference submitted for verification');
      void queryClient.invalidateQueries({ queryKey: ['payment-status', id] });
    },
    onError: (submitError: any) => toast.error(submitError?.response?.data?.message || 'Could not submit payment reference'),
  });

  const isUpiPayment = data?.provider === 'UPI_MANUAL';
  const upiLink = typeof data?.meta?.upiLink === 'string' ? data.meta.upiLink : '';
  const status = String(data?.status || 'PENDING');

  useEffect(() => {
    setIsMobile(window.matchMedia('(max-width: 700px) and (pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    if (isMobile && isUpiPayment && status === 'PENDING' && upiLink && !appLaunchAttempted.current) {
      appLaunchAttempted.current = true;
      window.location.assign(upiLink);
    }
  }, [isMobile, isUpiPayment, status, upiLink]);

  if (isLoading) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 420, textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', width: 28, height: 28, borderWidth: 3 }} />
          <div style={{ fontWeight: 700, fontSize: 18 }}>Loading payment status…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 420, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>Payment not found</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>This payment could not be loaded.</p>
          <Link to="/payments" className="btn btn-primary">Back to payments</Link>
        </div>
      </div>
    );
  }

  const isPending = status === 'PENDING' || status === 'AWAITING_VERIFICATION';
  const isFailure = status === 'FAILED' || status === 'EXPIRED';

  if (isUpiPayment && status === 'PENDING' && upiLink) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <div className="card" style={{ padding: 28, width: '100%', maxWidth: 520, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Pay ₹{Number(data.amount).toLocaleString('en-IN')} using UPI</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Payment is pending until it is verified by the server.</p>
          {isMobile ? (
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Opening an installed UPI app. If it did not open, use the button below.</p>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 18 }}>
              <QRCodeSVG value={upiLink} size={240} level="M" includeMargin />
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>Scan with your UPI app</p>
            </div>
          )}
          <a className="btn btn-primary" href={upiLink} style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Open UPI app
          </a>
          <form
            onSubmit={event => {
              event.preventDefault();
              submitUtr.mutate();
            }}
            style={{ textAlign: 'left', marginTop: 24 }}
          >
            <label className="form-label" htmlFor="payment-utr">After paying, enter the 12-digit UTR</label>
            <input
              id="payment-utr"
              className="form-input"
              value={utr}
              onChange={event => setUtr(event.target.value.replace(/\D/g, '').slice(0, 12))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              placeholder="UPI transaction reference"
            />
            <button className="btn btn-primary" type="submit" disabled={utr.length !== 12 || submitUtr.isPending} style={{ marginTop: 12, width: '100%' }}>
              {submitUtr.isPending ? 'Submitting...' : 'Submit for verification'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isUpiPayment && status === 'AWAITING_VERIFICATION') {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Payment reference received</h2>
          <p style={{ color: 'var(--text-muted)' }}>Your UTR is awaiting server-side verification. The subscription will activate only after verification.</p>
          <p style={{ marginTop: 12, fontWeight: 700 }}>₹{Number(data.amount).toLocaleString('en-IN')}</p>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>⏳</div>
          <h2 style={{ marginBottom: 8 }}>Confirming...</h2>
          <p style={{ color: 'var(--text-muted)' }}>Your payment is being verified by the server. This page reflects the real backend status and never marks a payment successful on the client.</p>
          <div className="spinner" style={{ margin: '18px auto 0', width: 24, height: 24, borderWidth: 3 }} />
        </div>
      </div>
    );
  }

  if (status === 'SUCCESS') {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
          <h2 style={{ marginBottom: 8 }}>Payment successful</h2>
          <p style={{ color: 'var(--text-muted)' }}>This was confirmed by the server and not inferred from the URL or client state.</p>
          <Link to="/payments" className="btn btn-primary" style={{ marginTop: 16 }}>Back to payments</Link>
        </div>
      </div>
    );
  }

  if (isFailure) {
    return (
      <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
        <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ marginBottom: 8 }}>{status === 'EXPIRED' ? 'Payment expired' : 'Payment failed'}</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 18 }}>{data.failureReason || 'Please try again.'}</p>
          <Link to="/payments" className="btn btn-primary">Try again</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Payment status</h2>
        <p style={{ color: 'var(--text-muted)' }}>Current status: {status}</p>
      </div>
    </div>
  );
}
