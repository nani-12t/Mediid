import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, LayoutDashboard, PlusCircle, MessageSquare, LogOut, Menu, X, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { to: '/buyer/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/buyer/post-requirement', icon: PlusCircle, label: 'Post Requirement' },
  // { to: '/buyer/chat', icon: MessageSquare, label: 'Messages' },
];

export default function BuyerLayout({ children, title }) {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const SidebarContent = () => (
    <>
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={18} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'white' }}>MediID</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 14px', marginBottom: 4 }}>Researcher Portal</p>
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar" style={{ width: 34, height: 34, fontSize: 13, background: 'var(--teal)' }}>
              {profile?.companyName?.[0] || 'B'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ color: 'white', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {profile?.companyName || 'Buyer'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Researcher</p>
            </div>
          </div>
        </div>
        <button className="sidebar-link" onClick={handleLogout} style={{ color: 'rgba(255,100,100,0.7)', width: '100%' }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Desktop Sidebar */}
      <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setMobileOpen(false)} />
          <aside className="sidebar" style={{ position: 'absolute', display: 'flex', flexDirection: 'column', transform: 'none' }}>
            <button onClick={() => setMobileOpen(false)} style={{ position: 'absolute', right: 12, top: 12, background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={20} /></button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setMobileOpen(true)} style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-600)' }} className="mobile-menu-btn">
              <Menu size={22} />
            </button>
            <h1 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--gray-900)' }}>{title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--gray-100)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Bell size={18} color="var(--gray-500)" />
            </button>
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 14, background: 'var(--teal)' }}>
              {profile?.companyName?.[0] || 'B'}
            </div>
          </div>
        </div>
        <div className="page-content fade-in" style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
