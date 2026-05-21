import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Star, Clock, ChevronRight, User, ShieldCheck, MessageSquare } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { doctorAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const SPECIALTIES = [
  { id: 1, name: 'Gynaecologist', image: 'https://www.practostatic.com/consult/direct/images/speciality-gynaecologist.png', price: 499 },
  { id: 2, name: 'Dermatologist', image: 'https://www.practostatic.com/consult/direct/images/speciality-dermatologist.png', price: 599 },
  { id: 3, name: 'General Physician', image: 'https://www.practostatic.com/consult/direct/images/speciality-general-physician.png', price: 399 },
  { id: 4, name: 'Paediatrician', image: 'https://www.practostatic.com/consult/direct/images/speciality-pediatrician.png', price: 499 },
  { id: 5, name: 'Psychiatrist', image: 'https://www.practostatic.com/consult/direct/images/speciality-psychiatry.png', price: 799 },
  { id: 6, name: 'Stomach Issues', image: 'https://www.practostatic.com/consult/direct/images/speciality-stomach-issues.png', price: 449 },
];

const MOCK_DOCTORS = [
  {
    _id: 'mock-1',
    firstName: 'Sarah',
    lastName: 'Wilson',
    specialization: 'Dermatologist',
    experience: 12,
    rating: { average: 4.9, count: 1200 },
    consultationFee: 599,
    dutyStatus: 'Available',
    image: 'https://randomuser.me/api/portraits/women/44.jpg'
  },
  {
    _id: 'mock-2',
    firstName: 'James',
    lastName: 'Miller',
    specialization: 'General Physician',
    experience: 15,
    rating: { average: 4.8, count: 2400 },
    consultationFee: 399,
    dutyStatus: 'Available',
    image: 'https://randomuser.me/api/portraits/men/32.jpg'
  },
  {
    _id: 'mock-3',
    firstName: 'Emily',
    lastName: 'Chen',
    specialization: 'Paediatrician',
    experience: 8,
    rating: { average: 4.7, count: 850 },
    consultationFee: 499,
    dutyStatus: 'Available',
    image: 'https://randomuser.me/api/portraits/women/68.jpg'
  }
];

export default function VideoConsult() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        setLoading(true);
        const { data } = await doctorAPI.search({});
        if (data && data.length > 0) {
          // Add default image for doctors without one
          const formatted = data.map((doc, idx) => ({
            ...doc,
            image: doc.image || (doc.lastName?.toLowerCase()?.charCodeAt(0) % 2 === 0
              ? `https://randomuser.me/api/portraits/women/${(idx + 10) % 100}.jpg`
              : `https://randomuser.me/api/portraits/men/${(idx + 15) % 100}.jpg`)
          }));
          setDoctors(formatted);
        } else {
          setDoctors(MOCK_DOCTORS);
        }
      } catch (err) {
        console.error('Error fetching doctors:', err);
        setDoctors(MOCK_DOCTORS);
      } finally {
        setLoading(false);
      }
    };
    fetchDoctors();
  }, []);

  const handleConsultNow = (docId) => {
    navigate(`/doctor/${docId}?type=video`);
  };

  return (
    <PatientLayout title="Video Consult">
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Hero Section */}
        <div style={{ 
          background: 'linear-gradient(135deg, #283275 0%, #1a204d 100%)', 
          borderRadius: 20, 
          padding: '40px', 
          color: 'white', 
          marginBottom: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 20
        }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>Consult with Top Doctors Online</h1>
            <p style={{ fontSize: 18, opacity: 0.9, marginBottom: 24 }}>Skip the waiting room. Video consult in 10 minutes.</p>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color="#10b981" />
                <span style={{ fontSize: 14 }}>Verified Doctors</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquare size={20} color="#10b981" />
                <span style={{ fontSize: 14 }}>Free Follow-up</span>
              </div>
            </div>
          </div>
          <div>
             <Video size={80} color="rgba(255,255,255,0.15)" />
          </div>
        </div>

        {/* Specialty Grid */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600 }}>Consult by Specialty</h2>
            <button className="btn btn-ghost" style={{ color: '#283275' }}>View all</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 20 }}>
            {SPECIALTIES.map(s => (
              <div key={s.id} className="card hover-scale" style={{ textAlign: 'center', cursor: 'pointer', padding: 20 }}>
                <img src={s.image} alt={s.name} style={{ width: 80, height: 80, marginBottom: 12, margin: '0 auto' }} />
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{s.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>₹{s.price}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Featured Doctors */}
        <section style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Doctors Available Now</h2>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {doctors.map(doc => (
                <div key={doc._id} className="card hover-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                      <div style={{ position: 'relative' }}>
                        <img 
                          src={doc.image} 
                          alt={`${doc.firstName} ${doc.lastName}`} 
                          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} 
                        />
                        <div style={{ 
                          position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: '50%', 
                          background: doc.dutyStatus === 'Available' ? '#10b981' : '#f59e0b',
                          border: '2px solid white'
                        }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Dr. {doc.firstName} {doc.lastName}</h3>
                        <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{doc.specialization}</p>
                        <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{doc.experience} years experience</p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                        <Star size={12} fill="#166534" color="#166534" />
                        {doc.rating?.average || 4.8}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{doc.rating?.count || 120} Stories</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>Consultation Fee</p>
                      <p style={{ fontSize: 16, fontWeight: 700 }}>₹{doc.consultationFee || 499}</p>
                    </div>
                    <button 
                      onClick={() => handleConsultNow(doc._id)}
                      className="btn btn-primary" 
                      style={{ background: '#283275', borderColor: '#283275' }}
                    >
                      Consult Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PatientLayout>
  );
}
