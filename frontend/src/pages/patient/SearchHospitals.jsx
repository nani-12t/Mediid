import React, { useState, useEffect } from 'react';
import {
  Search, Star, MapPin, Clock, Users, ChevronDown, ChevronUp,
  Phone, Calendar, Award, Shield, Zap, TrendingUp, Filter, X
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { hospitalAPI, appointmentAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

/* ─── constants ─── */
const SPECIALIZATIONS = [
  'All','Cardiology','Neurology','Orthopedics','Pediatrics','Oncology',
  'Dermatology','General Medicine','Gynecology','Psychiatry','ENT',
  'Urology','Neurosurgery','Bone Marrow Transplant',
];

const TIME_SLOTS = [
  '09:00 AM','10:00 AM','11:00 AM','12:00 PM',
  '02:00 PM','03:00 PM','04:00 PM','05:00 PM',
];

/* ─── rating score: weighted blend of average × log(reviews) ─── */
const ratingScore = (h) => {
  const avg   = h.rating?.average || 0;
  const count = h.rating?.count   || 0;
  return avg * Math.log10(Math.max(count, 1) + 1);
};

/* ─── star row ─── */
const Stars = ({ avg }) => {
  const full = Math.floor(avg);
  const half = avg - full >= 0.5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={13}
          color="#f59e0b"
          fill={i <= full ? '#f59e0b' : (i === full + 1 && half) ? '#f59e0b' : 'none'}
          style={{ opacity: i <= full || (i === full+1 && half) ? 1 : 0.25 }}
        />
      ))}
    </span>
  );
};

/* ─── rank badge ─── */
const RankBadge = ({ rank }) => {
  const colors = { 1:'#f59e0b', 2:'#9ca3af', 3:'#b45309' };
  const labels = { 1:'🥇 #1 Top Rated', 2:'🥈 #2 Highly Rated', 3:'🥉 #3 Popular' };
  if (rank > 3) return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: colors[rank], background: `${colors[rank]}18`, border: `1px solid ${colors[rank]}40`, borderRadius: 6, padding: '2px 8px' }}>
      {labels[rank]}
    </span>
  );
};

/* ═══════════════════════════════════════ */
export default function SearchHospitals() {
  const { profile } = useAuth();

  /* ── state ── */
  const [allHospitals, setAllHospitals] = useState([]);  // all from API, sorted by score
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [specFilter, setSpecFilter]     = useState('All');
  const [typeFilter, setTypeFilter]     = useState('All');
  const [minRating, setMinRating]       = useState(0);
  const [expanded, setExpanded]         = useState(null);
  const [showFilters, setShowFilters]   = useState(false);

  const [bookingDoc, setBookingDoc]         = useState(null);
  const [bookingHospital, setBookingHospital] = useState(null);
  const [bookForm, setBookForm]             = useState({
    appointmentDate: '', timeSlot: '', symptoms: '',
    bookingMethod: 'app', contactPhone: '',
  });
  const [booking, setBooking] = useState(false);

  /* ── fetch all registered hospitals, sorted by weighted rating ── */
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await hospitalAPI.search({});
        // sort by weighted score: rating.average × log10(reviews+1)
        const sorted = [...data].sort((a, b) => ratingScore(b) - ratingScore(a));
        setAllHospitals(sorted);
      } catch (err) {
        toast.error('Could not load hospitals — showing demo data');
        setAllHospitals(DEMO_HOSPITALS);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  /* ── filter pipeline ── */
  const filtered = allHospitals.filter(h => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || h.name?.toLowerCase().includes(q)
      || h.address?.city?.toLowerCase().includes(q)
      || h.specialties?.some(s => s.toLowerCase().includes(q))
      || h.doctors?.some(d => `${d.firstName} ${d.lastName}`.toLowerCase().includes(q));
    const matchSpec = specFilter === 'All'
      || h.specialties?.some(s => s.toLowerCase().includes(specFilter.toLowerCase()))
      || h.doctors?.some(d => d.specialization?.toLowerCase().includes(specFilter.toLowerCase()));
    const matchType   = typeFilter === 'All' || h.type === typeFilter;
    const matchRating = (h.rating?.average || 0) >= minRating;
    return matchSearch && matchSpec && matchType && matchRating;
  });

  const topPicks = filtered.slice(0, 3);

  /* ── booking ── */
  const handleBook = async () => {
    if (!bookForm.appointmentDate) { toast.error('Please select a date'); return; }
    if (['phone','whatsapp','sms'].includes(bookForm.bookingMethod) && !bookForm.contactPhone) {
      toast.error('Please enter your phone number'); return;
    }
    setBooking(true);
    try {
      await appointmentAPI.create({
        doctor:          bookingDoc._id,
        hospital:        bookingHospital._id,
        appointmentDate: bookForm.appointmentDate,
        timeSlot:        bookForm.timeSlot,
        symptoms:        bookForm.symptoms,
        bookingMethod:   bookForm.bookingMethod,
        contactPhone:    bookForm.contactPhone,
        type: 'consultation',
      });
      toast.success('Appointment request sent! Hospital will confirm shortly. 🎉');
      setBookingDoc(null);
      setBookForm({ appointmentDate:'', timeSlot:'', symptoms:'', bookingMethod:'app', contactPhone:'' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Booking failed');
    } finally { setBooking(false); }
  };

  /* ── styles ── */
  const sectionHead = { fontSize: 16, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 };

  /* ════════════════════════════════════════════ */
  return (
    <PatientLayout title="Find Hospitals & Doctors">

      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
          Find Hospitals & Doctors
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Hospitals ranked by rating and patient reviews — highest rated shown first
        </p>
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div className="search-bar" style={{ flex: 1, marginBottom: 0 }}>
          <Search size={18} color="var(--gray-400)" />
          <input
            placeholder="Search hospitals, doctors, city, specialization..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 2 }}>
              <X size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 10, border: `1.5px solid ${showFilters ? 'var(--teal)' : 'var(--gray-200)'}`, background: showFilters ? '#e6f7f5' : '#fff', color: showFilters ? 'var(--teal)' : 'var(--gray-600)', fontSize: 14, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}
        >
          <Filter size={15} /> Filters
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ background: '#f9fafb', border: '1px solid var(--gray-100)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', display: 'block', marginBottom: 6 }}>HOSPITAL TYPE</label>
            <select className="form-input form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="All">All Types</option>
              <option value="private">Private</option>
              <option value="government">Government</option>
              <option value="trust">Trust / NGO</option>
              <option value="clinic">Clinic</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', display: 'block', marginBottom: 6 }}>MINIMUM RATING</label>
            <select className="form-input form-select" value={minRating} onChange={e => setMinRating(Number(e.target.value))}>
              <option value={0}>Any rating</option>
              <option value={4}>4.0+</option>
              <option value={4.5}>4.5+</option>
              <option value={4.8}>4.8+</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => { setTypeFilter('All'); setMinRating(0); setSpecFilter('All'); setSearch(''); }}
              style={{ background: 'none', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'var(--gray-500)', cursor: 'pointer', width: '100%' }}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Specialization chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {SPECIALIZATIONS.map(s => (
          <button key={s} onClick={() => setSpecFilter(s)}
            style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${specFilter === s ? 'var(--teal)' : 'var(--gray-200)'}`, background: specFilter === s ? 'var(--teal)' : '#fff', color: specFilter === s ? '#fff' : 'var(--gray-600)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s', fontWeight: specFilter === s ? 600 : 400 }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--gray-400)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <p>Finding the best hospitals for you...</p>
        </div>
      ) : (
        <>
          {/* ══ Top Picks ══ */}
          {topPicks.length > 0 && !search && specFilter === 'All' && (
            <div style={{ marginBottom: 32 }}>
              <div style={sectionHead}>
                <TrendingUp size={18} color="var(--teal)" />
                Top Picks — Highest Rated & Most Reviewed
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--gray-400)', marginLeft: 4 }}>Based on rating × review count</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 8 }}>
                {topPicks.map((hospital, idx) => (
                  <TopPickCard
                    key={hospital._id}
                    hospital={hospital}
                    rank={idx + 1}
                    onExpand={() => setExpanded(e => e === hospital._id ? null : hospital._id)}
                    expanded={expanded === hospital._id}
                    onBook={(doc) => { setBookingDoc(doc); setBookingHospital(hospital); }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ══ All Hospitals ══ */}
          <div style={{ ...sectionHead, marginBottom: 16 }}>
            <Users size={18} color="var(--gray-500)" />
            {search || specFilter !== 'All' ? `${filtered.length} hospitals found` : 'All Registered Hospitals'}
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🏥</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }}>No hospitals found</p>
              <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>Try a different search or filter</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filtered.map((hospital, idx) => (
                <HospitalRow
                  key={hospital._id}
                  hospital={hospital}
                  rank={idx + 1}
                  expanded={expanded === hospital._id}
                  onToggle={() => setExpanded(e => e === hospital._id ? null : hospital._id)}
                  onBook={(doc) => { setBookingDoc(doc); setBookingHospital(hospital); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ══ Booking Modal ══ */}
      {bookingDoc && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setBookingDoc(null); }}>
          <div className="modal" style={{ maxWidth: 500, borderRadius: 16, padding: 0, overflow: 'hidden' }}>

            {/* Modal header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f1f1', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 3 }}>Book Appointment</h2>
                <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
                  Dr. {bookingDoc.firstName} {bookingDoc.lastName} · {bookingDoc.specialization}
                </p>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>🏥 {bookingHospital?.name}</p>
              </div>
              <button onClick={() => setBookingDoc(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6b7280' }}>
                <X size={15} /> Close
              </button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preferred Date *</label>
                <input className="form-input" type="date" min={new Date().toISOString().split('T')[0]}
                  value={bookForm.appointmentDate} onChange={e => setBookForm({ ...bookForm, appointmentDate: e.target.value })} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preferred Time Slot</label>
                <select className="form-input form-select" value={bookForm.timeSlot} onChange={e => setBookForm({ ...bookForm, timeSlot: e.target.value })}>
                  <option value="">Select time</option>
                  {TIME_SLOTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Symptoms / Reason for Visit</label>
                <textarea className="form-input" rows={3} placeholder="Describe your symptoms..."
                  value={bookForm.symptoms} onChange={e => setBookForm({ ...bookForm, symptoms: e.target.value })} style={{ resize: 'vertical' }} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Preferred Contact Method</label>
                <select className="form-input form-select" value={bookForm.bookingMethod} onChange={e => setBookForm({ ...bookForm, bookingMethod: e.target.value })}>
                  <option value="app">App Notification</option>
                  <option value="phone">Phone Call</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              {['phone','whatsapp','sms'].includes(bookForm.bookingMethod) && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Phone Number *</label>
                  <input className="form-input" type="tel" placeholder="Enter your phone number"
                    value={bookForm.contactPhone} onChange={e => setBookForm({ ...bookForm, contactPhone: e.target.value })} />
                </div>
              )}

              
            </div>

            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10 }}>
              <button onClick={() => setBookingDoc(null)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleBook} disabled={booking}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--teal)', fontSize: 14, fontWeight: 600, color: '#fff', cursor: booking ? 'not-allowed' : 'pointer', opacity: booking ? 0.7 : 1 }}>
                {booking ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}

/* ════════════════════════════════════════════
   TopPickCard — compact premium card for rank 1-3
════════════════════════════════════════════ */
function TopPickCard({ hospital, rank, onExpand, expanded, onBook }) {
  const gradients = {
    1: 'linear-gradient(135deg, #0d9488 0%, #0891b2 100%)',
    2: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    3: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  };

  return (
    <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.10)', border: '1px solid rgba(0,0,0,0.06)' }}>
      {/* Colored top band */}
      <div style={{ background: gradients[rank], padding: '14px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.07em' }}>
            {rank === 1 ? '🥇 TOP RATED' : rank === 2 ? '🥈 HIGHLY RATED' : '🥉 POPULAR'}
          </span>
          {hospital.operatingHours?.is24x7 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 6, padding: '2px 7px' }}>🚨 24/7</span>
          )}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{hospital.name}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Stars avg={hospital.rating?.average || 0} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{hospital.rating?.average}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
            ({(hospital.rating?.count || 0).toLocaleString('en-IN')} reviews)
          </span>
        </div>
      </div>

      {/* White body */}
      <div style={{ background: '#fff', padding: '12px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
          <MapPin size={12} /> {hospital.address?.city}, {hospital.address?.state}
        </div>

        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {hospital.specialties?.slice(0, 3).map(s => (
            <span key={s} style={{ fontSize: 10, fontWeight: 500, background: '#f0fdf4', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 5, padding: '2px 7px' }}>{s}</span>
          ))}
          {hospital.specialties?.length > 3 && (
            <span style={{ fontSize: 10, color: 'var(--gray-400)', padding: '2px 4px' }}>+{hospital.specialties.length - 3} more</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
          <span>🛏 {hospital.totalBeds} beds</span>
          <span>👨‍⚕️ {hospital.doctors?.length || 0} doctors</span>
          {hospital.accreditations?.includes('NABH') && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>✓ NABH</span>}
          {hospital.accreditations?.includes('JCI') && <span style={{ color: 'var(--teal)', fontWeight: 600 }}>✓ JCI</span>}
        </div>

        <button
          onClick={onExpand}
          style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1.5px solid var(--teal)', background: expanded ? 'var(--teal)' : 'transparent', color: expanded ? '#fff' : 'var(--teal)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
        >
          {expanded ? <><ChevronUp size={14} /> Hide Doctors</> : <><ChevronDown size={14} /> View Doctors & Book</>}
        </button>

        {expanded && <DoctorGrid doctors={hospital.doctors} onBook={onBook} />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   HospitalRow — full-width list card
════════════════════════════════════════════ */
function HospitalRow({ hospital, rank, expanded, onToggle, onBook }) {
  return (
    <div className="hospital-card" style={{ borderRadius: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Icon + rank */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: hospital.type === 'government' ? '#fef3c7' : 'linear-gradient(135deg,#e0f2fe,#ccfbf1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
            🏥
          </div>
          {rank <= 3 && (
            <div style={{ position: 'absolute', top: -6, right: -6, fontSize: 14 }}>
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-900)' }}>{hospital.name}</h3>
            {hospital.operatingHours?.is24x7 && <span className="badge badge-red" style={{ fontSize: 10 }}>🚨 24/7</span>}
            {hospital.type === 'government' && <span className="badge badge-blue" style={{ fontSize: 10 }}>Govt.</span>}
            {hospital.isVerified && <span className="badge badge-teal" style={{ fontSize: 10 }}>✓ Verified</span>}
          </div>

          {/* Rating row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Stars avg={hospital.rating?.average || 0} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{hospital.rating?.average}</span>
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                ({(hospital.rating?.count || 0).toLocaleString('en-IN')} reviews)
              </span>
            </div>
            <RankBadge rank={rank} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={12} />{hospital.address?.city}, {hospital.address?.state}</span>
            <span>🛏 {hospital.totalBeds} beds</span>
            <span>👨‍⚕️ {hospital.doctors?.length || 0} doctors</span>
          </div>

          {/* Accreditations */}
          {hospital.accreditations?.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
              {hospital.accreditations.map(a => (
                <span key={a} style={{ fontSize: 10, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 5, padding: '2px 7px' }}>
                  <Shield size={9} style={{ marginRight: 2 }} />{a}
                </span>
              ))}
            </div>
          )}

          {/* Specialties */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {hospital.specialties?.slice(0, 5).map(s => (
              <span key={s} className="badge badge-teal" style={{ fontSize: 10 }}>{s}</span>
            ))}
            {hospital.specialties?.length > 5 && (
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>+{hospital.specialties.length - 5} more</span>
            )}
          </div>
        </div>

        <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4, flexShrink: 0 }}>
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Facilities */}
      {hospital.facilities?.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gray-100)' }}>
          {hospital.facilities.map(f => <span key={f} className="badge badge-gray" style={{ fontSize: 10 }}>{f}</span>)}
        </div>
      )}

      {/* Expanded doctors */}
      {expanded && (
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--gray-100)' }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--gray-700)' }}>
            Doctors at {hospital.name}
          </h4>
          <DoctorGrid doctors={hospital.doctors} onBook={onBook} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   DoctorGrid — shared between both card types
════════════════════════════════════════════ */
function DoctorGrid({ doctors, onBook }) {
  if (!doctors?.length) return <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 12 }}>No doctors listed yet.</p>;

  // sort doctors by their own rating
  const sorted = [...doctors].sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
      {sorted.map(doc => (
        <div key={doc._id} className="doctor-card">
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 16, flexShrink: 0, borderRadius: 12 }}>
              {doc.firstName?.[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Dr. {doc.firstName} {doc.lastName}
              </p>
              <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{doc.specialization}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Stars avg={doc.rating?.average || 0} />
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>{doc.rating?.average} ({doc.rating?.count?.toLocaleString?.() || 0})</span>
              </div>
            </div>
            {/* Status dot */}
            <div style={{ flexShrink: 0, paddingTop: 4 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: doc.status === 'available' ? '#10b981' : doc.status === 'busy' ? '#f59e0b' : '#9ca3af' }} title={doc.status} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <div style={{ textAlign: 'center', background: 'var(--white, #f9fafb)', borderRadius: 6, padding: '5px 4px' }}>
              <p style={{ fontSize: 12, fontWeight: 600 }}>{doc.experience}yr</p>
              <p style={{ fontSize: 10, color: 'var(--gray-400)' }}>Exp.</p>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--white, #f9fafb)', borderRadius: 6, padding: '5px 4px' }}>
              <p style={{ fontSize: 12, fontWeight: 600 }}>₹{doc.consultationFee}</p>
              <p style={{ fontSize: 10, color: 'var(--gray-400)' }}>Fee</p>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--white, #f9fafb)', borderRadius: 6, padding: '5px 4px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: doc.status === 'available' ? '#10b981' : '#f59e0b', textTransform: 'capitalize' }}>{doc.status === 'on_leave' ? 'Leave' : doc.status}</p>
              <p style={{ fontSize: 10, color: 'var(--gray-400)' }}>Status</p>
            </div>
          </div>

          {doc.expertise?.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {doc.expertise.slice(0, 3).map(e => (
                <span key={e} className="badge badge-blue" style={{ fontSize: 10 }}>{e}</span>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary btn-sm btn-full"
            disabled={doc.status === 'on_leave'}
            onClick={() => onBook(doc)}
            style={{ opacity: doc.status === 'on_leave' ? 0.5 : 1 }}
          >
            <Calendar size={14} />
            {doc.status === 'on_leave' ? 'On Leave' : 'Book Appointment'}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── fallback demo data if API fails ── */
const DEMO_HOSPITALS = [
  { _id:'s1', name:'Apollo Hospitals', address:{ city:'Chennai', state:'Tamil Nadu' }, rating:{ average:4.8, count:12400 }, specialties:['Cardiology','Oncology','Neurology','Organ Transplant'], facilities:['24/7 Emergency','ICU','NICU','Blood Bank','Pharmacy'], type:'private', operatingHours:{ is24x7:true }, totalBeds:560, accreditations:['NABH','JCI'], isVerified:true,
    doctors:[
      { _id:'d1', firstName:'Rajesh', lastName:'Kumar', specialization:'Cardiology', qualifications:['MBBS','MD','DM'], experience:18, rating:{ average:4.9, count:1240 }, consultationFee:800, status:'available', expertise:['Angioplasty','Bypass Surgery','Echocardiography'] },
      { _id:'d2', firstName:'Priya', lastName:'Venkataraman', specialization:'Neurology', qualifications:['MBBS','MD','DM'], experience:14, rating:{ average:4.8, count:980 }, consultationFee:750, status:'available', expertise:['Epilepsy','Stroke','Migraine'] },
    ]},
  { _id:'s2', name:'Fortis Memorial Research Institute', address:{ city:'Gurugram', state:'Haryana' }, rating:{ average:4.7, count:9800 }, specialties:['Neurosurgery','Paediatrics','Urology','Gynaecology'], facilities:['24/7 Emergency','Level 1 Trauma','PICU','NICU','Dialysis'], type:'private', operatingHours:{ is24x7:true }, totalBeds:460, accreditations:['NABH','NABL','JCI'], isVerified:true,
    doctors:[
      { _id:'d3', firstName:'Vikram', lastName:'Mehta', specialization:'Neurosurgery', qualifications:['MBBS','MS','MCh'], experience:20, rating:{ average:4.9, count:620 }, consultationFee:1200, status:'available', expertise:['Brain Tumour Surgery','Spine Surgery','Deep Brain Stimulation'] },
      { _id:'d4', firstName:'Sunita', lastName:'Sharma', specialization:'Paediatrics', qualifications:['MBBS','MD'], experience:16, rating:{ average:4.8, count:1100 }, consultationFee:600, status:'available', expertise:['Neonatology','Paediatric ICU','Vaccination'] },
    ]},
];