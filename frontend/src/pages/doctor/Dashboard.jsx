import React, { useState, useEffect } from 'react';
import { 
  Users, Clock, CheckCircle, Search, FileText, Activity, 
  Shield, LogOut, Star, Pill, Heart, Thermometer, Upload, 
  Printer, Share2, Save, AlertTriangle, ChevronRight, X, Edit2, 
  Video, MapPin, ClipboardList, Droplets, Lock, Plus, Trash2, Eye
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function DoctorDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeApt, setActiveApt] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [errorState, setErrorState] = useState(null);
  const [activeTab, setActiveTab] = useState('clinical'); 
  const [saving, setSaving] = useState(false);

  // Clinical states
  const [vitals, setVitals] = useState({
    temp: '',
    bp: '',
    pulse: '',
    spo2: '',
    weight: ''
  });
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [medicines, setMedicines] = useState([
    { name: '', dosage: '', duration: '', instruction: '' }
  ]);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const loadData = async () => {
    try {
      const { data } = await api.get('/doctor-portal/queue');
      setData(data);
      if (data.appointments.length > 0 && !activeApt) {
        selectAppointment(data.appointments[0]);
      }
    } catch (e) {
      toast.error('Failed to load doctor queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectAppointment = async (apt) => {
    setActiveApt(apt);
    setPatientProfile(null);
    setErrorState(null);
    setLoading(true);
    // Reset inputs
    setVitals({ temp: '', bp: '', pulse: '', spo2: '', weight: '' });
    setClinicalNotes('');
    setMedicines([{ name: '', dosage: '', duration: '', instruction: '' }]);
    setSelectedDoc(null);

    try {
      const { data } = await api.get(`/doctor-portal/patient/${apt.patient.uid}`);
      setPatientProfile(data);
      // Pre-fill if patient has existing profile data
      if (data.emergency) {
        setVitals({
          temp: '',
          bp: '',
          pulse: '',
          spo2: '',
          weight: ''
        });
      }
    } catch (e) {
      if (e.response && e.response.status === 403) {
        setErrorState(e.response.data);
      } else {
        toast.error('Failed to load patient profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const addMedicineRow = () => {
    setMedicines([...medicines, { name: '', dosage: '', duration: '', instruction: '' }]);
  };

  const removeMedicineRow = (idx) => {
    if (medicines.length === 1) {
      setMedicines([{ name: '', dosage: '', duration: '', instruction: '' }]);
    } else {
      setMedicines(medicines.filter((_, i) => i !== idx));
    }
  };

  const updateMedicine = (idx, field, value) => {
    const updated = [...medicines];
    updated[idx][field] = value;
    setMedicines(updated);
  };

  const handleSavePrescription = async () => {
    // Validate prescription
    const validMeds = medicines.filter(m => m.name.trim() !== '');
    if (!clinicalNotes.trim() && validMeds.length === 0) {
      return toast.error('Please enter clinical notes or prescribe at least one medicine');
    }

    setSaving(true);
    try {
      // Compile prescription text
      let compiledRx = ``;
      if (vitals.temp || vitals.bp || vitals.pulse || vitals.spo2 || vitals.weight) {
        compiledRx += `VITALS: Temp: ${vitals.temp || '—'}°F, BP: ${vitals.bp || '—'}, Pulse: ${vitals.pulse || '—'} bpm, SpO2: ${vitals.spo2 || '—'}%, Wt: ${vitals.weight || '—'}kg\n\n`;
      }
      if (clinicalNotes.trim()) {
        compiledRx += `CLINICAL NOTES / COMPLAINTS:\n${clinicalNotes}\n\n`;
      }
      if (validMeds.length > 0) {
        compiledRx += `Rx (MEDICINES):\n`;
        validMeds.forEach((m, i) => {
          compiledRx += `${i + 1}. Tab. ${m.name} -- ${m.dosage} -- ${m.duration} Days [Instructions: ${m.instruction || 'N/A'}]\n`;
        });
      }

      await api.post('/doctor-portal/prescription', {
        appointmentId: activeApt._id,
        patientId: patientProfile._id,
        prescriptionText: compiledRx,
        notes: clinicalNotes || 'Routine consultation'
      });

      toast.success('Prescription & case sheet saved to patient record');
      
      // Reload queue to reflect completed status
      await loadData();
      
      // Keep patient profile visible, update active appointment state
      const updatedApts = data?.appointments.map(a => 
        a._id === activeApt._id ? { ...a, status: 'completed' } : a
      );
      if (updatedApts) {
        setData({ ...data, appointments: updatedApts });
      }
      setActiveApt({ ...activeApt, status: 'completed' });
    } catch (e) {
      toast.error('Failed to save prescription');
    } finally {
      setSaving(false);
    }
  };

  const getPatientCategory = (uid) => {
    if (!uid) return 'Railway Employee (Regular)';
    const code = uid.charCodeAt(uid.length - 1) || 0;
    if (code % 3 === 0) return 'Railway Employee (Regular)';
    if (code % 3 === 1) return 'RELHS Pensioner';
    return 'Employee Dependent';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* ── Top Bar: Railway HMIS Gold/Blue Header ── */}
      <header style={{ 
        background: '#092147', 
        color: '#ffffff', 
        borderBottom: '4px solid #f2a900', 
        padding: '10px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Indian Railways Emblem Text */}
          <div style={{ borderRight: '2px solid rgba(255,255,255,0.2)', paddingRight: 14, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 9, letterSpacing: '0.1em', color: '#f2a900', fontWeight: 'bold' }}>भारत सरकार • रेल मंत्रालय</span>
            <span style={{ fontSize: 10, letterSpacing: '0.05em', color: '#ffffff', fontWeight: 'bold' }}>GOVT. OF INDIA • MINISTRY OF RAILWAYS</span>
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              AHIMSG5 <span style={{ color: '#f2a900', fontWeight: 'normal', fontSize: 14 }}>|</span> Hospital Management Information System (HMIS)
            </h1>
            <p style={{ fontSize: 11, margin: 0, color: 'rgba(255,255,255,0.7)' }}>Integrated OPD Clinical Desk & E-Rx Module</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ffffff' }}>{data?.doctor?.name || 'Medical Officer'}</div>
            <div style={{ fontSize: 11, color: '#f2a900' }}>{data?.doctor?.specialization || 'OPD Department'} - {data?.doctor?.hospital?.name || 'Railway Division'}</div>
          </div>
          <button 
            onClick={logout} 
            style={{ 
              background: '#f2a900', 
              color: '#092147', 
              border: 'none', 
              padding: '8px 16px', 
              borderRadius: 4, 
              fontSize: 12, 
              fontWeight: 'bold', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = '#e09a00'}
            onMouseOut={(e) => e.target.style.background = '#f2a900'}
          >
            <LogOut size={14} /> SIGN OUT
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* ── Left Sidebar: Dense OPD Queue ── */}
        <aside style={{ 
          width: 320, 
          background: '#ffffff', 
          borderRight: '1px solid #c8d6e5', 
          display: 'flex', 
          flexDirection: 'column',
          boxShadow: '2px 0 5px rgba(0,0,0,0.03)'
        }}>
          {/* Sidebar Title */}
          <div style={{ 
            background: '#1d3f72', 
            color: 'white', 
            padding: '12px 16px', 
            fontSize: 13, 
            fontWeight: 'bold',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>TODAY'S OPD QUEUE</span>
            <span style={{ background: '#f2a900', color: '#092147', padding: '2px 6px', borderRadius: 10, fontSize: 10 }}>
              {data?.appointments.length || 0} Patients
            </span>
          </div>

          {/* Queue List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {data?.appointments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: '#8395a7', fontSize: 13 }}>
                No scheduled appointments for today.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data?.appointments.map((apt, idx) => {
                  const isActive = activeApt?._id === apt._id;
                  const category = getPatientCategory(apt.patient.uid);
                  
                  // Status Badge Colors
                  let statusBg = '#e2e8f0';
                  let statusColor = '#475569';
                  if (apt.status === 'confirmed') {
                    statusBg = '#d1fae5';
                    statusColor = '#065f46';
                  } else if (apt.status === 'pending') {
                    statusBg = '#fef3c7';
                    statusColor = '#92400e';
                  } else if (apt.status === 'completed') {
                    statusBg = '#dbeafe';
                    statusColor = '#1e40af';
                  }

                  return (
                    <div 
                      key={apt._id}
                      onClick={() => selectAppointment(apt)}
                      style={{ 
                        padding: '10px 12px', 
                        borderRadius: 4, 
                        cursor: 'pointer', 
                        border: isActive ? '2px solid #1d3f72' : '1px solid #dcdde1',
                        background: isActive ? '#f0f4f8' : '#ffffff',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ 
                            background: '#092147', 
                            color: '#ffffff', 
                            fontSize: 10, 
                            fontWeight: 'bold', 
                            padding: '1px 4px', 
                            borderRadius: 2 
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 'bold', color: '#2c3e50' }}>
                            {apt.patient.firstName} {apt.patient.lastName}
                          </span>
                        </div>
                        <span style={{ 
                          fontSize: 9, 
                          fontWeight: 'bold', 
                          padding: '1px 5px', 
                          borderRadius: 3,
                          textTransform: 'uppercase',
                          background: statusBg,
                          color: statusColor
                        }}>
                          {apt.status === 'pending' ? 'Awaiting Conf' : apt.status}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7f8c8d' }}>
                        <span>Slot: <strong>{apt.timeSlot}</strong></span>
                        <span>UID: {apt.patient.uid.substring(0, 11)}</span>
                      </div>

                      <div style={{ marginTop: 4, borderTop: '1px dashed #e2e8f0', paddingTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#10ac84', fontWeight: 600 }}>{category}</span>
                        {apt.type === 'video' ? (
                          <span style={{ fontSize: 9, color: '#8c7ae6', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Video size={10} /> Video
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: '#7f8c8d', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <MapPin size={10} /> OPD
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Right Content Area ── */}
        <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#092147', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#092147' }}>Fetching patient records...</span>
              </div>
            </div>
          ) : errorState ? (
            /* ── Lock Overlay Screen ── */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: '#fcf8f2' }}>
              <div style={{ 
                maxWidth: 550, 
                background: '#ffffff', 
                border: '1px dashed #f2a900', 
                borderRadius: 8, 
                boxShadow: '0 8px 30px rgba(0,0,0,0.05)',
                overflow: 'hidden'
              }}>
                <div style={{ background: '#f2a900', color: '#092147', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Lock size={24} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 'bold' }}>SECURITY PROTOCOL: CLINICAL DESK LOCK</h3>
                </div>
                
                <div style={{ padding: 28, textAlign: 'center' }}>
                  <div style={{ width: 80, height: 80, background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Lock size={36} color="#d97706" />
                  </div>
                  
                  <h4 style={{ fontSize: 18, color: '#1e293b', marginBottom: 12, fontWeight: 'bold' }}>
                    Patient Records Sealed
                  </h4>

                  {errorState.reason === 'no_appointment' && (
                    <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>
                      Access Denied. You do not have a registered appointment with patient <strong>{activeApt?.patient?.firstName} {activeApt?.patient?.lastName}</strong>.
                    </p>
                  )}

                  {errorState.reason === 'awaiting_confirmation' && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', padding: '14px', borderRadius: 6, marginBottom: 20, textAlign: 'left' }}>
                      <p style={{ fontSize: 13, color: '#b45309', margin: 0, lineHeight: 1.5 }}>
                        <strong>Awaiting Confirmation:</strong> The patient has scheduled an appointment, but it has not been confirmed by the hospital admin desk yet. Patient records unlock immediately upon confirmation.
                      </p>
                    </div>
                  )}

                  {errorState.reason === 'time_restriction' && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: 6, marginBottom: 20, textAlign: 'left' }}>
                      <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5, marginBottom: 8 }}>
                        <strong>Time-Bound Access Control:</strong> Under government healthcare regulations, patient records are locked until exactly <strong>10 minutes</strong> before the scheduled appointment.
                      </p>
                      <p style={{ fontSize: 12, color: '#1e3a8a', margin: 0 }}>
                        • Scheduled Time: <strong>{errorState.scheduledTime}</strong><br />
                        • Access Opens At: <strong>{errorState.opensAt ? new Date(errorState.opensAt).toLocaleTimeString() : '10 minutes prior'}</strong>
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button 
                      onClick={loadData}
                      style={{ 
                        padding: '10px 20px', 
                        background: '#092147', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: 4, 
                        fontSize: 13, 
                        fontWeight: 'bold', 
                        cursor: 'pointer' 
                      }}
                    >
                      Check Status / Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : patientProfile ? (
            <div style={{ padding: '20px 24px' }}>
              
              {/* Patient Banner */}
              <div style={{ 
                background: '#ffffff', 
                border: '1px solid #c8d6e5', 
                borderRadius: 4, 
                padding: '16px', 
                marginBottom: 20,
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: '50%', 
                    background: '#1d3f72', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: 16, 
                    fontWeight: 'bold' 
                  }}>
                    {patientProfile.firstName[0]}{patientProfile.lastName[0]}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 'bold', color: '#092147', margin: '0 0 4px 0' }}>
                      {patientProfile.firstName} {patientProfile.lastName}
                    </h2>
                    <p style={{ fontSize: 12, color: '#57606f', margin: 0 }}>
                      MID: <strong>{patientProfile.uid}</strong> &nbsp;|&nbsp; 
                      Age: <strong>{patientProfile.dateOfBirth ? Math.floor((new Date() - new Date(patientProfile.dateOfBirth)) / 31557600000) : '—'}</strong> &nbsp;|&nbsp; 
                      Gender: <strong>{patientProfile.gender || 'M'}</strong> &nbsp;|&nbsp; 
                      Category: <strong style={{ color: '#10ac84' }}>{getPatientCategory(patientProfile.uid)}</strong>
                    </p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {patientProfile.emergency?.bloodGroup && (
                    <span style={{ 
                      background: '#fff1f2', 
                      color: '#be123c', 
                      border: '1px solid #fecdd3', 
                      padding: '4px 10px', 
                      borderRadius: 4, 
                      fontSize: 11, 
                      fontWeight: 'bold' 
                    }}>
                      BLOOD: {patientProfile.emergency.bloodGroup}
                    </span>
                  )}
                  <span style={{ 
                    background: '#d1fae5', 
                    color: '#065f46', 
                    border: '1px solid #a7f3d0', 
                    padding: '4px 10px', 
                    borderRadius: 4, 
                    fontSize: 11, 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Shield size={12} /> SECURE DECrypted
                  </span>
                </div>
              </div>

              {/* Workspace Navigation Tabs (Railway Clinical Layout) */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 15, background: '#e2e8f0', padding: 2, borderRadius: 4 }}>
                <button 
                  onClick={() => setActiveTab('clinical')}
                  style={{ 
                    flex: 1, 
                    padding: '10px', 
                    border: 'none', 
                    background: activeTab === 'clinical' ? '#1d3f72' : 'transparent',
                    color: activeTab === 'clinical' ? '#ffffff' : '#2c3e50',
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    borderRadius: 3,
                    transition: 'all 0.15s'
                  }}
                >
                  OPD CLINICAL CASE SHEET & VITALS
                </button>
                <button 
                  onClick={() => setActiveTab('prescription')}
                  style={{ 
                    flex: 1, 
                    padding: '10px', 
                    border: 'none', 
                    background: activeTab === 'prescription' ? '#1d3f72' : 'transparent',
                    color: activeTab === 'prescription' ? '#ffffff' : '#2c3e50',
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    borderRadius: 3,
                    transition: 'all 0.15s'
                  }}
                >
                  PRESCRIPTION GRID (CPOE)
                </button>
                <button 
                  onClick={() => setActiveTab('diagnostics')}
                  style={{ 
                    flex: 1, 
                    padding: '10px', 
                    border: 'none', 
                    background: activeTab === 'diagnostics' ? '#1d3f72' : 'transparent',
                    color: activeTab === 'diagnostics' ? '#ffffff' : '#2c3e50',
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    borderRadius: 3,
                    transition: 'all 0.15s'
                  }}
                >
                  DIAGNOSTICS & SCANS ({patientProfile.documents?.filter(d => d.type === 'scan' || d.type === 'lab_report').length || 0})
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  style={{ 
                    flex: 1, 
                    padding: '10px', 
                    border: 'none', 
                    background: activeTab === 'history' ? '#1d3f72' : 'transparent',
                    color: activeTab === 'history' ? '#ffffff' : '#2c3e50',
                    fontSize: 12, 
                    fontWeight: 'bold', 
                    cursor: 'pointer',
                    borderRadius: 3,
                    transition: 'all 0.15s'
                  }}
                >
                  PATIENT EHR TIMELINE
                </button>
              </div>

              {/* Tab Contents */}
              <div style={{ background: '#ffffff', border: '1px solid #c8d6e5', borderRadius: 4, padding: '20px', minHeight: 400 }}>
                
                {/* ── Tab 1: Clinical Desk & Vitals ── */}
                {activeTab === 'clinical' && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 'bold', color: '#092147', borderBottom: '2px solid #1d3f72', paddingBottom: 6, marginBottom: 15 }}>
                      OPD CLINICAL DESK - CASE DETAILS
                    </h3>

                    {/* Vitals Input Grid */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '14px', marginBottom: 20 }}>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: '#1d3f72', display: 'block', marginBottom: 10 }}>RECORD PATIENT VITALS</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Temp (°F)</label>
                          <input 
                            type="text" 
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} 
                            placeholder="e.g. 98.6"
                            value={vitals.temp}
                            onChange={(e) => setVitals({...vitals, temp: e.target.value})}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Blood Pressure</label>
                          <input 
                            type="text" 
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} 
                            placeholder="e.g. 120/80"
                            value={vitals.bp}
                            onChange={(e) => setVitals({...vitals, bp: e.target.value})}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Pulse (bpm)</label>
                          <input 
                            type="text" 
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} 
                            placeholder="e.g. 72"
                            value={vitals.pulse}
                            onChange={(e) => setVitals({...vitals, pulse: e.target.value})}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>SpO2 (%)</label>
                          <input 
                            type="text" 
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} 
                            placeholder="e.g. 98"
                            value={vitals.spo2}
                            onChange={(e) => setVitals({...vitals, spo2: e.target.value})}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Weight (kg)</label>
                          <input 
                            type="text" 
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13 }} 
                            placeholder="e.g. 70"
                            value={vitals.weight}
                            onChange={(e) => setVitals({...vitals, weight: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Chief Complaints / Notes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 'bold', color: '#2c3e50' }}>Chief Complaints & Symptoms / Diagnosis Summary</label>
                      <textarea 
                        style={{ 
                          width: '100%', 
                          height: 180, 
                          padding: '12px', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: 4, 
                          fontSize: 14, 
                          resize: 'vertical',
                          fontFamily: 'inherit'
                        }}
                        placeholder="Enter the patient's complaints, history of illness, clinical examination findings, and diagnosis..."
                        value={clinicalNotes}
                        onChange={(e) => setClinicalNotes(e.target.value)}
                      />
                    </div>

                    <div style={{ marginTop: 20, color: '#7f8c8d', fontSize: 11 }}>
                      💡 Fill in the vitals and notes above, then navigate to the <strong>Prescription Grid</strong> tab to issue medicines.
                    </div>
                  </div>
                )}

                {/* ── Tab 2: Prescription CPOE Grid ── */}
                {activeTab === 'prescription' && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 'bold', color: '#092147', borderBottom: '2px solid #1d3f72', paddingBottom: 6, marginBottom: 15 }}>
                      CPOE DRUG ORDERING & DISPENSING DESK
                    </h3>

                    {/* Table Grid */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#1d3f72', color: '#ffffff' }}>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'center', width: '5%' }}>S.No</th>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'left', width: '35%' }}>Drug Name</th>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'left', width: '20%' }}>Dosage Schedule</th>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'left', width: '15%' }}>Duration (Days)</th>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'left', width: '20%' }}>Instructions</th>
                          <th style={{ border: '1px solid #c8d6e5', padding: '8px', textAlign: 'center', width: '5%' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {medicines.map((m, idx) => (
                          <tr key={idx}>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px' }}>
                              <input 
                                type="text"
                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
                                placeholder="e.g. Metformin 500mg"
                                value={m.name}
                                onChange={(e) => updateMedicine(idx, 'name', e.target.value)}
                              />
                            </td>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px' }}>
                              <select 
                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
                                value={m.dosage}
                                onChange={(e) => updateMedicine(idx, 'dosage', e.target.value)}
                              >
                                <option value="">Select Schedule</option>
                                <option value="1-0-0 (Morning)">1-0-0 (Morning)</option>
                                <option value="0-1-0 (Afternoon)">0-1-0 (Afternoon)</option>
                                <option value="0-0-1 (Night)">0-0-1 (Night)</option>
                                <option value="1-0-1 (Morning & Night)">1-0-1 (Morning & Night)</option>
                                <option value="1-1-1 (Thrice daily)">1-1-1 (Thrice daily)</option>
                                <option value="Once daily (OD)">Once daily (OD)</option>
                                <option value="As required (SOS)">As required (SOS)</option>
                              </select>
                            </td>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px' }}>
                              <input 
                                type="number"
                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
                                placeholder="Duration"
                                value={m.duration}
                                onChange={(e) => updateMedicine(idx, 'duration', e.target.value)}
                              />
                            </td>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px' }}>
                              <input 
                                type="text"
                                style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: 13 }}
                                placeholder="e.g. After food"
                                value={m.instruction}
                                onChange={(e) => updateMedicine(idx, 'instruction', e.target.value)}
                              />
                            </td>
                            <td style={{ border: '1px solid #c8d6e5', padding: '6px', textAlign: 'center' }}>
                              <button 
                                type="button"
                                onClick={() => removeMedicineRow(idx)}
                                style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 4 }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <button 
                      type="button" 
                      onClick={addMedicineRow}
                      style={{ 
                        background: '#1d3f72', 
                        color: 'white', 
                        border: 'none', 
                        padding: '6px 12px', 
                        borderRadius: 4, 
                        fontSize: 12, 
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Plus size={14} /> ADD DRUG ROW
                    </button>

                    {/* Compile Preview & Save Bar */}
                    <div style={{ marginTop: 30, borderTop: '1px solid #e2e8f0', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#7f8c8d' }}>
                        * Saving compiles case sheet, vitals, and medication list into a secure report file automatically linked to patient's MediID DigiLocker.
                      </span>

                      {activeApt.status === 'completed' ? (
                        <div style={{ background: '#dbeafe', color: '#1e40af', padding: '10px 16px', borderRadius: 4, fontSize: 13, fontWeight: 'bold' }}>
                          ✓ CASE CONSULTATION COMPLETED
                        </div>
                      ) : (
                        <button 
                          onClick={handleSavePrescription}
                          disabled={saving}
                          style={{ 
                            background: '#10ac84', 
                            color: 'white', 
                            border: 'none', 
                            padding: '10px 24px', 
                            borderRadius: 4, 
                            fontSize: 13, 
                            fontWeight: 'bold', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                        >
                          <Save size={16} /> {saving ? 'Submitting Case...' : 'SUBMIT CASE & SIGN Rx'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Tab 3: Diagnostics & Scans Viewer ── */}
                {activeTab === 'diagnostics' && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 'bold', color: '#092147', borderBottom: '2px solid #1d3f72', paddingBottom: 6, marginBottom: 15 }}>
                      DIAGNOSTICS & RADIOLOGY LAB VIEWER (MRI / CT / SCANS)
                    </h3>

                    {(!patientProfile.documents || patientProfile.documents.filter(d => d.type === 'scan' || d.type === 'lab_report').length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8395a7' }}>
                        <FileText size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
                        <p style={{ fontSize: 14 }}>No diagnostic reports or scans found on file for this patient.</p>
                        <p style={{ fontSize: 12, color: '#a4b0be' }}>Admins can upload reports in the Hospital Reports module.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 20 }}>
                        {/* Reports List */}
                        <div style={{ width: '40%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {patientProfile.documents
                            .filter(d => d.type === 'scan' || d.type === 'lab_report')
                            .map((doc) => (
                              <div 
                                key={doc._id}
                                onClick={() => setSelectedDoc(doc)}
                                style={{ 
                                  padding: '12px', 
                                  borderRadius: 4, 
                                  border: selectedDoc?._id === doc._id ? '2px solid #1d3f72' : '1px solid #dcdde1',
                                  background: selectedDoc?._id === doc._id ? '#f0f4f8' : '#ffffff',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                              >
                                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#2c3e50', marginBottom: 2 }}>{doc.title}</div>
                                <div style={{ fontSize: 11, color: '#7f8c8d', display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{doc.type === 'scan' ? 'Radiology Scan' : 'Laboratory Report'}</span>
                                  <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            ))}
                        </div>

                        {/* Report Preview Panel */}
                        <div style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 4, background: '#f8fafc', padding: 15, display: 'flex', flexDirection: 'column' }}>
                          {selectedDoc ? (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                              <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 15 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 'bold', color: '#092147', margin: '0 0 4px 0' }}>{selectedDoc.title}</h4>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  Uploaded At: <strong>{new Date(selectedDoc.uploadedAt).toLocaleString()}</strong> &nbsp;|&nbsp; 
                                  Source: <strong>{selectedDoc.hospitalName || 'Railway Diagnostics Center'}</strong>
                                </div>
                              </div>

                              {/* Document content viewer */}
                              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 3, padding: 10, overflow: 'auto', minHeight: 250 }}>
                                {selectedDoc.fileUrl && selectedDoc.fileUrl.startsWith('data:image/') ? (
                                  <img 
                                    src={selectedDoc.fileUrl} 
                                    alt={selectedDoc.title} 
                                    style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', border: '1px solid #eee' }} 
                                  />
                                ) : selectedDoc.fileUrl ? (
                                  <div style={{ textAlign: 'center' }}>
                                    <FileText size={48} color="#1d3f72" style={{ marginBottom: 12 }} />
                                    <p style={{ fontSize: 13, margin: 0 }}>This document is a PDF/Binary file</p>
                                    <a 
                                      href={selectedDoc.fileUrl} 
                                      download={selectedDoc.fileName || 'Report.pdf'}
                                      style={{ display: 'inline-block', marginTop: 12, background: '#1d3f72', color: 'white', textDecoration: 'none', padding: '6px 12px', borderRadius: 3, fontSize: 12, fontWeight: 'bold' }}
                                    >
                                      Download Document
                                    </a>
                                  </div>
                                ) : (
                                  <div style={{ color: '#7f8c8d', fontSize: 13 }}>No viewable file content found on server.</div>
                                )}
                              </div>

                              {selectedDoc.notes && (
                                <div style={{ marginTop: 15, background: '#f1f5f9', borderLeft: '3px solid #1d3f72', padding: 10, fontSize: 12, color: '#334155' }}>
                                  <strong>Radiology/Lab Notes:</strong><br />
                                  {selectedDoc.notes}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, height: 300 }}>
                              Select a diagnostic report from the list to preview details and view scans.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Tab 4: Patient EHR Timeline ── */}
                {activeTab === 'history' && (
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 'bold', color: '#092147', borderBottom: '2px solid #1d3f72', paddingBottom: 6, marginBottom: 15 }}>
                      ELECTRONIC HEALTH RECORD (EHR) HISTORY TIMELINE
                    </h3>

                    {(!patientProfile.medicalHistory || patientProfile.medicalHistory.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8395a7' }}>
                        <ClipboardList size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
                        <p style={{ fontSize: 14 }}>No prior clinical history recorded in the database for this patient.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                        {patientProfile.medicalHistory.map((h, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              background: '#f8fafc', 
                              border: '1px solid #e2e8f0', 
                              borderLeft: '4px solid #1d3f72',
                              borderRadius: 4, 
                              padding: '14px 18px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <h4 style={{ fontSize: 14, fontWeight: 'bold', color: '#2c3e50', margin: 0 }}>
                                {h.diagnosis}
                              </h4>
                              <span style={{ fontSize: 11, color: '#7f8c8d' }}>
                                {new Date(h.date).toLocaleDateString()}
                              </span>
                            </div>
                            <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px 0' }}>
                              Practitioner: <strong>{h.doctor}</strong> &nbsp;|&nbsp; Hospital: <strong>{h.hospital}</strong>
                            </p>
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: 10, borderRadius: 3, fontSize: 13, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                              {h.treatment}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          ) : (
            /* ── Default Desktop View ── */
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8395a7', background: '#f8fafc' }}>
              <div style={{ textAlign: 'center', maxWidth: 450, padding: 20 }}>
                <Clock size={64} style={{ opacity: 0.15, marginBottom: 16 }} />
                <h2 style={{ fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 8 }}>
                  AHIMSG5 Clinical Workbench
                </h2>
                <p style={{ fontSize: 13, margin: 0 }}>
                  Select an active patient token from the OPD queue on the left to begin entering vitals, prescribing drugs, viewing radiology files, and recording the case sheet.
                </p>
              </div>
            </div>
          )}
        </main>

      </div>

      {/* ── Keyframe Animations ── */}
      <style>{`
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </div>
  );
}
