import React, { useState, useEffect } from 'react';
import { Search, Star, MapPin, Clock, Users, ChevronDown, ChevronUp, Phone, Calendar } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { hospitalAPI, doctorAPI, appointmentAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const SPECIALIZATIONS = ['All', 'Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Oncology', 'Dermatology', 'General Medicine', 'Gynecology', 'Psychiatry', 'ENT'];

// Sample fallback data
const SAMPLE_HOSPITALS = [
  { _id: 's1', name: 'Apollo Hospitals', address: { city: 'Chennai' }, rating: { average: 4.8, count: 12400 }, specialties: ['Cardiology', 'Oncology', 'Neurology', 'Transplant'], facilities: ['24/7 Emergency', 'ICU', 'NICU', 'Blood Bank', 'Pharmacy'], type: 'private', operatingHours: { is24x7: true }, doctors: [
    { _id: 'd1', firstName: 'Rajesh', lastName: 'Kumar', specialization: 'Cardiology', qualifications: ['MBBS', 'MD', 'DM'], experience: 18, rating: { average: 4.9 }, consultationFee: 800, status: 'available', expertise: ['Angioplasty', 'Heart Surgery', 'Echocardiography'] },
    { _id: 'd2', firstName: 'Priya', lastName: 'Venkat', specialization: 'Neurology', qualifications: ['MBBS', 'MD', 'DNB'], experience: 12, rating: { average: 4.7 }, consultationFee: 700, status: 'available', expertise: ['Epilepsy', 'Stroke', 'Migraine'] }
  ]},
  { _id: 's2', name: 'AIIMS Delhi', address: { city: 'New Delhi' }, rating: { average: 4.9, count: 28000 }, specialties: ['All Specialties'], facilities: ['Emergency', 'ICU', 'Trauma Center', 'Teaching Hospital'], type: 'government', operatingHours: { is24x7: true }, doctors: [
    { _id: 'd3', firstName: 'Anita', lastName: 'Singh', specialization: 'General Medicine', qualifications: ['MBBS', 'MD'], experience: 22, rating: { average: 4.8 }, consultationFee: 200, status: 'available', expertise: ['Internal Medicine', 'Diabetes', 'Thyroid'] }
  ]},
  { _id: 's3', name: 'Fortis Memorial', address: { city: 'Gurugram' }, rating: { average: 4.7, count: 9800 }, specialties: ['Orthopedics', 'Spine', 'Robotic Surgery'], facilities: ['ICU', 'Robotic OT', 'Physiotherapy'], type: 'private', operatingHours: { is24x7: false }, doctors: [
    { _id: 'd4', firstName: 'Sanjay', lastName: 'Mehta', specialization: 'Orthopedics', qualifications: ['MBBS', 'MS Ortho', 'Fellowship'], experience: 16, rating: { average: 4.8 }, consultationFee: 600, status: 'available', expertise: ['Knee Replacement', 'Spine Surgery', 'Sports Medicine'] }
  ]},
];

export default function SearchHospitals() {
  const { profile } = useAuth();
  const [hospitals, setHospitals] = useState(SAMPLE_HOSPITALS);
  const [search, setSearch] = useState('');
  const [specFilter, setSpecFilter] = useState('All');
  const [expanded, setExpanded] = useState(null);
  const [bookingDoc, setBookingDoc] = useState(null);
  const [bookingHospital, setBookingHospital] = useState(null);
  const [bookForm, setBookForm] = useState({ appointmentDate: '', timeSlot: '', symptoms: '', bookingMethod: 'app', contactPhone: '' });
  const [loading, setLoading] = useState(false);

  const filtered = hospitals.filter(h => {
    const matchSearch = !search || h.name.toLowerCase().includes(search.toLowerCase()) || h.address?.city?.toLowerCase().includes(search.toLowerCase());
    const matchSpec = specFilter === 'All' || h.specialties?.some(s => s.toLowerCase().includes(specFilter.toLowerCase())) || h.doctors?.some(d => d.specialization === specFilter);
    return matchSearch && matchSpec;
  });

  const handleBook = async () => {
    if (!bookForm.appointmentDate) { toast.error('Please select a date'); return; }
    if (['phone', 'whatsapp', 'sms'].includes(bookForm.bookingMethod) && !bookForm.contactPhone) { toast.error('Please enter your phone number'); return; }
    setLoading(true);
    try {
      await appointmentAPI.create({ doctor: bookingDoc._id, hospital: bookingHospital._id, appointmentDate: bookForm.appointmentDate, timeSlot: bookForm.timeSlot, symptoms: bookForm.symptoms, bookingMethod: bookForm.bookingMethod, contactPhone: bookForm.contactPhone, type: 'consultation' });
      toast.success('Appointment request sent! Hospital will confirm shortly. 🎉');
      setBookingDoc(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PatientLayout title="Find Doctors & Hospitals">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>Find Hospitals & Doctors</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Search by hospital, specialization, or doctor name</p>
      </div>

      {/* Search + Filter */}
      <div className="search-bar" style={{ marginBottom: 16 }}>
        <Search size={20} color="var(--gray-400)" />
        <input placeholder="Search hospitals, doctors, specializations..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {SPECIALIZATIONS.map(s => (
          <button key={s} onClick={() => setSpecFilter(s)}
            style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${specFilter === s ? 'var(--teal)' : 'var(--gray-200)'}`, background: specFilter === s ? 'var(--teal)' : 'var(--white)', color: specFilter === s ? 'white' : 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'var(--transition)' }}>
            {s}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>{filtered.length} hospitals found</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.map(hospital => (
          <div key={hospital._id} className="hospital-card">
            {/* Hospital Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: hospital.type === 'government' ? '#fef3c7' : 'linear-gradient(135deg, #e0f2fe, #ccfbf1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
                🏥
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-900)' }}>{hospital.name}</h3>
                  {hospital.operatingHours?.is24x7 && <span className="badge badge-red" style={{ fontSize: 11 }}>🚨 24/7</span>}
                  {hospital.type === 'government' && <span className="badge badge-blue" style={{ fontSize: 11 }}>Govt.</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Star size={14} color="#f59e0b" fill="#f59e0b" />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{hospital.rating?.average}</span>
                    <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>({hospital.rating?.count?.toLocaleString()} reviews)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--gray-400)', fontSize: 13 }}>
                    <MapPin size={13} />{hospital.address?.city}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  {hospital.specialties?.slice(0, 4).map(s => <span key={s} className="badge badge-teal" style={{ fontSize: 11 }}>{s}</span>)}
                </div>
              </div>
              <button onClick={() => setExpanded(expanded === hospital._id ? null : hospital._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
                {expanded === hospital._id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
            </div>

            {/* Facilities */}
            {hospital.facilities && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
                {hospital.facilities.map(f => <span key={f} className="badge badge-gray" style={{ fontSize: 11 }}>{f}</span>)}
              </div>
            )}

            {/* Doctors (expanded) */}
            {expanded === hospital._id && (
              <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gray-100)' }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--gray-700)' }}>Doctors at {hospital.name}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {hospital.doctors?.map(doc => (
                    <div key={doc._id} className="doctor-card">
                      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                        <div className="avatar" style={{ width: 44, height: 44, fontSize: 16, flexShrink: 0 }}>{doc.firstName[0]}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 600 }}>Dr. {doc.firstName} {doc.lastName}</p>
                          <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{doc.specialization}</p>
                          <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{doc.qualifications?.join(', ')}</p>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div style={{ textAlign: 'center', background: 'var(--white)', borderRadius: 6, padding: '6px 4px' }}>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>{doc.experience}yr</p>
                          <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>Exp.</p>
                        </div>
                        <div style={{ textAlign: 'center', background: 'var(--white)', borderRadius: 6, padding: '6px 4px' }}>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>⭐ {doc.rating?.average || 'New'}</p>
                          <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>Rating</p>
                        </div>
                        <div style={{ textAlign: 'center', background: 'var(--white)', borderRadius: 6, padding: '6px 4px' }}>
                          <p style={{ fontSize: 12, fontWeight: 600 }}>₹{doc.consultationFee}</p>
                          <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>Fee</p>
                        </div>
                      </div>
                      {doc.expertise?.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                          {doc.expertise.slice(0, 3).map(e => <span key={e} className="badge badge-blue" style={{ fontSize: 10 }}>{e}</span>)}
                        </div>
                      )}
                      <button className="btn btn-primary btn-sm btn-full" onClick={() => { setBookingDoc(doc); setBookingHospital(hospital); }}>
                        <Calendar size={14} /> Book Appointment
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Booking Modal */}
      {bookingDoc && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Book Appointment</h2>
              <p style={{ color: 'var(--gray-500)', fontSize: 14, marginTop: 4 }}>Dr. {bookingDoc.firstName} {bookingDoc.lastName} · {bookingDoc.specialization}</p>
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Date *</label>
              <input className="form-input" type="date" min={new Date().toISOString().split('T')[0]} value={bookForm.appointmentDate} onChange={e => setBookForm({ ...bookForm, appointmentDate: e.target.value })} />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Time Slot</label>
              <select className="form-input form-select" value={bookForm.timeSlot} onChange={e => setBookForm({ ...bookForm, timeSlot: e.target.value })}>
                <option value="">Select time</option>
                {['09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Symptoms / Reason for Visit</label>
              <textarea className="form-input" rows={3} placeholder="Describe your symptoms..." value={bookForm.symptoms} onChange={e => setBookForm({ ...bookForm, symptoms: e.target.value })} style={{ resize: 'vertical' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Contact Method</label>
              <select className="form-input form-select" value={bookForm.bookingMethod} onChange={e => setBookForm({ ...bookForm, bookingMethod: e.target.value })}>
                <option value="app">App Notification</option>
                <option value="phone">Phone Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            {['phone', 'whatsapp', 'sms'].includes(bookForm.bookingMethod) && (
              <div className="form-group">
                <label className="form-label">Phone Number *</label>
                <input className="form-input" type="tel" placeholder="Enter your phone number" value={bookForm.contactPhone} onChange={e => setBookForm({ ...bookForm, contactPhone: e.target.value })} />
              </div>
            )}

            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#166534' }}>
              ℹ️ Your request will be sent to {bookingHospital?.name}. Hospital staff will confirm your appointment.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setBookingDoc(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleBook} disabled={loading}>
                {loading ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}
