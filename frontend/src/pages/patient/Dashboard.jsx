import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Maximize, Calendar, Search, Heart, FileText, Shield, AlertTriangle, ChevronRight, Star, Database } from 'lucide-react';
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
  { label: 'My Reports', icon: FileText, to: '/profile?tab=documents', color: '#10b981', bg: '#ecfdf5' },
  { label: 'Health Profile', icon: Heart, to: '/profile?tab=emergency', color: '#e11d48', bg: '#fff1f2' },
  { label: 'Data Marketplace', icon: Database, to: '/marketplace', color: '#8b5cf6', bg: '#f5f3ff' },
];

export default function PatientDashboard() {
  const { profile, user } = useAuth();
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await patientAPI.getQR();
        setQrData(res.data);
      } catch (e) { }
      setLoading(false);
    };
    load();
  }, []);

  const uid = profile?.uid || qrData?.uid || 'MID-XXXXXXXX';
  const patientName = profile ? `${profile.firstName} ${profile.lastName}` : user?.email;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning 🌅';
    if (hour < 17) return 'Good afternoon ☀️';
    return 'Good evening 🌙';
  };

  return (
    <PatientLayout title="Digi Locker Dashboard">
      {/* Welcome Banner */}
      <div style={{ background: 'linear-gradient(135deg, var(--navy) 0%, #0e4a4a 100%)', borderRadius: 'var(--radius-xl)', padding: '28px 32px', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,180,160,0.1)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>{getGreeting()}</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'white', marginBottom: 8 }}>{patientName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,180,160,0.2)', borderRadius: 8, padding: '6px 14px', display: 'inline-flex' }}>
              <Maximize size={16} color="var(--teal)" />
              <span style={{ color: 'var(--teal)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, letterSpacing: '0.05em' }}>{uid}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="qr-container" style={{ maxWidth: 160, padding: 16 }}>
            {qrData ? (
              <QRCodeSVG value={`mediid:${uid}`} size={100} level="H" fgColor="var(--navy)" />
            ) : (
              <div style={{ width: 100, height: 100, background: 'var(--gray-100)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Maximize size={40} color="var(--gray-400)" />
              </div>
            )}
            <p className="qr-uid" style={{ fontSize: 11 }}>{uid}</p>
            <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>Scan for Digital Locker</p>
          </div>
        </div>
      </div>

      {/* Emergency Alert (if no emergency info) */}
      {!profile?.emergency?.bloodGroup && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={18} color="#d97706" />
          <span style={{ fontSize: 14, color: '#92400e' }}>Complete your health information to populate your Digi Locker.</span>
          <Link to="/profile" style={{ marginLeft: 'auto', fontSize: 13, color: '#d97706', fontWeight: 500 }}>Update →</Link>
        </div>
      )}

      {/* Quick Actions */}
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Quick Actions</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 28 }}>
        {quickActions.map(action => (
          <Link key={action.label} to={action.to} style={{ textDecoration: 'none' }}>
            <div className="card" style={{ textAlign: 'center', padding: '20px 12px', cursor: 'pointer', height: '100%' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: action.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <action.icon size={22} color={action.color} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)' }}>{action.label}</p>
            </div>
          </Link>
        ))}
      </div>

    </PatientLayout>
  );
}
