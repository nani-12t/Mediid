import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Star, MapPin, ChevronDown, ChevronUp,
  Award, Shield, CheckCircle2, Hospital, Filter, Sparkles
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { hospitalAPI } from '../../utils/api';
import toast from 'react-hot-toast';

/* ─── constants ─── */
const CITIES = ['All Cities', 'Bangalore', 'Chennai', 'Delhi', 'Mumbai', 'Gurugram', 'Hyderabad', 'Pune'];

const SPECIALTIES_WITH_ICONS = [
  { name: 'Cardiology', icon: '🫀', color: 'hsl(0, 95%, 96%)', text: 'hsl(0, 72%, 45%)' },
  { name: 'Dermatology', icon: '🧴', color: 'hsl(200, 95%, 96%)', text: 'hsl(200, 72%, 45%)' },
  { name: 'Orthopedics', icon: '🦴', color: 'hsl(35, 92%, 96%)', text: 'hsl(35, 92%, 35%)' },
  { name: 'Neurology', icon: '🧠', color: 'hsl(262, 80%, 96%)', text: 'hsl(262, 80%, 45%)' },
  { name: 'Pediatrics', icon: '👶', color: 'hsl(142, 70%, 95%)', text: 'hsl(142, 76%, 22%)' },
  { name: 'Gynecology', icon: '🌸', color: 'hsl(320, 80%, 96%)', text: 'hsl(320, 80%, 45%)' },
  { name: 'Ophthalmology', icon: '👁️', color: 'hsl(190, 80%, 95%)', text: 'hsl(190, 80%, 35%)' },
  { name: 'Dentistry', icon: '🦷', color: 'hsl(215, 32%, 95%)', text: 'hsl(215, 25%, 35%)' },
  { name: 'Psychiatry', icon: '🧘', color: 'hsl(25, 90%, 95%)', text: 'hsl(25, 90%, 35%)' },
  { name: 'General Medicine', icon: '💊', color: 'hsl(172, 95%, 94%)', text: 'hsl(172, 95%, 25%)' },
];

/* ─── rating score ─── */
const ratingScore = (h) => {
  const avg   = h.rating?.average || 0;
  const count = h.rating?.count   || 0;
  return avg * Math.log10(Math.max(count, 1) + 1);
};

const Stars = ({ avg }) => {
  const full = Math.floor(avg);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12}
          color="var(--amber)"
          fill={i <= full ? 'var(--amber)' : 'none'}
          style={{ opacity: i <= full ? 1 : 0.2 }}
        />
      ))}
    </span>
  );
};

export default function SearchHospitals() {
  const navigate = useNavigate();
  const [allHospitals, setAllHospitals] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [cityFilter, setCityFilter]     = useState('All Cities');
  const [categoryFilter, setCategoryFilter] = useState('Doctors'); // 'Doctors' or 'Hospitals'
  const [specFilter, setSpecFilter]     = useState('All');
  const [expanded, setExpanded]         = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data } = await hospitalAPI.search({});
        const sorted = [...data].sort((a, b) => ratingScore(b) - ratingScore(a));
        setAllHospitals(sorted);
      } catch (err) {
        toast.error('Could not load data');
        setAllHospitals(DEMO_HOSPITALS);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  // Filter logic
  const filteredHospitals = allHospitals.filter(h => {
    const q = search.toLowerCase();
    const matchCity = cityFilter === 'All Cities' || h.address?.city === cityFilter;
    const matchSearch = !q || h.name?.toLowerCase().includes(q) || h.specialties?.some(s => s.toLowerCase().includes(q));
    const matchSpec = specFilter === 'All' || h.specialties?.some(s => s.toLowerCase().includes(specFilter.toLowerCase()));
    return matchCity && matchSearch && matchSpec;
  });

  const allDoctors = allHospitals.flatMap(h => (h.doctors || []).map(d => ({ ...d, hospitalName: h.name, hospitalId: h._id, city: h.address?.city, state: h.address?.state })));
  
  const filteredDoctors = allDoctors.filter(d => {
    const q = search.toLowerCase();
    const matchCity = cityFilter === 'All Cities' || d.city === cityFilter;
    const matchSearch = !q || `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) || d.specialization?.toLowerCase().includes(q) || d.hospitalName?.toLowerCase().includes(q);
    const matchSpec = specFilter === 'All' || d.specialization?.toLowerCase().includes(specFilter.toLowerCase());
    return matchCity && matchSearch && matchSpec;
  });

  return (
    <PatientLayout title="Find & Book Appointments">
      
      {/* ─── Hero Search Header ─── */}
      <div style={{ 
        background: 'linear-gradient(135deg, var(--navy-dark) 0%, var(--navy) 50%, var(--teal-dark) 100%)', 
        borderRadius: 'var(--radius-xl)', 
        padding: '48px 40px', 
        marginBottom: 36,
        color: 'white',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ position: 'absolute', right: -30, top: -30, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,180,160,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,180,160,0.12)', border: '1px solid rgba(0,180,160,0.2)', borderRadius: 20, padding: '4px 14px', display: 'inline-flex', marginBottom: 16 }}>
          <Sparkles size={13} color="var(--teal-light)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-light)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Direct Clinical Access</span>
        </div>
        
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>Search Doctors & Hospitals</h1>
        <p style={{ opacity: 0.75, fontSize: 15, marginBottom: 32, fontWeight: 500 }}>Find specialists in your city, browse transparent fees, and book direct consultations.</p>
        
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }} className="search-controls-wrapper">
          <div style={{ flex: 1, minWidth: 280, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)' }} size={18} />
            <input 
              type="text"
              placeholder="Search by doctor name, specialty, or hospital..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '16px 16px 16px 52px', 
                borderRadius: 14, 
                border: '1px solid rgba(255,255,255,0.15)', 
                background: 'rgba(255,255,255,0.06)', 
                color: 'white', 
                fontSize: 14, 
                outline: 'none', 
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                transition: 'var(--transition)'
              }}
              className="glass-search-input"
            />
          </div>
          
          <select 
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            style={{ 
              padding: '0 20px', 
              borderRadius: 14, 
              border: '1px solid rgba(255,255,255,0.15)', 
              background: 'rgba(255,255,255,0.06)', 
              color: 'white', 
              fontSize: 14, 
              outline: 'none', 
              cursor: 'pointer', 
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              minWidth: 160 
            }}
            className="glass-select-input"
          >
            {CITIES.map(c => <option key={c} value={c} style={{ color: 'black' }}>{c}</option>)}
          </select>
          
          <select 
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ 
              padding: '0 20px', 
              borderRadius: 14, 
              border: '1px solid rgba(255,255,255,0.15)', 
              background: 'rgba(255,255,255,0.06)', 
              color: 'white', 
              fontSize: 14, 
              outline: 'none', 
              cursor: 'pointer', 
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              minWidth: 160 
            }}
            className="glass-select-input"
          >
            <option value="Doctors" style={{ color: 'black' }}>Search Doctors</option>
            <option value="Hospitals" style={{ color: 'black' }}>Search Hospitals</option>
          </select>
        </div>
      </div>

      {/* ─── Browse by Specialty ─── */}
      <section style={{ marginBottom: 44 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, color: 'var(--gray-900)' }}>Browse by Specialty</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {SPECIALTIES_WITH_ICONS.map(spec => {
            const isSelected = specFilter === spec.name;
            return (
              <div 
                key={spec.name}
                onClick={() => setSpecFilter(s => s === spec.name ? 'All' : spec.name)}
                className="card spec-card-hover"
                style={{ 
                  textAlign: 'center', 
                  padding: '24px 16px', 
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected ? '2px solid var(--teal)' : '1px solid rgba(148, 163, 184, 0.08)',
                  background: isSelected ? 'white' : 'white',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  transform: isSelected ? 'translateY(-2px)' : 'none'
                }}
              >
                <div style={{ 
                  fontSize: 32, 
                  marginBottom: 12,
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: isSelected ? 'hsl(172, 95%, 94%)' : spec.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  transition: 'var(--transition)'
                }} className="spec-icon-wrap">
                  {spec.icon}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--teal)' : 'var(--gray-700)' }}>{spec.name}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Search Results ─── */}
      <section style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)' }}>
            {categoryFilter === 'Doctors' ? `${filteredDoctors.length} Doctors Found` : `${filteredHospitals.length} Partner Hospitals`}
          </h2>
          {specFilter !== 'All' && (
            <button onClick={() => setSpecFilter('All')} className="btn btn-secondary btn-sm" style={{ fontWeight: 700, borderRadius: 10 }}>
              Reset Specialty Filter: <span style={{ color: 'var(--teal)' }}>{specFilter}</span> <span style={{ marginLeft: 4 }}>×</span>
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><div className="spinner" /></div>
        ) : categoryFilter === 'Doctors' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {filteredDoctors.map(doc => (
              <DoctorSearchCard 
                key={doc._id} 
                doctor={doc} 
                onBook={() => navigate(`/doctor/${doc._id}`)} 
              />
            ))}
            {filteredDoctors.length === 0 && <EmptyResults type="doctors" />}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {filteredHospitals.map((h, idx) => (
              <HospitalRow 
                key={h._id} 
                hospital={h} 
                rank={idx + 1} 
                expanded={expanded === h._id} 
                onToggle={() => setExpanded(e => e === h._id ? null : h._id)} 
                onBook={(doc) => navigate(`/doctor/${doc._id}`)} 
              />
            ))}
            {filteredHospitals.length === 0 && <EmptyResults type="hospitals" />}
          </div>
        )}
      </section>

    </PatientLayout>
  );
}

/* ─── Components ─── */

function DoctorSearchCard({ doctor, onBook }) {
  return (
    <div className="card list-card-hover" style={{ padding: '24px 32px', display: 'flex', gap: 28, border: '1px solid rgba(148, 163, 184, 0.08)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ 
          width: 80, 
          height: 80, 
          borderRadius: '50%', 
          background: 'linear-gradient(135deg, var(--teal) 0%, var(--navy) 100%)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: 24, 
          color: 'white', 
          fontWeight: 700, 
          flexShrink: 0,
          boxShadow: '0 4px 14px rgba(0, 180, 160, 0.2)'
        }}>
          {doctor.firstName?.[0]}{doctor.lastName?.[0]}
        </div>
      </div>
      
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)' }}>Dr. {doctor.firstName} {doctor.lastName}</h3>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', background: 'hsl(172, 95%, 94%)', padding: '3px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={12} /> Verified
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'hsl(142, 76%, 22%)', background: 'hsl(142, 70%, 93%)', padding: '3px 10px', borderRadius: 8 }}>
            Available Today
          </span>
        </div>
        
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)', marginBottom: 12 }}>{doctor.specialization}</p>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--gray-500)', fontSize: 13, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}><MapPin size={14} color="var(--gray-400)" /> {doctor.hospitalName}, {doctor.city}</span>
          <span style={{ color: 'var(--gray-300)' }}>•</span>
          <span style={{ fontWeight: 500 }}>{doctor.experience} Years Exp</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Stars avg={doctor.rating?.average || 0} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-800)', marginLeft: 2 }}>{doctor.rating?.average}</span>
            <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 500 }}>({doctor.rating?.count || 0} reviews)</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-500)' }}>
            Fee: <span style={{ color: 'var(--gray-900)', fontWeight: 800, fontSize: 15 }}>₹{doctor.consultationFee}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, minWidth: 160, paddingLeft: 20, borderLeft: '1px solid var(--gray-100)' }} className="slot-booking-block">
        <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Slots</p>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', margin: '2px 0 6px' }}>10:00 - 11:30 AM</p>
        <button onClick={onBook} className="btn btn-primary btn-sm" style={{ fontWeight: 700, width: '100%' }}>Book Consultation</button>
      </div>
    </div>
  );
}

function HospitalRow({ hospital, rank, expanded, onToggle, onBook }) {
  return (
    <div className="card list-card-hover" style={{ padding: '24px 28px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
        <div style={{ 
          width: 56, 
          height: 56, 
          borderRadius: 14, 
          background: 'var(--gray-50)', 
          border: '1px solid var(--gray-100)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          fontSize: 24, 
          flexShrink: 0,
          boxShadow: 'var(--shadow-sm)'
        }}>
          🏥
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)' }}>{hospital.name}</h3>
            {rank <= 3 && <span style={{ fontSize: 10, background: 'hsl(45, 93%, 94%)', color: 'hsl(35, 90%, 30%)', padding: '2px 8px', borderRadius: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Partner</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={13} color="var(--gray-400)" /> {hospital.address?.city}, {hospital.address?.state}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hospital.specialties?.slice(0, 4).map(s => <span key={s} style={{ fontSize: 11, background: 'var(--gray-50)', border: '1px solid var(--gray-100)', padding: '3px 10px', borderRadius: 6, color: 'var(--gray-600)', fontWeight: 600 }}>{s}</span>)}
          </div>
        </div>
        <button onClick={onToggle} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-100)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: 'var(--gray-500)', display: 'flex', alignItems: 'center', justifyCentent: 'center', transition: 'var(--transition)' }} className="toggle-expand-btn">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--gray-100)' }} className="fade-in">
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--gray-800)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Doctors at {hospital.name}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {(hospital.doctors || []).map(doc => (
              <div key={doc._id} style={{ padding: '16px', border: '1px solid var(--gray-100)', borderRadius: 14, display: 'flex', gap: 14, background: 'var(--gray-50)' }} className="doctor-item-box">
                <div className="avatar" style={{ width: 42, height: 42, fontSize: 14 }}>{doc.firstName?.[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Dr. {doc.firstName} {doc.lastName}</p>
                  <p style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600, marginTop: 1 }}>{doc.specialization}</p>
                  <button onClick={() => onBook(doc)} className="btn btn-primary btn-sm" style={{ marginTop: 10, padding: '6px 12px', fontSize: 12, borderRadius: 8, fontWeight: 700 }}>Book</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyResults({ type }) {
  return (
    <div style={{ textAlign: 'center', padding: '72px 24px', background: 'white', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(148, 163, 184, 0.08)' }}>
      <Search size={44} style={{ margin: '0 auto 16px', opacity: 0.15 }} />
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>No matching {type} found</p>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 4 }}>Try clearing your filters or testing other search keywords.</p>
    </div>
  );
}

const DEMO_HOSPITALS = [
  { _id:'s1', name:'Apollo Hospitals', address:{ city:'Chennai', state:'Tamil Nadu' }, rating:{ average:4.8, count:12400 }, specialties:['Cardiology','Oncology','Neurology'], type:'private', doctors:[
    { _id:'d1', firstName:'Priya', lastName:'Mehta', specialization:'Cardiology', experience:14, rating:{ average:4.9, count:1240 }, consultationFee:800, status:'available' },
    { _id:'d2', firstName:'Arun', lastName:'Kumar', specialization:'Dermatology', experience:10, rating:{ average:4.7, count:850 }, consultationFee:600, status:'available' }
  ]},
  { _id:'s2', name:'Fortis Memorial', address:{ city:'Gurugram', state:'Haryana' }, rating:{ average:4.7, count:9800 }, specialties:['Orthopedics','Pediatrics'], type:'private', doctors:[
    { _id:'d3', firstName:'Sameer', lastName:'Gupta', specialization:'Orthopedics', experience:18, rating:{ average:4.8, count:1100 }, consultationFee:1000, status:'available' }
  ]}
];