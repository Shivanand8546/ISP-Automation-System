import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div style={{ width: '100%', maxWidth: 900, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, padding: 24, alignItems: 'center' }}>
        {/* Left Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div className="auth-logo" style={{ justifyContent: 'flex-start', marginBottom: 16 }}>
              <div className="auth-logo-icon">⚡</div>
              <div className="auth-logo-title">ISPFlow</div>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, lineHeight: 1.3 }}>
              Complete ISP Operations Platform
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.7 }}>
              Manage customers, billing, support tickets, network monitoring, and automation — all in one place.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              '🔐 Role-based access control',
              '⚡ Real-time network monitoring',
              '💳 Automated billing & invoices',
              '🎫 Smart ticket escalation',
              '📊 Live dashboards & reports',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-secondary)' }}>
                {f}
              </div>
            ))}
          </div>

        </div>

        {/* Right Panel - Login Form */}
        <div className="auth-card" style={{ maxWidth: '100%' }}>
          <h3 className="auth-title">Sign In</h3>
          <p className="auth-subtitle">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                {...register('email')}
                type="email"
                className="form-input"
                placeholder="admin@ispflow.com"
                id="email-input"
                autoComplete="email"
              />
              {errors.email && <span className="form-error">{errors.email.message}</span>}
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  className="form-input"
                  placeholder="••••••••"
                  id="password-input"
                  autoComplete="current-password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer'
                  }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="form-error">{errors.password.message}</span>}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              id="login-submit-btn"
              style={{ width: '100%', marginTop: 8 }}
            >
              {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Signing in...</> : 'Sign In →'}
            </button>
          </form>

          <div className="divider" />

        </div>
      </div>
    </div>
  );
}
