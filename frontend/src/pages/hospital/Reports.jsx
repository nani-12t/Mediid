import React, { useState, useEffect } from 'react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { FileText, Upload, Search, Filter, Plus, Calendar, AlertCircle, CheckCircle, Clock, X, Download, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, { reportAPI } from '../../utils/api';

export default function HospitalReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Upload modal states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [patientUidInput, setPatientUidInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundPatient, setFoundPatient] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Form states
  const [formType, setFormType] = useState('scan');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [formPriority, setFormPriority] = useState('normal');
  const [formNotes, setFormNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [base64File, setBase64File] = useState('');
  const [uploading, setUploading] = useState(false);

  // View modal states
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data } = await reportAPI.getHospitalReports();
      setReports(data);
    } catch (err) {
      console.error('Error fetching reports:', err);
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSearch = async (e) => {
    e.preventDefault();
    if (!patientUidInput.trim()) {
      setSearchError('Please enter a Patient UID');
      return;
    }
    
    setSearchLoading(true);
    setSearchError('');
    setFoundPatient(null);

    try {
      // Admins use /doctor-portal/patient/:uid to bypass access checks and lookup patient details
      const { data } = await api.get(`/doctor-portal/patient/${patientUidInput.trim()}`);
      setFoundPatient(data);
      toast.success(`Patient found: ${data.firstName} ${data.lastName}`);
    } catch (err) {
      console.error('Patient search error:', err);
      setSearchError(err.response?.data?.message || 'Patient not found. Verify UID.');
      toast.error('Patient search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File exceeds 5MB limit');
      return;
    }

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setBase64File(reader.result);
    };
    reader.onerror = (err) => {
      console.error('File reading error:', err);
      toast.error('Error reading file');
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!foundPatient) {
      toast.error('Please find and select a patient first');
      return;
    }
    if (!formTitle.trim()) {
      toast.error('Please enter a report title');
      return;
    }
    if (!base64File) {
      toast.error('Please upload a file');
      return;
    }

    setUploading(true);
    try {
      const payload = {
        patientUid: foundPatient.uid,
        report: {
          type: formType,
          title: formTitle.trim(),
          fileUrl: base64File,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          notes: formNotes.trim(),
          uploadedAt: new Date(formDate)
        }
      };

      await reportAPI.upload(payload);
      toast.success('Medical report uploaded successfully!');
      setIsUploadOpen(false);
      resetForm();
      fetchReports();
    } catch (err) {
      console.error('Report upload error:', err);
      toast.error(err.response?.data?.message || 'Failed to upload report');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFoundPatient(null);
    setPatientUidInput('');
    setSearchError('');
    setFormType('scan');
    setFormTitle('');
    setFormDate(new Date().toLocaleDateString('en-CA'));
    setFormPriority('normal');
    setFormNotes('');
    setSelectedFile(null);
    setBase64File('');
  };

  const openUploadModal = () => {
    resetForm();
    setIsUploadOpen(true);
  };

  const openViewModal = (report) => {
    setViewingReport(report);
    setIsViewOpen(true);
  };

  // Filtered reports list
  const filteredReports = reports.filter(r => {
    const matchesSearch = 
      (r.patientName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.patientUid || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.title || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = !typeFilter || r.type === typeFilter;
    const matchesPriority = !priorityFilter || r.priority === priorityFilter;

    return matchesSearch && matchesType && matchesPriority;
  });

  const getPriorityBadgeClass = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'badge-red';
      case 'high': return 'badge-amber';
      case 'normal': 
      default:
        return 'badge-gray';
    }
  };

  const getTypeBadgeClass = (type) => {
    switch (type?.toLowerCase()) {
      case 'prescription': return 'badge-teal';
      case 'scan': return 'badge-blue';
      case 'bill': return 'badge-green';
      case 'lab_report': return 'badge-amber';
      case 'discharge_summary': return 'badge-red';
      default: return 'badge-gray';
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <HospitalLayout title="Medical Reports">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Medical Reports</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Manage patient reports — X-rays, lab results, scans, and more</p>
        </div>
        <button className="btn btn-primary" onClick={openUploadModal}>
          <Upload size={16} /> Upload Report
        </button>
      </div>

      {/* Search and Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: 280 }}>
          <Search size={18} color="var(--gray-400)" />
          <input 
            placeholder="Search reports by patient name, UID, or report title..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', background: 'transparent' }}
          />
        </div>
        
        <select 
          className="form-input form-select" 
          value={typeFilter} 
          onChange={e => setTypeFilter(e.target.value)}
          style={{ width: 180 }}
        >
          <option value="">All Document Types</option>
          <option value="prescription">💊 Prescription</option>
          <option value="scan">🩻 Scan</option>
          <option value="bill">🧾 Bill</option>
          <option value="lab_report">🔬 Lab Report</option>
          <option value="discharge_summary">🏥 Discharge Summary</option>
          <option value="other">📄 Other</option>
        </select>

        <select 
          className="form-input form-select" 
          value={priorityFilter} 
          onChange={e => setPriorityFilter(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">All Priorities</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Reports Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Loading reports...</div>
        ) : filteredReports.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
            <FileText size={48} color="var(--gray-300)" style={{ marginBottom: 12 }} />
            <p>No reports found matching your criteria.</p>
          </div>
        ) : (
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--gray-100)', background: 'var(--gray-50)' }}>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Patient</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Report Type</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Title</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Priority</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>File Details</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-600)', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map(r => (
                <tr key={r._id} style={{ borderBottom: '1px solid var(--gray-50)' }} className="table-row">
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.patientName}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{r.patientUid}</div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span className={`badge ${getTypeBadgeClass(r.type)}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                      {r.type?.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 13, fontWeight: 500 }}>{r.title}</td>
                  <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--gray-500)' }}>
                    {r.uploadedAt ? new Date(r.uploadedAt).toLocaleDateString() : 'N/A'}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <span className={`badge ${getPriorityBadgeClass(r.priority || 'normal')}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                      {r.priority || 'normal'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 18px', fontSize: 12, color: 'var(--gray-500)' }}>
                    <div style={{ fontWeight: 500 }}>{r.fileName || 'Report.pdf'}</div>
                    <div style={{ color: 'var(--gray-400)' }}>{formatFileSize(r.fileSize)}</div>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => openViewModal(r)}>View</button>
                      {r.fileUrl && (
                        <a 
                          href={r.fileUrl} 
                          download={r.fileName || 'report.pdf'} 
                          className="btn btn-sm btn-secondary"
                          style={{ display: 'inline-flex', padding: '8px 12px' }}
                        >
                          <Download size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload Modal */}
      {isUploadOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsUploadOpen(false)}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Upload Medical Report</h2>
              <button onClick={() => setIsUploadOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            {/* Step 1: Search Patient */}
            <form onSubmit={handlePatientSearch} style={{ marginBottom: 16 }}>
              <label className="form-label">Step 1: Locate Patient by UID *</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  className="form-input" 
                  placeholder="Enter Patient UID (e.g., PAT-XXXXXX)"
                  value={patientUidInput}
                  onChange={e => setPatientUidInput(e.target.value)}
                  disabled={searchLoading}
                />
                <button type="submit" className="btn btn-secondary" disabled={searchLoading}>
                  {searchLoading ? 'Finding...' : 'Find'}
                </button>
              </div>
            </form>

            {/* Patient Search Results */}
            {foundPatient && (
              <div style={{ background: 'var(--gray-50)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', marginBottom: 18 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', marginBottom: 6, textTransform: 'uppercase' }}>Patient Identified</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {foundPatient.profilePhoto ? (
                    <img src={foundPatient.profilePhoto} alt="Profile" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--teal)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 16 }}>
                      {foundPatient.firstName[0]}
                    </div>
                  )}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700 }}>{foundPatient.firstName} {foundPatient.lastName}</h4>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                      UID: <strong>{foundPatient.uid}</strong> | Gender: {foundPatient.gender || 'N/A'} | DOB: {foundPatient.dateOfBirth ? new Date(foundPatient.dateOfBirth).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {searchError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'hsl(4, 90%, 96%)', border: '1px solid hsl(4, 90%, 90%)', borderRadius: 'var(--radius-md)', padding: 12, color: 'var(--coral)', fontSize: 13, marginBottom: 18 }}>
                <ShieldAlert size={16} />
                <span>{searchError}</span>
              </div>
            )}

            {/* Step 2: Upload Details */}
            <form onSubmit={handleUploadSubmit}>
              <div style={{ opacity: foundPatient ? 1 : 0.5, pointerEvents: foundPatient ? 'auto' : 'none' }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 12, textTransform: 'uppercase' }}>Step 2: Enter Report Metadata</h4>
                
                <div className="form-group">
                  <label className="form-label">Report Title *</label>
                  <input 
                    className="form-input" 
                    placeholder="e.g. Brain MRI - T2 Contrast" 
                    value={formTitle} 
                    onChange={e => setFormTitle(e.target.value)} 
                    required={!!foundPatient}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Report Type *</label>
                    <select className="form-input form-select" value={formType} onChange={e => setFormType(e.target.value)} required={!!foundPatient}>
                      <option value="prescription">💊 Prescription</option>
                      <option value="scan">🩻 Scan (MRI, CT, X-Ray)</option>
                      <option value="bill">🧾 Bill / Invoice</option>
                      <option value="lab_report">🔬 Lab Report (Blood, Urine)</option>
                      <option value="discharge_summary">🏥 Discharge Summary</option>
                      <option value="other">📄 Other Document</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Report Date *</label>
                    <input 
                      className="form-input" 
                      type="date" 
                      value={formDate} 
                      onChange={e => setFormDate(e.target.value)} 
                      required={!!foundPatient}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Priority *</label>
                  <select className="form-input form-select" value={formPriority} onChange={e => setFormPriority(e.target.value)} required={!!foundPatient}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Notes / Diagnostic Summary</label>
                  <textarea 
                    className="form-input" 
                    placeholder="Enter diagnostic summary, notes, or findings..." 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)} 
                    style={{ minHeight: 80, resize: 'vertical' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Upload Scan/Document (Max 5MB) *</label>
                  <div style={{ border: '2.5px dashed var(--gray-200)', borderRadius: 'var(--radius-md)', padding: '24px 16px', textAlign: 'center', background: 'var(--gray-50)', position: 'relative', cursor: 'pointer', transition: 'var(--transition)' }}>
                    <input 
                      type="file" 
                      onChange={handleFileChange} 
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                      required={!!foundPatient}
                    />
                    <Upload size={28} color="var(--gray-400)" style={{ marginBottom: 10, display: 'inline-block' }} />
                    {selectedFile ? (
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>{selectedFile.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>{formatFileSize(selectedFile.size)}</p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)' }}>Drag & drop file or click to browse</p>
                        <p style={{ fontSize: 11, color: 'var(--gray-400)' }}>Supports PDF, JPG, PNG up to 5MB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsUploadOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={uploading || !foundPatient}>
                  {uploading ? 'Uploading...' : 'Save & Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Document Modal */}
      {isViewOpen && viewingReport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsViewOpen(false)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Medical Report Details</h2>
              <button onClick={() => setIsViewOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-100)' }}>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Patient Name</p>
                <p style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{viewingReport.patientName}</p>
                <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>UID: {viewingReport.patientUid}</p>
              </div>
              <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-100)' }}>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Report Type</p>
                <span className={`badge ${getTypeBadgeClass(viewingReport.type)}`} style={{ fontSize: 11, textTransform: 'capitalize', marginTop: 4 }}>
                  {viewingReport.type?.replace('_', ' ')}
                </span>
              </div>
              <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-100)' }}>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Uploaded Date</p>
                <p style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>
                  {viewingReport.uploadedAt ? new Date(viewingReport.uploadedAt).toLocaleString() : 'N/A'}
                </p>
              </div>
              <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-100)' }}>
                <p style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Title</p>
                <p style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{viewingReport.title}</p>
              </div>
            </div>

            {viewingReport.notes && (
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes / Summary</h4>
                <div style={{ background: 'var(--gray-50)', padding: 14, borderRadius: 'var(--radius-md)', fontSize: 13, border: '1px solid var(--gray-100)', lineHeight: '1.5' }}>
                  {viewingReport.notes}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Preview</h4>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: 16, overflow: 'auto', minHeight: 280 }}>
                {viewingReport.fileUrl && viewingReport.fileUrl.startsWith('data:image/') ? (
                  <img 
                    src={viewingReport.fileUrl} 
                    alt={viewingReport.title} 
                    style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-sm)' }} 
                  />
                ) : viewingReport.fileUrl ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <FileText size={56} color="var(--navy)" style={{ marginBottom: 14, display: 'inline-block' }} />
                    <p style={{ fontSize: 14, margin: 0, fontWeight: 600 }}>{viewingReport.fileName || 'Report Document (PDF / Binary)'}</p>
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>{formatFileSize(viewingReport.fileSize)}</p>
                    <a 
                      href={viewingReport.fileUrl} 
                      download={viewingReport.fileName || 'Report.pdf'}
                      className="btn btn-primary"
                      style={{ marginTop: 16 }}
                    >
                      <Download size={14} /> Download Document
                    </a>
                  </div>
                ) : (
                  <div style={{ color: 'var(--gray-400)', fontSize: 13 }}>No file attachment found on this report.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIsViewOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
