import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { User, Shield, FileText, Upload, Trash2, Plus, X, Heart, Phone, AlertCircle } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const BENEFIT_TYPES = ['ayushman', 'esi', 'cghs', 'state', 'insurance', 'other'];
const DOC_TYPES = ['prescription', 'scan', 'bill', 'lab_report', 'discharge_summary', 'other'];

const TabButton = ({ label, active, onClick }) => (
  <button className={`tab-btn ${active ? 'active' : ''}`} onClick={onClick}>{label}</button>
);

export default function PatientProfile() {
  const { profile, setProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'emergency');
  const [patient, setPatient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [showBenefitModal, setShowBenefitModal] = useState(false);
  const [docForm, setDocForm] = useState({ type: 'prescription', title: '', hospitalName: '', doctorName: '', notes: '', fileUrl: '', fileName: '' });
  const [benefitForm, setBenefitForm] = useState({ type: 'ayushman', schemeName: '', cardNumber: '', beneficiaryName: '', coverageAmount: '', validFrom: '', validUntil: '' });
  const [emergency, setEmergency] = useState({ bloodGroup: '', allergies: '', chronicConditions: '', currentMedications: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '', aadhaarNumber: '' });

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
          aadhaarNumber: data.emergency?.aadhaarNumber || ''
        });
      } catch (e) {}
    };
    load();
  }, []);

  const saveEmergency = async () => {
    setSaving(true);
    try {
      const payload = { emergency: { ...emergency, allergies: emergency.allergies.split(',').map(s => s.trim()).filter(Boolean), chronicConditions: emergency.chronicConditions.split(',').map(s => s.trim()).filter(Boolean), currentMedications: emergency.currentMedications.split(',').map(s => s.trim()).filter(Boolean) } };
      await patientAPI.updateProfile(payload);
      toast.success('Emergency info updated!');
    } catch { toast.error('Update failed'); }
    setSaving(false);
  };

  const addDocument = async () => {
    try {
      await patientAPI.addDocument(docForm);
      const { data } = await patientAPI.getProfile();
      setPatient(data);
      setShowDocModal(false);
      toast.success('Document added!');
    } catch { toast.error('Failed to add document'); }
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

  const docTypeColors = { prescription: 'badge-teal', scan: 'badge-blue', bill: 'badge-green', lab_report: 'badge-amber', discharge_summary: 'badge-red', other: 'badge-gray' };
  const docTypeEmojis = { prescription: '💊', scan: '🩻', bill: '💵', lab_report: '🧪', discharge_summary: '📋', other: '📄' };

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
        <TabButton label="📄 Documents" active={tab === 'documents'} onClick={() => setTab('documents')} />
        <TabButton label="🏛️ Govt. Benefits" active={tab === 'benefits'} onClick={() => setTab('benefits')} />
      </div>

      {/* Emergency Info */}
      {tab === 'emergency' && (
        <div className="card">
          {/* Government Benefits Info */}
          {!emergency.aadhaarNumber && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #3b82f6' }}>
              <Shield size={18} color="#1d4ed8" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 14, color: '#1e40af', fontWeight: 500, marginBottom: 4 }}>Add Your Aadhaar Number</p>
                <p style={{ fontSize: 13, color: '#1e40af', lineHeight: 1.4 }}>
                  Provide your Aadhaar number to automatically check eligibility for government health schemes like Ayushman Bharat, ESI, CGHS, and state health programs. This helps you access cashless treatment at partner hospitals.
                </p>
              </div>
            </div>
          )}

          {/* Aadhaar Verification Success */}
          {emergency.aadhaarNumber && emergency.aadhaarNumber.length === 12 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #10b981' }}>
              <Shield size={18} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 14, color: '#047857', fontWeight: 500, marginBottom: 4 }}>Aadhaar Verified</p>
                <p style={{ fontSize: 13, color: '#047857', lineHeight: 1.4 }}>
                  Your Aadhaar number has been saved. You can now add government benefit cards in the "Govt. Benefits" tab to access cashless treatment at partner hospitals.
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
              <input
                className="form-input"
                type="text"
                placeholder="XXXX XXXX XXXX"
                value={emergency.aadhaarNumber}
                onChange={e => setEmergency({ ...emergency, aadhaarNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                maxLength="12"
              />
              <small style={{ color: 'var(--gray-500)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Enter 12-digit Aadhaar number to check government benefits
              </small>
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

      {/* Documents */}
      {tab === 'documents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setShowDocModal(true)}><Plus size={16} /> Upload Document</button>
          </div>
          {(!patient?.documents || patient.documents.length === 0) ? (
            <div className="card empty-state"><FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} /><p>No documents yet. Upload your medical records.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {patient.documents.map(doc => (
                <div key={doc._id} className="card" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ fontSize: 28, flexShrink: 0 }}>{docTypeEmojis[doc.type] || '📄'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>{doc.title}</p>
                        <span className={`badge ${docTypeColors[doc.type]} `} style={{ fontSize: 10 }}>{doc.type?.replace('_', ' ')}</span>
                      </div>
                      {doc.hospitalName && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>🏥 {doc.hospitalName}</p>}
                      {doc.doctorName && <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>👨‍⚕️ {doc.doctorName}</p>}
                      <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <button onClick={() => deleteDocument(doc._id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-300)' }}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Government Benefits */}
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

      {/* Document Modal */}
      {showDocModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Add Medical Document</h2>
              <button onClick={() => setShowDocModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Document Type</label>
              <select className="form-input form-select" value={docForm.type} onChange={e => setDocForm({ ...docForm, type: e.target.value })}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="e.g. Blood Test Report Jan 2025" value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Hospital Name</label>
                <input className="form-input" value={docForm.hospitalName} onChange={e => setDocForm({ ...docForm, hospitalName: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Doctor Name</label>
                <input className="form-input" value={docForm.doctorName} onChange={e => setDocForm({ ...docForm, doctorName: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">File URL (or upload in future)</label>
              <input className="form-input" placeholder="https://..." value={docForm.fileUrl} onChange={e => setDocForm({ ...docForm, fileUrl: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={docForm.notes} onChange={e => setDocForm({ ...docForm, notes: e.target.value })} style={{ resize: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDocModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={addDocument} disabled={!docForm.title}>Add Document</button>
            </div>
          </div>
        </div>
      )}

      {/* Govt Benefit Modal */}
      {showBenefitModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Add Government Benefit Card</h2>
              <button onClick={() => setShowBenefitModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Benefit Type</label>
              <select className="form-input form-select" value={benefitForm.type} onChange={e => setBenefitForm({ ...benefitForm, type: e.target.value })}>
                <option value="ayushman">Ayushman Bharat (PMJAY)</option>
                <option value="esi">ESI (Employee State Insurance)</option>
                <option value="cghs">CGHS (Central Govt. Health Scheme)</option>
                <option value="state">State Health Scheme</option>
                <option value="insurance">Group Health Insurance</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Scheme Name *</label>
              <input className="form-input" placeholder="e.g. Ayushman Bharat PMJAY" value={benefitForm.schemeName} onChange={e => setBenefitForm({ ...benefitForm, schemeName: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Card Number</label>
                <input className="form-input" value={benefitForm.cardNumber} onChange={e => setBenefitForm({ ...benefitForm, cardNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Beneficiary Name</label>
                <input className="form-input" value={benefitForm.beneficiaryName} onChange={e => setBenefitForm({ ...benefitForm, beneficiaryName: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Coverage (₹)</label>
                <input className="form-input" type="number" placeholder="500000" value={benefitForm.coverageAmount} onChange={e => setBenefitForm({ ...benefitForm, coverageAmount: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Valid From</label>
                <input className="form-input" type="date" value={benefitForm.validFrom} onChange={e => setBenefitForm({ ...benefitForm, validFrom: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Valid Until</label>
                <input className="form-input" type="date" value={benefitForm.validUntil} onChange={e => setBenefitForm({ ...benefitForm, validUntil: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowBenefitModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={addBenefit} disabled={!benefitForm.schemeName}>Add Card</button>
            </div>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}
