import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { AppLayout } from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import PlansPage from './pages/PlansPage';
import ConnectionsPage from './pages/ConnectionsPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import PaymentsPage from './pages/PaymentsPage';
import InvoicesPage from './pages/InvoicesPage';
import TicketsPage from './pages/TicketsPage';
import TechniciansPage from './pages/TechniciansPage';
import NetworkPage from './pages/NetworkPage';
import IncidentsPage from './pages/IncidentsPage';
import NotificationsPage from './pages/NotificationsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import PaymentStatusPage from './pages/PaymentStatusPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/connections" element={<ConnectionsPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/payments" element={<PaymentsPage />} />
              <Route path="/payments/:id/status" element={<PaymentStatusPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/technicians" element={<TechniciansPage />} />
              <Route path="/network" element={<NetworkPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              {/* Alias routes for role-specific pages */}
              <Route path="/my-profile" element={<DashboardPage />} />
              <Route path="/my-subscription" element={<SubscriptionsPage />} />
              <Route path="/my-payments" element={<PaymentsPage />} />
              <Route path="/my-jobs" element={<TicketsPage />} />
              <Route path="/reports" element={<DashboardPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid rgba(148,163,184,0.15)',
              borderRadius: 12,
              fontSize: 13.5,
            },
            success: { iconTheme: { primary: '#10b981', secondary: '#1e293b' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
