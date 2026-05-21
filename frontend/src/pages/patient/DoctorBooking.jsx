import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  ArrowLeft, Star, CheckCircle2, Video, Home, 
  ShieldCheck, Clock, Calendar, MessageSquare, ChevronRight, Globe2, BookOpen
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { hospitalAPI, appointmentAPI } from '../../utils/api';
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
  const [consultType, setConsultType] = useState(typeParam === 'video' ? 'Video' : 'In-Clinic'); // 'In-Clinic' or 'Video'
  const [bookingDate, setBookingDate] = useState('Today'); // 'Today' or 'Tomorrow'
  const [selectedTime, setSelectedTime] = useState(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    const fetch = async () => {
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
    fetch();
  }, [id, navigate]);

  const handleBooking = async () => {
    if (!selectedTime) {
      toast.error('Please select a time slot');
      return;
    }
    
    setBooking(true);
    try {
      const date = new Date();
      if (bookingDate === 'Tomorrow') date.setDate(date.getDate() + 1);
      
      await appointmentAPI.create({
        doctor: id,
        hospital: hospital._id,
        appointmentDate: date.toISOString().split('T')[0],
        timeSlot: selectedTime,
        type: consultType.toLowerCase() === 'video' ? 'teleconsultation' : 'consultation',
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

  if (loading) return <PatientLayout title="Loading..."><div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner" /></div></PatientLayout>;
  if (!doctor) return null;

  return (
    <PatientLayout title="Book Appointment">
      <div style={{ maxWidth: 1120, margin: '0 auto' }} className="booking-page-container">
        
        {/* Back Link */}
        <Link to="/search" style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: 8, 
          color: 'var(--teal)', 
          textDecoration: 'none', 
          fontWeight: 700, 
          fontSize: 13, 
          marginBottom: 24, 
          background: 'rgba(0, 180, 160, 0.06)', 
          padding: '6px 14px', 
          borderRadius: 8,
          transition: 'var(--transition)'
        }} className="back-search-btn">
          <ArrowLeft size={14} /> Back to Doctor Directory
        </Link>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28, alignItems: 'start' }} className="booking-grid">
          
          {/* ─── Left Column: Doctor Profile Details ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Header Profile Card */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <div style={{ display: 'flex', gap: 28, alignItems: 'center' }} className="doctor-header-row">
                <div style={{ 
                  width: 96, 
                  height: 96, 
                  borderRadius: '50%', 
                  background: 'linear-gradient(135deg, var(--teal) 0%, var(--navy) 100%)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: 28, 
                  color: 'white', 
                  fontWeight: 700, 
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(0, 180, 160, 0.2)'
                }}>
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
                      <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', justifyCentent: 'center', gap: 2 }}>
                        {doctor.rating?.average || 4.8}
                      </p>
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

            {/* About Profile Details */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={16} color="var(--teal)" /> Clinical Background
              </h3>
              <p style={{ color: 'var(--gray-600)', fontSize: 14, lineHeight: 1.7, marginBottom: 24, fontWeight: 500 }}>
                {doctor.bio || `Dr. ${doctor.firstName} ${doctor.lastName} is a senior clinical specialist in ${doctor.specialization} with years of experience leading healthcare diagnostics and outpatient consultations. Committed to providing premium, consent-driven medical care.`}
              </p>
              
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Qualifications</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(doctor.qualifications || ['MBBS', 'MD', 'FACC']).map(q => (
                    <span key={q} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-100)', color: 'var(--gray-700)', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>{q}</span>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Spoken Languages</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(doctor.languages || ['English', 'Hindi', 'Tamil']).map(l => (
                    <span key={l} style={{ background: 'hsl(172, 95%, 96%)', border: '1px solid hsl(172, 95%, 90%)', color: 'var(--teal-dark)', padding: '6px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe2 size={13} /> {l}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Patient Feedback Reviews */}
            <div className="card" style={{ padding: '36px', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={16} color="var(--teal)" /> Patient Disclosures & Feedback
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {[
                  { name: 'Suresh R.', date: '2 days ago', initial: 'S', comment: 'Extremely professional clinical specialist. Explained the diagnostic treatment plan clearly and took time to address my concerns.' },
                  { name: 'Meera K.', date: '1 week ago', initial: 'M', comment: 'Great clinic experience. Consultation started right on schedule and the HIMS dashboard QR integration made record sharing instant!' }
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 16, borderBottom: i === 0 ? '1px solid var(--gray-50)' : 'none', paddingBottom: i === 0 ? '20px' : '0' }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'hsl(200, 95%, 60%)', color: 'white', display: 'flex', alignItems: 'center', justifyCentent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0, boxShadow: '0 2px 8px rgba(56, 189, 248, 0.2)' }}>
                      {r.initial}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>{r.name}</p>
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 500 }}>{r.date}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                        {[1,2,3,4,5].map(s => <Star key={s} size={11} fill="var(--amber)" color="var(--amber)" />)}
                      </div>
                      <p style={{ fontSize: 13.5, color: 'var(--gray-600)', lineHeight: 1.5, fontWeight: 500 }}>{r.comment}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right Column: Sticky Booking Widget ─── */}
          <div className="card sticky-booking-card" style={{ padding: '28px', borderRadius: 'var(--radius-lg)', position: 'sticky', top: 100 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 20 }}>Schedule Consultation</h2>
            
            {/* Consultation Type Selector */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              <button 
                onClick={() => setConsultType('In-Clinic')}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: 12, 
                  border: consultType === 'In-Clinic' ? '2px solid var(--teal)' : '1px solid var(--gray-200)', 
                  background: consultType === 'In-Clinic' ? 'white' : 'var(--gray-50)', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 8, 
                  fontSize: 13.5, 
                  fontWeight: 700, 
                  color: consultType === 'In-Clinic' ? 'var(--teal)' : 'var(--gray-500)',
                  transition: 'var(--transition)'
                }}
                className="consult-toggle-btn"
              >
                <Home size={15} /> In-Clinic
              </button>
              <button 
                onClick={() => setConsultType('Video')}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  borderRadius: 12, 
                  border: consultType === 'Video' ? '2px solid var(--teal)' : '1px solid var(--gray-200)', 
                  background: consultType === 'Video' ? 'white' : 'var(--gray-50)', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 8, 
                  fontSize: 13.5, 
                  fontWeight: 700, 
                  color: consultType === 'Video' ? 'var(--teal)' : 'var(--gray-500)',
                  transition: 'var(--transition)'
                }}
                className="consult-toggle-btn"
              >
                <Video size={15} /> Video Call
              </button>
            </div>

            {/* Date Slide Selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'var(--gray-50)', padding: 5, borderRadius: 12, border: '1px solid var(--gray-100)' }}>
              <button 
                onClick={() => setBookingDate('Today')}
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  borderRadius: 10, 
                  border: 'none', 
                  background: bookingDate === 'Today' ? 'var(--navy)' : 'transparent', 
                  color: bookingDate === 'Today' ? 'white' : 'var(--gray-500)', 
                  cursor: 'pointer', 
                  fontSize: 13.5, 
                  fontWeight: 700,
                  transition: 'var(--transition)'
                }}
              >
                Today
              </button>
              <button 
                onClick={() => setBookingDate('Tomorrow')}
                style={{ 
                  flex: 1, 
                  padding: '10px', 
                  borderRadius: 10, 
                  border: 'none', 
                  background: bookingDate === 'Tomorrow' ? 'var(--navy)' : 'transparent', 
                  color: bookingDate === 'Tomorrow' ? 'white' : 'var(--gray-500)', 
                  cursor: 'pointer', 
                  fontSize: 13.5, 
                  fontWeight: 700,
                  transition: 'var(--transition)'
                }}
              >
                Tomorrow
              </button>
            </div>

            {/* Time Slot Picker Grid */}
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Select Session Time</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {['10:00 AM', '11:30 AM', '02:00 PM'].map(time => {
                  const isSelected = selectedTime === time;
                  return (
                    <button 
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      style={{ 
                        padding: '12px 6px', 
                        borderRadius: 10, 
                        border: isSelected ? '2px solid var(--teal)' : '1.5px solid var(--gray-200)', 
                        background: isSelected ? 'hsl(172, 95%, 97%)' : 'white', 
                        color: isSelected ? 'var(--teal-dark)' : 'var(--gray-700)', 
                        cursor: 'pointer', 
                        fontSize: 12, 
                        fontWeight: 700,
                        transition: 'var(--transition)'
                      }}
                      className="time-slot-btn"
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confirm Consultation Button */}
            <button 
              onClick={handleBooking}
              disabled={booking}
              className="btn btn-primary btn-full" 
              style={{ padding: '14px', fontSize: 15, fontWeight: 700, borderRadius: 12, marginBottom: 20 }}
            >
              {booking ? 'Scheduling...' : 'Proceed to Confirm'}
            </button>

            {/* Secure Sharing Disclaimer Badge */}
            <div style={{ 
              background: 'hsl(172, 95%, 96%)', 
              border: '1px solid hsl(172, 95%, 90%)', 
              padding: '14px', 
              borderRadius: 12, 
              display: 'flex', 
              alignItems: 'start', 
              gap: 10 
            }}>
              <ShieldCheck size={16} color="var(--teal)" style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 11.5, color: 'var(--teal-dark)', fontWeight: 600, lineHeight: 1.45 }}>
                Consent Shared: Your MediID history will decrypt for this doctor only upon appointment confirmation.
              </p>
            </div>
          </div>
        </div>

      </div>
      <style>{`
        .back-search-btn:hover {
          background: rgba(0, 180, 160, 0.12) !important;
          transform: translateY(-1px);
        }
        .consult-toggle-btn:hover {
          border-color: var(--teal) !important;
          color: var(--teal) !important;
        }
        .time-slot-btn:hover {
          border-color: var(--teal) !important;
          background: hsl(172, 95%, 99%) !important;
        }
        @media (max-width: 900px) {
          .booking-grid {
            grid-template-columns: 1fr !important;
          }
          .sticky-booking-card {
            position: relative !important;
            top: 0 !important;
          }
        }
        @media (max-width: 600px) {
          .stats-row {
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }
          .stats-row > div {
            border-right: none !important;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--gray-50);
          }
          .stats-row > div:last-child {
            border-bottom: none !important;
          }
          .doctor-header-row {
            flex-direction: column !important;
            text-align: center;
          }
        }
      `}</style>
    </PatientLayout>
  );
}
