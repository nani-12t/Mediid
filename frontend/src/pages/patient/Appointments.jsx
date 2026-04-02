import React, { useState, useEffect } from 'react';
import { Calendar, Plus, X, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import PatientLayout from '../../components/common/PatientLayout';
import { appointmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = { pending: 'badge-amber', confirmed: 'badge-teal', cancelled: 'badge-red', completed: 'badge-gray', rescheduled: 'badge-blue' };
const STATUS_ICONS = { pending: Clock, confirmed: CheckCircle, cancelled: XCircle, completed: CheckCircle };

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [tab, setTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await appointmentAPI.getMyAppointments();
      setAppointments(data);
    } catch (e) {}
    setLoading(false);
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

  const now = new Date();
  const upcoming = appointments.filter(a => new Date(a.appointmentDate) >= now && a.status !== 'cancelled');
  const past = appointments.filter(a => new Date(a.appointmentDate) < now || a.status === 'cancelled' || a.status === 'completed');
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <PatientLayout title="My Appointments">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>My Appointments</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>{upcoming.length} upcoming · {past.length} past</p>
        </div>
        <Link to="/search" className="btn btn-primary"><Plus size={16} /> Book New</Link>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab === 'upcoming' ? 'active' : ''}`} onClick={() => setTab('upcoming')}>Upcoming ({upcoming.length})</button>
        <button className={`tab-btn ${tab === 'past' ? 'active' : ''}`} onClick={() => setTab('past')}>Past ({past.length})</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : shown.length === 0 ? (
        <div className="card empty-state">
          <Calendar size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
          <p>{tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}</p>
          {tab === 'upcoming' && <Link to="/search" className="btn btn-primary" style={{ marginTop: 16 }}>Find a Doctor</Link>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {shown.map(apt => {
            const StatusIcon = STATUS_ICONS[apt.status] || Clock;
            return (
              <div key={apt._id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--gray-100)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <p style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>{new Date(apt.appointmentDate).getDate()}</p>
                    <p style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>{new Date(apt.appointmentDate).toLocaleString('en', { month: 'short' })}</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <p style={{ fontSize: 15, fontWeight: 600 }}>Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}</p>
                      <span className={`badge ${STATUS_COLORS[apt.status]}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>{apt.status}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500, marginBottom: 4 }}>{apt.doctor?.specialization}</p>
                    <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>🏥 {apt.hospital?.name}</p>
                    {apt.timeSlot && <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>⏰ {apt.timeSlot}</p>}
                    {apt.symptoms && <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6, fontStyle: 'italic' }}>"{apt.symptoms}"</p>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      <span className="badge badge-blue" style={{ fontSize: 11 }}>{apt.bookingMethod === 'whatsapp' ? '💬' : apt.bookingMethod === 'phone' ? '📞' : '🖥️'} via {apt.bookingMethod}</span>
                    </div>
                  </div>
                  {apt.status === 'pending' && (
                    <button className="btn btn-danger btn-sm" onClick={() => cancel(apt._id)}><X size={14} /> Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PatientLayout>
  );
}
