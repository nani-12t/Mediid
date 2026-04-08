import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Shield, FileText, Upload, Trash2, Plus, X, Heart, Phone, AlertCircle, CheckCircle, File, Building2, Briefcase, BadgeCheck, Clock } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GOVT_BENEFIT_TYPES = [
  { value: 'ayushman',   label: 'Ayushman Bharat (PMJAY)' },
  { value: 'esi',        label: 'ESI – Employee State Insurance' },
  { value: 'cghs',       label: 'CGHS – Central Govt. Health Scheme' },
  { value: 'state',      label: 'State Health Scheme' },
  { value: 'other_govt', label: 'Other Government Scheme' },
];

const EMPLOYER_BENEFIT_TYPES = [
  { value: 'group_mediclaim',     label: 'Group Mediclaim Insurance' },
  { value: 'corporate_insurance', label: 'Corporate Health Insurance' },
  { value: 'esic_employer',       label: 'ESIC (Employer Contribution)' },
  { value: 'other_employer',      label: 'Other Employer Benefit' },
];

const SOURCE_CONFIG = {
  government: {
    label: 'Government Scheme',
    icon: '🏛️',
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #0d9488 100%)',
    badge: 'badge-blue',
    types: GOVT_BENEFIT_TYPES,
  },
  employer: {
    label: 'Employer / Company',
    icon: '🏢',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
    badge: 'badge-purple',
    types: EMPLOYER_BENEFIT_TYPES,
  },
};

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

/* ─── BenefitCard component ─── */
function BenefitCard({ benefit: b, onDelete }) {
  const isGovt = b.source === 'government';
  const gradient = isGovt
    ? 'linear-gradient(135deg, #1d4ed8 0%, #0d9488 100%)'
    : 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)';

  const isExpired = b.validUntil && new Date(b.validUntil) < new Date();
  const expiresSoon = b.validUntil && !isExpired &&
    (new Date(b.validUntil) - new Date()) < 60 * 24 * 60 * 60 * 1000;

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', position: 'relative', opacity: isExpired ? 0.65 : 1 }}>
      {/* Coloured header */}
      <div style={{ background: gradient, padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {isGovt ? '🏛️ Government' : '🏢 Employer'} · {b.type?.replace(/_/g, ' ')}
          </span>
          <button onClick={() => onDelete(b._id)}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: '#fff', lineHeight: 1 }}>
            ✕
          </button>
        </div>
        <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{b.schemeName}</p>
        {b.insurerName && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{b.insurerName}</p>}
        {b.employerName && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>🏢 {b.employerName}{b.designation ? ` · ${b.designation}` : ''}</p>}
      </div>

      {/* White body */}
      <div style={{ background: '#fff', padding: '12px 18px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {(b.cardNumber || b.policyNumber) && (
            <div>
              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>CARD / POLICY</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{b.cardNumber || b.policyNumber}</p>
            </div>
          )}
          {b.beneficiaryName && (
            <div>
              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>BENEFICIARY</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{b.beneficiaryName}</p>
            </div>
          )}
          {b.employeeId && (
            <div>
              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>EMPLOYEE ID</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{b.employeeId}</p>
            </div>
          )}
          {b.coverageAmount > 0 && (
            <div>
              <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>SUM INSURED</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0d9488' }}>₹{Number(b.coverageAmount).toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>

        {/* Family */}
        {b.familyCovered && b.familyMembers?.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: '#6b7280', marginRight: 2 }}>👨‍👩‍👧 Family:</span>
            {b.familyMembers.map((m, i) => (
              <span key={i} style={{ fontSize: 11, background: '#f3f4f6', borderRadius: 999, padding: '1px 8px', color: '#374151' }}>{m}</span>
            ))}
          </div>
        )}

        {/* Hospital network */}
        {b.hospitalNetwork && (
          <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>🏥 {b.hospitalNetwork}</p>
        )}

        {/* Validity row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
          {b.validUntil ? (
            <span style={{ fontSize: 11, color: isExpired ? '#dc2626' : expiresSoon ? '#d97706' : '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
              {isExpired ? '❌ Expired' : expiresSoon ? '⚠️ Expires soon'  : '✅ Valid'} until {new Date(b.validUntil).toLocaleDateString('en-IN')}
            </span>
          ) : <span />}
          {b.tpaName && <span style={{ fontSize: 11, color: '#6b7280' }}>TPA: {b.tpaName}</span>}
        </div>
      </div>
    </div>
  );
}

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
  const [benefitSource, setBenefitSource] = useState('government');
  const [benefitForm, setBenefitForm] = useState({
    source: 'government', type: 'ayushman',
    schemeName: '', cardNumber: '', policyNumber: '',
    beneficiaryName: '',
    employerName: '', employeeId: '', designation: '',
    insurerName: '', tpaName: '', tpaPhone: '',
    coverageAmount: '', roomRentLimit: '',
    familyCovered: false, familyMembers: '',
    validFrom: '', validUntil: '',
    hospitalNetwork: '', claimProcess: '', helplineNumber: '', notes: '',
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
      await patientAPI.addMedicalBenefit({
        ...benefitForm,
        source: benefitSource,
        coverageAmount: benefitForm.coverageAmount ? Number(benefitForm.coverageAmount) : undefined,
        roomRentLimit:  benefitForm.roomRentLimit  ? Number(benefitForm.roomRentLimit)  : undefined,
        familyMembers:  benefitForm.familyMembers
          ? benefitForm.familyMembers.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      });
      const { data } = await patientAPI.getProfile();
      setPatient(data);
      setShowBenefitModal(false);
      setBenefitForm({
        source: 'government', type: 'ayushman',
        schemeName: '', cardNumber: '', policyNumber: '',
        beneficiaryName: '',
        employerName: '', employeeId: '', designation: '',
        insurerName: '', tpaName: '', tpaPhone: '',
        coverageAmount: '', roomRentLimit: '',
        familyCovered: false, familyMembers: '',
        validFrom: '', validUntil: '',
        hospitalNetwork: '', claimProcess: '', helplineNumber: '', notes: '',
      });
      toast.success('Medical benefit added!');
    } catch { toast.error('Failed to add benefit'); }
  };

  const deleteBenefit = async (id) => {
    if (!window.confirm('Remove this benefit?')) return;
    try {
      await patientAPI.deleteMedicalBenefit(id);
      setPatient(p => ({ ...p, medicalBenefits: (p.medicalBenefits || []).filter(b => b._id !== id) }));
      toast.success('Benefit removed');
    } catch { toast.error('Remove failed'); }
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
        <TabButton label="🚨 Emergency Info" active={tab === 'emergency'} onClick={() => setTab('emergency')} />
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
              <label className="form-label">Emergency Contact Name</label>
              <input className="form-input" placeholder="Family member / friend" value={emergency.emergencyContactName} onChange={e => setEmergency({ ...emergency, emergencyContactName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact Phone</label>
              <input className="form-input" type="tel" placeholder="+91 98765 43210" value={emergency.emergencyContactPhone} onChange={e => setEmergency({ ...emergency, emergencyContactPhone: e.target.value })} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={saveEmergency} disabled={saving}>{saving ? 'Saving...' : '💾 Save Emergency Info'}</button>
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

      {/* ═══════ Medical Benefits ═══════ */}
      {tab === 'benefits' && (
        <div>
          {/* Info banner */}
          <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Shield size={18} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.5 }}>
              Add all your medical benefits — government health schemes (Ayushman Bharat, ESI, CGHS) <strong>and</strong> employer / company health insurance. These are shown to hospitals for cashless treatment.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => setShowBenefitModal(true)}>
              <Plus size={16} /> Add Medical Benefit
            </button>
          </div>

          {/* ── Govt section ── */}
          {(() => {
            const govtBenefits = (patient?.medicalBenefits || []).filter(b => b.source === 'government');
            return (
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🏛️</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Government Schemes</h3>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>({govtBenefits.length})</span>
                </div>
                {govtBenefits.length === 0 ? (
                  <div style={{ background: 'var(--gray-50)', border: '1.5px dashed var(--gray-200)', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>No government benefits added — Ayushman Bharat, ESI, CGHS, state schemes</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {govtBenefits.map(b => (
                      <BenefitCard key={b._id} benefit={b} onDelete={deleteBenefit} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Employer section ── */}
          {(() => {
            const empBenefits = (patient?.medicalBenefits || []).filter(b => b.source === 'employer');
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🏢</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>Employer / Company Benefits</h3>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>({empBenefits.length})</span>
                </div>
                {empBenefits.length === 0 ? (
                  <div style={{ background: 'var(--gray-50)', border: '1.5px dashed var(--gray-200)', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>No employer benefits added — group mediclaim, corporate health insurance</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {empBenefits.map(b => (
                      <BenefitCard key={b._id} benefit={b} onDelete={deleteBenefit} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
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

      {/* ═══ Medical Benefit Modal ═══ */}
      {showBenefitModal && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowBenefitModal(false); }}>
          <div style={{ ...modalBox, maxWidth: 560 }}>

            <div style={modalHeader}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 3, letterSpacing: '-0.01em' }}>Add Medical Benefit</h2>
                <p style={{ fontSize: 13, color: '#9ca3af' }}>Government scheme or employer / company health cover</p>
              </div>
              <button style={closeBtn} onClick={() => setShowBenefitModal(false)}>
                <X size={15} /> Close
              </button>
            </div>

            <div style={modalBody}>

              {/* ── Source toggle ── */}
              <div>
                <label style={fLabel}>Benefit Source <span style={{ color: '#e53e3e' }}>*</span></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { value: 'government', label: '🏛️ Government Scheme',   sub: 'Ayushman, ESI, CGHS, State' },
                    { value: 'employer',   label: '🏢 Employer / Company', sub: 'Group mediclaim, corporate cover' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => {
                        setBenefitSource(opt.value);
                        setBenefitForm(f => ({
                          ...f, source: opt.value,
                          type: opt.value === 'government' ? 'ayushman' : 'group_mediclaim',
                        }));
                      }}
                      style={{ padding: '10px 12px', borderRadius: 10, border: `2px solid ${benefitSource === opt.value ? 'var(--teal)' : '#e5e7eb'}`, background: benefitSource === opt.value ? '#e6f7f5' : '#fff', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 600, color: benefitSource === opt.value ? '#0d9488' : '#374151', marginBottom: 2 }}>{opt.label}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af' }}>{opt.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Benefit Type dropdown ── */}
              <div>
                <label style={fLabel}>Benefit Type</label>
                <select className="form-input form-select" style={fInput}
                  value={benefitForm.type}
                  onChange={e => setBenefitForm(f => ({ ...f, type: e.target.value }))}>
                  {SOURCE_CONFIG[benefitSource].types.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* ── Scheme / Plan name ── */}
              <div>
                <label style={fLabel}>{benefitSource === 'employer' ? 'Insurance Plan Name' : 'Scheme Name'} <span style={{ color: '#e53e3e' }}>*</span></label>
                <input className="form-input" style={fInput}
                  placeholder={benefitSource === 'employer' ? 'e.g. Star Health Group Mediclaim' : 'e.g. Ayushman Bharat PMJAY'}
                  value={benefitForm.schemeName}
                  onChange={e => setBenefitForm(f => ({ ...f, schemeName: e.target.value }))} />
              </div>

              {/* ── Employer-specific fields ── */}
              {benefitSource === 'employer' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={fLabel}>Company / Employer Name <span style={{ color: '#e53e3e' }}>*</span></label>
                      <input className="form-input" style={fInput} placeholder="e.g. Infosys Ltd."
                        value={benefitForm.employerName}
                        onChange={e => setBenefitForm(f => ({ ...f, employerName: e.target.value }))} />
                    </div>
                    <div>
                      <label style={fLabel}>Employee ID</label>
                      <input className="form-input" style={fInput} placeholder="e.g. EMP-12345"
                        value={benefitForm.employeeId}
                        onChange={e => setBenefitForm(f => ({ ...f, employeeId: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={fLabel}>Designation / Role</label>
                    <input className="form-input" style={fInput} placeholder="e.g. Software Engineer"
                      value={benefitForm.designation}
                      onChange={e => setBenefitForm(f => ({ ...f, designation: e.target.value }))} />
                  </div>
                </>
              )}

              {/* ── Card / Policy number + Beneficiary ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>{benefitSource === 'employer' ? 'Policy Number' : 'Card Number'}</label>
                  <input className="form-input" style={fInput} placeholder="Card / policy number"
                    value={benefitSource === 'employer' ? benefitForm.policyNumber : benefitForm.cardNumber}
                    onChange={e => setBenefitForm(f => ({
                      ...f,
                      ...(benefitSource === 'employer' ? { policyNumber: e.target.value } : { cardNumber: e.target.value }),
                    }))} />
                </div>
                <div>
                  <label style={fLabel}>Beneficiary Name</label>
                  <input className="form-input" style={fInput} placeholder="Name on card"
                    value={benefitForm.beneficiaryName}
                    onChange={e => setBenefitForm(f => ({ ...f, beneficiaryName: e.target.value }))} />
                </div>
              </div>

              {/* ── Insurer / TPA ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Insurance Company</label>
                  <input className="form-input" style={fInput} placeholder="e.g. Star Health, United India"
                    value={benefitForm.insurerName}
                    onChange={e => setBenefitForm(f => ({ ...f, insurerName: e.target.value }))} />
                </div>
                <div>
                  <label style={fLabel}>TPA / Helpline</label>
                  <input className="form-input" style={fInput} placeholder="e.g. Medi Assist, +91 XXXXX"
                    value={benefitForm.tpaName}
                    onChange={e => setBenefitForm(f => ({ ...f, tpaName: e.target.value }))} />
                </div>
              </div>

              {/* ── Coverage ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Sum Insured / Coverage (₹)</label>
                  <input className="form-input" style={fInput} type="number" placeholder="e.g. 500000"
                    value={benefitForm.coverageAmount}
                    onChange={e => setBenefitForm(f => ({ ...f, coverageAmount: e.target.value }))} />
                </div>
                <div>
                  <label style={fLabel}>Room Rent Limit (₹/day)</label>
                  <input className="form-input" style={fInput} type="number" placeholder="e.g. 3000"
                    value={benefitForm.roomRentLimit}
                    onChange={e => setBenefitForm(f => ({ ...f, roomRentLimit: e.target.value }))} />
                </div>
              </div>

              {/* ── Family covered ── */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input type="checkbox" style={{ width: 16, height: 16 }}
                    checked={benefitForm.familyCovered}
                    onChange={e => setBenefitForm(f => ({ ...f, familyCovered: e.target.checked }))} />
                  Family members also covered under this benefit
                </label>
                {benefitForm.familyCovered && (
                  <input className="form-input" style={{ ...fInput, marginTop: 8 }}
                    placeholder="Family members (comma separated): Spouse, Child 1, Parent"
                    value={benefitForm.familyMembers}
                    onChange={e => setBenefitForm(f => ({ ...f, familyMembers: e.target.value }))} />
                )}
              </div>

              {/* ── Validity ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={fLabel}>Valid From</label>
                  <input className="form-input" style={fInput} type="date"
                    value={benefitForm.validFrom}
                    onChange={e => setBenefitForm(f => ({ ...f, validFrom: e.target.value }))} />
                </div>
                <div>
                  <label style={fLabel}>Valid Until</label>
                  <input className="form-input" style={fInput} type="date"
                    value={benefitForm.validUntil}
                    onChange={e => setBenefitForm(f => ({ ...f, validUntil: e.target.value }))} />
                </div>
              </div>

              {/* ── Hospital network + Notes ── */}
              <div>
                <label style={fLabel}>Hospital Network / Cashless Info</label>
                <input className="form-input" style={fInput}
                  placeholder="e.g. Cashless at 5000+ hospitals across India"
                  value={benefitForm.hospitalNetwork}
                  onChange={e => setBenefitForm(f => ({ ...f, hospitalNetwork: e.target.value }))} />
              </div>
              <div>
                <label style={fLabel}>Notes (optional)</label>
                <textarea className="form-input" style={{ ...fInput, resize: 'vertical', minHeight: 56 }}
                  placeholder="Any additional details, claim process, etc."
                  value={benefitForm.notes}
                  onChange={e => setBenefitForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div style={modalFooter}>
              <button onClick={() => setShowBenefitModal(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={addBenefit} disabled={!benefitForm.schemeName}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: benefitForm.schemeName ? 'var(--teal)' : '#a7f3d0', fontSize: 14, fontWeight: 600, color: '#fff', cursor: benefitForm.schemeName ? 'pointer' : 'not-allowed' }}>
                + Add Benefit
              </button>
            </div>
          </div>
        </div>
      )}

    </PatientLayout>
  );
}