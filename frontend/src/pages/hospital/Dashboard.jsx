import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Calendar, FileText, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle, ChevronRight } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { appointmentAPI, doctorAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const StatCard = ({ icon: Icon, label, value, color, bg, trend }) => (
  <div className="stat-card">
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div className="stat-card-icon" style={{ background: bg }}>
        <Icon size={20} color={color} />
      </div>
      {trend && <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>↑ {trend}</span>}
    </div>
    <p style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>{value}</p>
    <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{label}</p>
  </div>
);

export default function HospitalDashboard() {
  const { profile } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [apptRes, docRes] = await Promise.allSettled([
          appointmentAPI.getHospitalAppointments({ status: 'pending' }),
          doctorAPI.search({})
        ]);
        if (apptRes.status === 'fulfilled') setAppointments(apptRes.value.data);
        if (docRes.status === 'fulfilled') setDoctors(docRes.value.data.slice(0, 5));
      } catch (e) {}
      setLoading(false);
    };
    load();
  }, []);

  const pending = appointments.filter(a => a.status === 'pending').length;

  return (
    <HospitalLayout title="Dashboard">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
          Welcome, {profile?.name || 'Hospital Admin'} 🏥
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Here's what's happening today at your hospital.</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={Calendar} label="Pending Appointments" value={pending} color="#f59e0b" bg="#fef3c7" trend="12%" />
        <StatCard icon={Users} label="Total Doctors" value={doctors.length || '—'} color="#38bdf8" bg="#eff6ff" />
        <StatCard icon={CheckCircle} label="Confirmed Today" value="24" color="#10b981" bg="#d1fae5" trend="8%" />
        <StatCard icon={TrendingUp} label="Patient Satisfaction" value="96%" color="#8b5cf6" bg="#f5f3ff" trend="2%" />
      </div>

      {/* Pending appointment requests */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Pending Appointment Requests</h3>
            {pending > 0 && <span className="badge badge-amber">{pending} pending</span>}
            <Link to="/hospital/appointments" style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500, marginLeft: 'auto' }}>View all →</Link>
          </div>

          {appointments.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <CheckCircle size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No pending requests</p>
            </div>
          ) : (
            appointments.slice(0, 5).map(apt => (
              <div key={apt._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="avatar" style={{ width: 38, height: 38, fontSize: 14 }}>
                  {apt.patient?.firstName?.[0] || 'P'}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{apt.patient?.firstName} {apt.patient?.lastName}</p>
                  <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                    {apt.doctor?.specialization} · {new Date(apt.appointmentDate).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" style={{ background: '#d1fae5', color: '#065f46', padding: '4px 10px', fontSize: 12 }}>✓</button>
                  <button className="btn btn-sm" style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', fontSize: 12 }}>✕</button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Doctors on duty */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Doctors on Duty</h3>
            <Link to="/hospital/doctors" style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>Manage →</Link>
          </div>
          {doctors.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 0' }}>
              <Users size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No doctors added yet</p>
              <Link to="/hospital/doctors" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Add Doctor</Link>
            </div>
          ) : (
            doctors.map(doc => (
              <div key={doc._id} style={{ padding: '10px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{doc.firstName[0]}</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>Dr. {doc.firstName} {doc.lastName}</p>
                  <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{doc.specialization}</p>
                </div>
                <span className="status-dot available" />
              </div>
            ))
          )}
        </div>
      </div>
    </HospitalLayout>
  );
}
