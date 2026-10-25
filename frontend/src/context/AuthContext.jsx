import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, getAuthBackend, clearAuthSession, refreshAuthSession, subscribeAuthSession } from '../utils/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authBackend, setAuthBackend] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const mode = await getAuthBackend();
      setAuthBackend(mode);
      if (mode === 'legacy' && !localStorage.getItem('mediid_token')) return;
      const { data } = mode === 'postgres' ? await refreshAuthSession() : await authAPI.me();
      setUser(data.user);
      setProfile(data.profile);
    } catch {
      clearAuthSession(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => subscribeAuthSession(data => {
    setUser(data?.user || null);
    setProfile(data?.profile || null);
  }), []);
  useEffect(() => { loadUser(); }, [loadUser]);

  const setSignedIn = data => {
    sessionStorage.removeItem('hospital_doctor_token');
    sessionStorage.removeItem('hospital_doctor_profile');
    setUser(data.user);
    setProfile(data.profile);
    return data;
  };

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password });
    setAuthBackend(await getAuthBackend());
    return setSignedIn(data);
  };

  const register = async formData => {
    const { data } = await authAPI.register(formData);
    setAuthBackend(await getAuthBackend());
    return setSignedIn(data);
  };

  const logout = async () => {
    clearAuthSession();
    setUser(null);
    setProfile(null);
    try {
      await authAPI.logout();
      toast.success('Logged out successfully');
    } catch {
      toast.error('Server sign-out could not be confirmed. Please try again.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, setProfile, authBackend, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
