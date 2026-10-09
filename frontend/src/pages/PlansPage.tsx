import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '../components/Topbar';
import api from '../lib/api';
import { Zap, Plus, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

function PlanModal({ plan, onClose, onSave }: any) {
  const [form, setForm] = useState(plan || {
    name: '', speedMbps: 100, price: 499, billingCycleDays: 30,
    dataLimitGb: '', installationFee: 999, activationFee: 0,
    description: '', features: [],
  });
  const [loading, setLoading] = useState(false);
  const [featureInput, setFeatureInput] = useState('');

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave({
        ...form,
        dataLimitGb: form.dataLimitGb === '' ? null : form.dataLimitGb,
      });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{plan ? 'Edit Plan' : 'Create New Plan'}</span>
          <button className="btn btn-icon btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Plan Name</label>
                <input className="form-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Standard 100 Mbps" />
              </div>
              <div className="form-group">
                <label className="form-label">Speed (Mbps)</label>
                <input type="number" className="form-input" value={form.speedMbps} onChange={e => setForm({...form, speedMbps: +e.target.value})} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Monthly Price (₹)</label>
                <input type="number" className="form-input" value={form.price} onChange={e => setForm({...form, price: +e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Billing Cycle (days)</label>
                <input type="number" className="form-input" value={form.billingCycleDays} onChange={e => setForm({...form, billingCycleDays: +e.target.value})} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Installation Fee (₹)</label>
                <input type="number" className="form-input" value={form.installationFee} onChange={e => setForm({...form, installationFee: +e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Data Limit (GB, blank=unlimited)</label>
                <input type="number" className="form-input" value={form.dataLimitGb || ''} onChange={e => setForm({...form, dataLimitGb: e.target.value ? +e.target.value : null})} placeholder="Unlimited" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Features (press Enter to add)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={featureInput}
                  onChange={e => setFeatureInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && featureInput.trim()) {
                      setForm({...form, features: [...(form.features || []), featureInput.trim()]});
                      setFeatureInput('');
                    }
                  }}
                  placeholder="Add feature..."
                />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {form.features?.map((f: string, i: number) => (
                  <span key={i} style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--color-primary-light)', padding: '3px 10px', borderRadius: 20, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {f}
                    <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }} onClick={() => setForm({...form, features: form.features.filter((_: any, j: number) => j !== i)})}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading} id="save-plan-btn">
            {loading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : null}
            {plan ? 'Update Plan' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const { isAdmin } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans', { params: { includeInactive: isAdmin } }).then(r => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/plans', data),
    onSuccess: () => { toast.success('Plan created!'); qc.invalidateQueries({ queryKey: ['plans'] }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/plans/${id}`, data),
    onSuccess: () => { toast.success('Plan updated!'); qc.invalidateQueries({ queryKey: ['plans'] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: () => { toast.success('Plan deleted'); qc.invalidateQueries({ queryKey: ['plans'] }); },
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => api.post(`/plans/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });

  const handleSave = async (form: any) => {
    if (editPlan) {
      await updateMut.mutateAsync({ id: editPlan.id, data: form });
    } else {
      await createMut.mutateAsync(form);
    }
    setEditPlan(null);
    setShowModal(false);
  };

  const speedColor = (speed: number) => {
    if (speed >= 500) return '#6366f1';
    if (speed >= 200) return '#06b6d4';
    if (speed >= 100) return '#10b981';
    return '#f59e0b';
  };

  return (
    <>
      <Topbar title="Internet Plans" />
      <div className="page-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>Internet Plans</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{plans.length} plans configured</p>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditPlan(null); setShowModal(true); }} id="create-plan-btn">
              <Plus size={16} /> New Plan
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="loading-overlay"><div className="spinner" style={{ width: 36, height: 36 }} /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {plans.map((plan: any) => (
              <div key={plan.id} className="card" style={{ position: 'relative', overflow: 'visible' }}>
                {!plan.isActive && (
                  <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    Inactive
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${speedColor(plan.speedMbps)}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: speedColor(plan.speedMbps) }}>
                    <Zap size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{plan.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{plan.billingCycleDays}-day billing</div>
                  </div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>
                  <span style={{ color: speedColor(plan.speedMbps) }}>₹{Number(plan.price).toLocaleString()}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>/mo</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {plan.speedMbps} Mbps • {plan.dataLimitGb ? `${plan.dataLimitGb} GB` : 'Unlimited'}
                </div>
                {plan.description && (
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>{plan.description}</p>
                )}
                {plan.features?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
                    {plan.features.slice(0, 4).map((f: string) => (
                      <div key={f} style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: speedColor(plan.speedMbps) }}>✓</span> {f}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border-color)', paddingTop: 14, marginTop: 'auto' }}>
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
                    Install: ₹{Number(plan.installationFee).toLocaleString()}
                  </div>
                  {isAdmin && (
                    <>
                      <button className="btn btn-icon btn-secondary btn-sm" onClick={() => { setEditPlan(plan); setShowModal(true); }} title="Edit" id={`edit-plan-${plan.id}`}><Edit size={13} /></button>
                      <button className="btn btn-icon btn-secondary btn-sm" onClick={() => toggleMut.mutate(plan.id)} title="Toggle" id={`toggle-plan-${plan.id}`}>
                        {plan.isActive ? <ToggleRight size={14} style={{ color: '#10b981' }} /> : <ToggleLeft size={14} />}
                      </button>
                      <button className="btn btn-icon btn-danger btn-sm" onClick={() => { if (confirm('Delete plan?')) deleteMut.mutate(plan.id); }} title="Delete" id={`delete-plan-${plan.id}`}><Trash2 size={13} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showModal && (
          <PlanModal
            plan={editPlan}
            onClose={() => { setShowModal(false); setEditPlan(null); }}
            onSave={handleSave}
          />
        )}
      </div>
    </>
  );
}
