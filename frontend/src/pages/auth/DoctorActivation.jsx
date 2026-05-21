import React, { useState } from 'react';
import { Shield, Mail, Lock, UserCheck, ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function DoctorActivation() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    uid: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) {
      if (!formData.uid.trim()) return toast.error('Please enter your Doctor ID');
      setStep(2);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setLoading(true);
    try {
      await api.post('/auth/doctor-activate', {
        uid: formData.uid,
        password: formData.password
      });
      toast.success('Account activated successfully! Use your ID to login.');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Activation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 440, width: '100%', background: 'white', padding: '48px', borderRadius: 32, boxShadow: '0 10px 40px rgba(0,0,0,0.04)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, background: 'var(--teal)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <Shield size={32} color="white" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Doctor Activation</h1>
          <p style={{ color: '#64748b', fontSize: 15 }}>{step === 1 ? 'Enter your professional ID to begin' : 'Setup your login credentials'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {step === 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>Professional ID</label>
                <div style={{ position: 'relative' }}>
                  <UserCheck size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="text" 
                    placeholder="e.g. HID-A3F2C1B9-SRDOC-0001" 
                    value={formData.uid}
                    onChange={e => setFormData({...formData, uid: e.target.value.toUpperCase()})}
                    style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 12, border: '1.5px solid #f1f5f9', fontSize: 16, outline: 'none', background: '#fcfcfc' }}
                    required
                  />
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Provided by your hospital administration</p>
              </div>
              <button type="submit" style={{ width: '100%', padding: '18px', borderRadius: 16, border: 'none', background: 'var(--teal)', color: 'white', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                Continue <ChevronRight size={18} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ fontSize: 14, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>Professional ID</label>
                <div style={{ position: 'relative' }}>
                  <UserCheck size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="text" 
                    value={formData.uid}
                    style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 12, border: '1.5px solid #f1f5f9', fontSize: 16, outline: 'none', background: '#f8fafc', color: '#64748b' }}
                    readOnly
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>Create Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 12, border: '1.5px solid #f1f5f9', fontSize: 16, outline: 'none', background: '#fcfcfc' }}
                    required
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 14, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 8 }}>Confirm Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  value={formData.confirmPassword}
                  onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                  style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1.5px solid #f1f5f9', fontSize: 16, outline: 'none', background: '#fcfcfc' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => setStep(1)} style={{ padding: '18px', borderRadius: 16, border: '1.5px solid #e2e8f0', background: 'white', color: '#64748b', cursor: 'pointer' }}>
                  <ArrowLeft size={18} />
                </button>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '18px', borderRadius: 16, border: 'none', background: 'var(--teal)', color: 'white', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                  {loading ? 'Activating...' : 'Activate Account'}
                </button>
              </div>
            </div>
          )}
        </form>

        <div style={{ marginTop: 32, textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 24 }}>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Already have an account? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 700, textDecoration: 'none' }}>Login</Link></p>
        </div>
      </div>
    </div>
  );
}
