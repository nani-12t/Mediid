/**
 * ConfirmAppointment.jsx
 * ─────────────────────
 * This page is opened when the patient taps the SMS confirm link.
 * Route: /confirm-appointment/:token
 *
 * It calls the public backend endpoint GET /api/appointments/confirm/:token
 * which sets status=confirmed, then shows the result.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function ConfirmAppointment() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | success | already | cancelled | error
  const [details, setDetails] = useState(null);

  useEffect(() => {
    const confirm = async () => {
      try {
        const res  = await fetch(`${process.env.REACT_APP_API_URL || '/api'}/appointments/confirm/${token}`);
        const html = await res.text();
        // The backend returns HTML directly — we parse status from the content
        if (html.includes('Already Confirmed'))  { setState('already');   return; }
        if (html.includes('Appointment Confirmed')) { setState('success'); return; }
        if (html.includes('Cancelled'))           { setState('cancelled'); return; }
        if (html.includes('Invalid'))             { setState('error');     return; }
        setState('success');
      } catch {
        setState('error');
      }
    };
    confirm();
  }, [token]);

  const wrap = { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f0fdf4', padding:24, fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' };
  const card = { background:'#fff', borderRadius:20, padding:'40px 32px', maxWidth:420, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.10)', textAlign:'center' };
  const btn  = { display:'inline-block', marginTop:20, padding:'12px 28px', borderRadius:10, background:'#0d9488', color:'#fff', textDecoration:'none', fontSize:15, fontWeight:600 };

  if (state === 'loading') return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize:40, marginBottom:16 }}>⏳</div>
      <p style={{ fontSize:16, color:'#374151' }}>Confirming your appointment...</p>
    </div></div>
  );

  if (state === 'success') return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#065f46', marginBottom:8 }}>Appointment Confirmed!</h2>
      <p style={{ fontSize:15, color:'#6b7280', marginBottom:20 }}>Your appointment is confirmed. You'll receive a confirmation SMS shortly.</p>
      <p style={{ fontSize:13, color:'#9ca3af', marginBottom:4 }}>Please arrive 15 minutes early with your Aadhaar card and previous medical reports.</p>
      <Link to="/appointments" style={btn}>View My Appointments</Link>
    </div></div>
  );

  if (state === 'already') return (
    <div style={wrap}><div style={card}>
      <div style={{ fontSize:56, marginBottom:12 }}>✅</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#065f46', marginBottom:8 }}>Already Confirmed</h2>
      <p style={{ fontSize:15, color:'#6b7280', marginBottom:20 }}>Your appointment was already confirmed. See you at the hospital!</p>
      <Link to="/appointments" style={btn}>View My Appointments</Link>
    </div></div>
  );

  if (state === 'cancelled') return (
    <div style={{ ...wrap, background:'#fffbeb' }}><div style={card}>
      <div style={{ fontSize:56, marginBottom:12 }}>⚠️</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#92400e', marginBottom:8 }}>Appointment Cancelled</h2>
      <p style={{ fontSize:15, color:'#6b7280', marginBottom:20 }}>This appointment has been cancelled. You can rebook anytime.</p>
      <Link to="/search" style={{ ...btn, background:'#d97706' }}>Book New Appointment</Link>
    </div></div>
  );

  return (
    <div style={{ ...wrap, background:'#fff1f2' }}><div style={card}>
      <div style={{ fontSize:56, marginBottom:12 }}>❌</div>
      <h2 style={{ fontSize:22, fontWeight:700, color:'#991b1b', marginBottom:8 }}>Invalid Link</h2>
      <p style={{ fontSize:15, color:'#6b7280', marginBottom:20 }}>This confirmation link is invalid or has expired. Please contact the hospital.</p>
      <Link to="/appointments" style={{ ...btn, background:'#ef4444' }}>My Appointments</Link>
    </div></div>
  );
}