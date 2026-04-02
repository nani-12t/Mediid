import React, { useState, useEffect } from 'react';
import { Plus, Search, Phone, Mail, Edit2, Trash2, X, Star } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { doctorAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const SPECIALIZATIONS = ['Cardiology', 'Neurology', 'Orthopedics', 'Pediatrics', 'Oncology', 'Dermatology', 'Psychiatry', 'Radiology', 'General Medicine', 'Gynecology', 'Urology', 'ENT', 'Ophthalmology', 'Gastroenterology', 'Nephrology'];
const DOCTOR_TYPES = ['Junior Doctor', 'Senior Doctor', 'Duty Doctor', 'Visiting Consultant', 'External Surgeon'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHIFTS = ['Morning (6AM-2PM)', 'Afternoon (2PM-10PM)', 'Night (10PM-6AM)', '24/7 On-Call'];

const emptyDoc = {
  firstName: '',
  lastName: '',
  doctorType: '',
  specialization: '',
  qualifications: '',
  experience: '',
  phone: '',
  email: '',
  consultationFee: '',
  expertise: '',
  languages: 'Hindi, English',
  availability: [],
  currentShift: '',
  dutyStatus: 'Available', // Available, On Duty, Off Duty, On Leave
  assignedWard: '',
  emergencyContact: ''
};

export default function HospitalDoctors() {
  const [doctors, setDoctors] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [form, setForm] = useState(emptyDoc);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    try {
      const { data } = await doctorAPI.search({});
      setDoctors(data);
    } catch (e) {}
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm(emptyDoc); setEditDoc(null); setShowModal(true); };
  const openEdit = (doc) => {
    setForm({ ...doc, qualifications: doc.qualifications?.join(', ') || '', expertise: doc.expertise?.join(', ') || '', languages: doc.languages?.join(', ') || '' });
    setEditDoc(doc._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        qualifications: form.qualifications.split(',').map(s => s.trim()).filter(Boolean),
        expertise: form.expertise.split(',').map(s => s.trim()).filter(Boolean),
        languages: form.languages.split(',').map(s => s.trim()).filter(Boolean),
        experience: Number(form.experience),
        consultationFee: Number(form.consultationFee)
      };
      if (editDoc) {
        await doctorAPI.updateDoctor(editDoc, payload);
        toast.success('Doctor updated successfully');
      } else {
        await doctorAPI.addDoctor(payload);
        toast.success('Doctor added successfully');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this doctor?')) return;
    try {
      await doctorAPI.deleteDoctor(id);
      toast.success('Doctor removed');
      load();
    } catch { toast.error('Failed to remove'); }
  };

  const filtered = doctors.filter(d => {
    const matchesSearch = `${d.firstName} ${d.lastName} ${d.specialization}`.toLowerCase().includes(search.toLowerCase());
    const matchesType = !filterType || d.doctorType === filterType;
    const matchesStatus = !filterStatus || d.dutyStatus === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <HospitalLayout title="Doctors">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Doctor Directory</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>{doctors.length} doctors registered</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Doctor</button>
      </div>

      <div className="search-bar" style={{ marginBottom: 20 }}>
        <Search size={18} color="var(--gray-400)" />
        <input placeholder="Search by name or specialization..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Filters:</span>
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              fontSize: 13,
              background: 'var(--white)',
              outline: 'none',
              minWidth: 140
            }}
          >
            <option value="">All Doctor Types</option>
            {DOCTOR_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              fontSize: 13,
              background: 'var(--white)',
              outline: 'none',
              minWidth: 140
            }}
          >
            <option value="">All Duty Status</option>
            <option value="Available">Available</option>
            <option value="On Duty">On Duty</option>
            <option value="Off Duty">Off Duty</option>
            <option value="On Leave">On Leave</option>
          </select>

          {(filterType || filterStatus) && (
            <button
              onClick={() => { setFilterType(''); setFilterStatus(''); }}
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <p>No doctors found. Add your first doctor to get started.</p>
          <button className="btn btn-primary" onClick={openAdd} style={{ marginTop: 16 }}><Plus size={16} /> Add Doctor</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filtered.map(doc => (
            <div key={doc._id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 14, marginBottom: 12 }}>
                <div className="avatar" style={{ width: 52, height: 52, fontSize: 20, flexShrink: 0 }}>{doc.firstName[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>Dr. {doc.firstName} {doc.lastName}</h3>
                    <span className={`badge ${doc.dutyStatus === 'Available' ? 'badge-green' : doc.dutyStatus === 'On Duty' ? 'badge-blue' : doc.dutyStatus === 'On Leave' ? 'badge-yellow' : 'badge-gray'}`}>
                      {doc.dutyStatus || 'Available'}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500 }}>{doc.doctorType} • {doc.specialization}</p>
                  <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>{doc.qualifications?.join(' | ')}</p>
                  {doc.currentShift && (
                    <p style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 500 }}>Shift: {doc.currentShift}</p>
                  )}
                  {doc.assignedWard && (
                    <p style={{ fontSize: 12, color: 'var(--navy)' }}>Ward: {doc.assignedWard}</p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Experience', value: doc.experience ? `${doc.experience} yrs` : '—' },
                  { label: 'Fee', value: doc.consultationFee ? `₹${doc.consultationFee}` : '—' },
                  { label: 'Rating', value: doc.rating?.average ? `⭐ ${doc.rating.average}` : 'New' },
                  { label: 'Patients', value: doc.rating?.count || 0 }
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>{item.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{item.value}</p>
                  </div>
                ))}
              </div>

              {doc.expertise?.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  {doc.expertise.slice(0, 3).map(e => <span key={e} className="badge badge-teal" style={{ fontSize: 11 }}>{e}</span>)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {doc.phone && <a href={`tel:${doc.phone}`} className="btn btn-secondary btn-sm"><Phone size={14} /></a>}
                {doc.email && <a href={`mailto:${doc.email}`} className="btn btn-secondary btn-sm"><Mail size={14} /></a>}
                <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openEdit(doc)}><Edit2 size={14} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc._id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{editDoc ? 'Edit Doctor' : 'Add New Doctor'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input className="form-input" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="form-input" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Doctor Type *</label>
                <select className="form-input form-select" value={form.doctorType} onChange={e => setForm({ ...form, doctorType: e.target.value })} required>
                  <option value="">Select doctor type</option>
                  {DOCTOR_TYPES.map(type => <option key={type}>{type}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Specialization *</label>
                <select className="form-input form-select" value={form.specialization} onChange={e => setForm({ ...form, specialization: e.target.value })} required>
                  <option value="">Select specialization</option>
                  {SPECIALIZATIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Qualifications (comma separated)</label>
                  <input className="form-input" placeholder="MBBS, MD, DM" value={form.qualifications} onChange={e => setForm({ ...form, qualifications: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Experience (years)</label>
                  <input className="form-input" type="number" value={form.experience} onChange={e => setForm({ ...form, experience: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Current Shift</label>
                  <select className="form-input form-select" value={form.currentShift} onChange={e => setForm({ ...form, currentShift: e.target.value })}>
                    <option value="">Select shift</option>
                    {SHIFTS.map(shift => <option key={shift}>{shift}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Duty Status</label>
                  <select className="form-input form-select" value={form.dutyStatus} onChange={e => setForm({ ...form, dutyStatus: e.target.value })}>
                    <option value="Available">Available</option>
                    <option value="On Duty">On Duty</option>
                    <option value="Off Duty">Off Duty</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Assigned Ward</label>
                  <input className="form-input" placeholder="e.g., ICU, Ward A, Emergency" value={form.assignedWard} onChange={e => setForm({ ...form, assignedWard: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Emergency Contact</label>
                  <input className="form-input" type="tel" placeholder="Emergency contact number" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Areas of Expertise (comma separated)</label>
                <input className="form-input" placeholder="Heart Surgery, Angioplasty, Echo" value={form.expertise} onChange={e => setForm({ ...form, expertise: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Languages Known</label>
                <input className="form-input" placeholder="Hindi, English, Tamil" value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving...' : editDoc ? 'Update Doctor' : 'Add Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
