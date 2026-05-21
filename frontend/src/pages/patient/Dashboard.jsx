import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Maximize, Calendar, Search, Heart, FileText, Shield, AlertTriangle, Star, Video, FlaskConical, Package, ArrowRight, UserCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI, appointmentAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';

const SAMPLE_HOSPITALS = [
  { name: 'Apollo Hospitals', city: 'Chennai', rating: 4.8, reviews: 12400, specialties: ['Cardiology', 'Oncology', 'Neurology'] },
  { name: 'Fortis Memorial', city: 'Gurugram', rating: 4.7, reviews: 9800, specialties: ['Orthopedics', 'Transplant', 'Robotic Surgery'] },
  { name: 'AIIMS Delhi', city: 'New Delhi', rating: 4.9, reviews: 28000, specialties: ['General Medicine', 'Pediatrics', 'Cardiology'] },
];

const quickActions = [
  { label: 'Find Doctors', icon: Search, to: '/search', color: 'hsl(200, 95%, 55%)', bg: 'hsla(200, 95%, 55%, 0.08)' },
  { label: 'Video Consult', icon: Video, to: '/video-consult', color: 'hsl(38, 92%, 50%)', bg: 'hsla(38, 92%, 50%, 0.08)' },
  { label: 'Lab Tests', icon: FlaskConical, to: '/lab-tests', color: 'hsl(142, 70%, 45%)', bg: 'hsla(142, 70%, 45%, 0.08)' },
  { label: 'Medicines', icon: Package, to: '/medicines', color: 'hsl(4, 90%, 65%)', bg: 'hsla(4, 90%, 65%, 0.08)' },
  { label: 'My Reports', icon: FileText, to: '/profile?tab=documents', color: 'hsl(262, 80%, 60%)', bg: 'hsla(262, 80%, 60%, 0.08)' },
];

export default function PatientDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning 🌅';
    if (hour < 17) return 'Good afternoon ☀️';
    return 'Good evening 🌙';
  };

  return (
    <PatientLayout title="Patient Dashboard">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'start' }} className="dashboard-grid">
        
        {/* Left Section: Welcome, Actions & Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          
          {/* Welcome Banner */}
          <div style={{ 
            background: 'linear-gradient(135deg, var(--gray-900) 0%, var(--navy) 50%, var(--navy-dark) 100%)', 
            borderRadius: 'var(--radius-xl)', 
            padding: '40px', 
            position: 'relative', 
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,180,160,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -80, left: 10, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
            
            <div style={{ position: 'relative', zIndex: 2 }}>
              <p style={{ color: 'var(--teal-light)', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{getGreeting()}</p>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(24px, 3.5vw, 32px)', color: 'white', marginBottom: 12, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Welcome back,<br />
                <span style={{ color: 'var(--white)' }}>{patientName}</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, maxWidth: 440, marginBottom: 24, lineHeight: 1.6 }}>
                Access your secure diagnostic files, scan prescriptions, and coordinate directly with clinical specialists.
              </p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 500 }}>Your digital identity is active:</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,180,160,0.12)', border: '1px solid rgba(0,180,160,0.2)', borderRadius: 8, padding: '4px 12px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)', display: 'inline-block' }} />
                  <span style={{ color: 'var(--teal-light)', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{uid}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Alert (if no emergency info) */}
          {!profile?.emergency?.bloodGroup && (
            <div style={{ 
              background: 'hsl(45, 93%, 94%)', 
              border: '1px solid hsl(45, 93%, 80%)', 
              borderRadius: 'var(--radius-md)', 
              padding: '16px 20px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 14,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'hsla(38, 92%, 50%, 0.1)', display: 'flex', alignItems: 'center', justifyCentent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} color="var(--amber)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, color: 'hsl(35, 90%, 25%)', fontWeight: 600 }}>Emergency Profile Incomplete</p>
                <p style={{ fontSize: 12, color: 'hsl(35, 70%, 35%)', marginTop: 2 }}>Provide your blood group and allergy disclosures so doctors can help you faster in critical moments.</p>
              </div>
              <Link to="/profile" className="btn btn-sm" style={{ background: 'white', border: '1px solid hsl(45, 93%, 80%)', color: 'hsl(35, 90%, 30%)', fontWeight: 700 }}>Update Now</Link>
            </div>
          )}

          {/* Quick Actions Grid */}
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 18 }}>Quick Healthcare Hub</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 16 }}>
              {quickActions.map(action => (
                <Link key={action.label} to={action.to} style={{ textDecoration: 'none' }}>
                  <div className="card text-center-hover" style={{ 
                    textAlign: 'center', 
                    padding: '24px 16px', 
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: 'white',
                    border: '1px solid rgba(148, 163, 184, 0.08)'
                  }}>
                    <div style={{ 
                      width: 52, 
                      height: 52, 
                      borderRadius: 16, 
                      background: action.bg, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      marginBottom: 12,
                      transition: 'var(--transition)'
                    }} className="icon-wrap">
                      <action.icon size={22} color={action.color} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', transition: 'var(--transition)' }} className="label-text">{action.label}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Video Consult Promo Card */}
          <Link to="/video-consult" style={{ textDecoration: 'none' }}>
            <div style={{ 
              background: 'linear-gradient(95deg, hsl(230, 60%, 25%) 0%, hsl(230, 50%, 40%) 100%)', 
              borderRadius: 'var(--radius-lg)', 
              padding: '28px 32px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              color: 'white',
              boxShadow: '0 12px 24px -6px rgba(40, 50, 117, 0.3)',
              position: 'relative',
              overflow: 'hidden'
            }} className="promo-card">
              <div style={{ position: 'absolute', top: -30, right: -10, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />
              <div style={{ flex: 1, paddingRight: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: 'white', padding: '3px 8px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telemedicine</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: '#a7f3d0', fontWeight: 600 }}>142 Doctors Online</span>
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: 'white', marginBottom: 4 }}>Consult Top Specialists Instantly</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>Connect over secure HD video consultation with board-certified clinical professionals in under 10 minutes.</p>
              </div>
              <div style={{ background: 'white', color: 'hsl(230, 60%, 25%)', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, boxShadow: 'var(--shadow-sm)' }}>
                Start Consult <ArrowRight size={15} />
              </div>
            </div>
          </Link>

          {/* Grid of Connections */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="dashboard-subgrid">
            
            {/* Upcoming Appointments */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>My Appointments</h3>
                <Link to="/appointments" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>View All</Link>
              </div>
              {appointments.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 0', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={36} style={{ marginBottom: 12, opacity: 0.15 }} />
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500 }}>No upcoming sessions booked</p>
                  <Link to="/search" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>Schedule Now</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {appointments.map(apt => (
                    <div key={apt._id} style={{ padding: '14px', background: 'var(--gray-50)', borderRadius: 14, border: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 12, transition: 'var(--transition)' }} className="list-item-hover">
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: 'white', border: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Calendar size={18} color="var(--teal)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN')} • {apt.timeSlot}</p>
                      </div>
                      <span className={`badge badge-${apt.status === 'confirmed' ? 'teal' : apt.status === 'pending' ? 'amber' : 'gray'}`} style={{ fontSize: 10, padding: '3px 8px' }}>
                        {apt.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Partner Hospitals */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>Top Partner Hospitals</h3>
                <Link to="/search?category=Hospitals" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 700 }}>Explore</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {SAMPLE_HOSPITALS.map(h => (
                  <div key={h.name} style={{ padding: '14px', background: 'white', borderRadius: 14, border: '1px solid var(--gray-100)', display: 'flex', gap: 12, transition: 'var(--transition)' }} className="list-item-hover">
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg, hsl(172, 95%, 40%), hsl(200, 95%, 60%))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0, 180, 160, 0.1)' }}>
                      <Heart size={18} color="white" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Star size={11} color="var(--amber)" fill="var(--amber)" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-700)' }}>{h.rating}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{h.city} • {h.specialties?.slice(0,2).join(', ')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

        </div>

        {/* Right Section: Patient Digital ID QR Panel */}
        <div style={{ position: 'sticky', top: 100 }} className="right-panel">
          <div className="card text-center" style={{ textAlign: 'center', padding: '32px 24px', border: '1px solid rgba(0, 180, 160, 0.15)', background: 'white' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0, 180, 160, 0.08)', borderRadius: 20, padding: '4px 14px', marginBottom: 20 }}>
              <UserCheck size={14} color="var(--teal)" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Identity</span>
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 6 }}>MediID QR Card</h3>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 24, lineHeight: 1.4 }}>Present this card to clinical staff, pharmacies, or scanning kiosks for instant consent-based record access.</p>
            
            <div style={{ 
              background: 'white',
              padding: '24px',
              borderRadius: 24,
              border: '2px solid var(--gray-100)',
              display: 'inline-block',
              boxShadow: 'var(--shadow-md)',
              position: 'relative'
            }} className="qr-glowing-wrap">
              {qrData ? (
                <QRCodeSVG value={`mediid:${uid}`} size={160} level="H" fgColor="var(--navy)" />
              ) : (
                <div style={{ width: 160, height: 160, background: 'var(--gray-50)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Maximize size={48} color="var(--gray-300)" />
                </div>
              )}
            </div>

            <p style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.05em', marginTop: 20, background: 'var(--gray-50)', padding: '8px 12px', borderRadius: 10, border: '1px solid var(--gray-100)', display: 'inline-block' }}>
              {uid}
            </p>

            <div style={{ marginTop: 24, padding: '16px 14px', background: 'var(--gray-50)', borderRadius: 16, border: '1px solid var(--gray-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Shield size={18} color="var(--teal)" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: 11, color: 'var(--gray-500)', textAlign: 'left', lineHeight: 1.4 }}>
                This code is encrypted. Scanners require permission tokens and only decrypt relevant patient datasets.
              </p>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .text-center-hover:hover .icon-wrap {
          transform: scale(1.08);
          background: var(--teal) !important;
        }
        .text-center-hover:hover .icon-wrap svg {
          color: white !important;
        }
        .text-center-hover:hover .label-text {
          color: var(--teal) !important;
        }
        .list-item-hover:hover {
          background: white !important;
          border-color: rgba(0, 180, 160, 0.15) !important;
          box-shadow: var(--shadow-sm);
        }
        .qr-glowing-wrap::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 28px;
          border: 2px solid var(--teal);
          opacity: 0.15;
          pointer-events: none;
        }
        .promo-card {
          transition: var(--transition);
        }
        .promo-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px -8px rgba(40, 50, 117, 0.45);
        }
        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .right-panel {
            position: relative !important;
            top: 0 !important;
          }
        }
        @media (max-width: 640px) {
          .dashboard-subgrid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </PatientLayout>
  );
}
