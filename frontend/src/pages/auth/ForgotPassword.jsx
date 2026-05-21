import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Send OTP, 2: Reset Password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword({ email });
      toast.success('OTP verification code sent to your email.');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ email, otp, newPassword });
      toast.success('Password reset successfully!');
      setIsSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP code.');
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
          {isSuccess ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, background: '#ecfdf5', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <CheckCircle2 size={36} />
              </div>
              <h1 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 12 }}>Password Reset Complete</h1>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 32, lineHeight: 1.5 }}>Your password has been successfully updated. You can now use your new password to sign in.</p>
              <Link to="/login" className="btn btn-primary btn-lg btn-full" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', textDecoration: 'none' }}>
                Back to Sign in
              </Link>
            </div>
          ) : step === 1 ? (
            <div>
              <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>Forgot password?</h1>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 32 }}>Enter your email and we'll send you a 6-digit OTP code to reset your password.</p>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <form onSubmit={handleSendOTP}>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input className="form-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Sending OTP...</> : 'Send OTP Code'}
                </button>
              </form>

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>Remembered your password? <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link></p>
              </div>
            </div>
          ) : (
            <div>
              <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>Verify OTP Code</h1>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 32 }}>We've sent a 6-digit OTP code to <strong>{email}</strong>. Enter it below along with your new password.</p>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <form onSubmit={handleResetPassword}>
                <div className="form-group">
                  <label className="form-label">OTP Code</label>
                  <input className="form-input" type="text" placeholder="123456" maxLength={6} pattern="\d{6}" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))} required style={{ letterSpacing: 4, fontWeight: 'bold', fontSize: 16 }} />
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">New Password</label>
                  <input className="form-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 14, top: 36, background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer' }}>
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Confirm New Password</label>
                  <input className="form-input" type={showConfirmPass ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowConfirmPass(!showConfirmPass)} style={{ position: 'absolute', right: 14, top: 36, background: 'none', border: 'none', color: 'var(--gray-400)', cursor: 'pointer' }}>
                    {showConfirmPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> Resetting...</> : 'Reset Password'}
                </button>
              </form>

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <p style={{ color: 'var(--gray-500)', fontSize: 13 }}>Didn't receive the OTP? <button type="button" onClick={handleSendOTP} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--teal)', fontWeight: 600, cursor: 'pointer', font: 'inherit' }}>Resend OTP</button></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
