import React, { useState, useEffect } from 'react';
import { FileText, Calendar, User, Download, Eye, X } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { appointmentAPI, patientAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function PatientHistory() {
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');

  const loadData = async () => {
    setLoading(true);
    try {
      const [appointmentsRes, profileRes] = await Promise.all([
        appointmentAPI.getMyAppointments(),
        patientAPI.getProfile()
      ]);
      setAppointments(appointmentsRes.data);
      setProfile(profileRes.data);
    } catch (error) {
      console.error('Failed to load history data:', error);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Filter completed appointments (past checkups)
  const completedAppointments = appointments.filter(apt =>
    apt.status === 'completed' || new Date(apt.appointmentDate) < new Date()
  );

  // Medical history from profile
  const medicalHistory = profile?.medicalHistory || [];

  // Documents from profile
  const documents = profile?.documents || [];

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };


  const renderAppointments = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {completedAppointments.length === 0 ? (
        <div className="card empty-state">
          <Calendar size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
          <p>No past appointments found</p>
        </div>
      ) : (
        completedAppointments.map(apt => (
          <div key={apt._id} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'var(--gray-100)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <p style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--teal)', lineHeight: 1 }}>
                  {new Date(apt.appointmentDate).getDate()}
                </p>
                <p style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>
                  {new Date(apt.appointmentDate).toLocaleString('en', { month: 'short' })}
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}</p>
                  <span className="badge badge-gray" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {apt.status === 'completed' ? 'Completed' : 'Past'}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--teal)', fontWeight: 500, marginBottom: 4 }}>
                  {apt.doctor?.specialization}
                </p>
                <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>🏥 {apt.hospital?.name}</p>
                {apt.timeSlot && (
                  <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 2 }}>⏰ {apt.timeSlot}</p>
                )}
                {apt.symptoms && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6, fontStyle: 'italic' }}>
                    Symptoms: "{apt.symptoms}"
                  </p>
                )}
                {apt.notes && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                    Notes: {apt.notes}
                  </p>
                )}
                {apt.prescription && apt.prescription.fileUrl && (
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={apt.prescription.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <FileText size={14} /> View Prescription
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderMedicalHistory = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {medicalHistory.length === 0 ? (
        <div className="card empty-state">
          <User size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
          <p>No medical history records found</p>
        </div>
      ) : (
        medicalHistory.map((record, index) => (
          <div key={index} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'var(--gray-100)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <p style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--red)', lineHeight: 1 }}>
                  {new Date(record.date).getDate()}
                </p>
                <p style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase' }}>
                  {new Date(record.date).toLocaleString('en', { month: 'short' })}
                </p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{record.diagnosis}</p>
                  <span className="badge badge-red" style={{ fontSize: 11 }}>Medical Record</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 4 }}>
                  Treatment: {record.treatment}
                </p>
                <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                  🏥 {record.hospital} • 👨‍⚕️ Dr. {record.doctor}
                </p>
                {record.notes && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6, fontStyle: 'italic' }}>
                    "{record.notes}"
                  </p>
                )}
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Recorded on {formatDate(record.date)}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const [viewingDoc, setViewingDoc] = useState(null);

  const handleDownload = (doc) => {
    // Create a dummy blob to simulate a download
    const content = `MediID Medical Report\n\nTitle: ${doc.title}\nHospital: ${doc.hospitalName}\nDoctor: ${doc.doctorName}\nDate: ${formatDate(doc.uploadedAt)}\n\nThis is a dummy medical report file for demonstration purposes.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.title.replace(/\s+/g, '_')}_MediID.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report downloaded successfully!');
  };

  const renderDocuments = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {documents.length === 0 ? (
        <div className="card empty-state">
          <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
          <p>No documents uploaded yet</p>
        </div>
      ) : (
        documents.map((doc, index) => (
          <div key={index} className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'var(--gray-100)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <FileText size={24} color="var(--teal)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <p style={{ fontSize: 15, fontWeight: 600 }}>{doc.title}</p>
                  <span className={`badge badge-${doc.type === 'prescription' ? 'blue' : doc.type === 'lab_report' ? 'green' : 'purple'}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {doc.type.replace('_', ' ')}
                  </span>
                </div>
                {doc.hospitalName && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>🏥 {doc.hospitalName}</p>
                )}
                {doc.doctorName && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>👨‍⚕️ Dr. {doc.doctorName}</p>
                )}
                {doc.notes && (
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                    {doc.notes}
                  </p>
                )}
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                  Uploaded on {formatDate(doc.uploadedAt)} • {(doc.fileSize / 1024 / 1024).toFixed(2) || '0.45'} MB
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setViewingDoc(doc)}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Eye size={14} /> View
                </button>
                <button
                  onClick={() => handleDownload(doc)}
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Download size={14} /> Download
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          backdropFilter: 'blur(8px)'
        }} onClick={() => setViewingDoc(null)}>
          <div style={{
            background: '#fff', borderRadius: 20, maxWidth: 800, width: '100%', maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700 }}>{viewingDoc.title}</h3>
                <p style={{ fontSize: 13, color: '#666' }}>🏥 {viewingDoc.hospitalName || 'MediID Health'}</p>
              </div>
              <button 
                onClick={() => setViewingDoc(null)}
                style={{ background: '#f3f4f6', border: 'none', padding: 8, borderRadius: 10, cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', background: '#f9fafb', padding: '32px 40px', display: 'flex', justifyContent: 'center' }}>
              <div style={{
                background: '#fff', width: '100%', maxWidth: 600, padding: 48, borderRadius: 4, 
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)', fontFamily: 'serif', border: '1px solid #e5e7eb'
              }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #0d9488', paddingBottom: 24, marginBottom: 32 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0d9488', marginBottom: 4 }}>MediID Medical Report</h1>
                  <p style={{ fontSize: 13, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Authenticated Digital Health Record</p>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px 24px', fontSize: 15, color: '#374151' }}>
                  <span style={{ fontWeight: 600, color: '#9ca3af' }}>Document:</span>
                  <span style={{ fontWeight: 700 }}>{viewingDoc.title}</span>
                  
                  <span style={{ fontWeight: 600, color: '#9ca3af' }}>Category:</span>
                  <span style={{ textTransform: 'capitalize' }}>{viewingDoc.type?.replace('_', ' ')}</span>
                  
                  <span style={{ fontWeight: 600, color: '#9ca3af' }}>Hospital:</span>
                  <span>{viewingDoc.hospitalName || 'MediID Central Hospital'}</span>
                  
                  <span style={{ fontWeight: 600, color: '#9ca3af' }}>Doctor:</span>
                  <span>Dr. {viewingDoc.doctorName || 'Assigned Consultant'}</span>
                  
                  <span style={{ fontWeight: 600, color: '#9ca3af' }}>Date:</span>
                  <span>{formatDate(viewingDoc.uploadedAt)}</span>
                </div>

                <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid #f3f4f6' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 12, textTransform: 'uppercase' }}>Clinical Notes</h4>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4b5563', fontStyle: 'italic' }}>
                    {viewingDoc.notes || 'This is an automated digital summary of the patient medical record as provided by the healthcare institution. For detailed diagnostics, please refer to the original physical copy or contact the hospital directly.'}
                  </p>
                </div>

                <div style={{ marginTop: 64, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    ID: {viewingDoc._id?.slice(-12).toUpperCase() || 'M-ID-SYNC-77'}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ width: 100, height: 40, borderBottom: '1px solid #9ca3af', marginBottom: 4 }}></div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>DIGITAL SIGNATURE</p>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-outline" onClick={() => setViewingDoc(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => handleDownload(viewingDoc)}>Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <PatientLayout title="Medical History">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
            Medical History
          </h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            {medicalHistory.length} records • {documents.length} documents
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Medical Records ({medicalHistory.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents ({documents.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {activeTab === 'history' && renderMedicalHistory()}
          {activeTab === 'documents' && renderDocuments()}
        </>
      )}
    </PatientLayout>
  );
}
