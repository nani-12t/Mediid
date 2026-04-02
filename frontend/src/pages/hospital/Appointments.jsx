import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Search, Filter } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { appointmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending: 'badge-amber', confirmed: 'badge-teal', cancelled: 'badge-red', completed: 'badge-gray', rescheduled: 'badge-blue'
};

export default function HospitalAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await appointmentAPI.getHospitalAppointments({ status: filter !== 'all' ? filter : undefined });
      setAppointments(data);
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleAction = async (id, status, staffNotes = '') => {
    try {
      await appointmentAPI.updateStatus(id, { status, staffNotes });
      toast.success(`Appointment ${status}`);
      load();
    } catch { toast.error('Action failed'); }
  };

  const filtered = appointments.filter(a => {
    const name = `${a.patient?.firstName || ''} ${a.patient?.lastName || ''} ${a.doctor?.specialization || ''}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <HospitalLayout title="Appointments">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Appointment Requests</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Manage and confirm patient appointment requests</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
          <Search size={18} color="var(--gray-400)" />
          <input placeholder="Search by patient or specialization..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {['pending', 'confirmed', 'completed', 'cancelled', 'all'].map(s => (
            <button key={s} className={`tab-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state"><Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} /><p>No {filter} appointments</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor / Specialty</th>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Via</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(apt => (
                <tr key={apt._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 12, flexShrink: 0 }}>{apt.patient?.firstName?.[0] || 'P'}</div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500 }}>{apt.patient?.firstName} {apt.patient?.lastName}</p>
                        <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>{apt.patient?.uid}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}</p>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{apt.doctor?.specialization}</p>
                  </td>
                  <td>
                    <p style={{ fontSize: 13 }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN')}</p>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{apt.timeSlot || 'TBD'}</p>
                  </td>
                  <td><span className="badge badge-blue" style={{ textTransform: 'capitalize', fontSize: 11 }}>{apt.type}</span></td>
                  <td>
                    <span style={{ fontSize: 13 }}>
                      {apt.bookingMethod === 'whatsapp' ? '💬' : apt.bookingMethod === 'phone' ? '📞' : apt.bookingMethod === 'sms' ? '📱' : '🖥️'} {apt.bookingMethod}
                    </span>
                  </td>
                  <td><span className={`badge ${STATUS_COLORS[apt.status]}`} style={{ textTransform: 'capitalize', fontSize: 11 }}>{apt.status}</span></td>
                  <td>
                    {apt.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm" style={{ background: '#d1fae5', color: '#065f46', padding: '4px 10px' }}
                          onClick={() => handleAction(apt._id, 'confirmed')}>
                          <CheckCircle size={13} /> Confirm
                        </button>
                        <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px' }}
                          onClick={() => { const reason = prompt('Reason for rejection?'); if (reason !== null) handleAction(apt._id, 'cancelled', reason); }}>
                          <XCircle size={13} /> Reject
                        </button>
                      </div>
                    )}
                    {apt.status === 'confirmed' && (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleAction(apt._id, 'completed')}>Mark Complete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HospitalLayout>
  );
}
