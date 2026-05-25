import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Shield, AlertCircle, Eye, EyeOff, User, Building2, Stethoscope,
  FlaskConical, ChevronRight, CheckCircle2, Video, BookOpen, Briefcase
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const ROLES = [
  {
    value: 'patient',
    label: 'Patient',
    icon: '🧑‍⚕️',
    color: '#00b4a0',
    bg: 'hsl(172, 95%, 96%)',
    border: 'hsl(172, 80%, 82%)',
    desc: 'Manage your health records, book appointments, and share medical files securely.',
    features: ['Encrypted Health Records', 'Appointment Booking', 'Prescription History'],
  },
  {
    value: 'hospital_admin',
    label: 'Hospital / Clinic',
    icon: '🏥',
    color: '#1d4ed8',
    bg: 'hsl(220, 95%, 96%)',
    border: 'hsl(220, 80%, 82%)',
    desc: 'Manage your hospital operations, OPD queue, staff, appointments, and pharmacy.',
    features: ['OPD Queue Management', 'Doctor & Staff Roster', 'Appointment Dashboard'],
  },
  {
    value: 'doctor',
    label: 'Clinical Doctor',
    icon: '👨‍⚕️',
    color: '#7c3aed',
    bg: 'hsl(262, 95%, 96%)',
    border: 'hsl(262, 80%, 82%)',
    desc: 'Access your clinical desk, manage your appointment slots, and issue e-prescriptions.',
    features: ['E-Prescription Writer', 'Slot Management', 'Patient Record Access'],
    note: 'Your account will be linked to a hospital by admin after registration.',
  },
  {
    value: 'buyer',
    label: 'Researcher / Buyer',
    icon: '🔬',
    color: '#d97706',
    bg: 'hsl(38, 95%, 96%)',
    border: 'hsl(38, 80%, 82%)',
    desc: 'Purchase de-identified, consent-backed health data for medical research and AI development.',
    features: ['Aggregated Health Datasets', 'Consent Audit Trail', 'FHIR Compliant Data'],
  },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialRole = searchParams.get('role') || 'patient';
  const [role, setRole] = useState(initialRole);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '',
    hospitalName: '', registrationNumber: '',
    specialization: '', qualifications: '', medRegNo: '',
    companyName: '', website: '', description: '',
    phone: '',
    email: '', password: '', confirmPassword: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedRole = ROLES.find(r => r.value === role);

  const validate = () => {
    if (role === 'patient') {
      if (!form.firstName.trim()) return 'First name is required.';
      if (!form.lastName.trim()) return 'Last name is required.';
    }
    if (role === 'hospital_admin') {
      if (!form.hospitalName.trim()) return 'Hospital / Clinic name is required.';
      if (!form.registrationNumber.trim()) return 'Registration number is required.';
    }
    if (role === 'doctor') {
      if (!form.firstName.trim()) return 'First name is required.';
      if (!form.lastName.trim()) return 'Last name is required.';
      if (!form.specialization.trim()) return 'Specialization is required.';
    }
    if (role === 'buyer') {
      if (!form.companyName.trim()) return 'Organization name is required.';
    }
    if (!form.email.trim()) return 'Email address is required.';
    if (!/\S+@\S+\.\S+/.test(form.email)) return 'Please enter a valid email address.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);

    try {
      const payload = { role, email: form.email.trim().toLowerCase(), password: form.password, phone: form.phone };

      if (role === 'patient') {
        payload.firstName = form.firstName.trim();
        payload.lastName = form.lastName.trim();
      } else if (role === 'hospital_admin') {
        payload.hospitalName = form.hospitalName.trim();
        payload.registrationNumber = form.registrationNumber.trim();
      } else if (role === 'doctor') {
        payload.firstName = form.firstName.trim();
        payload.lastName = form.lastName.trim();
        payload.specialization = form.specialization.trim();
        payload.qualifications = form.qualifications.trim();
        payload.registrationNumber = form.medRegNo.trim();
      } else if (role === 'buyer') {
        payload.companyName = form.companyName.trim();
        payload.website = form.website.trim();
        payload.description = form.description.trim();
        payload.firstName = form.firstName.trim() || form.companyName.trim();
        payload.lastName = form.lastName.trim() || 'Researcher';
      }

      const data = await register(payload);
      toast.success('Account created! Welcome to MediID 🎉');

      if (data.user.role === 'buyer') navigate('/buyer/dashboard');
      else if (data.user.role === 'hospital_admin') navigate('/hospital');
      else if (data.user.role === 'doctor') navigate('/doctor');
      else navigate('/dashboard');
    } catch (err) {
      const backendErrors = err.response?.data?.errors;
      if (backendErrors?.length) {
        setError(backendErrors.map(e => e.msg).join(' · '));
      } else {
        const msg = err.response?.data?.message || '';
        if (msg.includes('already registered') || err.response?.status === 409) {
          setError('This email is already registered. Please sign in instead.');
        } else {
          setError(msg || 'Registration failed. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const inp = {
    width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0',
    borderRadius: 10, fontSize: 14, color: '#111827',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit', transition: 'border-color 0.2s',
  };
  const lbl = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };
  const fieldWrap = { marginBottom: 14 };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f8fafc', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* ─── Left Panel: Role selector + Info ─── */}
      <div style={{
        width: 340, background: 'linear-gradient(160deg, #0f172a 0%, #1e3a5f 100%)',
        flexShrink: 0, display: 'flex', flexDirection: 'column', padding: '40px 28px',
        color: 'white'
      }} className="register-left-panel">
        {/* Logo */}
        <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 40, textDecoration: 'none' }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Shield size={18} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 17, color: 'white', letterSpacing: '-0.02em' }}>MediID</span>
        </Link>

        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 16 }}>Select Account Type</h2>

        {/* Role cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {ROLES.map(r => (
            <button key={r.value} type="button"
              onClick={() => { setRole(r.value); setError(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
                borderRadius: 12, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: role === r.value ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                outline: role === r.value ? `2px solid ${r.color}` : '2px solid transparent',
                transition: 'all 0.2s'
              }}>
              <span style={{ fontSize: 22 }}>{r.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: role === r.value ? 'white' : 'rgba(255,255,255,0.7)' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{r.features[0]}</div>
              </div>
              {role === r.value && <ChevronRight size={14} color={r.color} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </button>
          ))}
        </div>

        {/* Selected role info */}
        {selectedRole && (
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 14px', border: `1px solid rgba(255,255,255,0.1)` }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>About this account</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5, marginBottom: 12 }}>{selectedRole.desc}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedRole.features.map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  <CheckCircle2 size={12} color={selectedRole.color} />
                  {f}
                </div>
              ))}
            </div>
            {selectedRole.note && (
              <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(255,193,7,0.15)', borderRadius: 8, fontSize: 11, color: '#fcd34d', borderLeft: '3px solid #fcd34d' }}>
                ⚠️ {selectedRole.note}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24, fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#00b4a0', fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>

      {/* ─── Right Panel: Form ─── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 480 }} className="fade-in">

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              background: selectedRole?.bg, border: `1px solid ${selectedRole?.border}`,
              borderRadius: 20, fontSize: 12, fontWeight: 700, color: selectedRole?.color, marginBottom: 12
            }}>
              <span>{selectedRole?.icon}</span> {selectedRole?.label} Account
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>Create your account</h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>Fill in the details below to get started with MediID</p>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate style={{ background: 'white', borderRadius: 16, padding: '28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 24px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>

            {/* ── Patient fields ── */}
            {role === 'patient' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input style={inp} placeholder="Arjun" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Last Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input style={inp} placeholder="Sharma" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Phone (optional)</label>
                  <input style={inp} type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </>
            )}

            {/* ── Hospital Admin fields ── */}
            {role === 'hospital_admin' && (
              <>
                <div style={fieldWrap}>
                  <label style={lbl}>Hospital / Clinic Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={inp} placeholder="e.g. Apollo Hospitals Chennai" value={form.hospitalName} onChange={e => set('hospitalName', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Government Registration Number <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={inp} placeholder="e.g. GOV-AIIMS-456" value={form.registrationNumber} onChange={e => set('registrationNumber', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Contact Phone (optional)</label>
                  <input style={inp} type="tel" placeholder="+91 44 2345 6789" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
              </>
            )}

            {/* ── Clinical Doctor fields ── */}
            {role === 'doctor' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>First Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input style={inp} placeholder="Sanjay" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Last Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input style={inp} placeholder="Batra" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Specialization <span style={{ color: '#ef4444' }}>*</span></label>
                  <select style={{ ...inp, background: 'white' }} value={form.specialization} onChange={e => set('specialization', e.target.value)}>
                    <option value="">-- Select specialization --</option>
                    {['General Medicine', 'Orthopaedics', 'Cardiology', 'Neurology', 'Homoeopathy',
                      'Dermatology', 'Gynaecology', 'Paediatrics', 'Ophthalmology', 'ENT',
                      'Oncology', 'Psychiatry', 'Radiology', 'Anaesthesiology', 'Dentistry', 'Other'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Qualifications</label>
                  <input style={inp} placeholder="e.g. MBBS, MD, MS (comma-separated)" value={form.qualifications} onChange={e => set('qualifications', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Medical Council Reg. No.</label>
                  <input style={inp} placeholder="e.g. MCI-12345" value={form.medRegNo} onChange={e => set('medRegNo', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Phone</label>
                  <input style={inp} type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                  ℹ️ After registration, a hospital administrator will link your account to their system before you can access the clinical desk.
                </div>
              </>
            )}

            {/* ── Researcher / Buyer fields ── */}
            {role === 'buyer' && (
              <>
                <div style={fieldWrap}>
                  <label style={lbl}>Organization / Company Name <span style={{ color: '#ef4444' }}>*</span></label>
                  <input style={inp} placeholder="e.g. Apollo Research Labs" value={form.companyName} onChange={e => set('companyName', e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={lbl}>Your First Name</label>
                    <input style={inp} placeholder="Rohit" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Your Last Name</label>
                    <input style={inp} placeholder="Verma" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                  </div>
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Website (optional)</label>
                  <input style={inp} placeholder="https://your-org.com" value={form.website} onChange={e => set('website', e.target.value)} />
                </div>
                <div style={fieldWrap}>
                  <label style={lbl}>Research Focus (optional)</label>
                  <textarea style={{ ...inp, resize: 'vertical', minHeight: 70 }} placeholder="e.g. AI research lab focused on cardiovascular diagnostics" value={form.description} onChange={e => set('description', e.target.value)} />
                </div>
              </>
            )}

            {/* ── Common: Email ── */}
            <div style={fieldWrap}>
              <label style={lbl}>Email Address <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={inp} type="email" placeholder="you@example.com"
                value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
            </div>

            {/* ── Password ── */}
            <div style={fieldWrap}>
              <label style={lbl}>Password <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inp, paddingRight: 44 }}
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── Confirm Password ── */}
            <div style={{ ...fieldWrap, marginBottom: 24 }}>
              <label style={lbl}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <input
                  style={{ ...inp, paddingRight: 44 }}
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={form.confirmPassword}
                  onChange={e => set('confirmPassword', e.target.value)}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowConfirmPwd(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* ── Submit ── */}
            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                background: loading ? '#a7f3d0' : selectedRole?.color || '#00b4a0',
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 0.2s'
              }}>
              {loading ? (
                <><div className="spinner" style={{ width: 18, height: 18, borderTopColor: 'white' }} /> Creating account...</>
              ) : (
                <>{selectedRole?.icon} Create {selectedRole?.label} Account</>
              )}
            </button>

          </form>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
            By creating an account, you agree to our{' '}
            <span style={{ color: '#00b4a0', cursor: 'pointer' }}>Terms of Service</span> and{' '}
            <span style={{ color: '#00b4a0', cursor: 'pointer' }}>Privacy Policy</span>.
          </p>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .register-left-panel { display: none !important; }
        }
      `}</style>
    </div>
  );
}