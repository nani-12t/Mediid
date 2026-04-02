import React, { useState, useEffect } from 'react';
import { Plus, Search, QrCode, X, Download, Badge } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import toast from 'react-hot-toast';
import axios from 'axios';

const ROLES = ['nurse','receptionist','lab_technician','pharmacist','ward_boy','security','administrator','radiologist','physiotherapist','other'];
const SHIFTS = ['morning','afternoon','night','rotational'];

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(c => { const t = localStorage.getItem('mediid_token'); if(t) c.headers.Authorization=`Bearer ${t}`; return c; });

const emptyForm = { firstName:'', lastName:'', role:'nurse', department:'', phone:'', email:'', experience:'', qualifications:'', shift:'morning', dateOfJoining:'' };

export default function HospitalStaff() {
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showQR, setShowQR] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(data);
    } catch(e) { toast.error('Failed to load staff'); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, qualifications: form.qualifications.split(',').map(s=>s.trim()).filter(Boolean), experience: Number(form.experience) };
      const { data } = await api.post('/staff', payload);
      toast.success(`✅ Staff added! ID: ${data.uid}`);
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch(err) {
      toast.error(err.response?.data?.message || 'Failed to add staff');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if(!window.confirm('Remove this staff member?')) return;
    try {
      await api.delete(`/staff/${id}`);
      toast.success('Staff removed');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const downloadQR = (staff) => {
    const link = document.createElement('a');
    link.download = `${staff.uid}-QR.png`;
    link.href = staff.qrCode;
    link.click();
  };

  const filtered = staff.filter(s => {
    const name = `${s.firstName} ${s.lastName} ${s.role} ${s.department || ''}`.toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchRole = !roleFilter || s.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleColors = { nurse:'badge-teal', receptionist:'badge-blue', lab_technician:'badge-amber', pharmacist:'badge-green', administrator:'badge-red', radiologist:'badge-blue', physiotherapist:'badge-teal', security:'badge-gray', ward_boy:'badge-gray', other:'badge-gray' };

  return (
    <HospitalLayout title="Staff Management">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h2 style={{ fontSize:20, fontFamily:'var(--font-display)', fontWeight:700, marginBottom:2 }}>Staff Directory</h2>
          <p style={{ color:'var(--gray-500)', fontSize:14 }}>{staff.length} staff members · Each gets a unique ID & QR on recruitment</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Recruit Staff</button>
      </div>

      {/* Info Banner */}
      <div style={{ background:'linear-gradient(135deg,#e0f2fe,#ccfbf1)', borderRadius:10, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
        <QrCode size={22} color="var(--teal)" />
        <p style={{ fontSize:13, color:'var(--navy)' }}>
          Every recruited staff member automatically gets a unique ID in the format <strong>HID-XXXXXXXX-STF-0001</strong> tied to this hospital, along with a scannable QR card.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <div className="search-bar" style={{ flex:1, minWidth:200 }}>
          <Search size={18} color="var(--gray-400)" />
          <input placeholder="Search by name, role, department..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="form-input" style={{ width:180 }} value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <Badge size={40} style={{ margin:'0 auto 12px', opacity:0.25 }} />
          <p>No staff members yet. Recruit your first staff member.</p>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:16 }}>
          {filtered.map(s => (
            <div key={s._id} className="card">
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:12 }}>
                <div className="avatar" style={{ width:48, height:48, fontSize:18, background:'linear-gradient(135deg, #1e3a5f, #0e4a4a)', flexShrink:0 }}>
                  {s.firstName[0]}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:600, fontSize:15 }}>{s.firstName} {s.lastName}</p>
                  <span className={`badge ${roleColors[s.role] || 'badge-gray'}`} style={{ fontSize:11, textTransform:'capitalize' }}>
                    {s.role?.replace('_',' ')}
                  </span>
                  {s.department && <p style={{ fontSize:12, color:'var(--gray-400)', marginTop:3 }}>🏢 {s.department}</p>}
                </div>
                <span className={`badge ${s.status === 'active' ? 'badge-teal' : 'badge-amber'}`} style={{ fontSize:11 }}>{s.status}</span>
              </div>

              {/* UID Badge */}
              <div style={{ background:'var(--navy)', borderRadius:8, padding:'8px 12px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <p style={{ fontSize:10, color:'rgba(255,255,255,0.4)', letterSpacing:'0.08em', marginBottom:2 }}>STAFF ID</p>
                  <p style={{ fontFamily:'var(--font-display)', fontSize:12, fontWeight:700, color:'var(--teal)', letterSpacing:'0.05em' }}>{s.uid}</p>
                </div>
                <QrCode size={18} color="rgba(255,255,255,0.3)" />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                {[
                  { label:'Experience', value: s.experience ? `${s.experience} yrs` : '—' },
                  { label:'Shift', value: s.shift || '—' },
                  { label:'Phone', value: s.phone || '—' },
                  { label:'Joined', value: s.dateOfJoining ? new Date(s.dateOfJoining).toLocaleDateString('en-IN') : '—' }
                ].map(item => (
                  <div key={item.label} style={{ background:'var(--gray-50)', borderRadius:6, padding:'7px 10px' }}>
                    <p style={{ fontSize:10, color:'var(--gray-400)', marginBottom:1 }}>{item.label}</p>
                    <p style={{ fontSize:12, fontWeight:500 }}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => setShowQR(s)}>
                  <QrCode size={14} /> View QR
                </button>
                {s.qrCode && (
                  <button className="btn btn-secondary btn-sm" onClick={() => downloadQR(s)}>
                    <Download size={14} />
                  </button>
                )}
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s._id)}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Staff Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth:560 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <h2 style={{ fontSize:18, fontFamily:'var(--font-display)', fontWeight:700 }}>Recruit Staff Member</h2>
                <p style={{ fontSize:12, color:'var(--gray-400)', marginTop:2 }}>A unique Staff ID & QR will be auto-generated on recruitment</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input className="form-input" value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="form-input" value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} required />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-input form-select" value={form.role} onChange={e=>setForm({...form,role:e.target.value})} required>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input className="form-input" placeholder="ICU, OPD, Radiology..." value={form.department} onChange={e=>setForm({...form,department:e.target.value})} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div className="form-group">
                  <label className="form-label">Experience (yrs)</label>
                  <input className="form-input" type="number" value={form.experience} onChange={e=>setForm({...form,experience:e.target.value})} />
                </div>
                <div className="form-group">
                  <label className="form-label">Shift</label>
                  <select className="form-input form-select" value={form.shift} onChange={e=>setForm({...form,shift:e.target.value})}>
                    {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date of Joining</label>
                  <input className="form-input" type="date" value={form.dateOfJoining} onChange={e=>setForm({...form,dateOfJoining:e.target.value})} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Qualifications (comma separated)</label>
                <input className="form-input" placeholder="B.Sc Nursing, GNM, ANM" value={form.qualifications} onChange={e=>setForm({...form,qualifications:e.target.value})} />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Generating ID & QR...' : '✨ Recruit & Generate ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR View Modal */}
      {showQR && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowQR(null)}>
          <div className="modal" style={{ textAlign:'center', maxWidth:340 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h2 style={{ fontSize:17, fontFamily:'var(--font-display)', fontWeight:700 }}>Staff ID Card</h2>
              <button onClick={() => setShowQR(null)} style={{ background:'none', border:'none', cursor:'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ background:'var(--navy)', borderRadius:16, padding:24, marginBottom:16 }}>
              {showQR.qrCode ? (
                <img src={showQR.qrCode} alt="Staff QR" style={{ width:180, height:180, borderRadius:10, background:'white', padding:8 }} />
              ) : (
                <div style={{ width:180, height:180, background:'rgba(255,255,255,0.05)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}>
                  <QrCode size={60} color="rgba(255,255,255,0.2)" />
                </div>
              )}
              <p style={{ fontFamily:'var(--font-display)', fontSize:13, fontWeight:700, color:'var(--teal)', letterSpacing:'0.08em', marginTop:14 }}>{showQR.uid}</p>
              <p style={{ fontSize:14, color:'white', fontWeight:600, marginTop:4 }}>{showQR.firstName} {showQR.lastName}</p>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', textTransform:'capitalize' }}>{showQR.role?.replace('_',' ')} · {showQR.department || 'General'}</p>
            </div>
            <button className="btn btn-primary btn-full" onClick={() => downloadQR(showQR)}>
              <Download size={16} /> Download QR Card
            </button>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
