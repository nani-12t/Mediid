import React, { useEffect, useState } from 'react';
import { QrCode, Download, Building2, Users, UserCheck } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';

const STAFF_ROLES = ['nurse','receptionist','lab_technician','pharmacist','ward_boy','security','administrator','radiologist','physiotherapist','other'];

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(c => { const t = localStorage.getItem('mediid_token'); if(t) c.headers.Authorization=`Bearer ${t}`; return c; });

export default function HospitalQR() {
  const { profile } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tab, setTab] = useState('hospital');
  const [staffFilter, setStaffFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const [d, s] = await Promise.all([api.get('/doctors'), api.get('/staff')]);
        setDoctors(d.data);
        setStaff(s.data);
      } catch(e) {}
    };
    load();
  }, []);

  const downloadQR = (name, uid, qrCode) => {
    if(!qrCode) return;
    const link = document.createElement('a');
    link.download = `${uid}-QR.png`;
    link.href = qrCode;
    link.click();
  };

  const QRCard = ({ name, uid, role, qrCode, color = 'var(--navy)' }) => (
    <div style={{ background: color, borderRadius: 16, padding: 20, textAlign: 'center' }}>
      {qrCode ? (
        <img src={qrCode} alt={`${uid} QR`} style={{ width: 140, height: 140, background: 'white', borderRadius: 10, padding: 6 }} />
      ) : (
        <div style={{ width: 140, height: 140, background: 'rgba(255,255,255,0.05)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <QrCode size={50} color="rgba(255,255,255,0.2)" />
        </div>
      )}
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--teal)', letterSpacing: '0.08em', marginTop: 12 }}>{uid}</p>
      <p style={{ fontSize: 13, color: 'white', fontWeight: 600, marginTop: 3 }}>{name}</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{role}</p>
      <button className="btn btn-sm" onClick={() => downloadQR(name, uid, qrCode)}
        style={{ marginTop: 12, background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', width: '100%' }}>
        <Download size={13} /> Download
      </button>
    </div>
  );

  return (
    <HospitalLayout title="QR Codes">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>ID & QR Cards</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>View and download QR codes for hospital, doctors, and staff</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${tab==='hospital'?'active':''}`} onClick={()=>setTab('hospital')}>🏥 Hospital</button>
        <button className={`tab-btn ${tab==='doctors'?'active':''}`} onClick={()=>setTab('doctors')}>👨‍⚕️ Doctors ({doctors.length})</button>
        <button className={`tab-btn ${tab==='staff'?'active':''}`} onClick={()=>setTab('staff')}>👥 Staff ({staff.length})</button>
      </div>

      {tab === 'hospital' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 340, width: '100%' }}>
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <Building2 size={28} color="var(--teal)" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>{profile?.name}</h3>
              <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 20 }}>Hospital QR Code</p>
              {profile?.qrCode ? (
                <img src={profile.qrCode} alt="Hospital QR" style={{ width: 200, height: 200, borderRadius: 12, border: '3px solid var(--teal)' }} />
              ) : (
                <div style={{ width: 200, height: 200, background: 'var(--gray-100)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <QrCode size={60} color="var(--gray-300)" />
                </div>
              )}
              <div style={{ background: 'var(--navy)', borderRadius: 10, padding: '10px 16px', margin: '16px 0 20px' }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 3 }}>HOSPITAL ID</p>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--teal)', fontSize: 16, letterSpacing: '0.06em' }}>{profile?.uid}</p>
              </div>
              <button className="btn btn-primary btn-full" onClick={() => downloadQR(profile?.name, profile?.uid, profile?.qrCode)}>
                <Download size={16} /> Download Hospital QR
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'doctors' && (
        doctors.length === 0 ? (
          <div className="card empty-state"><Users size={36} style={{ margin:'0 auto 12px', opacity:0.25 }}/><p>No doctors added yet</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {doctors.map(d => (
              <QRCard key={d._id} name={`Dr. ${d.firstName} ${d.lastName}`} uid={d.uid} role={d.specialization} qrCode={d.qrCode} color="var(--navy)" />
            ))}
          </div>
        )
      )}

      {tab === 'staff' && (
        <>
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 14, fontWeight: 500 }}>Filter by Role:</label>
            <select
              className="form-input form-select"
              style={{ maxWidth: 200 }}
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
            >
              <option value="all">All Staff</option>
              {STAFF_ROLES.map(role => (
                <option key={role} value={role}>{role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          {staff.length === 0 ? (
            <div className="card empty-state"><UserCheck size={36} style={{ margin:'0 auto 12px', opacity:0.25 }}/><p>No staff added yet</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {staff.filter(s => staffFilter === 'all' || s.role === staffFilter).map(s => (
                <QRCard key={s._id} name={`${s.firstName} ${s.lastName}`} uid={s.uid} role={s.role?.replace('_',' ')} qrCode={s.qrCode} color="#1e3a5f" />
              ))}
            </div>
          )}
        </>
      )}
    </HospitalLayout>
  );
}
