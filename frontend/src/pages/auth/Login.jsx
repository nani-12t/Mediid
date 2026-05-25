import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const LOGIN_ROLES = [
  {
    value: 'patient',
    label: 'Patient',
    icon: '🧑‍⚕️',
    title: 'Your Health, Secured & Connected',
    desc: 'Access your complete medical history, book appointments, and manage your health — all in one secure digital locker.',
    highlights: ['AES-256 Encrypted Records', 'FHIR Compliant Sharing', 'Consent-Based Doctor Access'],
    demoEmail: 'arjun@patient.com',
    demoPass: 'Test@1234'
  },
  {
    value: 'hospital_admin',
    label: 'Hospital Admin',
    icon: '🏥',
    title: 'Enterprise Hospital Command',
    desc: 'Coordinate healthcare operations, manage staff shifts, approve appointments, and configure diagnostic services.',
    highlights: ['OPD Queue Routing', 'Doctor Shift Rosters', 'Government Registry Integrated'],
    demoEmail: 'hospital1@apollo.com',
    demoPass: 'Test@1234'
  },
  {
    value: 'doctor',
    label: 'Clinical Doctor',
    icon: '👨‍⚕️',
    title: 'Precision Doctor Desk',
    desc: 'Review patient medical files within approved 10-minute windows, record vital signs, and write electronic prescriptions.',
    highlights: ['Token Queue Dashboard', 'Secure Diagnostics Hub', 'E-Prescription Assistant'],
    demoEmail: 'dr.batra@clinic.com',
    demoPass: 'Test@1234'
  },
  {
    value: 'buyer',
    label: 'Researcher / Buyer',
    icon: '🔬',
    title: 'De-Identified Data Analytics',
    desc: 'Browse and purchase validated, consent-backed aggregated datasets for biomedical analysis and AI training.',
    highlights: ['Consent Audit Trail', 'Aggregated Patient Cohorts', 'De-Identified Medical Feeds'],
    demoEmail: 'buyer@research.com',
    demoPass: 'Test@1234'
  }
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [activeRole, setActiveRole] = useState('patient');
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentRoleConfig = LOGIN_ROLES.find(r => r.value === activeRole) || LOGIN_ROLES[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email.trim(), form.password);
      toast.success(`Welcome back!`);
      const role = data.user.role;
      if (role === 'hospital_admin') navigate('/hospital');
      else if (role === 'doctor') navigate('/doctor');
      else if (role === 'pharmacy') navigate('/pharmacy');
      else if (role === 'buyer') navigate('/buyer/dashboard');
      else navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutofill = () => {
    setForm({
      email: currentRoleConfig.demoEmail,
      password: currentRoleConfig.demoPass
    });
    toast.success(`${currentRoleConfig.label} demo credentials loaded!`, {
      icon: '⚡',
      duration: 2000
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--off-white)', fontFamily: 'var(--font-body)' }}>
      {/* Left panel */}
      <div style={{ 
        flex: 1, 
        background: 'linear-gradient(135deg, var(--navy) 0%, #0c3e3e 100%)', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center', 
        padding: '80px 60px', 
        position: 'relative', 
        overflow: 'hidden',
        transition: 'all 0.5s ease-in-out'
      }}>
        {/* Glow rings */}
        <div style={{ position: 'absolute', top: -100, right: -100, width: 450, height: 450, borderRadius: '50%', background: 'rgba(0,180,160,0.06)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: -150, left: -50, width: 400, height: 400, borderRadius: '50%', background: 'rgba(56,189,248,0.04)', filter: 'blur(60px)' }} />
        
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 64, zIndex: 2 }}>
          <div style={{ width: 42, height: 42, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-teal)' }}>
            <Shield size={22} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'white', letterSpacing: '-0.02em' }}>MediID</span>
        </Link>
        
        <div key={currentRoleConfig.value} className="fade-in" style={{ zIndex: 2, maxWidth: 440 }}>
          <h2 style={{ fontSize: 38, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', marginBottom: 20, lineHeight: 1.25 }}>
            {currentRoleConfig.title}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 16, lineHeight: 1.75, marginBottom: 40 }}>
            {currentRoleConfig.desc}
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {currentRoleConfig.highlights.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 22, height: 22, background: 'rgba(0,180,160,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 8, height: 8, background: 'var(--teal)', borderRadius: '50%' }} />
                </div>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14.5, fontWeight: 500 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 520, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 48px', background: 'var(--white)', borderLeft: '1px solid var(--gray-100)' }}>
        <div style={{ width: '100%', maxWidth: 410 }} className="fade-in">
          <h1 style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, marginBottom: 8, color: 'var(--gray-900)' }}>Welcome back</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 32 }}>
            Don't have an account? <Link to="/register" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Create one</Link>
          </p>

          {/* Role switcher tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28, background: 'var(--gray-50)', padding: 5, borderRadius: 14, border: '1px solid var(--gray-100)' }}>
            {LOGIN_ROLES.map(r => (
              <button 
                key={r.value} 
                type="button"
                onClick={() => {
                  setActiveRole(r.value);
                  setError('');
                }}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: activeRole === r.value ? 700 : 500,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  background: activeRole === r.value ? 'var(--white)' : 'transparent',
                  color: activeRole === r.value ? 'var(--navy)' : 'var(--gray-500)',
                  boxShadow: activeRole === r.value ? '0 4px 12px rgba(9, 14, 26, 0.05)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>

          {/* Demo credential helper banner */}
          <div 
            onClick={handleAutofill}
            style={{ 
              background: 'linear-gradient(135deg, #f0fdfa 0%, #e0f2fe 100%)', 
              border: '1px solid rgba(0, 180, 160, 0.15)', 
              borderRadius: 12, 
              padding: '12px 16px', 
              marginBottom: 24, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              transition: 'var(--transition)'
            }}
            className="card-hover-effect"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles size={16} color="var(--teal)" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginBottom: 2 }}>Quick-Fill Testing Account</p>
                <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Autofill seeded credentials for {currentRoleConfig.label}</p>
              </div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'white', padding: '4px 8px', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>Load ⚡</span>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', border: '1px solid #fee2e2', color: '#b91c1c', padding: '12px 16px', borderRadius: 10, marginBottom: 24, fontSize: 13.5 }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>Email address</label>
              <input 
                className="form-input" 
                type="email" 
                placeholder="name@hospital.com" 
                value={form.email} 
                onChange={e => setForm({ ...form, email: e.target.value })} 
                required 
                style={{ padding: '12px 16px', borderRadius: 10 }}
              />
            </div>
            <div className="form-group" style={{ position: 'relative', marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label className="form-label" style={{ marginBottom: 0, fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>Password</label>
                <Link to="/forgot-password" style={{ color: 'var(--teal)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>Forgot password?</Link>
              </div>
              <input 
                className="form-input" 
                type={showPass ? 'text' : 'password'} 
                placeholder="••••••••" 
                value={form.password} 
                onChange={e => setForm({ ...form, password: e.target.value })} 
                required 
                style={{ paddingRight: 44, padding: '12px 16px', borderRadius: 10 }}
              />
              <button 
                type="button" 
                onClick={() => setShowPass(!showPass)} 
                style={{ position: 'absolute', right: 14, top: 38, background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer' }}
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary btn-lg btn-full" 
              disabled={loading}
              style={{ padding: '14px 0', borderRadius: 12, fontSize: 15, fontWeight: 700 }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} /> Authenticating...</>
              ) : (
                `Sign in as ${currentRoleConfig.label}`
              )}
            </button>
          </form>

          <div style={{ marginTop: 32, textAlign: 'center', borderTop: '1px solid var(--gray-100)', paddingTop: 24 }}>
            <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>
              🏦 Healthcare Partner? <Link to="/doctor-activate" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>Activate Clinical Credentials</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
