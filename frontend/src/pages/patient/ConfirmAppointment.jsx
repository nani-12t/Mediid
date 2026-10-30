/**
 * ConfirmAppointment.jsx
 * ─────────────────────
 * This page is opened when the patient taps the SMS confirm link.
 * Route: /confirm-appointment/:token
 *
 * It calls the public backend endpoint GET /api/appointments/confirm/:token
 * PostgreSQL links record acknowledgement; provider/payment confirmation remains separate.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { appointmentAPI } from '../../utils/api';

export default function ConfirmAppointment() {
  const { token } = useParams();
  const [state, setState] = useState('loading'); // loading | success | already | cancelled | error
  const [details, setDetails] = useState('');

  useEffect(() => {
    const confirm = async () => {
      try {
        const { data: config } = await appointmentAPI.getConfig();
        if (!['legacy', 'postgres'].includes(config.backend)) throw new Error('Appointment configuration is unavailable.');
        const { data } = await appointmentAPI.confirmLink(token);
        if (config.backend === 'postgres') {
          if (typeof data !== 'object' || typeof data.message !== 'string') throw new Error('Invalid acknowledgement response.');
          setDetails(data.message);
          setState('acknowledged');
          return;
        }
        if (typeof data !== 'string') throw new Error('Invalid confirmation response.');
        if (data.includes('Already Confirmed')) { setState('already'); return; }
        if (data.includes('Appointment Confirmed')) { setState('success'); return; }
        if (data.includes('Cancelled')) { setState('cancelled'); return; }
        setState('error');
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

  if (state === 'acknowledged') return (
    <div style={wrap}><div style={card}>
      <h2>Appointment acknowledged</h2>
      <p>{details}</p>
      <p>View your appointments for payment and final confirmation status.</p>
      <Link to="/appointments" style={btn}>View My Appointments</Link>
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