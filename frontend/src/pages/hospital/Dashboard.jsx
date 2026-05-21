import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Calendar, 
  FileText, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  X,
  AlertCircle, 
  ChevronRight, 
  Sparkles, 
  Plus, 
  Activity, 
  QrCode, 
  ShieldCheck,
  Stethoscope
} from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { appointmentAPI, doctorAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

export default function HospitalDashboard() {
  const { profile } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Inline rejection state
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const load = async () => {
    try {
      const [apptRes, docRes] = await Promise.allSettled([
        appointmentAPI.getHospitalAppointments({ status: 'pending' }),
        doctorAPI.search({})
      ]);
      if (apptRes.status === 'fulfilled') setAppointments(apptRes.value.data);
      if (docRes.status === 'fulfilled') setDoctors(docRes.value.data.slice(0, 5));
    } catch (e) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleConfirm = async (aptId) => {
    setActionLoading(aptId);
    try {
      await appointmentAPI.updateStatus(aptId, { status: 'confirmed' });
      toast.success('Appointment confirmed successfully! SMS notification dispatched.', {
        icon: '✓',
        style: { background: 'var(--navy)', color: '#fff', borderRadius: '12px' }
      });
      // Remove from pending list
      setAppointments(prev => prev.filter(a => a._id !== aptId));
    } catch (err) {
      toast.error('Failed to confirm appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async (e, aptId) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      toast.error('Please enter a cancellation reason');
      return;
    }
    setActionLoading(aptId);
    try {
      await appointmentAPI.updateStatus(aptId, { 
        status: 'cancelled', 
        staffNotes: rejectReason.trim() 
      });
      toast.success('Appointment cancelled. Patient notified.', {
        style: { background: 'var(--navy)', color: '#fff', borderRadius: '12px' }
      });
      setAppointments(prev => prev.filter(a => a._id !== aptId));
      setRejectingId(null);
      setRejectReason('');
    } catch (err) {
      toast.error('Failed to cancel appointment');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = appointments.length;

  return (
    <HospitalLayout title="Command Dashboard">
      {/* Welcome Banner */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)', 
        borderRadius: 'var(--radius-lg)', 
        padding: '32px', 
        color: '#white', 
        marginBottom: 28,
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
        overflow: 'hidden'
      }} className="fade-in">
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: '50%', background: 'rgba(0, 180, 160, 0.1)', filter: 'blur(30px)' }} />
        <div style={{ position: 'absolute', bottom: -30, left: 100, width: 140, height: 140, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.05)', filter: 'blur(20px)' }} />
        
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(0, 180, 160, 0.15)', border: '1px solid rgba(0, 180, 160, 0.25)', padding: '6px 12px', borderRadius: '99px', fontSize: 12, color: 'var(--teal-light)', fontWeight: 600, marginBottom: 12 }}>
              <Sparkles size={13} /> Active Session Secure
            </div>
            <h2 style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', marginBottom: 6 }}>
              {profile?.name || 'Apollo Chennai'}
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: 14, maxWidth: 500 }}>
              Hospital Registry: <strong style={{ color: 'white' }}>{profile?.uid || 'HID-APOLLOCHENNAI'}</strong> | Welcome back to the clinic command console.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/hospital/qr" className="btn btn-primary" style={{ padding: '10px 18px', fontSize: 13, background: 'rgba(255,255,255,0.08)', color: 'white', borderColor: 'rgba(255,255,255,0.15)', boxShadow: 'none' }}>
              <QrCode size={16} /> QR Poster
            </Link>
            <Link to="/hospital/reports" className="btn btn-primary" style={{ padding: '10px 18px', fontSize: 13 }}>
              <Plus size={16} /> Upload Report
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20, marginBottom: 32 }} className="fade-in">
        {/* Stat 1: Pending */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>Awaiting Confirmation</span>
              <div style={{ background: 'hsl(38, 92%, 92%)', padding: 8, borderRadius: 10 }}>
                <Clock size={18} color="var(--amber)" />
              </div>
            </div>
            <p style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
              {loading ? '...' : pendingCount}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: pendingCount > 0 ? 'var(--amber)' : 'var(--gray-400)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pendingCount > 0 ? 'var(--amber)' : 'var(--gray-300)' }} />
            {pendingCount > 0 ? `${pendingCount} patients in queue` : 'OPD queue is empty'}
          </div>
        </div>

        {/* Stat 2: Doctors */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>Doctor Registry</span>
              <div style={{ background: 'hsl(200, 95%, 92%)', padding: 8, borderRadius: 10 }}>
                <Users size={18} color="var(--sky)" />
              </div>
            </div>
            <p style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
              {loading ? '...' : doctors.length}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--teal)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
            On-boarded specialists
          </div>
        </div>

        {/* Stat 3: Confirmed */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>Confirmed Bookings</span>
              <div style={{ background: 'hsl(148, 70%, 90%)', padding: 8, borderRadius: 10 }}>
                <CheckCircle size={18} color="var(--teal)" />
              </div>
            </div>
            <p style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
              24
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#10b981', fontWeight: 600 }}>
            <span>↑ 8% vs yesterday</span>
          </div>
        </div>

        {/* Stat 4: Satisfaction */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 600 }}>Consent Rating</span>
              <div style={{ background: '#f5f3ff', padding: 8, borderRadius: 10 }}>
                <TrendingUp size={18} color="#8b5cf6" />
              </div>
            </div>
            <p style={{ fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
              96%
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8b5cf6', fontWeight: 600 }}>
            <span>↑ 2% improvement</span>
          </div>
        </div>
      </div>

      {/* Main Core Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }} className="fade-in">
        {/* Left Column: Pending Actions */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, pb: 12, borderBottom: '1px solid var(--gray-100)' }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 8 }}>
                Pending Appointment Queue
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--gray-500)', marginTop: 2 }}>Accept or cancel bookings to activate doctor clinical windows.</p>
            </div>
            {pendingCount > 0 ? (
              <span style={{ background: 'hsl(38, 92%, 94%)', color: 'var(--amber)', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}>
                {pendingCount} Pending Action
              </span>
            ) : (
              <span style={{ background: 'hsl(148, 70%, 94%)', color: 'var(--teal)', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}>
                Clear Queue
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading appointments...</p>
            </div>
          ) : appointments.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'hsl(148, 70%, 94%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ShieldCheck size={24} color="var(--teal)" />
              </div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 4 }}>No Pending Bookings</h4>
              <p style={{ fontSize: 12, color: 'var(--gray-400)', maxWidth: 280, margin: '0 auto' }}>All patient bookings are processed. Check the full list in the registry.</p>
              <Link to="/hospital/appointments" className="btn btn-secondary btn-sm" style={{ marginTop: 16, display: 'inline-flex' }}>
                View All Appointments <ChevronRight size={14} />
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {appointments.slice(0, 5).map(apt => (
                <div key={apt._id} style={{ 
                  background: 'var(--gray-50)', 
                  border: '1px solid var(--gray-100)', 
                  borderRadius: 12, 
                  padding: 16, 
                  transition: 'var(--transition)',
                  position: 'relative'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="avatar" style={{ width: 40, height: 40, fontSize: 14, background: 'linear-gradient(135deg, var(--teal), #38bdf8)' }}>
                        {apt.patient?.firstName?.[0] || 'P'}
                      </div>
                      <div>
                        <h4 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--navy)' }}>
                          {apt.patient?.firstName} {apt.patient?.lastName}
                        </h4>
                        <p style={{ fontSize: 11.5, color: 'var(--gray-500)', marginTop: 2 }}>
                          ID: <strong style={{ color: 'var(--gray-700)' }}>{apt.patient?.uid || 'PAT-XXXXXX'}</strong> · {apt.patient?.gender || 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)' }}>
                        Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        {apt.doctor?.specialization} · Token {apt.tokenNumber || '—'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button 
                        onClick={() => handleConfirm(apt._id)}
                        disabled={actionLoading !== null}
                        className="btn"
                        style={{ 
                          background: 'white', 
                          border: '1px solid var(--gray-200)',
                          boxShadow: 'var(--shadow-sm)',
                          color: '#059669', 
                          padding: '8px 12px', 
                          fontSize: 12.5,
                          borderRadius: 8,
                          cursor: 'pointer'
                        }}
                      >
                        {actionLoading === apt._id ? '...' : '✓ Accept'}
                      </button>
                      <button 
                        onClick={() => {
                          setRejectingId(rejectingId === apt._id ? null : apt._id);
                          setRejectReason('');
                        }}
                        disabled={actionLoading !== null}
                        className="btn"
                        style={{ 
                          background: 'white', 
                          border: '1px solid var(--gray-200)',
                          boxShadow: 'var(--shadow-sm)',
                          color: '#dc2626', 
                          padding: '8px 12px', 
                          fontSize: 12.5,
                          borderRadius: 8,
                          cursor: 'pointer'
                        }}
                      >
                        {rejectingId === apt._id ? '✕ Cancel' : '✕ Reject'}
                      </button>
                    </div>
                  </div>

                  {/* Inline Rejection Form */}
                  {rejectingId === apt._id && (
                    <form 
                      onSubmit={(e) => handleRejectSubmit(e, apt._id)}
                      style={{ 
                        marginTop: 14, 
                        paddingTop: 12, 
                        borderTop: '1.5px dashed var(--gray-200)',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center'
                      }}
                    >
                      <input 
                        type="text" 
                        placeholder="Reason for rejection (e.g. Doctor is out of town)..." 
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          border: '1.5px solid var(--gray-200)',
                          borderRadius: 8,
                          fontSize: 12.5,
                          outline: 'none'
                        }}
                        autoFocus
                        required
                      />
                      <button 
                        type="submit" 
                        disabled={actionLoading === apt._id}
                        className="btn" 
                        style={{ 
                          background: '#dc2626', 
                          color: 'white', 
                          padding: '8px 14px', 
                          fontSize: 12,
                          borderRadius: 8,
                          border: 'none',
                          fontWeight: 600
                        }}
                      >
                        Confirm Rejection
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          
          <div style={{ marginTop: 'auto', paddingTop: 18, borderTop: '1px solid var(--gray-100)', textAlign: 'right' }}>
            <Link to="/hospital/appointments" style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Open Full Booking Panel <ChevronRight size={15} />
            </Link>
          </div>
        </div>

        {/* Right Column: Doctors + Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Quick Actions Panel */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 14 }}>
              Quick Control Tools
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Link to="/hospital/management" style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, border: '1px solid var(--gray-100)', display: 'flex', flexDirection: 'column', gap: 8, transition: 'var(--transition)' }} className="card-hover-effect">
                <Users size={16} color="var(--teal)" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Staff Shifts</span>
              </Link>
              <Link to="/hospital/reports" style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, border: '1px solid var(--gray-100)', display: 'flex', flexDirection: 'column', gap: 8, transition: 'var(--transition)' }} className="card-hover-effect">
                <FileText size={16} color="#3b82f6" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Upload Report</span>
              </Link>
              <Link to="/hospital/analytics" style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, border: '1px solid var(--gray-100)', display: 'flex', flexDirection: 'column', gap: 8, transition: 'var(--transition)' }} className="card-hover-effect">
                <Activity size={16} color="#8b5cf6" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Live Trends</span>
              </Link>
              <Link to="/hospital/settings" style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 10, border: '1px solid var(--gray-100)', display: 'flex', flexDirection: 'column', gap: 8, transition: 'var(--transition)' }} className="card-hover-effect">
                <Stethoscope size={16} color="var(--amber)" />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Settings</span>
              </Link>
            </div>
          </div>

          {/* Doctors On Duty */}
          <div className="card" style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>
                Doctors on Duty
              </h3>
              <Link to="/hospital/management" style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>Manage →</Link>
            </div>

            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}><div className="spinner" /></div>
            ) : doctors.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--gray-400)' }}>
                <p style={{ fontSize: 13 }}>No registered doctors found</p>
                <Link to="/hospital/management" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Register Doctor</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {doctors.map(doc => (
                  <div 
                    key={doc._id} 
                    style={{ 
                      padding: 10, 
                      borderRadius: 10,
                      border: '1px solid var(--gray-100)',
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 10 
                    }}
                  >
                    <div className="avatar" style={{ width: 34, height: 34, fontSize: 13, background: 'linear-gradient(135deg, var(--navy), var(--navy-light))' }}>
                      {doc.firstName[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)' }}>Dr. {doc.firstName} {doc.lastName}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 1 }}>{doc.specialization} · {doc.department || 'General'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span className="status-dot available" style={{ width: 7, height: 7 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>On Duty</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </HospitalLayout>
  );
}
