import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, Home, Users, Calendar, Search, CreditCard, LogOut, Menu, X, Bell, FileText, Package, Database, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/dashboard', icon: Home, label: 'Dashboard' },
  { to: '/search', icon: Search, label: 'Find Doctors' },
  { to: '/appointments', icon: Calendar, label: 'Appointments' },
  { to: '/history', icon: FileText, label: 'Medical History' },
  { to: '/medicines', icon: Package, label: 'Buy Medicines' },
  { to: '/bills', icon: CreditCard, label: 'Bills & Expenses' },
  { to: '/marketplace', icon: Database, label: 'Data Marketplace' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/profile', icon: Users, label: 'My Profile' },
];

export default function PatientLayout({ children, title }) {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo" style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, var(--teal) 0%, var(--sky) 100%)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(0, 180, 160, 0.25)' }}>
            <Shield size={20} color="white" />
          </div>
          <div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'white', letterSpacing: '-0.02em', display: 'block', lineHeight: 1 }}>MediID</span>
            <span style={{ fontSize: 10, color: 'var(--teal-light)', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 3, display: 'block' }}>HIMS Portal</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav" style={{ flex: 1, padding: '24px 16px' }}>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0 12px', marginBottom: 16 }}>Patient Console</p>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
            <item.icon size={18} />
            <span style={{ fontWeight: 600 }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14, fontWeight: 700, border: '2px solid rgba(255,255,255,0.1)' }}>
              {profile?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'P'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: 'white', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile ? `${profile.firstName} ${profile.lastName}` : user?.email}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'monospace', fontWeight: 500 }}>{profile?.uid || 'MID-TEMP'}</p>
            </div>
          </div>
        </div>
        <button className="sidebar-link" onClick={handleLogout} style={{ color: 'rgba(251,113,133,0.9)', width: '100%', background: 'rgba(251,113,133,0.04)', borderRadius: 12, border: '1px solid rgba(251,113,133,0.1)' }}>
          <LogOut size={16} />
          <span style={{ fontWeight: 600 }}>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--off-white)' }}>
      {/* Desktop Sidebar */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(9,14,26,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setMobileOpen(false)} />
          <aside className="sidebar" style={{ position: 'relative', display: 'flex', flexDirection: 'column', transform: 'none', height: '100%', width: 280 }}>
            <button onClick={() => setMobileOpen(false)} style={{ position: 'absolute', right: 16, top: 24, background: 'rgba(255,255,255,0.05)', border: 'none', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}>
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content" style={{ flex: 1 }}>
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={() => setMobileOpen(true)} style={{ display: 'none', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 10, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--gray-700)' }} className="mobile-menu-btn">
              <Menu size={20} />
            </button>
            <h1 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gray-900)' }}>{title}</h1>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'var(--transition)' }} className="btn-hover-effect">
              <Bell size={18} color="var(--gray-600)" />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 8, borderLeft: '1px solid var(--gray-100)' }}>
              <div className="avatar" style={{ width: 40, height: 40, fontSize: 14, cursor: 'pointer' }} onClick={() => navigate('/profile')}>
                {profile?.firstName?.[0] || 'P'}
              </div>
              <div style={{ display: 'block', textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate('/profile')} className="desktop-only">
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', lineHeight: 1.2 }}>
                  {profile ? `${profile.firstName} ${profile.lastName[0]}.` : 'Patient'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500, marginTop: 2 }}>View profile</p>
              </div>
            </div>
          </div>
        </div>
        <div className="page-content fade-in">
          {children}
        </div>
      </div>
      <style>{`
        .btn-hover-effect:hover {
          background: var(--gray-100) !important;
          transform: translateY(-1px);
        }
        @media (max-width: 1024px) {
          .desktop-only { display: none !important; }
        }
      `}</style>
    </div>
  );
}
