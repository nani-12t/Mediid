import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, AlertCircle, User, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultRole = searchParams.get('role') || 'patient';

  const [role, setRole] = useState(defaultRole);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', hospitalName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      const data = await register({ ...form, role });
      toast.success('Account created! Welcome to MediID 🎉');
      navigate(data.user.role === 'hospital_admin' ? '/hospital' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--off-white)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="white" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>MediID</span>
          </Link>
          <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Already registered? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 500 }}>Sign in</Link></p>
        </div>

        <div className="card">
          {/* Role selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'var(--gray-100)', padding: 4, borderRadius: 10 }}>
            {[
              { value: 'patient', label: '🧑‍⚕️ Patient', Icon: User },
              { value: 'hospital_admin', label: '🏥 Hospital', Icon: Building2 }
            ].map(r => (
              <button key={r.value} type="button" onClick={() => setRole(r.value)}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, transition: 'var(--transition)', background: role === r.value ? 'var(--white)' : 'transparent', color: role === r.value ? 'var(--teal)' : 'var(--gray-500)', boxShadow: role === r.value ? 'var(--shadow-sm)' : 'none' }}>
                {r.label}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {role === 'patient' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-input" placeholder="Arjun" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-input" placeholder="Sharma" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required />
                </div>
              </div>
            )}

            {role === 'hospital_admin' && (
              <div className="form-group">
                <label className="form-label">Hospital Name</label>
                <input className="form-input" placeholder="Apollo Hospital, Chennai" value={form.hospitalName} onChange={e => setForm({ ...form, hospitalName: e.target.value })} required />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="Min. 6 characters" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} /> Creating account...</> : 'Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--gray-400)', marginTop: 16 }}>
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
