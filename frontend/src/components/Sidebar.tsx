import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard, Users, Wifi, CreditCard, Ticket, Settings,
  Activity, Server, AlertTriangle, Bell, LogOut, ChevronRight,
  FileText, UserCog, Router, Shield, BarChart3, Zap, Wrench,
  PieChart, Home
} from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  roles?: string[];
  badge?: number;
}

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'Customers', icon: Users, to: '/customers', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'My Profile', icon: Home, to: '/my-profile', roles: ['CUSTOMER'] },
      { label: 'My Subscription', icon: Wifi, to: '/my-subscription', roles: ['CUSTOMER'] },
      { label: 'My Payments', icon: CreditCard, to: '/my-payments', roles: ['CUSTOMER'] },
    ],
  },
  {
    label: 'Services',
    items: [
      { label: 'Internet Plans', icon: Zap, to: '/plans' },
      { label: 'Connections', icon: Wifi, to: '/connections', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'Subscriptions', icon: Activity, to: '/subscriptions', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'Payments', icon: CreditCard, to: '/payments', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'Invoices', icon: FileText, to: '/invoices' },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Tickets', icon: Ticket, to: '/tickets' },
      { label: 'Technicians', icon: Wrench, to: '/technicians', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'My Jobs', icon: Wrench, to: '/my-jobs', roles: ['TECHNICIAN'] },
    ],
  },
  {
    label: 'Network',
    items: [
      { label: 'Network Devices', icon: Router, to: '/network', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT'] },
      { label: 'Incidents', icon: AlertTriangle, to: '/incidents', roles: ['SUPER_ADMIN', 'ISP_ADMIN', 'SUPPORT_AGENT', 'TECHNICIAN'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Reports', icon: BarChart3, to: '/reports', roles: ['SUPER_ADMIN', 'ISP_ADMIN'] },
      { label: 'Audit Logs', icon: Shield, to: '/audit-logs', roles: ['SUPER_ADMIN', 'ISP_ADMIN'] },
    ],
  },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredSections = navSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (!item.roles) return true;
      return user?.role && item.roles.includes(user.role);
    }),
  })).filter(section => section.items.length > 0);

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">⚡</div>
        <div>
          <div className="sidebar-title">ISPFlow</div>
          <div className="sidebar-subtitle">Network Operations</div>
        </div>
      </div>

      <div className="sidebar-nav">
        {filteredSections.map(section => (
          <div key={section.label}>
            <div className="sidebar-section-label">{section.label}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <item.icon className="icon" size={18} />
                {item.label}
                {item.badge ? <span className="sidebar-badge">{item.badge}</span> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-avatar">{initials}</div>
        <div className="user-info">
          <div className="user-name">{user?.name}</div>
          <div className="user-role">{user?.role?.replace('_', ' ')}</div>
        </div>
        <button
          className="btn btn-icon btn-secondary"
          onClick={handleLogout}
          title="Logout"
          id="logout-btn"
          style={{ marginLeft: 'auto' }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
