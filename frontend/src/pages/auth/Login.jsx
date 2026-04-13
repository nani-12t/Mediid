import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      toast.success(`Welcome back!`);
      if (data.user.role === 'buyer') {
        navigate('/buyer/dashboard');
      } else if (data.user.role === 'hospital_admin') {
        navigate('/hospital');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--off-white)' }}>
      {/* Left panel */}
      <div style={{ flex: 1, background: 'linear-gradient(135deg, var(--navy) 0%, #0e4a4a 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: 'rgba(0,180,160,0.08)' }} />
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={22} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'white' }}>MediID</span>
        </Link>
        <h2 style={{ fontSize: 36, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'white', marginBottom: 16, lineHeight: 1.3 }}>Your Health,<br />Secured & Connected</h2>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1.7, maxWidth: 380 }}>Access your complete medical history, book appointments, and manage your health — all in one place.</p>
        {['AES-256 Encrypted', 'FHIR Compliant', 'Consent-Based Access'].map(item => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <div style={{ width: 20, height: 20, background: 'rgba(0,180,160,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 8, height: 8, background: 'var(--teal)', borderRadius: '50%' }} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={{ width: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 380 }} className="fade-in">
          <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>Sign in</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 32 }}>Don't have an account? <Link to="/register" style={{ color: 'var(--teal)', fontWeight: 500 }}>Create one</Link></p>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Password</label>
              <input className="form-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required style={{ paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 14, top: 36, background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer' }}>
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Signing in...</> : 'Sign In'}
            </button>
          </form>

          <div style={{ margin: '24px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
            <span style={{ color: 'var(--gray-400)', fontSize: 13 }}>or continue as</span>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Link to="/register?role=patient" className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: 13, background: 'var(--gray-50)' }}>🧑‍⚕️ Patient</Link>
            <Link to="/register?role=buyer" className="btn btn-secondary" style={{ justifyContent: 'center', fontSize: 13, background: 'var(--gray-50)' }}>🔬 Buyer / Researcher</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
