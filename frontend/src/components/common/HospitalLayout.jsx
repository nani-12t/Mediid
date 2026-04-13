import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, LayoutDashboard, Users, Calendar, FileText, Activity, Settings, LogOut, Bell, Building, UserCheck, Maximize } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/hospital', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/hospital/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/hospital/doctors', icon: Users, label: 'Doctors' },
  { to: '/hospital/staff', icon: UserCheck, label: 'Staff' },
  { to: '/hospital/reports', icon: FileText, label: 'Reports' },
  { to: '/hospital/analytics', icon: Activity, label: 'Analytics' },
  { to: '/hospital/qr', icon: Maximize, label: 'Hospital QR' },
  { to: '/hospital/settings', icon: Settings, label: 'Settings' },
];

export default function HospitalLayout({ children, title }) {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex' }}>
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building size={18} color="white" />
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'white', lineHeight: 1.2 }}>MediID</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>HOSPITAL ADMIN</p>
            </div>
          </div>
        </div>

        {profile?.name && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Managing</p>
            <p style={{ fontSize: 14, color: 'white', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.name}</p>
          </div>
        )}

        <nav className="sidebar-nav" style={{ flex: 1 }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 14px', marginBottom: 4 }}>Management</p>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '0 12px 8px' }}>
          <button className="sidebar-link" onClick={handleLogout} style={{ color: 'rgba(255,100,100,0.7)', width: '100%' }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content" style={{ flex: 1 }}>
        <div className="topbar">
          <h1 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--gray-900)' }}>{title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: 'var(--gray-100)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Bell size={18} color="var(--gray-500)" />
              <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, background: 'var(--coral)', borderRadius: '50%', border: '2px solid white' }} />
            </button>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14, background: 'linear-gradient(135deg, #0a1628, #1a3a5c)', cursor: 'pointer' }} onClick={() => navigate('/hospital/settings')}>
              {profile?.name?.[0] || 'H'}
            </div>
          </div>
        </div>
        <div className="page-content fade-in">
          {children}
        </div>
      </div>
    </div>
  );
}
