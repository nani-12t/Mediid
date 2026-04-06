import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Shield, FileText, Upload, Trash2, Plus, X, Heart, Phone, AlertCircle, CheckCircle, File } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BENEFIT_TYPES = ['ayushman', 'esi', 'cghs', 'state', 'insurance', 'other'];

const DOC_TYPES = [
  { value: 'prescription',      label: '💊 Prescription' },
  { value: 'scan',              label: '🩻 Scan / Imaging' },
  { value: 'bill',              label: '🧾 Bill / Invoice' },
  { value: 'lab_report',        label: '🔬 Lab Report' },
  { value: 'discharge_summary', label: '🏥 Discharge Summary' },
  { value: 'other',             label: '📄 Other' },
];

const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';

const docTypeColors = {
  prescription: 'badge-teal', scan: 'badge-blue', bill: 'badge-green',
  lab_report: 'badge-amber', discharge_summary: 'badge-red', other: 'badge-gray',
};
const docTypeEmojis = {
  prescription: '💊', scan: '🩻', bill: '🧾',
  lab_report: '🔬', discharge_summary: '🏥', other: '📄',
};

const TabButton = ({ label, active, onClick }) => (
  <button className={`tab-btn ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>
);

const EMPTY_DOC = {
  type: 'prescription', title: '', hospitalName: '',
  doctorName: '', notes: '', fileUrl: '', fileName: '', file: null,
};

export default function PatientProfile() {
  const { profile, setProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'emergency');
  const [patient, setPatient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const [docForm, setDocForm] = useState(EMPTY_DOC);
  const [benefitForm, setBenefitForm] = useState({
    type: 'ayushman', schemeName: '', cardNumber: '',
    beneficiaryName: '', coverageAmount: '', validFrom: '', validUntil: '',
  });
  const [emergency, setEmergency] = useState({
    bloodGroup: '', allergies: '', chronicConditions: '', currentMedications: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '', aadhaarNumber: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await patientAPI.getProfile();
        setPatient(data);
        setEmergency({
          bloodGroup: data.emergency?.bloodGroup || '',
          allergies: data.emergency?.allergies?.join(', ') || '',
          chronicConditions: data.emergency?.chronicConditions?.join(', ') || '',
          currentMedications: data.emergency?.currentMedications?.join(', ') || '',
          emergencyContactName: data.emergency?.emergencyContactName || '',
          emergencyContactPhone: data.emergency?.emergencyContactPhone || '',
          emergencyContactRelation: data.emergency?.emergencyContactRelation || '',
          aadhaarNumber: data.emergency?.aadhaarNumber || '',
        });
      } catch (e) {}
    };
    load();
  }, []);

  const saveEmergency = async () => {
    setSaving(true);
    try {
      const payload = {
        emergency: {
          ...emergency,
          allergies: emergency.allergies.split(',').map(s => s.trim()).filter(Boolean),
          chronicConditions: emergency.chronicConditions.split(',').map(s => s.trim()).filter(Boolean),
          currentMedications: emergency.currentMedications.split(',').map(s => s.trim()).filter(Boolean),
        },
      };
      await patientAPI.updateProfile(payload);
      toast.success('Emergency info updated!');
    } catch { toast.error('Update failed'); }
    setSaving(false);
  };

  /* ── file helpers ── */
  const applyFile = (file) => {
    if (!file) return;
    const base = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const autoTitle = base.charAt(0).toUpperCase() + base.slice(1);
    setDocForm(prev => ({
      ...prev,
      file,
      fileName: file.name,
      title: prev.title || autoTitle,
    }));
  };

  const handleFileChange = (e) => applyFile(e.target.files?.[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    applyFile(e.dataTransfer.files?.[0]);
  };

  const removeFile = () => {
    setDocForm(prev => ({ ...prev, file: null, fileName: '' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  const closeDocModal = () => {
    setShowDocModal(false);
    setDocForm(EMPTY_DOC);
    if (fileRef.current) fileRef.current.value = '';
  };

  /* ── document submit ── */
  const addDocument = async () => {
    if (!docForm.title.trim()) return;
    setDocUploading(true);
    try {
      // If you add a real upload endpoint later, upload docForm.file here first
      await patientAPI.addDocument({
        type:         docForm.type,
        title:        docForm.title.trim(),
        hospitalName: docForm.hospitalName.trim(),
        doctorName:   docForm.doctorName.trim(),
        fileUrl:      docForm.fileUrl.trim(),
        fileName:     docForm.fileName,
        notes:        docForm.notes.trim(),
      });
      const { data } = await patientAPI.getProfile();
      setPatient(data);
      closeDocModal();
      toast.success('Document added!');
    } catch { toast.error('Failed to add document'); }
    setDocUploading(false);
  };

  const deleteDocument = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await patientAPI.deleteDocument(id);
      setPatient(p => ({ ...p, documents: p.documents.filter(d => d._id !== id) }));
      toast.success('Document removed');
    } catch { toast.error('Delete failed'); }
  };

  const addBenefit = async () => {
    try {
      await patientAPI.addGovernmentBenefit({ ...benefitForm, coverageAmount: Number(benefitForm.coverageAmount) });
      const { data } = await patientAPI.getProfile();
      setPatient(data);
      setShowBenefitModal(false);
      toast.success('Benefit card added!');
    } catch { toast.error('Failed to add'); }
  };

  /* ── shared modal styles — matches Govt Benefit card design ── */
  const modalOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  };
  const modalBox = {
    background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540,
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden',
  };
  const modalHeader = {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '22px 28px 18px', borderBottom: '1px solid #f1f1f1', flexShrink: 0,
  };
  const modalBody   = { flex: 1, overflowY: 'auto', padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 16 };
  const modalFooter = { padding: '16px 28px 20px', borderTop: '1px solid #f1f1f1', display: 'flex', gap: 10, flexShrink: 0 };
  const fLabel      = { fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6, display: 'block' };
  const fInput      = { width: '100%', boxSizing: 'border-box' };
  const closeBtn    = {
    display: 'flex', alignItems: 'center', gap: 5,
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
    fontSize: 13, color: '#6b7280', fontWeight: 500, flexShrink: 0,
    lineHeight: 1,
  };

  const dropzone = {
    border: `2px dashed ${dragging ? 'var(--teal)' : docForm.file ? 'var(--teal)' : 'var(--gray-200)'}`,
    borderRadius: 10, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
    background: dragging ? '#e6f7f5' : docForm.file ? '#f0faf8' : 'var(--gray-50,#f9f9f9)',
    transition: 'all 0.15s',
  };

  return (
    <PatientLayout title={`${profile?.firstName || 'Loading...'} ${profile?.lastName || ''}`.trim()}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 6 }}>
          {profile ? `${profile.firstName} ${profile.lastName}` : 'Loading...'}
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 16 }}>
          Manage your medical information, documents, and government benefits
        </p>
      </div>

      <div className="tabs">
        <TabButton label="🚨 Patient Info" active={tab === 'emergency'} onClick={() => setTab('emergency')} />
        <TabButton label="📄 Documents"       active={tab === 'documents'} onClick={() => setTab('documents')} />
        <TabButton label="🏛️ Govt. Benefits"  active={tab === 'benefits'}  onClick={() => setTab('benefits')} />
      </div>

      {/* ═══════ Emergency Info ═══════ */}
      {tab === 'emergency' && (
        <div className="card">
          {!emergency.aadhaarNumber && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #3b82f6' }}>
              <Shield size={18} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 14, color: '#1e40af', fontWeight: 500, marginBottom: 4 }}>Add Your Aadhaar Number</p>
                <p style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.4 }}>
                  Provide your Aadhaar number to automatically check eligibility for government health schemes like Ayushman Bharat, ESI, CGHS, and state health programs.
                </p>
              </div>
            </div>
          )}
          {emergency.aadhaarNumber && emergency.aadhaarNumber.length === 12 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #10b981' }}>
              <Shield size={18} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 14, color: '#047857', fontWeight: 500, marginBottom: 4 }}>Aadhaar Verified</p>
                <p style={{ fontSize: 13, color: '#047857', lineHeight: 1.4 }}>
                  Your Aadhaar number has been saved. You can now add government benefit cards in the "Govt. Benefits" tab.
                </p>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#fff1f2', borderRadius: 8, border: '1px solid #fecdd3' }}>
            <AlertCircle size={16} color="#e11d48" />
            <p style={{ fontSize: 13, color: '#9f1239' }}>This info is always visible when your QR is scanned — even in emergencies without your consent.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Blood Group</label>
              <select className="form-input form-select" value={emergency.bloodGroup} onChange={e => setEmergency({ ...emergency, bloodGroup: e.target.value })}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Aadhaar Number</label>
              <input className="form-input" type="text" placeholder="XXXX XXXX XXXX"
                value={emergency.aadhaarNumber}
                onChange={e => setEmergency({ ...emergency, aadhaarNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                maxLength="12" />
              <small style={{ color: 'var(--gray-500)', fontSize: 12, marginTop: 4, display: 'block' }}>Enter 12-digit Aadhaar number</small>
            </div>
            <div className="form-group">
              <label className="form-label">Allergies (comma separated)</label>
              <input className="form-input" placeholder="Penicillin, Peanuts, Latex" value={emergency.allergies} onChange={e => setEmergency({ ...emergency, allergies: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Chronic Conditions</label>
              <input className="form-input" placeholder="Diabetes Type 2, Hypertension" value={emergency.chronicConditions} onChange={e => setEmergency({ ...emergency, chronicConditions: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Current Medications</label>
              <input className="form-input" placeholder="Metformin 500mg, Amlodipine 5mg" value={emergency.currentMedications} onChange={e => setEmergency({ ...emergency, currentMedications: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Patient Contact Name</label>
              <input className="form-input" placeholder="Family member / friend" value={emergency.emergencyContactName} onChange={e => setEmergency({ ...emergency, emergencyContactName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Patient Contact Phone</label>
              <input className="form-input" type="tel" placeholder="+91 98765 43210" value={emergency.emergencyContactPhone} onChange={e => setEmergency({ ...emergency, emergencyContactPhone: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact Phone</label>
              <input className="form-input" type="tel" placeholder="+91 98765 43210" value={emergency.emergencyContactPhone} onChange={e => setEmergency({ ...emergency, emergencyContactPhone: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveEmergency} disabled={saving}>{saving ? 'Saving...' : '💾 Save Patient Info'}</button>
        </div>
      )}

      {/* ═══════ Documents ═══════ */}
      {tab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setShowDocModal(true)}>
              <Plus size={16} /> Upload Document
            </button>
          </div>

          {(!patient?.documents || patient.documents.length === 0) ? (
            <div className="card empty-state" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <FileText size={48} style={{ margin: '0 auto 14px', opacity: 0.2 }} />
              <p style={{ fontSize: 15, color: 'var(--gray-400)', marginBottom: 16 }}>No documents yet. Upload your medical records.</p>
              <button className="btn btn-primary" onClick={() => setShowDocModal(true)}>
                <Plus size={15} /> Upload your first document
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {patient.documents.map(doc => (
                <div key={doc._id} className="card" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 28, flexShrink: 0 }}>{docTypeEmojis[doc.type] || '📄'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                        <p style={{ fontSize: 14, fontWeight: 600, wordBreak: 'break-word' }}>{doc.title}</p>
                        <span className={`badge ${docTypeColors[doc.type]}`} style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                          {doc.type?.replace('_', ' ')}
                        </span>
                      </div>
                      {doc.hospitalName && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>🏥 {doc.hospitalName}</p>}
                      {doc.doctorName   && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>👨‍⚕️ {doc.doctorName}</p>}
                      {doc.fileName     && (
                        <p style={{ fontSize: 11, color: 'var(--gray-300)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <File size={11} /> {doc.fileName}
                        </p>
                      )}
                      <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                        {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <button onClick={() => deleteDocument(doc._id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)', flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ Government Benefits ═══════ */}
      {tab === 'benefits' && (
        <div>
          <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Shield size={18} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>Add your government health benefit cards (Ayushman Bharat, ESI, CGHS, state schemes) to use them at partner hospitals for cashless treatment.</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setShowBenefitModal(true)}><Plus size={16} /> Add Benefit Card</button>
          </div>
          {(!patient?.governmentBenefits || patient.governmentBenefits.length === 0) ? (
            <div className="card empty-state"><Shield size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} /><p>No government benefit cards added yet.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {patient.governmentBenefits.map(b => (
                <div key={b._id} className="insurance-plan-card">
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{b.type?.toUpperCase()} · Government Benefit</p>
                  <p style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>{b.schemeName}</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>Card: {b.cardNumber}</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>Beneficiary: {b.beneficiaryName}</p>
                  {b.coverageAmount && <p style={{ color: 'var(--teal)', fontSize: 15, fontWeight: 600 }}>₹{Number(b.coverageAmount).toLocaleString('en-IN')} Coverage</p>}
                  {b.validUntil && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>Valid until {new Date(b.validUntil).toLocaleDateString('en-IN')}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          Document Upload Modal
      ═══════════════════════════════════════ */}
      {showDocModal && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) closeDocModal(); }}>
          <div style={modalBox}>

            {/* Header */}
            <div style={modalHeader}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 3, letterSpacing: '-0.01em' }}>Upload Document</h2>
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Prescription, scan, bill, lab report & more</p>
              </div>
              <button style={closeBtn} onClick={closeDocModal}>
                <X size={15} /> Close
              </button>
            </div>

            {/* Body */}
            <div style={modalBody}>

              {/* Document Type */}
              <div>
                <label style={fLabel}>Document Type</label>
                <select className="form-input form-select" style={fInput}
                  value={docForm.type} onChange={e => setDocForm({ ...docForm, type: e.target.value })}>
                  {DOC_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* File Upload */}
              <div>
                <label style={fLabel}>
                  Upload File <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(PDF, Image, Word, Excel)</span>
                </label>

                {/* hidden input */}
                <input ref={fileRef} type="file" accept={ACCEPTED_FILES}
                  style={{ display: 'none' }} onChange={handleFileChange} />

                {docForm.file ? (
                  /* File chosen — preview row */
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: '#f0faf8', border: '1.5px solid var(--teal)' }}>
                    <CheckCircle size={20} color="var(--teal)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{docForm.file.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>{(docForm.file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={removeFile} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
                      <X size={16} />
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      style={{ fontSize: 12, color: 'var(--teal)', background: 'none', border: '1px solid var(--teal)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Change
                    </button>
                  </div>
                ) : (
                  /* Drag & drop zone */
                  <div style={dropzone}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}>
                    <Upload size={28} color="var(--teal)" style={{ margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 4 }}>
                      Click to browse or drag &amp; drop
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>PDF, JPG, PNG, Word, Excel — max 20 MB</p>
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label style={fLabel}>Title <span style={{ color: '#e53e3e' }}>*</span></label>
                <input className="form-input" style={fInput}
                  placeholder="e.g. Blood Test Report Jan 2025"
                  value={docForm.title}
                  onChange={e => setDocForm({ ...docForm, title: e.target.value })} />
              </div>

              {/* Hospital + Doctor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Hospital Name</label>
                  <input className="form-input" style={fInput} placeholder="Apollo, AIIMS..."
                    value={docForm.hospitalName} onChange={e => setDocForm({ ...docForm, hospitalName: e.target.value })} />
                </div>
                <div>
                  <label style={fLabel}>Doctor Name</label>
                  <input className="form-input" style={fInput} placeholder="Dr. Sharma..."
                    value={docForm.doctorName} onChange={e => setDocForm({ ...docForm, doctorName: e.target.value })} />
                </div>
              </div>

              {/* File URL — only show if no file picked */}
              {!docForm.file && (
                <div>
                  <label style={fLabel}>
                    File URL <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(optional — paste link if already hosted)</span>
                  </label>
                  <input className="form-input" style={fInput} placeholder="https://..."
                    value={docForm.fileUrl} onChange={e => setDocForm({ ...docForm, fileUrl: e.target.value })} />
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={fLabel}>Notes <span style={{ fontWeight: 400, color: 'var(--gray-400)' }}>(optional)</span></label>
                <textarea className="form-input" style={{ ...fInput, resize: 'vertical', minHeight: 64 }}
                  placeholder="Any additional context..."
                  value={docForm.notes}
                  onChange={e => setDocForm({ ...docForm, notes: e.target.value })} />
              </div>
            </div>

            {/* Footer */}
            <div style={modalFooter}>
              <button
                onClick={closeDocModal}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={addDocument}
                disabled={!docForm.title.trim() || docUploading}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: docForm.title.trim() ? 'var(--teal)' : '#a7f3d0', fontSize: 14, fontWeight: 600, color: '#fff', cursor: docForm.title.trim() ? 'pointer' : 'not-allowed' }}>
                {docUploading ? 'Adding...' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          Govt Benefit Modal — unchanged layout, same close pattern
      ═══════════════════════════════════════ */}
      {showBenefitModal && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowBenefitModal(false); }}>
          <div style={modalBox}>

            <div style={modalHeader}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 3, letterSpacing: '-0.01em' }}>Add Government Benefit Card</h2>
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Ayushman Bharat, ESI, CGHS, State schemes</p>
              </div>
              <button style={closeBtn} onClick={() => setShowBenefitModal(false)}>
                <X size={15} /> Close
              </button>
            </div>

            <div style={modalBody}>
              <div>
                <label style={fLabel}>Benefit Type</label>
                <select className="form-input form-select" style={fInput}
                  value={benefitForm.type} onChange={e => setBenefitForm({ ...benefitForm, type: e.target.value })}>
                  <option value="ayushman">Ayushman Bharat (PMJAY)</option>
                  <option value="esi">ESI (Employee State Insurance)</option>
                  <option value="cghs">CGHS (Central Govt. Health Scheme)</option>
                  <option value="state">State Health Scheme</option>
                  <option value="insurance">Group Health Insurance</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={fLabel}>Scheme Name <span style={{ color: '#e53e3e' }}>*</span></label>
                <input className="form-input" style={fInput} placeholder="e.g. Ayushman Bharat PMJAY"
                  value={benefitForm.schemeName} onChange={e => setBenefitForm({ ...benefitForm, schemeName: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Card Number</label>
                  <input className="form-input" style={fInput}
                    value={benefitForm.cardNumber} onChange={e => setBenefitForm({ ...benefitForm, cardNumber: e.target.value })} />
                </div>
                <div>
                  <label style={fLabel}>Beneficiary Name</label>
                  <input className="form-input" style={fInput}
                    value={benefitForm.beneficiaryName} onChange={e => setBenefitForm({ ...benefitForm, beneficiaryName: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Coverage (₹)</label>
                  <input className="form-input" style={fInput} type="number" placeholder="500000"
                    value={benefitForm.coverageAmount} onChange={e => setBenefitForm({ ...benefitForm, coverageAmount: e.target.value })} />
                </div>
                <div>
                  <label style={fLabel}>Valid From</label>
                  <input className="form-input" style={fInput} type="date"
                    value={benefitForm.validFrom} onChange={e => setBenefitForm({ ...benefitForm, validFrom: e.target.value })} />
                </div>
                <div>
                  <label style={fLabel}>Valid Until</label>
                  <input className="form-input" style={fInput} type="date"
                    value={benefitForm.validUntil} onChange={e => setBenefitForm({ ...benefitForm, validUntil: e.target.value })} />
                </div>
              </div>
            </div>

            <div style={modalFooter}>
              <button
                onClick={() => setShowBenefitModal(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={addBenefit}
                disabled={!benefitForm.schemeName}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: benefitForm.schemeName ? 'var(--teal)' : '#a7f3d0', fontSize: 14, fontWeight: 600, color: '#fff', cursor: benefitForm.schemeName ? 'pointer' : 'not-allowed' }}>
                Add Card
              </button>
            </div>
          </div>
        </div>
      )}

    </PatientLayout>
  );
}