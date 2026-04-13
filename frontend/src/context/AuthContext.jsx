import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('mediid_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await authAPI.me();
      console.log('👤 User loaded successfully:', data.user.email);
      setUser(data.user);
      setProfile(data.profile);
    } catch (err) {
      console.error('❌ Auth initialization failed:', err.message);
      localStorage.removeItem('mediid_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    localStorage.setItem('mediid_token', data.token);
    setUser(data.user);
    setProfile(data.profile);
    return data;
  };

  const register = async (formData) => {
    const { data } = await authAPI.register(formData);
    localStorage.setItem('mediid_token', data.token);
    setUser(data.user);
    setProfile(data.profile);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('mediid_token');
    setUser(null);
    setProfile(null);
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
