import React, { useState, useEffect } from 'react';
import { FileText, Calendar, User, Download, Eye } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { appointmentAPI, patientAPI } from '../../utils/api';

export default function PatientHistory() {
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('appointments');

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
                  Uploaded on {formatDate(doc.uploadedAt)} • {(doc.fileSize / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Eye size={14} /> View
                </a>
                <a
                  href={doc.fileUrl}
                  download={doc.fileName}
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Download size={14} /> Download
                </a>
              </div>
            </div>
          </div>
        ))
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
            {completedAppointments.length} checkups • {medicalHistory.length} records • {documents.length} documents
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          Checkups ({completedAppointments.length})
        </button>
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
          {activeTab === 'appointments' && renderAppointments()}
          {activeTab === 'history' && renderMedicalHistory()}
          {activeTab === 'documents' && renderDocuments()}
        </>
      )}
    </PatientLayout>
  );
}
