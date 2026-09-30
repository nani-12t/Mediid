import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, Mail, Edit2, Trash2, X, Star, QrCode, Download, Badge, Users, UserCheck, Pill } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HospitalLayout from '../../components/common/HospitalLayout';
import api, { doctorAPI, staffAPI, authAPI } from '../../utils/api';
import toast from 'react-hot-toast';

/* ─── Constants ─── */
const SPECIALIZATIONS = ['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Oncology', 'Dermatology', 'Psychiatry', 'Radiology', 'General Medicine', 'Gynecology', 'Urology', 'ENT', 'Ophthalmology', 'Gastroenterology', 'Nephrology'];
const DOCTOR_TYPES = ['Senior Doctor', 'Junior Doctor', 'Duty Doctor', 'Visiting Consultant'];
const DOCTOR_SHIFTS = ['Morning (6AM-2PM)', 'Afternoon (2PM-10PM)', 'Night (10PM-6AM)', '24/7 On-Call'];
const STAFF_ROLES = ['nurse', 'lab_technician', 'pharmacist', 'receptionist', 'radiologist', 'administrator', 'ward_boy', 'security', 'physiotherapist', 'other'];
const STAFF_SHIFTS = ['morning','afternoon','night','rotational'];

const emptyDoc = {
  firstName: '', lastName: '', doctorType: '', specialization: '', qualifications: '', experience: '', phone: '', email: '',
  consultationFee: '', expertise: '', languages: 'Hindi, English', availability: [], currentShift: '', dutyStatus: 'Available',
  assignedWard: '', emergencyContact: ''
};

const emptyStaff = { firstName:'', lastName:'', role:'nurse', department:'', phone:'', email:'', experience:'', qualifications:'', shift:'morning', dateOfJoining:'' };

export default function HospitalManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('doctors'); // 'doctors' or 'staff'
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [hospital, setHospital] = useState(null);

  /* ── Doctor States ── */
  const [doctors, setDoctors] = useState([]);
  const [showDocModal, setShowDocModal] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [docForm, setDocForm] = useState(emptyDoc);
  const [docFilterType, setDocFilterType] = useState('');
  const [docFilterStatus, setDocFilterStatus] = useState('');

  /* ── Staff States ── */
  const [staff, setStaff] = useState([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showStaffQR, setShowStaffQR] = useState(null);
  const [staffForm, setStaffForm] = useState(emptyStaff);
  const [staffRoleFilter, setStaffRoleFilter] = useState('');
  
  /* ── Login Management States ── */
  const [showDocLoginModal, setShowDocLoginModal] = useState(null); // doctor object
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  /* ── Load Data ── */
  const loadDoctors = async () => {
    try {
      const { data } = await doctorAPI.search({});
      setDoctors(data);
    } catch (e) {}
  };

  const loadStaff = async () => {
    try {
      const { data } = await staffAPI.search({});
      setStaff(data);
    } catch(e) { toast.error('Failed to load staff'); }
  };

  const loadHospital = async () => {
    try {
      const { data } = await authAPI.me();
      setHospital(data.profile);
    } catch (e) {}
  };

  useEffect(() => {
    loadDoctors();
    loadStaff();
    loadHospital();
  }, []);

  /* ── Doctor Handlers ── */
  const openAddDoc = () => { setDocForm(emptyDoc); setEditDoc(null); setShowDocModal(true); };
  const openEditDoc = (doc) => {
    setDocForm({ ...doc, qualifications: doc.qualifications?.join(', ') || '', expertise: doc.expertise?.join(', ') || '', languages: doc.languages?.join(', ') || '' });
    setEditDoc(doc._id);
    setShowDocModal(true);
  };

  const handleDocSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...docForm,
        qualifications: docForm.qualifications.split(',').map(s => s.trim()).filter(Boolean),
        expertise: docForm.expertise.split(',').map(s => s.trim()).filter(Boolean),
        languages: docForm.languages.split(',').map(s => s.trim()).filter(Boolean),
        experience: Number(docForm.experience),
        consultationFee: Number(docForm.consultationFee)
      };
      if (editDoc) {
        await doctorAPI.updateDoctor(editDoc, payload);
        toast.success('Doctor updated successfully');
      } else {
        await doctorAPI.addDoctor(payload);
        toast.success('Doctor added successfully');
      }
      setShowDocModal(false);
      loadDoctors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDocDelete = async (id) => {
    if (!window.confirm('Remove this doctor?')) return;
    try {
      await doctorAPI.deleteDoctor(id);
      toast.success('Doctor removed');
      loadDoctors();
    } catch { toast.error('Failed to remove'); }
  };

  /* ── Staff Handlers ── */
  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...staffForm, qualifications: staffForm.qualifications.split(',').map(s=>s.trim()).filter(Boolean), experience: Number(staffForm.experience) };
      const { data } = await staffAPI.createStaff(payload);
      toast.success(`✅ Staff added! ID: ${data.uid}`);
      setShowStaffModal(false);
      setStaffForm(emptyStaff);
      loadStaff();
    } catch(err) {
      toast.error(err.response?.data?.message || 'Failed to add staff');
    } finally { setLoading(false); }
  };

  const handleStaffDelete = async (id) => {
    if(!window.confirm('Remove this staff member?')) return;
    try {
      await staffAPI.deleteStaff(id);
      toast.success('Staff removed');
      loadStaff();
    } catch { toast.error('Delete failed'); }
  };

  const handleLoginSetup = async (e, type) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = type === 'doctor' ? '/hospital-admin/doctor-login' : '/hospital-admin/pharmacy-login';
      const payload = type === 'doctor' ? { doctorId: showDocLoginModal._id, ...loginForm } : loginForm;
      
      await api.post(endpoint, payload);
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} login setup successful`);
      setShowDocLoginModal(null);
      setLoginForm({ email: '', password: '' });
      if (type === 'doctor') loadDoctors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadStaffQR = (s) => {
    const link = document.createElement('a');
    link.download = `${s.uid}-QR.png`;
    link.href = s.qrCode;
    link.click();
  };

  /* ── Filtering ── */
  const filteredDoctors = doctors.filter(d => {
    const matchesSearch = `${d.firstName} ${d.lastName} ${d.specialization}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = !docFilterType || d.doctorType === docFilterType;
    const matchesStatus = !docFilterStatus || d.dutyStatus === docFilterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const filteredStaff = staff.filter(s => {
    const name = `${s.firstName} ${s.lastName} ${s.role} ${s.department || ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchRole = !staffRoleFilter || s.role === staffRoleFilter;
    return matchSearch && matchRole;
  });

  const staffRoleColors = { nurse:'badge-teal', receptionist:'badge-blue', lab_technician:'badge-amber', pharmacist:'badge-green', administrator:'badge-red', radiologist:'badge-blue', physiotherapist:'badge-teal', security:'badge-gray', ward_boy:'badge-gray', other:'badge-gray' };

  return (
    <HospitalLayout title="Management">
      
      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--gray-100)', paddingBottom: 4 }}>
        <button 
          onClick={() => { setActiveTab('doctors'); setSearch(''); }}
          style={{ 
            padding: '8px 24px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, 
            background: activeTab === 'doctors' ? 'var(--navy)' : 'transparent', 
            color: activeTab === 'doctors' ? 'white' : 'var(--gray-500)',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
          }}
        >
          <Users size={18} /> Doctors
        </button>
        <button 
          onClick={() => { setActiveTab('staff'); setSearch(''); }}
          style={{ 
            padding: '8px 24px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, 
            background: activeTab === 'staff' ? 'var(--navy)' : 'transparent', 
            color: activeTab === 'staff' ? 'white' : 'var(--gray-500)',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
          }}
        >
          <UserCheck size={18} /> Staff
        </button>
      </div>

      {/* ── Header Area ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>
            {activeTab === 'doctors' ? 'Doctor Directory' : 'Staff Directory'}
          </h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {activeTab === 'doctors' ? `${doctors.length} doctors registered` : `${staff.length} staff members registered`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={activeTab === 'doctors' ? openAddDoc : () => setShowStaffModal(true)}>
            <Plus size={16} /> {activeTab === 'doctors' ? 'Add Doctor' : 'Recruit Staff'}
          </button>
        </div>
      </div>

      {/* ── Common Search ── */}
      <div className="search-bar" style={{ marginBottom: 20 }}>
        <Search size={18} color="var(--gray-400)" />
        <input 
          placeholder={activeTab === 'doctors' ? "Search doctors by name or specialization..." : "Search staff by name, role, or department..."} 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
        />
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'doctors' ? (
        <>
          {/* Doctor Filters */}
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Filters:</span>
              <select value={docFilterType} onChange={e => setDocFilterType(e.target.value)} className="form-input" style={{ width: 160 }}>
                <option value="">All Types</option>
                {DOCTOR_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <select value={docFilterStatus} onChange={e => setDocFilterStatus(e.target.value)} className="form-input" style={{ width: 160 }}>
                <option value="">All Status</option>
                <option value="Available">Available</option>
                <option value="On Duty">On Duty</option>
                <option value="Off Duty">Off Duty</option>
                <option value="On Leave">On Leave</option>
              </select>
              {(docFilterType || docFilterStatus) && (
                <button onClick={() => { setDocFilterType(''); setDocFilterStatus(''); }} className="btn btn-ghost btn-sm">Clear</button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filteredDoctors.map(doc => (
              <div key={doc._id} className="card">
                <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                  <div className="avatar" style={{ width: 52, height: 52 }}>{doc.firstName[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600 }}>Dr. {doc.firstName} {doc.lastName}</h3>
                      <span className={`badge ${doc.dutyStatus === 'Available' ? 'badge-green' : 'badge-blue'}`}>{doc.dutyStatus}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{doc.specialization}</p>
                    <p style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, marginTop: 4 }}>ID: {doc.uid}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditDoc(doc)} title="Edit Details"><Edit2 size={14} /></button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowDocQR(doc)} title="View ID Card"><QrCode size={14} /></button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDocDelete(doc._id)} title="Remove Doctor"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* Staff Filters */}
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Filter by Role:</span>
              <select value={staffRoleFilter} onChange={e => setStaffRoleFilter(e.target.value)} className="form-input" style={{ width: 180 }}>
                <option value="">All Roles</option>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filteredStaff.map(s => (
              <div key={s._id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                  <div className="avatar" style={{ width: 48, height: 48 }}>{s.firstName[0]}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 15 }}>{s.firstName} {s.lastName}</p>
                    <span className={`badge ${staffRoleColors[s.role] || 'badge-gray'}`}>{s.role?.replace('_',' ')}</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 12 }}>ID: {s.uid}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowStaffQR(s)}><QrCode size={14} /> QR</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleStaffDelete(s._id)}><X size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      
      {/* Doctor Modal */}
      {showDocModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDocModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>{editDoc ? 'Edit Doctor' : 'Add Doctor'}</h2>
            <form onSubmit={handleDocSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input className="form-input" placeholder="First Name" value={docForm.firstName} onChange={e=>setDocForm({...docForm, firstName: e.target.value})} required />
                <input className="form-input" placeholder="Last Name" value={docForm.lastName} onChange={e=>setDocForm({...docForm, lastName: e.target.value})} required />
              </div>
              <select className="form-input mt-2" value={docForm.specialization} onChange={e=>setDocForm({...docForm, specialization: e.target.value})} required>
                <option value="">Select Specialization</option>
                {SPECIALIZATIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setShowDocModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">{loading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Modal */}
      {showStaffModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStaffModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>Recruit Staff Member</h2>
            <form onSubmit={handleStaffSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input className="form-input" placeholder="First Name" value={staffForm.firstName} onChange={e=>setStaffForm({...staffForm, firstName: e.target.value})} required />
                <input className="form-input" placeholder="Last Name" value={staffForm.lastName} onChange={e=>setStaffForm({...staffForm, lastName: e.target.value})} required />
              </div>
              <select className="form-input mt-2" value={staffForm.role} onChange={e=>setStaffForm({...staffForm, role: e.target.value})} required>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" onClick={() => setShowStaffModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">{loading ? 'Recruiting...' : '✨ Recruit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff QR Modal */}
      {showStaffQR && (
        <div className="modal-overlay" onClick={() => setShowStaffQR(null)}>
          <div className="modal" style={{ textAlign: 'center', maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 20 }}>Staff ID Card</h2>
            <div style={{ background: 'var(--navy)', padding: 24, borderRadius: 16, marginBottom: 16 }}>
              {showStaffQR.qrCode ? <img src={showStaffQR.qrCode} alt="QR" style={{ width: 180, background: 'white', padding: 8, borderRadius: 8 }} /> : <QrCode size={60} color="white" />}
              <p style={{ color: 'var(--teal)', fontWeight: 700, marginTop: 16 }}>{showStaffQR.uid}</p>
              <p style={{ color: 'white' }}>{showStaffQR.firstName} {showStaffQR.lastName}</p>
            </div>
            <button className="btn btn-primary btn-full" onClick={() => downloadStaffQR(showStaffQR)}>Download QR</button>
          </div>
        </div>
      )}

      {/* Doctor Login Modal */}
      {showDocLoginModal && (
        <div className="modal-overlay" onClick={() => setShowDocLoginModal(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2 style={{ marginBottom: 20 }}>Doctor Login Setup</h2>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Set unique credentials for Dr. {showDocLoginModal.firstName} {showDocLoginModal.lastName}</p>
            <form onSubmit={(e) => handleLoginSetup(e, 'doctor')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Email (Login ID)</label>
                  <input className="form-input" type="email" placeholder="doctor@hospital.com" value={loginForm.email} onChange={e=>setLoginForm({...loginForm, email: e.target.value})} required />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Password</label>
                  <input className="form-input" type="password" placeholder="Min 6 characters" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password: e.target.value})} required />
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDocLoginModal(null)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{loading ? 'Setting up...' : 'Setup Login'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}




    </HospitalLayout>
  );
}
