import React, { useState, useEffect } from 'react';
import { Save, Building2, Phone, Award, Bed, Truck, FlaskConical, Stethoscope, Users, Plus, Pencil, Check, X } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { hospitalAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const SectionCard = ({ icon: Icon, title, children, fullWidth }) => (
  <div className="card" style={{ gridColumn: fullWidth ? '1 / -1' : undefined }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <Icon size={18} color="var(--teal)" />
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
    </div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    {children}
  </div>
);

const NumInput = ({ value, onChange, placeholder }) => (
  <input className="form-input" type="number" min="0" value={value}
    onChange={onChange} placeholder={placeholder || '0'} />
);

const DEPT_LIST = [
  ['cardiology',      'Cardiology'],
  ['neurology',       'Neurology'],
  ['orthopedics',     'Orthopedics'],
  ['pediatrics',      'Pediatrics'],
  ['gynecology',      'Gynecology'],
  ['ent',             'ENT'],
  ['dermatology',     'Dermatology'],
  ['generalMedicine', 'General Medicine'],
  ['generalSurgery',  'General Surgery'],
];

const defaultDeptDoctors = () =>
  Object.fromEntries(DEPT_LIST.map(([key]) => [key, { senior: '', junior: '', specializations: [] }]));

const defaultForm = {
  name: '', type: 'private',
  contact: { phone: '', email: '', website: '', emergencyPhone: '' },
  address: { street: '', city: '', state: '', pincode: '' },
  specialties: '', facilities: '', accreditations: '',
  operatingHours: { weekdays: { open: '08:00', close: '20:00' }, weekends: { open: '09:00', close: '17:00' }, is24x7: false },
  totalBeds: '', icuBeds: '', ventilators: '', nicuBeds: '', picuBeds: '',
  operationTheaters: { total: '', generalSurgery: '', orthopedic: '', cardiac: '', emergency: '', gynecology: '' },
  pharmacy: { available: false, is24x7: false },
  wards: { male: '', female: '', children: '' },
  privateRooms: { single: '', deluxe: '', shared: '' },
  ambulances: { total: '', basic: '', icu: '', cardiac: '' },
  emergencyRoom: { available: false, is24x7: false },
  traumaCenter: false, bloodBank: false, laboratory: false,
  dialysisUnit: { available: false, beds: '' },
  oxygenBeds: '', isolationRooms: '',
  radiology: { xray: false, ctScan: false, mri: false, ultrasound: false },
  staffing: {
    totalDoctors: '', deptBreakdownOpen: false, deptDoctors: defaultDeptDoctors(),
    totalStaff: '', staffBreakdownOpen: false,
    breakdown: { nurse: '', receptionist: '', lab_technician: '', pharmacist: '', ward_boy: '', security: '', administrator: '', radiologist: '', physiotherapist: '', other: '' },
  },
  departments: Object.fromEntries(DEPT_LIST.map(([k]) => [k, false])),
  visitingHours: { from: '10:00', to: '20:00' },
};

function SpecializationEditor({ items = [], onChange }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');

  const commit = (idx) => {
    const next = [...items]; next[idx] = draft.trim();
    onChange(next.filter(Boolean)); setEditing(null);
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const addNew = () => {
    if (!newVal.trim()) return setAdding(false);
    onChange([...items, newVal.trim()]); setNewVal(''); setAdding(false);
  };

  const pill = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 999, fontSize: 12,
    background: '#e6f7f5', color: 'var(--teal)',
    border: '1px solid #b2e8e2', marginRight: 4, marginBottom: 4,
  };

  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map((sp, idx) => (
        <span key={idx} style={pill}>
          {editing === idx ? (
            <>
              <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commit(idx); if (e.key === 'Escape') setEditing(null); }}
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 100, color: 'var(--teal)' }} />
              <Check size={12} style={{ cursor: 'pointer' }} onClick={() => commit(idx)} />
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setEditing(null)} />
            </>
          ) : (
            <>
              {sp}
              <Pencil size={11} style={{ cursor: 'pointer', opacity: 0.6, marginLeft: 2 }} onClick={() => { setEditing(idx); setDraft(sp); }} />
              <X size={11} style={{ cursor: 'pointer', opacity: 0.6 }} onClick={() => remove(idx)} />
            </>
          )}
        </span>
      ))}
      {adding ? (
        <span style={{ ...pill, background: '#fff', border: '1px dashed var(--teal)' }}>
          <input autoFocus value={newVal} onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="e.g. Interventional"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, width: 130, color: 'var(--teal)' }} />
          <Check size={12} style={{ cursor: 'pointer' }} onClick={addNew} />
          <X size={12} style={{ cursor: 'pointer' }} onClick={() => setAdding(false)} />
        </span>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          style={{ ...pill, background: 'transparent', border: '1px dashed #ccc', color: '#888', cursor: 'pointer' }}>
          <Plus size={11} /> Add specialization
        </button>
      )}
    </div>
  );
}

export default function HospitalSettings() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await hospitalAPI.getAdminProfile();
        if (data) {
          setForm(prev => ({
            ...prev, ...data,
            specialties: data.specialties?.join(', ') || '',
            facilities: data.facilities?.join(', ') || '',
            accreditations: data.accreditations?.join(', ') || '',
            operationTheaters: { ...prev.operationTheaters, ...(data.operationTheaters || {}) },
            pharmacy: { ...prev.pharmacy, ...(data.pharmacy || {}) },
            wards: { ...prev.wards, ...(data.wards || {}) },
            privateRooms: { ...prev.privateRooms, ...(data.privateRooms || {}) },
            ambulances: { ...prev.ambulances, ...(data.ambulances || {}) },
            emergencyRoom: { ...prev.emergencyRoom, ...(data.emergencyRoom || {}) },
            dialysisUnit: { ...prev.dialysisUnit, ...(data.dialysisUnit || {}) },
            radiology: { ...prev.radiology, ...(data.radiology || {}) },
            staffing: {
              ...prev.staffing, ...(data.staffing || {}),
              breakdown: { ...prev.staffing.breakdown, ...(data.staffing?.breakdown || {}) },
              deptDoctors: { ...prev.staffing.deptDoctors, ...(data.staffing?.deptDoctors || {}) },
            },
            departments: { ...prev.departments, ...(data.departments || {}) },
            visitingHours: { ...prev.visitingHours, ...(data.visitingHours || {}) },
          }));
        }
      } catch (e) {}
    };
    load();
  }, []);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const setNested = (parent, key, value) => setForm(prev => ({ ...prev, [parent]: { ...prev[parent], [key]: value } }));

  const setDeptDoc = (dept, field, value) =>
    setForm(prev => ({
      ...prev,
      staffing: {
        ...prev.staffing,
        deptDoctors: { ...prev.staffing.deptDoctors, [dept]: { ...prev.staffing.deptDoctors[dept], [field]: value } },
      },
    }));

  const setDeptSpec = (dept, arr) =>
    setForm(prev => ({
      ...prev,
      staffing: {
        ...prev.staffing,
        deptDoctors: { ...prev.staffing.deptDoctors, [dept]: { ...prev.staffing.deptDoctors[dept], specializations: arr } },
      },
    }));

  const toggleStaffing = (key) =>
    setForm(prev => ({ ...prev, staffing: { ...prev.staffing, [key]: !prev.staffing[key] } }));

  const handleSave = async () => {
    setLoading(true);
    try {
      await hospitalAPI.updateProfile({
        ...form,
        specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean),
        facilities: form.facilities.split(',').map(s => s.trim()).filter(Boolean),
        accreditations: form.accreditations.split(',').map(s => s.trim()).filter(Boolean),
      });
      toast.success('Hospital profile updated!');
    } catch { toast.error('Update failed'); }
    setLoading(false);
  };

  const activeDepts = DEPT_LIST.filter(([key]) => form.departments[key]);

  const gridTwo    = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
  const gridThree  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 };
  const checkLabel = { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, paddingBottom: 4 };
  const subLabel   = { fontSize: 12, color: 'var(--gray-400)', marginBottom: 8, marginTop: 4 };
  const accordion  = { marginTop: 14, border: '1px solid var(--gray-100)', borderRadius: 8, overflow: 'hidden' };
  const accBtn     = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--gray-50,#f9f9f9)', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' };

  return (
    <HospitalLayout title="Settings">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Hospital Settings</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Update hospital information and preferences</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          <Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Basic Information ── */}
        <SectionCard icon={Building2} title="Basic Information">
          <Field label="Hospital Name"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Type">
            <select className="form-input form-select" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="private">Private</option><option value="government">Government</option>
              <option value="trust">Trust / NGO</option><option value="clinic">Clinic</option>
            </select>
          </Field>
          <Field label="Accreditations (e.g. NABH, JCI)">
            <input className="form-input" placeholder="NABH, JCI" value={form.accreditations} onChange={e => set('accreditations', e.target.value)} />
          </Field>
          <div style={gridTwo}>
            <Field label="Visiting Hours — From"><input className="form-input" type="time" value={form.visitingHours.from} onChange={e => setNested('visitingHours', 'from', e.target.value)} /></Field>
            <Field label="Visiting Hours — To"><input className="form-input" type="time" value={form.visitingHours.to} onChange={e => setNested('visitingHours', 'to', e.target.value)} /></Field>
          </div>
        </SectionCard>

        {/* ── Contact & Address ── */}
        <SectionCard icon={Phone} title="Contact & Address">
          {['phone','email','website','emergencyPhone'].map(field => (
            <Field key={field} label={field === 'emergencyPhone' ? 'Emergency Phone' : field.charAt(0).toUpperCase() + field.slice(1)}>
              <input className="form-input" value={form.contact[field] || ''} onChange={e => setNested('contact', field, e.target.value)} />
            </Field>
          ))}
          <div style={gridTwo}>
            {['city','state','pincode'].map(f => (
              <Field key={f} label={f.charAt(0).toUpperCase() + f.slice(1)}>
                <input className="form-input" value={form.address[f] || ''} onChange={e => setNested('address', f, e.target.value)} />
              </Field>
            ))}
          </div>
        </SectionCard>

        {/* ── Bed Capacity ── */}
        <SectionCard icon={Bed} title="Bed Capacity">
          <div style={gridTwo}>
            {[['totalBeds','Total Beds'],['icuBeds','ICU Beds'],['nicuBeds','NICU Beds'],['picuBeds','PICU Beds'],
              ['ventilators','Ventilators'],['oxygenBeds','Oxygen Beds'],['isolationRooms','Isolation Rooms']].map(([k,l]) => (
              <Field key={k} label={l}><NumInput value={form[k]} onChange={e => set(k, e.target.value)} /></Field>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--gray-100)', margin: '14px 0', paddingTop: 14 }}>
            <p style={subLabel}>General Wards</p>
            <div style={gridThree}>
              {[['male','Male Ward Beds'],['female','Female Ward Beds'],['children','Children Ward Beds']].map(([k,l]) => (
                <Field key={k} label={l}><NumInput value={form.wards[k]} onChange={e => setNested('wards', k, e.target.value)} /></Field>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--gray-100)', margin: '14px 0', paddingTop: 14 }}>
            <p style={subLabel}>Private Rooms</p>
            <div style={gridThree}>
              {[['single','Single Rooms'],['deluxe','Deluxe Rooms'],['shared','Shared Rooms']].map(([k,l]) => (
                <Field key={k} label={l}><NumInput value={form.privateRooms[k]} onChange={e => setNested('privateRooms', k, e.target.value)} /></Field>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── Operation Theaters ── */}
        <SectionCard icon={FlaskConical} title="Operation Theaters">
          <Field label="Total OTs"><NumInput value={form.operationTheaters.total} onChange={e => setNested('operationTheaters', 'total', e.target.value)} /></Field>
          <p style={{ ...subLabel, marginTop: 12 }}>OT Breakdown by Type</p>
          <div style={gridTwo}>
            {[['generalSurgery','General Surgery OT'],['orthopedic','Orthopedic OT'],['cardiac','Cardiac OT'],['emergency','Emergency OT'],['gynecology','Gynecology OT']].map(([k,l]) => (
              <Field key={k} label={l}><NumInput value={form.operationTheaters[k]} onChange={e => setNested('operationTheaters', k, e.target.value)} /></Field>
            ))}
          </div>
        </SectionCard>

        {/* ── Ambulances ── */}
        <SectionCard icon={Truck} title="Ambulances">
          <Field label="Total Ambulances"><NumInput value={form.ambulances.total} onChange={e => setNested('ambulances', 'total', e.target.value)} /></Field>
          <p style={{ ...subLabel, marginTop: 12 }}>Ambulance Type Breakdown</p>
          <div style={gridThree}>
            {[['basic','Basic'],['icu','ICU Ambulance'],['cardiac','Cardiac Ambulance']].map(([k,l]) => (
              <Field key={k} label={l}><NumInput value={form.ambulances[k]} onChange={e => setNested('ambulances', k, e.target.value)} /></Field>
            ))}
          </div>
        </SectionCard>

        {/* ── Departments Available ── placed before Staffing so ticks drive dept breakdown ── */}
        <SectionCard icon={Building2} title="Departments Available">
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
            Ticked departments will appear in the Staffing section below for doctor counts.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DEPT_LIST.map(([key, label]) => (
              <label key={key} style={checkLabel}>
                <input type="checkbox" style={{ width: 16, height: 16 }}
                  checked={form.departments[key]}
                  onChange={e => setNested('departments', key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        </SectionCard>

        {/* ── Staffing ── */}
        <SectionCard icon={Users} title="Staffing" fullWidth>

          {/* Totals row */}
          <div style={gridTwo}>
            <Field label="Total Number of Doctors">
              <NumInput value={form.staffing.totalDoctors} onChange={e => setNested('staffing', 'totalDoctors', e.target.value)} />
            </Field>
            <Field label="Total Number of Staff">
              <NumInput value={form.staffing.totalStaff} onChange={e => setNested('staffing', 'totalStaff', e.target.value)} />
            </Field>
          </div>

          {/* Doctors by department accordion */}
          <div style={accordion}>
            <button type="button" style={accBtn} onClick={() => toggleStaffing('deptBreakdownOpen')}>
              <span>
                Doctors by department
                {activeDepts.length === 0 && (
                  <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--gray-400)', marginLeft: 6 }}>
                    — select departments above first
                  </span>
                )}
              </span>
              <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--teal)' }}>
                {form.staffing.deptBreakdownOpen ? '−' : '+'}
              </span>
            </button>

            {form.staffing.deptBreakdownOpen && (
              <div style={{ padding: '16px 16px 8px' }}>
                {activeDepts.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--gray-400)', textAlign: 'center', padding: '12px 0' }}>
                    No departments selected. Tick departments in the "Departments Available" card above.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {activeDepts.map(([key, label]) => {
                      const dd = form.staffing.deptDoctors[key] || { senior: '', junior: '', specializations: [] };
                      return (
                        <div key={key} style={{ background: 'var(--gray-50,#f9fafb)', borderRadius: 8, padding: '12px 14px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 10 }}>{label}</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                            <Field label="Senior Doctors">
                              <NumInput value={dd.senior} onChange={e => setDeptDoc(key, 'senior', e.target.value)} />
                            </Field>
                            <Field label="Junior Doctors">
                              <NumInput value={dd.junior} onChange={e => setDeptDoc(key, 'junior', e.target.value)} />
                            </Field>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Specializations in this department</p>
                          <SpecializationEditor
                            items={dd.specializations || []}
                            onChange={arr => setDeptSpec(key, arr)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Staff breakdown accordion */}
          <div style={accordion}>
            <button type="button" style={accBtn} onClick={() => toggleStaffing('staffBreakdownOpen')}>
              <span>Staff breakdown by category</span>
              <span style={{ fontSize: 18, lineHeight: 1, color: 'var(--teal)' }}>{form.staffing.staffBreakdownOpen ? '−' : '+'}</span>
            </button>
            {form.staffing.staffBreakdownOpen && (
              <div style={{ padding: '14px 14px 6px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 12 }}>
                {[['nurse','Nurses'],['receptionist','Receptionists'],['lab_technician','Lab Technicians'],
                  ['pharmacist','Pharmacists'],['ward_boy','Ward Boys'],['security','Security Staff'],
                  ['administrator','Administrators'],['radiologist','Radiologists'],['physiotherapist','Physiotherapists'],['other','Other'],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <NumInput value={form.staffing.breakdown[key]}
                      onChange={e => setForm(prev => ({
                        ...prev, staffing: { ...prev.staffing, breakdown: { ...prev.staffing.breakdown, [key]: e.target.value } },
                      }))} />
                  </Field>
                ))}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Facilities & Availability ── */}
        <SectionCard icon={Award} title="Facilities & Availability" fullWidth>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Pharmacy</p>
              <label style={checkLabel}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.pharmacy.available} onChange={e => setNested('pharmacy', 'available', e.target.checked)} /> Available</label>
              {form.pharmacy.available && <label style={{ ...checkLabel, paddingLeft: 24 }}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.pharmacy.is24x7} onChange={e => setNested('pharmacy', 'is24x7', e.target.checked)} /> 24×7</label>}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Emergency Room</p>
              <label style={checkLabel}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.emergencyRoom.available} onChange={e => setNested('emergencyRoom', 'available', e.target.checked)} /> Available</label>
              {form.emergencyRoom.available && <label style={{ ...checkLabel, paddingLeft: 24 }}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.emergencyRoom.is24x7} onChange={e => setNested('emergencyRoom', 'is24x7', e.target.checked)} /> 24×7</label>}
            </div>
            {[['traumaCenter','Trauma Center'],['bloodBank','Blood Bank'],['laboratory','Laboratory']].map(([key, label]) => (
              <div key={key}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</p>
                <label style={checkLabel}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form[key]} onChange={e => set(key, e.target.checked)} /> Available</label>
              </div>
            ))}
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Dialysis Unit</p>
              <label style={checkLabel}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.dialysisUnit.available} onChange={e => setNested('dialysisUnit', 'available', e.target.checked)} /> Available</label>
              {form.dialysisUnit.available && (
                <div style={{ paddingLeft: 24, marginTop: 6 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Dialysis Beds</label>
                  <NumInput value={form.dialysisUnit.beds} onChange={e => setNested('dialysisUnit', 'beds', e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* ── Radiology Services ── */}
        <SectionCard icon={Stethoscope} title="Radiology Services">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['xray','X-Ray'],['ctScan','CT Scan'],['mri','MRI'],['ultrasound','Ultrasound']].map(([key, label]) => (
              <label key={key} style={checkLabel}><input type="checkbox" style={{ width: 16, height: 16 }} checked={form.radiology[key]} onChange={e => setNested('radiology', key, e.target.checked)} /> {label}</label>
            ))}
          </div>
        </SectionCard>

        {/* ── Specialties & Additional Facilities ── */}
        <SectionCard icon={Award} title="Specialties & Additional Facilities" fullWidth>
          <div style={gridTwo}>
            <Field label="Medical Specialties (comma separated)">
              <input className="form-input" placeholder="Cardiology, Neurology, Oncology..." value={form.specialties} onChange={e => set('specialties', e.target.value)} />
            </Field>
            <Field label="Additional Facilities (comma separated)">
              <input className="form-input" placeholder="ICU, Blood Bank, 24/7 Emergency, Pharmacy..." value={form.facilities} onChange={e => set('facilities', e.target.value)} />
            </Field>
          </div>
        </SectionCard>

      </div>
    </HospitalLayout>
  );
}