import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Router, Wifi, Server, AlertTriangle, Activity, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { io as socketIO } from 'socket.io-client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const deviceIcon: Record<string, React.ElementType> = {
  ROUTER: Router, SWITCH: Server, OLT: Wifi, ONU: Wifi, ONT: Wifi,
  ACCESS_POINT: Wifi, FIREWALL: AlertTriangle, SERVER: Server,
};

const statusColorMap: Record<string, string> = {
  ONLINE: 'success', OFFLINE: 'danger', DEGRADED: 'warning', UNKNOWN: 'default',
};

const simOptions = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH_LATENCY', label: 'High Latency' },
  { value: 'HIGH_PACKET_LOSS', label: 'Packet Loss' },
  { value: 'HIGH_CPU', label: 'High CPU' },
  { value: 'HIGH_BANDWIDTH', label: 'High BW' },
  { value: 'OFFLINE', label: 'Offline' },
];

export default function NetworkPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, any>>({});
  const socketRef = useRef<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['network-devices'],
    queryFn: () => api.get('/network/devices').then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['network-stats'],
    queryFn: () => api.get('/network/devices/stats').then(r => r.data.data),
    refetchInterval: 30000,
  });

  const simMut = useMutation({
    mutationFn: ({ id, simStatus }: any) => api.post(`/network/devices/${id}/simulate`, { simStatus }),
    onSuccess: () => { toast.success('Simulation mode changed'); qc.invalidateQueries({ queryKey: ['network-devices'] }); },
  });

  // Real-time Socket.IO for device status
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    socketRef.current = socketIO('/', { auth: { token } });
    socketRef.current.on('DEVICE_STATUS_CHANGED', (data: any) => {
      setLiveMetrics(prev => ({ ...prev, [data.deviceId]: data }));
      qc.invalidateQueries({ queryKey: ['network-devices'] });
    });
    return () => socketRef.current?.disconnect();
  }, []);

  const devices = data?.data || [];

  const getMetric = (deviceId: string) => liveMetrics[deviceId];

  return (
    <>
      <Topbar title="Network Monitoring" />
      <div className="page-content">
        {/* Summary stats */}
        {stats && (
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
            <div className="stat-card green">
              <div className="stat-icon green"><Wifi size={20} /></div>
              <div className="stat-value">{stats.online}</div>
              <div className="stat-label">Online</div>
            </div>
            <div className="stat-card red">
              <div className="stat-icon red"><AlertTriangle size={20} /></div>
              <div className="stat-value">{stats.offline}</div>
              <div className="stat-label">Offline</div>
            </div>
            <div className="stat-card yellow">
              <div className="stat-icon yellow"><Activity size={20} /></div>
              <div className="stat-value">{stats.degraded}</div>
              <div className="stat-label">Degraded</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-icon blue"><Server size={20} /></div>
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Devices</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Network Devices</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => refetch()} id="refresh-devices-btn">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selectedDevice ? '1fr 1fr' : '1fr', gap: 20 }}>
          {/* Device List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              ))
            ) : devices.map((device: any) => {
              const live = getMetric(device.id);
              const status = live?.status || device.status;
              const IconComp = deviceIcon[device.type] || Server;

              return (
                <div
                  key={device.id}
                  className="network-card"
                  style={{ cursor: 'pointer', border: selectedDevice?.id === device.id ? '1px solid var(--color-primary)' : undefined }}
                  onClick={() => setSelectedDevice(device)}
                  id={`device-card-${device.id}`}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: status === 'ONLINE' ? 'rgba(16,185,129,0.15)' : status === 'OFFLINE' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: status === 'ONLINE' ? '#10b981' : status === 'OFFLINE' ? '#ef4444' : '#f59e0b', flexShrink: 0 }}>
                    <IconComp size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{device.name}</span>
                      <span className={`badge badge-${statusColorMap[status]}`} style={{ fontSize: 10 }}>{status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10 }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{device.ipAddress}</span>
                      <span>{device.type}</span>
                      {device.location && <span>• {device.location}</span>}
                    </div>
                    {live?.metrics && (
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>CPU: {live.metrics.cpuPercent?.toFixed(1)}%</span>
                        <span>Latency: {live.metrics.latencyMs?.toFixed(1)}ms</span>
                        <span>Loss: {live.metrics.packetLoss?.toFixed(2)}%</span>
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <select
                      className="form-select"
                      style={{ width: 140, padding: '4px 8px', fontSize: 11 }}
                      value={device.simStatus}
                      onChange={e => { e.stopPropagation(); simMut.mutate({ id: device.id, simStatus: e.target.value }); }}
                      onClick={e => e.stopPropagation()}
                      id={`sim-select-${device.id}`}
                    >
                      {simOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          {/* Device Detail */}
          {selectedDevice && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">{selectedDevice.name}</span>
                <button className="btn btn-icon btn-secondary btn-sm" onClick={() => setSelectedDevice(null)}>✕</button>
              </div>
              <DeviceDetail deviceId={selectedDevice.id} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DeviceDetail({ deviceId }: { deviceId: string }) {
  const { data } = useQuery({
    queryKey: ['device-detail', deviceId],
    queryFn: () => api.get(`/network/devices/${deviceId}`).then(r => r.data.data),
    refetchInterval: 10000,
  });

  if (!data) return <div className="loading-overlay"><div className="spinner" /></div>;

  const metrics = data.metrics || [];
  const chartData = [...metrics].reverse().slice(-12).map((m: any) => ({
    time: new Date(m.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: Math.round(m.cpuPercent),
    latency: Math.round(m.latencyMs * 10) / 10,
    bandwidth: Math.round(m.bandwidthIn),
    loss: Math.round(m.packetLoss * 100) / 100,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { label: 'IP Address', value: data.ipAddress, mono: true },
          { label: 'Type', value: data.type },
          { label: 'Vendor', value: data.vendor || '-' },
          { label: 'Model', value: data.model || '-' },
          { label: 'Location', value: data.location || '-' },
          { label: 'Status', value: data.status },
        ].map(item => (
          <div key={item.label}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontWeight: 600, fontSize: 13, fontFamily: item.mono ? 'JetBrains Mono, monospace' : undefined }}>{item.value}</div>
          </div>
        ))}
      </div>

      {metrics.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { label: 'CPU', value: `${Math.round(metrics[0].cpuPercent)}%`, color: metrics[0].cpuPercent > 80 ? '#ef4444' : '#10b981' },
              { label: 'Memory', value: `${Math.round(metrics[0].memoryPercent)}%`, color: '#6366f1' },
              { label: 'Latency', value: `${Math.round(metrics[0].latencyMs)}ms`, color: metrics[0].latencyMs > 100 ? '#f59e0b' : '#10b981' },
              { label: 'Packet Loss', value: `${metrics[0].packetLoss?.toFixed(2)}%`, color: metrics[0].packetLoss > 1 ? '#ef4444' : '#10b981' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {chartData.length > 1 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>CPU History</div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#cpuGrad)" strokeWidth={2} name="CPU %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
