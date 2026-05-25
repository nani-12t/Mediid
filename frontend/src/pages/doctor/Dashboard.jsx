import React, { useState, useEffect } from 'react';
import { 
  Users, Clock, CheckCircle, Search, FileText, Activity, 
  Shield, LogOut, Star, Pill, Heart, Thermometer, Upload, 
  Printer, Share2, Save, AlertTriangle, ChevronRight, X, Edit2, 
  Video, MapPin, ClipboardList, Droplets, Lock, Plus, Trash2, Eye,
  Calendar, RefreshCw, Database
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

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

  // ── Slot Manager state ──────────────────────────────────
  const [showSlotManager, setShowSlotManager] = useState(false);
  const [mySlots, setMySlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotForm, setSlotForm] = useState({
    scheduleType: 'day',       // 'date' | 'day'
    date: '',                  // for scheduleType=date
    day: 'Monday',             // for scheduleType=day
    startTime: '09:00',        // used for auto-generation
    endTime: '13:00',
    slotDurationMin: 15,       // minutes per slot
    maxBookings: 1,            // patients per slot
    manualSlots: [],           // manual override list
    useManual: false           // if true, show manual entry instead of auto-gen
  });
  const [generatedSlots, setGeneratedSlots] = useState([]);
  const [savingSlot, setSavingSlot] = useState(false);

  const [showMarketplace, setShowMarketplace] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [reqsLoading, setReqsLoading] = useState(false);

  const loadMarketplace = async () => {
    setReqsLoading(true);
    try {
      const { data } = await api.get('/marketplace/requirements');
      setRequirements(data);
    } catch (err) {
      toast.error('Failed to load marketplace requirements');
    } finally {
      setReqsLoading(false);
    }
  };

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

  useEffect(() => {
    if (!data?.doctor?._id) return;

    const socketUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const baseSocketUrl = socketUrl.replace(/\/api$/, '').replace(/\/$/, '');
    const socket = io(baseSocketUrl);

    socket.on('connect', () => {
      console.log('Connected to socket server');
      socket.emit('join', data.doctor._id.toString());
    });

    socket.on('appointment_confirmed', (payload) => {
      if (payload.doctorId === data.doctor._id.toString()) {
        toast.success(`Appointment confirmed: ${payload.patientName} for slot ${payload.timeSlot}`);
        loadData();
      }
    });

    socket.on('patient_checked_in', (payload) => {
      if (payload.doctorId === data.doctor._id.toString()) {
        toast.success(`Patient checked in: ${payload.patientName}`);
        loadData();
      }
    });

    socket.on('doctor_notification', (payload) => {
      toast.info(payload.message);
      loadData();
    });

    return () => {
      socket.disconnect();
    };
  }, [data?.doctor?._id]);

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
    if (!uid) return 'Regular Patient';
    const code = uid.charCodeAt(uid.length - 1) || 0;
    if (code % 3 === 0) return 'Regular Patient';
    if (code % 3 === 1) return 'Pensioner';
    return 'Dependent';
  };

  // ── Slot Manager helpers ────────────────────────────────
  const loadMySlots = async () => {
    setSlotsLoading(true);
    try {
      const { data } = await api.get('/doctor-portal/slots');
      setMySlots(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Failed to load slot schedules');
    } finally {
      setSlotsLoading(false);
    }
  };

  // Auto-generate time slots from startTime → endTime with a given interval
  const generateTimeSlotsAuto = (start, end, durationMin) => {
    const slots = [];
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let cur = sh * 60 + sm;
    const endMins = eh * 60 + em;
    while (cur + durationMin <= endMins) {
      const h = Math.floor(cur / 60);
      const m = cur % 60;
      const ampm = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      slots.push(`${h12}:${m.toString().padStart(2,'0')} ${ampm}`);
      cur += durationMin;
    }
    return slots;
  };

  const handleGenerateSlots = () => {
    const slots = generateTimeSlotsAuto(slotForm.startTime, slotForm.endTime, Number(slotForm.slotDurationMin));
    setGeneratedSlots(slots);
    toast.success(`${slots.length} slots generated`);
  };

  const handleRemoveGeneratedSlot = (idx) => {
    setGeneratedSlots(g => g.filter((_, i) => i !== idx));
  };

  const handleSaveSlotSchedule = async () => {
    const finalSlots = slotForm.useManual ? slotForm.manualSlots.filter(s => s.trim()) : generatedSlots;
    if (!finalSlots.length) return toast.error('Please generate or add at least one time slot');
    if (slotForm.scheduleType === 'date' && !slotForm.date) return toast.error('Please pick a date');

    setSavingSlot(true);
    try {
      await api.post('/doctor-portal/slots', {
        scheduleType: slotForm.scheduleType,
        date: slotForm.scheduleType === 'date' ? slotForm.date : undefined,
        day:  slotForm.scheduleType === 'day'  ? slotForm.day  : undefined,
        timeSlots: finalSlots,
        maxBookings: Number(slotForm.maxBookings)
      });
      toast.success('Slot schedule saved!');
      setGeneratedSlots([]);
      setSlotForm(f => ({ ...f, date: '', useManual: false, manualSlots: [] }));
      loadMySlots();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save slot schedule');
    } finally {
      setSavingSlot(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    if (!window.confirm('Delete this slot schedule?')) return;
    try {
      await api.delete(`/doctor-portal/slots/${slotId}`);
      toast.success('Slot schedule removed');
      setMySlots(s => s.filter(sl => sl._id !== slotId));
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  const handleToggleSlot = async (slot) => {
    try {
      await api.put(`/doctor-portal/slots/${slot._id}`, { isActive: !slot.isActive });
      setMySlots(s => s.map(sl => sl._id === slot._id ? { ...sl, isActive: !sl.isActive } : sl));
    } catch (e) {
      toast.error('Failed to update');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      
      {/* ── Top Bar: Generic Blue Header ── */}
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
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#ffffff', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              Hospital Management Information System (HMIS)
            </h1>
            <p style={{ fontSize: 11, margin: 0, color: 'rgba(255,255,255,0.7)' }}>Integrated OP Clinical Desk</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#ffffff' }}>{data?.doctor?.name || 'Medical Officer'}</div>
            <div style={{ fontSize: 11, color: '#f2a900' }}>{data?.doctor?.specialization || 'General Practitioner'} - {data?.doctor?.hospital?.name || 'Clinic'}</div>
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

          {/* ── Queue List ── */}
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
                        {(apt.type === 'video' || apt.type === 'teleconsultation') ? (
                          <span style={{ 
                            fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 3,
                            background: '#ede9fe', color: '#7c3aed', padding: '2px 7px', borderRadius: 4,
                            border: '1px solid #c4b5fd'
                          }}>
                            <Video size={10} /> VIDEO CALL
                          </span>
                        ) : (
                          <span style={{ 
                            fontSize: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 3,
                            background: '#e0f2fe', color: '#0369a1', padding: '2px 7px', borderRadius: 4,
                            border: '1px solid #bae6fd'
                          }}>
                            <MapPin size={10} /> IN-PERSON
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Sidebar Actions (bottom of sidebar) ── */}
          <div style={{ borderTop: '1px solid #c8d6e5', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => { setShowSlotManager(true); loadMySlots(); }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'linear-gradient(135deg, #1d3f72, #2563aa)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: '0.02em',
                boxShadow: '0 2px 6px rgba(29,63,114,0.3)',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.88'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              <Calendar size={14} /> MANAGE APPOINTMENT SLOTS
            </button>
            <button
              onClick={() => { setShowMarketplace(true); loadMarketplace(); }}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'linear-gradient(135deg, #0f766e, #0d9488)',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: '0.02em',
                boxShadow: '0 2px 6px rgba(13,148,136,0.3)',
                transition: 'opacity 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.88'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              <Database size={14} /> RESEARCH CAMPAIGNS
            </button>
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
                  {activeApt && (activeApt.status === 'confirmed' || activeApt.status === 'CONFIRMED') && (
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/appointments/${activeApt._id}/check-in`);
                          toast.success('Patient checked in successfully');
                          await loadData();
                          setActiveApt({ ...activeApt, status: 'checked_in' });
                        } catch (err) {
                          toast.error('Failed to check in patient');
                        }
                      }}
                      style={{
                        background: '#1d3f72',
                        color: 'white',
                        border: 'none',
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'background 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.background = '#152e54'}
                      onMouseOut={(e) => e.target.style.background = '#1d3f72'}
                    >
                      Check In Patient
                    </button>
                  )}
                </div>
              </div>

              {/* Workspace Navigation Tabs */}
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
                                  Source: <strong>{selectedDoc.hospitalName || 'Diagnostics Center'}</strong>
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
                  Clinical Workbench
                </h2>
                <p style={{ fontSize: 13, margin: 0 }}>
                  Select an active patient token from the OPD queue on the left to begin entering vitals, prescribing drugs, viewing radiology files, and recording the case sheet.
                </p>
              </div>
            </div>
          )}
        </main>

      </div>

      {/* ═══════════════════════════════════════════════════
          SLOT MANAGER MODAL
      ═══════════════════════════════════════════════════ */}
      {showSlotManager && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9,33,71,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)', padding: 20
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 10, width: '100%', maxWidth: 920,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#092147', color: 'white', padding: '16px 24px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '4px solid #f2a900'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Calendar size={20} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 'bold' }}>Appointment Slot Manager</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Configure available time slots for patient bookings</div>
                </div>
              </div>
              <button onClick={() => setShowSlotManager(false)}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <X size={16} /> Close
              </button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* ── Left: Create new schedule ── */}
              <div style={{ width: 420, borderRight: '1px solid #e2e8f0', overflowY: 'auto', padding: 24 }}>
                <h3 style={{ fontSize: 13, fontWeight: 'bold', color: '#1d3f72', borderBottom: '2px solid #1d3f72', paddingBottom: 6, marginBottom: 16 }}>
                  CREATE NEW SLOT SCHEDULE
                </h3>

                {/* Schedule Type toggle */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: 6 }}>SCHEDULE TYPE</label>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1.5px solid #cbd5e1' }}>
                    {['date','day'].map(t => (
                      <button key={t} onClick={() => setSlotForm(f => ({ ...f, scheduleType: t }))}
                        style={{
                          flex: 1, padding: '9px 0', border: 'none', fontSize: 12, fontWeight: 'bold', cursor: 'pointer',
                          background: slotForm.scheduleType === t ? '#1d3f72' : '#f8fafc',
                          color: slotForm.scheduleType === t ? 'white' : '#64748b',
                          transition: 'all 0.15s'
                        }}>
                        {t === 'date' ? '📅 Specific Date' : '📆 Recurring Day'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date or Day picker */}
                {slotForm.scheduleType === 'date' ? (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: 6 }}>SELECT DATE</label>
                    <input type="date" value={slotForm.date}
                      min={new Date().toLocaleDateString('en-CA')}
                      onChange={e => setSlotForm(f => ({ ...f, date: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                    />
                  </div>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: 6 }}>DAY OF WEEK</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                        <button key={d} onClick={() => setSlotForm(f => ({ ...f, day: d }))}
                          style={{
                            padding: '6px 10px', border: '1.5px solid', borderRadius: 20, fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
                            borderColor: slotForm.day === d ? '#1d3f72' : '#cbd5e1',
                            background: slotForm.day === d ? '#1d3f72' : 'white',
                            color: slotForm.day === d ? 'white' : '#475569',
                            transition: 'all 0.15s'
                          }}>
                          {d.substring(0,3)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Max bookings per slot */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: 6 }}>MAX PATIENTS PER SLOT</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="number" min="1" max="20" value={slotForm.maxBookings}
                      onChange={e => setSlotForm(f => ({ ...f, maxBookings: e.target.value }))}
                      style={{ width: 80, padding: '8px 10px', border: '1.5px solid #cbd5e1', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: 12, color: '#64748b' }}>patient(s) per time slot</span>
                  </div>
                </div>

                {/* Slot generation mode toggle */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569' }}>SLOT TIMINGS</label>
                    <button onClick={() => setSlotForm(f => ({ ...f, useManual: !f.useManual }))}
                      style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #94a3b8', background: slotForm.useManual ? '#f1f5f9' : 'white', cursor: 'pointer', color: '#475569' }}>
                      {slotForm.useManual ? '⚡ Switch to Auto-Gen' : '✏️ Manual Entry'}
                    </button>
                  </div>

                  {!slotForm.useManual ? (
                    /* Auto-generation form */
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Start Time</label>
                          <input type="time" value={slotForm.startTime}
                            onChange={e => setSlotForm(f => ({ ...f, startTime: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>End Time</label>
                          <input type="time" value={slotForm.endTime}
                            onChange={e => setSlotForm(f => ({ ...f, endTime: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 10, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Duration (min)</label>
                          <select value={slotForm.slotDurationMin}
                            onChange={e => setSlotForm(f => ({ ...f, slotDurationMin: e.target.value }))}
                            style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}>
                            {[5,10,15,20,30,45,60].map(d => <option key={d} value={d}>{d} min</option>)}
                          </select>
                        </div>
                      </div>
                      <button onClick={handleGenerateSlots}
                        style={{ width: '100%', padding: '8px', background: '#0f766e', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}>
                        ⚡ Generate {Math.floor((Number(slotForm.endTime.split(':')[0])*60+Number(slotForm.endTime.split(':')[1]) - (Number(slotForm.startTime.split(':')[0])*60+Number(slotForm.startTime.split(':')[1]))) / Number(slotForm.slotDurationMin))} Slots
                      </button>
                    </div>
                  ) : (
                    /* Manual entry */
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {(slotForm.manualSlots.length ? slotForm.manualSlots : ['']).map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 4 }}>
                            <input type="time"
                              value={s ? (() => { const [t,a] = s.split(' '); const [h,m] = t.split(':'); const hh = a==='PM'&&h!=='12'?String(+h+12):a==='AM'&&h==='12'?'00':h.padStart(2,'0'); return `${hh}:${m}`; })() : ''}
                              onChange={e => {
                                const [h,m] = e.target.value.split(':');
                                const hNum = parseInt(h); const ampm = hNum<12?'AM':'PM'; const h12 = hNum===0?12:hNum>12?hNum-12:hNum;
                                const label = `${h12}:${m} ${ampm}`;
                                const updated = [...slotForm.manualSlots]; updated[i] = label;
                                setSlotForm(f => ({ ...f, manualSlots: updated }));
                              }}
                              style={{ padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}
                            />
                            <button onClick={() => setSlotForm(f => ({ ...f, manualSlots: f.manualSlots.filter((_,j) => j!==i) }))}
                              style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', padding: '0 6px', color: '#dc2626' }}>
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setSlotForm(f => ({ ...f, manualSlots: [...f.manualSlots, ''] }))}
                        style={{ fontSize: 12, padding: '6px 12px', border: '1.5px dashed #94a3b8', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#475569' }}>
                        + Add Time Slot
                      </button>
                    </div>
                  )}
                </div>

                {/* Generated slots preview */}
                {!slotForm.useManual && generatedSlots.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#475569', marginBottom: 8 }}>
                      GENERATED SLOTS ({generatedSlots.length}) — click × to remove individual slots:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {generatedSlots.map((s, i) => (
                        <span key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          background: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 'bold',
                          padding: '4px 8px', borderRadius: 4, border: '1px solid #93c5fd'
                        }}>
                          <Clock size={10} /> {s}
                          <button onClick={() => handleRemoveGeneratedSlot(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', padding: 0, lineHeight: 1 }}>
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Save button */}
                <button onClick={handleSaveSlotSchedule} disabled={savingSlot}
                  style={{
                    width: '100%', padding: '11px 0', background: savingSlot ? '#94a3b8' : '#092147',
                    color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 'bold',
                    cursor: savingSlot ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  {savingSlot ? 'Saving...' : <><Save size={14} /> Save Schedule</>}
                </button>
              </div>

              {/* ── Right: Existing slot schedules ── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 'bold', color: '#1d3f72', borderBottom: '2px solid #1d3f72', paddingBottom: 6, margin: 0 }}>
                    MY SLOT SCHEDULES
                  </h3>
                  <button onClick={loadMySlots} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                    <RefreshCw size={14} />
                  </button>
                </div>

                {slotsLoading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading schedules...</div>
                ) : mySlots.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, border: '1px dashed #e2e8f0', borderRadius: 8, color: '#94a3b8' }}>
                    <Calendar size={36} color="#cbd5e1" style={{ marginBottom: 8 }} />
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>No slot schedules yet</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Create your first schedule on the left →</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {mySlots.map(slot => (
                      <div key={slot._id} style={{
                        border: `1.5px solid ${slot.isActive ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: 8, padding: 16, background: slot.isActive ? '#f0f9ff' : '#f8fafc',
                        opacity: slot.isActive ? 1 : 0.6, transition: 'all 0.2s'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                background: slot.scheduleType === 'date' ? '#fef3c7' : '#dbeafe',
                                color: slot.scheduleType === 'date' ? '#92400e' : '#1e40af',
                                fontSize: 10, fontWeight: 'bold', padding: '2px 7px', borderRadius: 3
                              }}>
                                {slot.scheduleType === 'date' ? '📅 ONE-TIME' : '🔁 RECURRING'}
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#1e293b' }}>
                                {slot.scheduleType === 'date' ? new Date(slot.date).toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' }) : slot.day}
                              </span>
                              {!slot.isActive && (
                                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '2px 6px', borderRadius: 3, fontWeight: 'bold' }}>PAUSED</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              {slot.timeSlots.length} slots &nbsp;·&nbsp; Max {slot.maxBookings} patient{slot.maxBookings > 1 ? 's' : ''}/slot
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => handleToggleSlot(slot)} title={slot.isActive ? 'Pause schedule' : 'Activate schedule'}
                              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 'bold',
                                borderColor: slot.isActive ? '#fca5a5' : '#86efac',
                                background: slot.isActive ? '#fef2f2' : '#f0fdf4',
                                color: slot.isActive ? '#dc2626' : '#16a34a' }}>
                              {slot.isActive ? 'Pause' : 'Activate'}
                            </button>
                            <button onClick={() => handleDeleteSlot(slot._id)} title="Delete schedule"
                              style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Slots grid */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {slot.timeSlots.map((t, i) => (
                            <span key={i} style={{
                              background: '#ffffff', border: '1px solid #bfdbfe',
                              color: '#1e40af', fontSize: 11, fontWeight: 600,
                              padding: '3px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4
                            }}>
                              <Clock size={9} /> {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          DATA MARKETPLACE CAMPAIGNS MODAL
      ═══════════════════════════════════════════════════ */}
      {showMarketplace && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(9,33,71,0.55)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)', padding: 20
        }}>
          <div style={{
            background: '#ffffff', borderRadius: 10, width: '100%', maxWidth: 720,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#092147', color: 'white', padding: '16px 24px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '4px solid #f2a900'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={20} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 'bold' }}>Research Data Marketplace</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>View active data campaigns and coordinate cohort submissions</div>
                </div>
              </div>
              <button onClick={() => setShowMarketplace(false)}
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <X size={16} /> Close
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, background: '#f8fafc' }}>
              {reqsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
              ) : requirements.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                  <Database size={40} style={{ margin: '0 auto 12px', opacity: 0.3, color: '#092147' }} />
                  <p style={{ fontWeight: 600, fontSize: 14 }}>No Active Campaigns</p>
                  <p style={{ fontSize: 12 }}>There are no active data collection campaigns currently available.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {requirements.map(req => (
                    <div key={req._id} style={{ 
                      background: 'white', 
                      borderRadius: 8, 
                      padding: 16, 
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 'bold', color: '#1e293b' }}>{req.title}</h4>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Target: {req.amount} • Posted by {req.buyer.companyName}</span>
                        </div>
                        <span style={{ fontSize: 10, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 12, fontWeight: 'bold' }}>Active</span>
                      </div>

                      <p style={{ margin: 0, fontSize: 12, color: '#475569', lineHeight: 1.5, background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                        {req.description}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {req.requiredDocs?.map(docId => (
                            <span key={docId} style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>
                              {docId.replace(/([A-Z])/g, ' $1').trim()}
                            </span>
                          ))}
                        </div>
                        
                        <button
                          onClick={async () => {
                            const loadingToast = toast.loading('Connecting with buyer...');
                            try {
                              await api.post('/marketplace/messages', {
                                receiverId: req.buyer.user,
                                requirementId: req._id,
                                content: `Hi! I am Dr. ${data?.doctor?.name || 'attending consultant'}. I am interested in your data campaign for "${req.title}" and would like to discuss submitting clinical datasets.`
                              });
                              toast.success('Connected! Redirecting to chat...', { id: loadingToast });
                              setShowMarketplace(false);
                              navigate('/messages', { state: { targetUserId: req.buyer.user }});
                            } catch (err) {
                              toast.error('Failed to establish contact', { id: loadingToast });
                            }
                          }}
                          style={{
                            background: '#1d3f72',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          Connect & Chat <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Keyframe Animations ── */}
      <style>{`
        @keyframes spin { 
          to { transform: rotate(360deg); } 
        }
      `}</style>
    </div>
  );
}
