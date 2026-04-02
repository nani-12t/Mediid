import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QrCode, Calendar, Search, Heart, FileText, Shield, AlertTriangle, ChevronRight, Star } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI, appointmentAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const SAMPLE_HOSPITALS = [
  { name: 'Apollo Hospitals', city: 'Chennai', rating: 4.8, reviews: 12400, specialties: ['Cardiology', 'Oncology', 'Neurology'] },
  { name: 'Fortis Memorial', city: 'Gurugram', rating: 4.7, reviews: 9800, specialties: ['Orthopaedics', 'Transplant', 'Robotic Surgery'] },
  { name: 'AIIMS Delhi', city: 'New Delhi', rating: 4.9, reviews: 28000, specialties: ['General Medicine', 'Paediatrics', 'Cardiology'] },
];

const quickActions = [
  { label: 'Find Doctors', icon: Search, to: '/search', color: '#38bdf8', bg: '#eff6ff' },
  { label: 'My Appointments', icon: Calendar, to: '/appointments', color: '#8b5cf6', bg: '#f5f3ff' },
  { label: 'Insurance', icon: Shield, to: '/insurance', color: '#f97066', bg: '#fff1f2' },
  { label: 'My Reports', icon: FileText, to: '/profile?tab=documents', color: '#10b981', bg: '#ecfdf5' },
];

export default function PatientDashboard() {
  const { profile, user } = useAuth();
  const [qrData, setQrData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [qrRes, apptRes] = await Promise.allSettled([
          patientAPI.getQR(),
          appointmentAPI.getMyAppointments()
        ]);
        if (qrRes.status === 'fulfilled') setQrData(qrRes.value.data);
        if (apptRes.status === 'fulfilled') setAppointments(apptRes.value.data.slice(0, 3));
      } catch (e) {}
      setLoading(false);
    };
    load();
  }, []);

  const uid = profile?.uid || qrData?.uid || 'MID-XXXXXXXX';
  const patientName = profile ? `${profile.firstName} ${profile.lastName}` : user?.email;

  return (
    <PatientLayout title="Dashboard">
      {/* Welcome Banner */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, #0e4a4a 100%)', borderRadius: 'var(--radius-xl)', padding: '28px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,180,160,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>Good morning 👋</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'white', marginBottom: 8 }}>{patientName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,180,160,0.2)', borderRadius: 8, padding: '6px 14px', display: 'inline-flex' }}>
              <QrCode size={16} color="var(--teal)" />
              <span style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>{uid}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="qr-container" style={{ maxWidth: 160, padding: 16 }}>
            {qrData ? (
              <QRCodeSVG value={`mediid:${uid}`} size={100} level="H" fgColor="var(--navy)" />
            ) : (
              <div style={{ width: 100, height: 100, background: 'var(--gray-100)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <QrCode size={40} color="var(--gray-400)" />
              </div>
            )}
            <p className="qr-uid" style={{ fontSize: 11 }}>{uid}</p>
            <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Show to doctor / pharmacy</p>
          </div>
        </div>
      </div>

      {/* Emergency Alert (if no emergency info) */}
      {!profile?.emergency?.bloodGroup && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#d97706" />
          <span style={{ fontSize: 14, color: '#92400e' }}>Complete your information so doctors can help you faster.</span>
          <Link to="/profile" style={{ marginLeft: 'auto', fontSize: 13, color: '#d97706', fontWeight: 500 }}>Update →</Link>
        </div>
      )}

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
        {quickActions.map(action => (
          <Link key={action.label} to={action.to} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ textAlign: 'center', padding: '20px 12px', cursor: 'pointer' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: action.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <action.icon size={22} color={action.color} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>{action.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Upcoming Appointments */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Upcoming Appointments</h3>
            <Link to="/appointments" style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>View all</Link>
          </div>
          {appointments.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <Calendar size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ fontSize: 14 }}>No upcoming appointments</p>
              <Link to="/search" className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Book Now</Link>
            </div>
          ) : (
            appointments.map(apt => (
              <div key={apt._id} style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Calendar size={18} color="var(--teal)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN')}</p>
                </div>
                <span className={`badge badge-${apt.status === 'confirmed' ? 'teal' : apt.status === 'pending' ? 'amber' : 'gray'}`} style={{ fontSize: 11 }}>{apt.status}</span>
              </div>
            ))
          )}
        </div>

        {/* Top Hospitals */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Top Hospitals</h3>
            <Link to="/search" style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>View all</Link>
          </div>
          {SAMPLE_HOSPITALS.map(h => (
            <div key={h.name} style={{ padding: '12px 0', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #00b4a0, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Heart size={18} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{h.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Star size={12} color="#f59e0b" fill="#f59e0b" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>{h.rating}</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{h.city} · {h.reviews.toLocaleString()} reviews</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PatientLayout>
  );
}
