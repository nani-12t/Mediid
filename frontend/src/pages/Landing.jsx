import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, QrCode, Search, Heart, Star, ArrowRight, CheckCircle, Stethoscope, FileText, Users } from 'lucide-react';

const features = [
  { icon: QrCode, title: 'Digital Medical ID', desc: 'One QR code carries your entire medical history, accessible anywhere instantly.', color: '#00b4a0' },
  { icon: Shield, title: 'Secure & Consent-Based', desc: 'AES-256 encryption with full control over who sees your data.', color: '#38bdf8' },
  { icon: Search, title: 'Find Doctors & Hospitals', desc: 'Search by specialization, view ratings, and book appointments seamlessly.', color: '#8b5cf6' },
  { icon: Heart, title: 'Health Insurance', desc: 'Browse insurance plans and connect directly with agents.', color: '#f97066' },
];

const stats = [
  { label: 'Patients Registered', value: '2.4M+' },
  { label: 'Partner Hospitals', value: '1,200+' },
  { label: 'Doctors on Platform', value: '18,000+' },
  { label: 'States Covered', value: '28' },
];

const steps = [
  { num: '01', title: 'Create Your Profile', desc: 'Sign up and fill in your medical history, allergies, and emergency contact info.' },
  { num: '02', title: 'Get Your Medical ID', desc: 'Receive a unique UID and a permanent QR code tied to your profile.' },
  { num: '03', title: 'Show QR at Any Hospital', desc: 'Doctors scan your QR to instantly access your records with your consent.' },
  { num: '04', title: 'Manage Everything Online', desc: 'Book appointments, upload reports, and manage insurance from one dashboard.' },
];

export default function Landing() {
  return (
    <div style={{ fontFamily: 'var(--font-body)', background: 'var(--white)' }}>
      {/* Navbar */}
      <nav style={{ position: 'sticky', top: 0, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--gray-100)', zIndex: 100 }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="white" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--navy)' }}>MediID</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link to="/login" className="btn btn-secondary btn-sm">Sign In</Link>
            <Link to="/register" className="btn btn-primary btn-sm">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, var(--navy) 0%, #1a3a5c 60%, #0e4a4a 100%)', padding: '100px 0 80px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'rgba(0,180,160,0.08)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'rgba(56,189,248,0.08)', pointerEvents: 'none' }} />

        <div className="container" style={{ textAlign: 'center', position: 'relative' }}>
          <div className="badge badge-teal" style={{ display: 'inline-flex', marginBottom: 20, background: 'rgba(0,180,160,0.15)', color: '#00d4bc' }}>
            🇮🇳 India's Digital Medical ID Platform
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 60px)', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', marginBottom: 20, lineHeight: 1.15 }}>
            Your Health Records,<br />
            <span style={{ background: 'linear-gradient(90deg, #00b4a0, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>One Scan Away</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', maxWidth: 560, margin: '0 auto 36px', lineHeight: 1.7 }}>
            MediID gives every patient a permanent QR-based Medical ID. Doctors, hospitals, and pharmacies can access your complete health history instantly — with your consent.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" className="btn btn-primary btn-lg">
              Create My Medical ID <ArrowRight size={18} />
            </Link>
            <Link to="/register?role=hospital_admin" className="btn btn-lg btn-outline" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
              Hospital Admin Login
            </Link>
          </div>

          {/* Mini QR card preview */}
          <div style={{ marginTop: 60, display: 'flex', justifyContent: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 80, height: 80, background: 'white', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={48} color="var(--navy)" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Medical ID</p>
                <p style={{ color: 'white', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, letterSpacing: '0.05em' }}>MID-xxxxxxx</p>
                <p style={{ color: 'var(--teal)', fontSize: 13, marginTop: 4 }}>✓ Verified Patient</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ background: 'var(--teal)', padding: '32px 0' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
            {stats.map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white' }}>{s.value}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '80px 0', background: 'var(--off-white)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 12 }}>Everything You Need</h2>
            <p style={{ color: 'var(--gray-500)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>One platform for patients, doctors, hospitals, pharmacies, and insurance.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {features.map(f => (
              <div key={f.title} className="card" style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: f.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <f.icon size={24} color={f.color} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ color: 'var(--gray-500)', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '80px 0', background: 'var(--white)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontSize: 36, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 12 }}>How It Works</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            {steps.map(step => (
              <div key={step.num} style={{ position: 'relative' }}>
                <div style={{ fontSize: 48, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'black', marginBottom: 8, lineHeight: 1 }}>{step.num}</div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'black' }}>{step.title}</h3>
                <p style={{ color: 'black', fontSize: 14, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '80px 0', background: 'linear-gradient(135deg, var(--navy), #0e4a4a)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <Stethoscope size={40} color="var(--teal)" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 36, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'white', marginBottom: 12 }}>Ready to Go Digital?</h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, marginBottom: 32 }}>Join millions of patients and hospitals on MediID</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            
            <Link to="/register?role=hospital_admin" className="btn btn-lg" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>Register Hospital</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: 'var(--gray-900)', color: 'var(--gray-400)', padding: '32px 0', textAlign: 'center', fontSize: 14 }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
            <Shield size={16} color="var(--teal)" />
            <span style={{ color: 'white', fontFamily: 'var(--font-display)', fontWeight: 600 }}>MediID</span>
          </div>
          <p>© 2025 MediID. Secure Digital Health Identity for India.</p>
        </div>
      </footer>
    </div>
  );
}
