import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [role, setRole]       = useState(searchParams.get('role') || 'patient');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const [form, setForm] = useState({
    firstName:    '',
    lastName:     '',
    email:        '',
    password:     '',
    hospitalName: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  /* ── client-side validation ── */
  const validate = () => {
    if (role === 'patient') {
      if (!form.firstName.trim()) return 'First name is required.';
      if (!form.lastName.trim())  return 'Last name is required.';
    }
    if (role === 'hospital_admin' && !form.hospitalName.trim())
      return 'Hospital name is required.';
    if (!form.email.trim())       return 'Email address is required.';
    if (!/\S+@\S+\.\S+/.test(form.email)) return 'Please enter a valid email address.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      // Always include role explicitly in the payload
      const payload = {
        role,
        email:    form.email.trim().toLowerCase(),
        password: form.password,
      };

      if (role === 'patient') {
        payload.firstName = form.firstName.trim();
        payload.lastName  = form.lastName.trim();
      } else {
        payload.hospitalName = form.hospitalName.trim();
        payload.firstName    = form.firstName.trim() || form.hospitalName.trim();
        payload.lastName     = form.lastName.trim()  || 'Admin';
      }

      const data = await register(payload);
      toast.success('Account created! Welcome to MediID 🎉');
      navigate(data.user.role === 'hospital_admin' ? '/hospital' : '/dashboard');
    } catch (err) {
      // Show the exact backend error message if available
      const backendErrors = err.response?.data?.errors;
      if (backendErrors?.length) {
        setError(backendErrors.map(e => e.msg).join(' · '));
      } else {
        const msg = err.response?.data?.message || '';
        if (msg.includes('already registered') || err.response?.status === 409) {
          setError('This email is already registered. Please sign in instead.');
        } else if (err.response?.status === 400) {
          setError('Please check all fields and try again. ' + msg);
        } else {
          setError(msg || 'Registration failed. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    border: '1.5px solid var(--gray-200)',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    color: 'var(--gray-900)',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--gray-600)',
    marginBottom: 5,
    display: 'block',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--off-white)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }} className="fade-in">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="white" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>MediID</span>
          </Link>
          <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            Already registered? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 500 }}>Sign in</Link>
          </p>
        </div>

        <div className="card">

          {/* Role switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'var(--gray-100)', padding: 4, borderRadius: 10 }}>
            {[
              { value: 'patient',       label: '🧑‍⚕️ Patient' },
              { value: 'hospital_admin', label: '🏥 Hospital' },
            ].map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => { setRole(r.value); setError(''); }}
                style={{ flex: 1, padding: 10, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, transition: 'all 0.15s', background: role === r.value ? '#fff' : 'transparent', color: role === r.value ? 'var(--teal)' : 'var(--gray-500)', boxShadow: role === r.value ? '0 1px 4px rgba(0,0,0,0.10)' : 'none' }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>

            {/* Patient — first + last name */}
            {role === 'patient' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>First Name <span style={{ color: '#e53e3e' }}>*</span></label>
                  <input style={inputStyle} placeholder="Arjun" value={form.firstName}
                    onChange={e => set('firstName', e.target.value)} autoComplete="given-name" />
                </div>
                <div>
                  <label style={labelStyle}>Last Name <span style={{ color: '#e53e3e' }}>*</span></label>
                  <input style={inputStyle} placeholder="Sharma" value={form.lastName}
                    onChange={e => set('lastName', e.target.value)} autoComplete="family-name" />
                </div>
              </div>
            )}

            {/* Hospital — hospital name + optional contact name */}
            {role === 'hospital_admin' && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Hospital Name <span style={{ color: '#e53e3e' }}>*</span></label>
                  <input style={inputStyle} placeholder="Apollo Hospital, Chennai"
                    value={form.hospitalName} onChange={e => set('hospitalName', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Admin First Name</label>
                    <input style={inputStyle} placeholder="Rajesh" value={form.firstName}
                      onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Admin Last Name</label>
                    <input style={inputStyle} placeholder="Kumar" value={form.lastName}
                      onChange={e => set('lastName', e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email Address <span style={{ color: '#e53e3e' }}>*</span></label>
              <input style={inputStyle} type="email" placeholder="you@example.com"
                value={form.email} onChange={e => set('email', e.target.value)}
                autoComplete="email" />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Password <span style={{ color: '#e53e3e' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inputStyle, paddingRight: 44 }}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 2 }}
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && form.password.length < 6 && (
                <p style={{ fontSize: 12, color: '#e53e3e', marginTop: 4 }}>Password must be at least 6 characters</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: loading ? '#a7f3d0' : 'var(--teal)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} /> Creating account...</>
              ) : (
                `Create ${role === 'hospital_admin' ? 'Hospital' : 'Patient'} Account`
              )}
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