import React, { useState, useEffect } from 'react';
import { Calendar, Plus, X, Clock, CheckCircle, XCircle, RefreshCw, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import PatientLayout from '../../components/common/PatientLayout';
import { appointmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending:     'badge-amber',
  confirmed:   'badge-teal',
  cancelled:   'badge-red',
  completed:   'badge-gray',
  rescheduled: 'badge-blue',
};

const METHOD_ICONS = { app:'🖥️', phone:'📞', whatsapp:'💬', sms:'📱', walk_in:'🚶' };

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [tab, setTab]                   = useState('upcoming');
  const [loading, setLoading]           = useState(true);
  const [confirming, setConfirming]     = useState(null); // apt._id being confirmed

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await appointmentAPI.getMyAppointments();
      setAppointments(data);
    } catch (e) {}
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
      // Use the public confirm-token endpoint — no auth needed
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || '/api'}/appointments/confirm/${apt.confirmToken}`
      );
      if (res.ok) {
        toast.success('✅ Appointment confirmed! You will receive an SMS shortly.');
        load();
      } else {
        toast.error('Could not confirm — please try again');
      }
    } catch {
      toast.error('Network error');
    }
    setConfirming(null);
  };

  const now      = new Date();
  const upcoming = appointments.filter(a => new Date(a.appointmentDate) >= now && a.status !== 'cancelled' && a.status !== 'completed');
  const past     = appointments.filter(a => new Date(a.appointmentDate) <  now || a.status === 'cancelled' || a.status === 'completed');
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
              Tap <strong>"Confirm Appointment"</strong> below each pending request to confirm your slot.
              You can also tap the link in the SMS we sent you.
            </p>
          </div>
        </div>
      )}

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
                    <span className={`badge ${STATUS_COLORS[apt.status]}`} style={{ fontSize:11, textTransform:'capitalize' }}>
                      {apt.status === 'pending' ? '⏳ Pending Confirmation' :
                       apt.status === 'confirmed' ? '✅ Confirmed' :
                       apt.status === 'cancelled' ? '❌ Cancelled' :
                       apt.status === 'completed' ? '🏁 Completed' : apt.status}
                    </span>
                  </div>
                  <p style={{ fontSize:13, color:'var(--teal)', fontWeight:500, marginBottom:2 }}>{apt.doctor?.specialization}</p>
                  <p style={{ fontSize:13, color:'var(--gray-500)' }}>🏥 {apt.hospital?.name}</p>
                  {apt.timeSlot && <p style={{ fontSize:13, color:'var(--gray-400)', marginTop:2 }}>⏰ {apt.timeSlot}</p>}
                  {apt.symptoms && <p style={{ fontSize:13, color:'var(--gray-500)', marginTop:4, fontStyle:'italic' }}>💬 "{apt.symptoms}"</p>}
                  <div style={{ display:'flex', gap:6, marginTop:6, flexWrap:'wrap' }}>
                    <span className="badge badge-gray" style={{ fontSize:10 }}>
                      {METHOD_ICONS[apt.bookingMethod]} {apt.bookingMethod}
                    </span>
                    {apt.confirmationMethod === 'patient_sms' && (
                      <span className="badge badge-teal" style={{ fontSize:10 }}>📱 Confirmed via SMS</span>
                    )}
                    {apt.confirmationMethod === 'hospital_admin' && (
                      <span className="badge badge-teal" style={{ fontSize:10 }}>🏥 Confirmed by Hospital</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              {apt.status === 'pending' && (
                <div style={{ display:'flex', gap:10, marginTop:14, paddingTop:12, borderTop:'1px solid var(--gray-100)' }}>
                  <button
                    onClick={() => confirmAppointment(apt)}
                    disabled={confirming === apt._id}
                    style={{ flex:2, padding:'10px 0', borderRadius:10, border:'none', background: confirming === apt._id ? '#a7f3d0' : 'var(--teal)', color:'#fff', fontSize:14, fontWeight:600, cursor: confirming === apt._id ? 'not-allowed' : 'pointer' }}
                  >
                    {confirming === apt._id ? 'Confirming...' : '✅ Confirm Appointment'}
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