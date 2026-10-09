import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import {
  Users, Wifi, CreditCard, Ticket, AlertTriangle, Server,
  TrendingUp, Activity, Shield, Zap
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';

function StatCard({ label, value, icon: Icon, color, change }: any) {
  return (
    <div className={`stat-card ${color}`}>
      <div className={`stat-icon ${color}`}>
        <Icon size={20} />
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {change !== undefined && (
        <div className={`stat-change ${change >= 0 ? 'up' : 'down'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  );
}

function formatCurrency(val: number) {
  return `₹${val.toLocaleString('en-IN')}`;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export default function DashboardPage() {
  const { user, isAdmin, isSupport, isTechnician, isCustomer } = useAuth();

  const dashEndpoint = isAdmin || isSupport ? '/dashboard/admin' : isTechnician ? '/dashboard/technician' : '/dashboard/customer';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', dashEndpoint],
    queryFn: () => api.get(dashEndpoint).then(r => r.data.data),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <>
        <Topbar title="Dashboard" />
        <div className="page-content">
          <div className="loading-overlay"><div className="spinner" style={{ width: 40, height: 40 }} /></div>
        </div>
      </>
    );
  }

  if (isCustomer) {
    return <CustomerDashboard data={data} />;
  }

  if (isTechnician) {
    return <TechnicianDashboard data={data} />;
  }

  return <AdminDashboard data={data} refetch={refetch} />;
}

function AdminDashboard({ data, refetch }: any) {
  if (!data) return null;

  const { customers, connections, subscriptions, tickets, revenue, network, incidents, revenueTrend, recentPayments, recentTickets } = data;

  const pieData = [
    { name: 'Active', value: connections.active },
    { name: 'Suspended', value: connections.suspended },
  ].filter(d => d.value > 0);

  return (
    <>
      <Topbar title="Admin Dashboard" />
      <div className="page-content">
        {/* Stats Grid */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <StatCard label="Total Customers" value={customers.total} icon={Users} color="blue" />
          <StatCard label="Active Connections" value={connections.active} icon={Wifi} color="green" />
          <StatCard label="Monthly Revenue" value={formatCurrency(revenue.monthly)} icon={CreditCard} color="cyan" />
          <StatCard label="Open Tickets" value={tickets.open} icon={Ticket} color="yellow" />
          <StatCard label="Online Devices" value={network.online} icon={Server} color="green" />
          <StatCard label="Offline Devices" value={network.offline} icon={Server} color="red" />
          <StatCard label="Active Subscriptions" value={subscriptions.active} icon={Activity} color="blue" />
          <StatCard label="Critical Incidents" value={incidents.critical} icon={AlertTriangle} color="red" />
          <StatCard label="SLA Breaches" value={tickets.slaBreached} icon={Shield} color="red" />
          <StatCard label="Total Revenue" value={formatCurrency(revenue.total)} icon={TrendingUp} color="purple" />
        </div>

        {/* Charts */}
        <div className="charts-grid">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Revenue Trend (6 months)</span>
              <button className="btn btn-secondary btn-sm" onClick={refetch}>Refresh</button>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueTrend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `₹${v/1000}k`} />
                <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 10 }} labelStyle={{ color: '#94a3b8' }} />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Connection Status</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <ResponsiveContainer width="60%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pieData.map((d, i) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORS[i] }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                    <span style={{ fontWeight: 700 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Recent Payments */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Payments</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentPayments?.map((p: any) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                    <CreditCard size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.customer?.user?.name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(p.createdAt), 'MMM d, h:mm a')}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981' }}>₹{Number(p.amount).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Tickets */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Tickets</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentTickets?.map((t: any) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
                    <Ticket size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.ticketNumber} • {t.priority}</div>
                  </div>
                  <span className={`badge badge-${t.status === 'OPEN' ? 'warning' : t.status === 'RESOLVED' ? 'success' : 'info'}`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CustomerDashboard({ data }: any) {
  const { customer } = data || {};
  const activeConn = customer?.connections?.[0];
  const activeSub = customer?.subscriptions?.[0];

  return (
    <>
      <Topbar title="My Dashboard" />
      <div className="page-content">
        <div className="stats-grid">
          <StatCard label="Current Plan" value={activeSub?.plan?.name || 'None'} icon={Zap} color="blue" />
          <StatCard label="Status" value={activeConn?.status || 'N/A'} icon={Wifi} color={activeConn?.status === 'ACTIVE' ? 'green' : 'red'} />
          <StatCard label="Speed" value={activeSub?.plan ? `${activeSub.plan.speedMbps} Mbps` : 'N/A'} icon={Activity} color="cyan" />
        </div>

        {activeSub && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Subscription Details</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Plan</div>
                <div style={{ fontWeight: 600 }}>{activeSub.plan?.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Valid Until</div>
                <div style={{ fontWeight: 600 }}>{activeSub.endDate ? format(new Date(activeSub.endDate), 'dd MMM yyyy') : 'N/A'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Monthly Cost</div>
                <div style={{ fontWeight: 600 }}>₹{Number(activeSub.plan?.price || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Payments</span>
            </div>
            {customer?.payments?.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No payments yet</div></div>
            ) : (
              customer?.payments?.map((p: any) => (
                <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>₹{Number(p.amount).toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{format(new Date(p.createdAt), 'dd MMM yyyy')}</div>
                  </div>
                  <span className={`badge badge-${p.status === 'SUCCESS' ? 'success' : p.status === 'FAILED' ? 'danger' : 'warning'}`}>
                    {p.status}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">My Tickets</span>
            </div>
            {customer?.tickets?.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No open tickets</div></div>
            ) : (
              customer?.tickets?.map((t: any) => (
                <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.ticketNumber}</div>
                  </div>
                  <span className={`badge badge-${t.status === 'RESOLVED' ? 'success' : 'warning'}`}>{t.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function TechnicianDashboard({ data }: any) {
  const { technician } = data || {};
  return (
    <>
      <Topbar title="My Dashboard" />
      <div className="page-content">
        <div className="stats-grid">
          <StatCard label="Assigned Tickets" value={technician?.tickets?.length || 0} icon={Ticket} color="yellow" />
          <StatCard label="Pending Installations" value={technician?.installations?.length || 0} icon={Wifi} color="blue" />
          <StatCard label="Status" value={technician?.status || 'N/A'} icon={Activity} color="green" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">My Tickets</span></div>
            {technician?.tickets?.map((a: any) => (
              <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{a.ticket?.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Priority: {a.ticket?.priority} • {a.ticket?.status}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">My Installations</span></div>
            {technician?.installations?.map((inst: any) => (
              <div key={inst.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{inst.customer?.user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inst.address} • {inst.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
