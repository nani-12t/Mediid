import React, { useState, useEffect } from 'react';
import { Calendar, Plus, X, Clock, CheckCircle, XCircle, RefreshCw, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import PatientLayout from '../../components/common/PatientLayout';
import { appointmentAPI } from '../../utils/api';
import AppointmentReschedule from '../../components/common/AppointmentReschedule';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending:     'badge-amber',
  reminder_sent: 'badge-amber',
  checked_in: 'badge-teal',
  expired: 'badge-gray',
  confirmed:   'badge-teal',
  cancelled:   'badge-red',
  completed:   'badge-gray',
  rescheduled: 'badge-blue',
};

const METHOD_ICONS = { app:'🖥️', phone:'📞', whatsapp:'💬', sms:'📱', walk_in:'🚶' };

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [backend, setBackend] = useState(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null);
  const [tab, setTab]                   = useState('upcoming');
  const [loading, setLoading]           = useState(true);
  const [confirming, setConfirming]     = useState(null); // apt._id being confirmed

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setError('');
      const { data: config } = await appointmentAPI.getConfig();
      if (!['legacy', 'postgres'].includes(config.backend)) throw new Error('Appointment configuration is unavailable.');
      setBackend(config.backend);
      const { data } = await appointmentAPI.getMyAppointments();
      setAppointments(data);
    } catch (e) { setError(e.response?.data?.message || 'Appointments are temporarily unavailable. Please retry.'); setAppointments([]); }
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      await appointmentAPI.cancel(id);
      toast.success('Appointment cancelled');
      load();
    } catch { toast.error('Cancellation failed'); }
  };

  /* Patient confirms their own pending appointment directly from the app */
  const confirmAppointment = async (apt) => {
    setConfirming(apt._id);
    try {
      if (backend === 'postgres') {
        await appointmentAPI.confirm(apt._id);
        toast.success('Acknowledgement recorded. Payment and provider confirmation requirements still apply.');
      } else {
        await appointmentAPI.confirmLink(apt.confirmToken);
        toast.success('Appointment confirmed!');
      }
      await load();
    } catch {
      toast.error('Network error');
    }
    setConfirming(null);
  };

  const pay = async apt => {
    setPaying(apt._id);
    try {
      const epoch = `${apt._id}:${apt.slotId || ''}:${apt.rescheduleCount || 0}`;
      const storageKey = `mediid:appointment-payment:${epoch}`;
      let key = sessionStorage.getItem(storageKey);
      if (!key) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        key = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(storageKey, key);
      }
      await appointmentAPI.pay(apt._id, key);
      toast.success('Payment processed. Your appointment status has been refreshed.');
      await load();
    } catch (err) { toast.error(err.response?.data?.message || 'Payment is temporarily unavailable. Retry with the same payment request.'); }
    finally { setPaying(null); }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = appointments.filter(a => {
    const apptDate = new Date(a.appointmentDate);
    apptDate.setHours(0, 0, 0, 0);
    return apptDate >= today && !['cancelled', 'completed', 'expired'].includes(a.status);
  });

  const past = appointments.filter(a => {
    const apptDate = new Date(a.appointmentDate);
    apptDate.setHours(0, 0, 0, 0);
    return apptDate < today || ['cancelled', 'completed', 'expired'].includes(a.status);
  });

  const shown    = tab === 'upcoming' ? upcoming : past;

  const pendingCount = upcoming.filter(a => a.status === 'pending').length;

  return (
    <PatientLayout title="My Appointments">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontFamily:'var(--font-display)', fontWeight:700, marginBottom:4 }}>
            My Appointments
            {pendingCount > 0 && (
              <span style={{ marginLeft:10, background:'#f59e0b', color:'#fff', borderRadius:999, fontSize:12, fontWeight:700, padding:'2px 9px', verticalAlign:'middle' }}>
                {pendingCount} pending confirmation
              </span>
            )}
          </h2>
          <p style={{ color:'var(--gray-500)', fontSize:14 }}>{upcoming.length} upcoming · {past.length} past</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => load(true)} style={{ background:'none', border:'1px solid var(--gray-200)', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13, color:'var(--gray-500)', display:'flex', alignItems:'center', gap:5 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <Link to="/search" className="btn btn-primary"><Plus size={16} /> Book New</Link>
        </div>
      </div>

      {/* Pending confirmation banner */}
      {pendingCount > 0 && tab === 'upcoming' && (
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:10, padding:'12px 16px', marginBottom:18 }}>
          <Bell size={18} color="#d97706" style={{ flexShrink:0, marginTop:1 }} />
          <div>
            <p style={{ fontSize:14, fontWeight:600, color:'#92400e', marginBottom:2 }}>
              You have {pendingCount} appointment{pendingCount > 1 ? 's' : ''} waiting for your confirmation
            </p>
            <p style={{ fontSize:13, color:'#b45309' }}>
              {backend === 'postgres' ? 'Acknowledge your appointment below. Required payment and provider confirmation still apply.' : <>Tap <strong>"Confirm Appointment"</strong> below each pending request to confirm your slot.</>}
              {backend === 'legacy' && 'You can also tap the link in the SMS we sent you.'}
            </p>
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      <div className="tabs">
        <button className={`tab-btn ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button className={`tab-btn ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>
          Past ({past.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
      ) : shown.length === 0 ? (
        <div className="card empty-state">
          <Calendar size={40} style={{ margin:'0 auto 12px', opacity:0.25 }} />
          <p>{tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}</p>
          {tab === 'upcoming' && <Link to="/search" className="btn btn-primary" style={{ marginTop:16 }}>Find a Doctor</Link>}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {shown.map(apt => (
            <div key={apt._id} className="card" style={{ borderLeft: apt.status === 'pending' ? '4px solid #f59e0b' : apt.status === 'confirmed' ? '4px solid #0d9488' : '4px solid var(--gray-200)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>

                {/* Date badge */}
                <div style={{ width:52, height:52, borderRadius:14, background: apt.status === 'confirmed' ? '#ccfbf1' : 'var(--gray-100)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <p style={{ fontSize:18, fontFamily:'var(--font-display)', fontWeight:700, color:'var(--teal)', lineHeight:1 }}>
                    {new Date(apt.appointmentDate).getDate()}
                  </p>
                  <p style={{ fontSize:10, color:'var(--gray-400)', textTransform:'uppercase' }}>
                    {new Date(apt.appointmentDate).toLocaleString('en', { month:'short' })}
                  </p>
                </div>

                {/* Details */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <p style={{ fontSize:15, fontWeight:600 }}>Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}</p>
                    <span className={`badge ${
                      apt.status === 'completed' ? 'badge-gray' :
                      apt.status === 'cancelled' ? 'badge-red' :
                      apt.status === 'expired' ? 'badge-gray' :
                      new Date(apt.appointmentDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) ? 'badge-amber' :
                      STATUS_COLORS[apt.status]
                    }`} style={{ fontSize:11, textTransform:'capitalize' }}>
                      {apt.status === 'completed' ? '🏁 Completed' :
                       apt.status === 'cancelled' ? '❌ Cancelled' :
                       apt.status === 'expired' ? 'Expired' :
                       new Date(apt.appointmentDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0) ? '⚠️ Not Attended' :
                       apt.status === 'pending' ? '⏳ Pending Confirmation' :
                       apt.status === 'confirmed' ? '✅ Confirmed' : apt.status}
                    </span>
                  </div>
                  <p style={{ fontSize:13, color:'var(--teal)', fontWeight:500, marginBottom:2 }}>{apt.doctor?.specialization}</p>
                  <p style={{ fontSize:13, color:'var(--gray-500)' }}>🏥 {apt.hospital?.name}</p>
                  {apt.timeSlot && <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:2 }}>⏰ {apt.timeSlot}</p>}
                  {apt.symptoms && <p style={{ fontSize:13, color:'var(--gray-500)', marginTop:4, fontStyle:'italic' }}>💬 "{apt.symptoms}"</p>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Appointment Type badge */}
                    {(apt.type === 'video' || apt.type === 'teleconsultation') ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'hsl(262, 95%, 96%)', border: '1px solid hsl(262, 80%, 85%)', color: '#6d28d9', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
                        📹 Video Consultation
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'hsl(172, 95%, 96%)', border: '1px solid hsl(172, 80%, 85%)', color: 'var(--teal-dark)', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6 }}>
                        🏥 In-Clinic Visit
                      </span>
                    )}
                    {apt.confirmationMethod === 'patient_sms' && (
                      <span className="badge badge-teal" style={{ fontSize: 10 }}>📱 Confirmed via SMS</span>
                    )}
                    {apt.confirmationMethod === 'hospital_admin' && (
                      <span className="badge badge-teal" style={{ fontSize: 10 }}>🏥 Confirmed by Hospital</span>
                    )}
                  </div>
                </div>
              </div>

              {backend === 'postgres' && <div style={{ marginTop: 12 }}>
                <p>Total fee: {apt.currency || 'INR'} {apt.billAmount} - Amount paid: {apt.currency || 'INR'} {apt.amountPaid || '0.00'}</p>
                <p>{apt.billStatus === 'deposit_paid' ? 'Deposit paid - remaining consultation fee may still be due.' : apt.billStatus === 'paid' ? 'Appointment fee paid.' : 'Appointment fee pending.'}</p>
                {['HELD', 'PENDING'].includes(apt.paymentHoldStatus) && !['cancelled', 'expired', 'completed'].includes(apt.status) && <>
                  <p>Waiting for payment - Deposit due: {apt.currency || 'INR'} {Math.max(0, Number(apt.depositAmount || 0) - Number(apt.amountPaid || 0)).toFixed(2)}</p>
                  {apt.holdExpiresAt && <p>Payment deadline: {new Date(apt.holdExpiresAt).toLocaleString('en-IN')}</p>}
                  <button className="btn btn-primary" disabled={paying === apt._id} onClick={() => pay(apt)}>{paying === apt._id ? 'Processing payment...' : 'Pay required deposit'}</button>
                </>}
                {['pending', 'reminder_sent'].includes(apt.status) && <p>{apt.confirmationMode === 'TIME_BASED' ? 'Final confirmation is scheduled by the provider.' : apt.confirmationMode === 'MANUAL' ? 'Waiting for hospital confirmation.' : 'Confirmation follows successful required payment.'}</p>}
                {!['cancelled', 'expired', 'completed'].includes(apt.status) && <AppointmentReschedule appointment={apt} onChanged={load} />}
              </div>}
              {/* Action buttons */}
              {(['pending', 'reminder_sent'].includes(apt.status) || (backend === 'postgres' && ['confirmed', 'checked_in'].includes(apt.status))) && (
                <div style={{ display:'flex', gap:10, marginTop:14, paddingTop:12, borderTop:'1px solid var(--gray-100)' }}>
                  <button
                    onClick={() => confirmAppointment(apt)}
                    disabled={confirming === apt._id || (backend === 'postgres' && (Boolean(apt.patientConfirmedAt) || !['pending', 'reminder_sent'].includes(apt.status)))}
                    style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background: confirming === apt._id ? '#a7f3d0' : 'var(--teal)', color:'#fff', fontSize:14, fontWeight:600, cursor: confirming === apt._id ? 'not-allowed' : 'pointer' }}
                  >
                    {confirming === apt._id ? 'Confirming...' : backend === 'postgres' ? (apt.patientConfirmedAt ? 'Acknowledged' : 'Acknowledge Appointment') : '✅ Confirm Appointment'}
                  </button>
                  <button
                    onClick={() => cancel(apt._id)}
                    style={{ flex:1, padding:'10px 0', borderRadius:10, border:'1px solid #fca5a5', background:'#fff', color:'#dc2626', fontSize:14, fontWeight:500, cursor:'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PatientLayout>
  );
}