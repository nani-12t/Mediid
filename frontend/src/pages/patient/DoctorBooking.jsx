import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Star, CheckCircle2, Video, Home, 
  ShieldCheck, Clock, Calendar, MessageSquare, ChevronRight, Globe2, BookOpen,
  RefreshCw, AlertCircle
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { hospitalAPI, appointmentAPI } from '../../utils/api';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function DoctorBooking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const queryParams = new URLSearchParams(search);
  const typeParam = queryParams.get('type');

  const [doctor, setDoctor] = useState(null);
  const [hospital, setHospital] = useState(null);
  const [loading, setLoading] = useState(true);

  // Booking state
  const [consultType, setConsultType] = useState(typeParam === 'video' ? 'video' : 'consultation');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState(null);
  const [booking, setBooking] = useState(false);

  // Slot state
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  // Set today as default date
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA');
    setSelectedDate(today);
  }, []);

  useEffect(() => {
    const fetchDoctor = async () => {
      try {
        const { data } = await hospitalAPI.search({});
        let foundDoc = null;
        let foundHosp = null;
        
        for (const h of data) {
          const d = h.doctors?.find(doc => doc._id === id);
          if (d) {
            foundDoc = d;
            foundHosp = h;
            break;
          }
        }

        if (foundDoc) {
          setDoctor(foundDoc);
          setHospital(foundHosp);
        } else {
          toast.error('Doctor not found');
          navigate('/search');
        }
      } catch (err) {
        toast.error('Failed to load doctor details');
      } finally {
        setLoading(false);
      }
    };
    fetchDoctor();
  }, [id, navigate]);

  // Fetch available time slots whenever the date changes
  useEffect(() => {
    if (!selectedDate || !id) return;
    fetchSlots(selectedDate);
  }, [selectedDate, id]);

  const fetchSlots = async (date) => {
    setSlotsLoading(true);
    setSlotsError('');
    setSelectedTime(null);
    try {
      const { data } = await api.get(`/doctor-portal/slots/available?doctorId=${id}&date=${date}`);
      if (data.slots && data.slots.length > 0) {
        setAvailableSlots(data.slots);
      } else {
        setAvailableSlots([]);
        setSlotsError(data.message || 'No slots available for this date.');
      }
    } catch (err) {
      // If no slots configured at all, fall back to empty with message
      setAvailableSlots([]);
      setSlotsError('No appointment slots configured for this date. Please try another day.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleBooking = async () => {
    if (!selectedTime) {
      toast.error('Please select a time slot');
      return;
    }
    
    setBooking(true);
    try {
      await appointmentAPI.create({
        doctor: id,
        hospital: hospital._id,
        appointmentDate: selectedDate,
        timeSlot: selectedTime,
        type: consultType,          // 'video' or 'consultation'
        bookingMethod: 'app'
      });
      
      toast.success('Appointment booked successfully! 🎉');
      navigate('/appointments');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  // Build date options: today + next 13 days
  const dateOptions = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dateOptions.push({
      value: d.toLocaleDateString('en-CA'),
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      dayName: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      dayNum: d.getDate(),
      monthName: d.toLocaleDateString('en-IN', { month: 'short' })
    });
  }

  if (loading) return <PatientLayout title="Loading..."><div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner" /></div></PatientLayout>;
  if (!doctor) return null;

  return (
    <PatientLayout title="Book Appointment">
      <div style={{ maxWidth: 1120, margin: '0 auto' }} className="booking-page-container">
        
        {/* Back Link */}
        <Link to="/search" style={{ 
          display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--teal)', 
          textDecoration: 'none', fontWeight: 700, fontSize: 13, marginBottom: 24, 
          background: 'rgba(0, 180, 160, 0.06)', padding: '6px 14px', borderRadius: 8
        }}>
          <ArrowLeft size={14} /> Back to Doctor Directory
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 28, alignItems: 'start' }} className="booking-grid">
          
          {/* ─── Left Column: Doctor Profile ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Header */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', gap: 28, alignItems: 'center' }} className="doctor-header-row">
                <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg, var(--teal) 0%, var(--navy) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: 'white', fontWeight: 700, flexShrink: 0, boxShadow: '0 4px 14px rgba(0, 180, 160, 0.2)' }}>
                  {doctor.firstName?.[0]}{doctor.lastName?.[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--gray-900)' }}>Dr. {doctor.firstName} {doctor.lastName}</h1>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'hsl(172, 95%, 94%)', padding: '3px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={12} /> Verified
                    </span>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--teal)', marginBottom: 6 }}>{doctor.specialization}</p>
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500 }}>{hospital.name} • {hospital.address?.city}</p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--gray-100)' }} className="stats-row">
                    <div style={{ textAlign: 'center', borderRight: '1px solid var(--gray-100)' }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)' }}>{doctor.experience}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, marginTop: 2 }}>Years Exp</p>
                    </div>
                    <div style={{ textAlign: 'center', borderRight: '1px solid var(--gray-100)' }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)' }}>{doctor.rating?.average || 4.8}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, marginTop: 2 }}>Rating</p>
                    </div>
                    <div style={{ textAlign: 'center', borderRight: '1px solid var(--gray-100)' }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)' }}>{(doctor.rating?.count || 120).toLocaleString()}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, marginTop: 2 }}>Reviews</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)' }}>₹{doctor.consultationFee}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, marginTop: 2 }}>Fee</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={16} color="var(--teal)" /> Clinical Background
              </h3>
              <p style={{ color: 'var(--gray-600)', fontSize: 14, lineHeight: 1.7, marginBottom: 24, fontWeight: 500 }}>
                {doctor.bio || `Dr. ${doctor.firstName} ${doctor.lastName} is a senior clinical specialist in ${doctor.specialization} with years of experience.`}
              </p>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Qualifications</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(doctor.qualifications || ['MBBS', 'MD']).map(q => (
                    <span key={q} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-100)', color: 'var(--gray-700)', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{q}</span>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Spoken Languages</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(doctor.languages || ['English', 'Hindi']).map(l => (
                    <span key={l} style={{ background: 'hsl(172, 95%, 96%)', border: '1px solid hsl(172, 95%, 90%)', color: 'var(--teal-dark)', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe2 size={13} /> {l}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Reviews */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} color="var(--teal)" /> Patient Feedback
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {[
                  { name: 'Suresh R.', date: '2 days ago', initial: 'S', comment: 'Extremely professional. Explained the diagnostic treatment plan clearly.' },
                  { name: 'Meera K.', date: '1 week ago', initial: 'M', comment: 'Great clinic experience. Consultation started right on schedule!' }
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, borderBottom: i === 0 ? '1px solid var(--gray-50)' : 'none', paddingBottom: i === 0 ? '20px' : '0' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'hsl(200, 95%, 60%)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{r.initial}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>{r.name}</p>
                        <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>{r.date}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                        {[1,2,3,4,5].map(s => <Star key={s} size={11} fill="var(--amber)" color="var(--amber)" />)}
                      </div>
                      <p style={{ fontSize: 13.5, color: 'var(--gray-600)', lineHeight: 1.5 }}>{r.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right Column: Booking Widget ─── */}
          <div className="card sticky-booking-card" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', position: 'sticky', top: 100 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 20 }}>Schedule Consultation</h2>
            
            {/* ── Consultation Type Selector ── */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Appointment Type</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button 
                  onClick={() => setConsultType('consultation')}
                  style={{ 
                    flex: 1, padding: '12px', borderRadius: 12, 
                    border: consultType === 'consultation' ? '2px solid var(--teal)' : '1px solid var(--gray-200)', 
                    background: consultType === 'consultation' ? 'hsl(172, 95%, 97%)' : 'var(--gray-50)', 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    gap: 8, fontSize: 13.5, fontWeight: 700, 
                    color: consultType === 'consultation' ? 'var(--teal)' : 'var(--gray-500)'
                  }}
                >
                  <Home size={15} /> In-Clinic
                </button>
                <button 
                  onClick={() => setConsultType('video')}
                  style={{ 
                    flex: 1, padding: '12px', borderRadius: 12, 
                    border: consultType === 'video' ? '2px solid #7c3aed' : '1px solid var(--gray-200)', 
                    background: consultType === 'video' ? 'hsl(262, 95%, 97%)' : 'var(--gray-50)', 
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    gap: 8, fontSize: 13.5, fontWeight: 700, 
                    color: consultType === 'video' ? '#7c3aed' : 'var(--gray-500)'
                  }}
                >
                  <Video size={15} /> Video Call
                </button>
              </div>
              {consultType === 'video' && (
                <div style={{ marginTop: 8, background: 'hsl(262, 95%, 97%)', border: '1px solid hsl(262, 80%, 90%)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#6d28d9', fontWeight: 500 }}>
                  📹 Video consultation — a link will be shared on confirmation
                </div>
              )}
            </div>

            {/* ── Date Picker ── */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Select Date</p>
              <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 4 }}>
                {dateOptions.slice(0, 7).map(opt => (
                  <button key={opt.value} onClick={() => setSelectedDate(opt.value)}
                    style={{
                      minWidth: 52, padding: '10px 6px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'center',
                      background: selectedDate === opt.value ? 'var(--navy)' : 'var(--gray-50)',
                      color: selectedDate === opt.value ? 'white' : 'var(--gray-500)',
                      border: selectedDate === opt.value ? '2px solid var(--navy)' : '1.5px solid var(--gray-200)',
                      flexShrink: 0
                    }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{opt.dayName}</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{opt.dayNum}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>{opt.monthName}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Time Slot Picker ── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Select Time Slot
                </p>
                <button onClick={() => fetchSlots(selectedDate)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {slotsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--gray-400)', fontSize: 13 }}>
                  <div className="spinner" style={{ margin: '0 auto 8px', width: 22, height: 22 }} />
                  Loading slots...
                </div>
              ) : slotsError ? (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>{slotsError}</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {availableSlots.map(slot => {
                    const isSelected = selectedTime === slot.time;
                    const isFull = !slot.available;
                    return (
                      <button
                        key={slot.time}
                        onClick={() => !isFull && setSelectedTime(slot.time)}
                        disabled={isFull}
                        style={{
                          padding: '10px 4px', borderRadius: 10, cursor: isFull ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, textAlign: 'center',
                          border: isSelected ? '2px solid var(--teal)' : isFull ? '1.5px solid #fecaca' : '1.5px solid var(--gray-200)',
                          background: isSelected ? 'hsl(172, 95%, 97%)' : isFull ? '#fef2f2' : 'white',
                          color: isSelected ? 'var(--teal-dark)' : isFull ? '#ef4444' : 'var(--gray-700)',
                          opacity: isFull ? 0.7 : 1
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                          <Clock size={9} /> {slot.time}
                        </div>
                        {isFull && <div style={{ fontSize: 9, marginTop: 2 }}>Full</div>}
                        {!isFull && slot.booked > 0 && <div style={{ fontSize: 9, marginTop: 2, color: '#f59e0b' }}>{slot.booked}/{slot.capacity}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Confirm Button */}
            <button 
              onClick={handleBooking}
              disabled={booking || !selectedTime}
              className="btn btn-primary btn-full" 
              style={{ 
                padding: '14px', fontSize: 15, fontWeight: 700, borderRadius: 12, marginBottom: 20,
                background: !selectedTime ? 'var(--gray-300)' : consultType === 'video' ? '#7c3aed' : 'var(--teal)',
                cursor: !selectedTime ? 'not-allowed' : 'pointer'
              }}
            >
              {booking ? 'Scheduling...' : consultType === 'video' ? '📹 Book Video Consultation' : '✅ Confirm Appointment'}
            </button>

            {/* Consent Badge */}
            <div style={{ background: 'hsl(172, 95%, 96%)', border: '1px solid hsl(172, 95%, 90%)', padding: '14px', borderRadius: 12, display: 'flex', alignItems: 'start', gap: 10 }}>
              <ShieldCheck size={16} color="var(--teal)" style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 11.5, color: 'var(--teal-dark)', fontWeight: 600, lineHeight: 1.45 }}>
                Consent Shared: Your MediID history will decrypt for this doctor only upon appointment confirmation.
              </p>
            </div>
          </div>
        </div>

      </div>
      <style>{`
        @media (max-width: 900px) {
          .booking-grid { grid-template-columns: 1fr !important; }
          .sticky-booking-card { position: relative !important; top: 0 !important; }
        }
        @media (max-width: 600px) {
          .stats-row { grid-template-columns: 1fr 1fr !important; }
          .doctor-header-row { flex-direction: column !important; text-align: center; }
        }
      `}</style>
    </PatientLayout>
  );
}
