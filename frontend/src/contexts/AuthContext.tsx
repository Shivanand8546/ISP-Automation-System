import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'ISP_ADMIN' | 'SUPPORT_AGENT' | 'TECHNICIAN' | 'CUSTOMER';
  customer?: { id: string; customerCode: string };
  technician?: { id: string };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isTechnician: boolean;
  isCustomer: boolean;
  isSupport: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    const { accessToken, refreshToken, user: userData } = response.data.data;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(userData));
    // Fetch full user data
    const meResponse = await api.get('/auth/me');
    const fullUser = meResponse.data.data;
    localStorage.setItem('user', JSON.stringify(fullUser));
    setUser(fullUser);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ISP_ADMIN';
  const isTechnician = user?.role === 'TECHNICIAN';
  const isCustomer = user?.role === 'CUSTOMER';
  const isSupport = user?.role === 'SUPPORT_AGENT' || isAdmin;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isTechnician, isCustomer, isSupport }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
