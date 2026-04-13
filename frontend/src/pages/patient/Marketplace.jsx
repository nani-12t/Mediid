import React, { useState, useEffect } from 'react';
import { Database, Search, ChevronRight, DollarSign, Briefcase, Upload, X } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function Marketplace() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalReq, setUploadModalReq] = useState(null);
  const [uploadForm, setUploadForm] = useState({ file: null, docType: '' });
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchMarketplace();
  }, []);

  const fetchMarketplace = async () => {
    try {
      const { data } = await marketplaceAPI.getAllRequirements();
      setRequirements(data);
    } catch (error) {
      toast.error('Failed to load marketplace data');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (reqId) => {
    // Navigate to a dedicated submission page or open modal.
    // For now, let's initiate chat directly to start the process as requested.
    try {
      const selectedReq = requirements.find(r => r._id === reqId);
      if (!selectedReq) return;

      const loadingToast = toast.loading('Connecting with buyer...');
      
      // We create a chat automatically so the patient can talk to the buyer
      await marketplaceAPI.sendMessage({
        receiverId: selectedReq.buyer.user,
        requirementId: selectedReq._id,
        content: `Hi! I am interested in your data requirement: "${selectedReq.title}". I would like to submit my medical documents for this.`
      });

      toast.success('Connected! Opening chat.', { id: loadingToast });
      navigate('/messages', { state: { targetUserId: selectedReq.buyer.user }});
      
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect');
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadForm.file || !uploadForm.docType) {
      toast.error('Please select a file and document type.');
      return;
    }
    
    setUploading(true);
    try {
      // Create FormData to send file
      const formData = new FormData();
      formData.append('document', uploadForm.file);
      formData.append('requirementId', uploadModalReq._id);
      formData.append('docType', uploadForm.docType);

      await marketplaceAPI.submitDocuments(formData);
      
      toast.success('Documents submitted successfully!');
      setUploadModalReq(null);
      setUploadForm({ file: null, docType: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit documents');
    } finally {
      setUploading(false);
    }
  };

  return (
    <PatientLayout title="Data Marketplace">
      <div style={{ marginBottom: 24, maxWidth: 800 }}>
        <h2 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 8 }}>
          Medical Data Marketplace
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 15, lineHeight: 1.5 }}>
          Contribute your medical data to research and get paid. Researchers and medical AI startups are looking for specific anonymous medical records. You control what you share.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : requirements.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
          <Database size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, color: 'var(--gray-800)', fontWeight: 600, marginBottom: 8 }}>No Active Campaigns</h3>
          <p>There are no active data collection campaigns at the moment. Please check back later.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
          {requirements.map(req => (
            <div key={req._id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>{req.title}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--gray-500)', fontSize: 13 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Briefcase size={14} /> {req.buyer.companyName}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Database size={14} /> Target: {req.amount}
                    </span>
                  </div>
                </div>
                <div style={{ background: '#f0fdfa', color: 'var(--teal)', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  Active
                </div>
              </div>

              <div style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 8, fontSize: 14, color: 'var(--gray-700)', lineHeight: 1.6 }}>
                <strong>Description:</strong> {req.description}
              </div>

              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Required Data & Payout</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {req.requiredDocs.map(docId => (
                    <div key={docId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gray-200)', padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, color: 'var(--gray-800)' }}>
                      <span style={{ textTransform: 'capitalize' }}>{docId.replace(/([A-Z])/g, ' $1').trim()}</span>
                      {req.pricing?.[docId] > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', color: '#10b981', background: '#ecfdf5', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                           <DollarSign size={12} /> {req.pricing[docId]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', margin: '4px -24px -24px -24px', padding: '16px 24px', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button 
                  onClick={() => setUploadModalReq(req)}
                  className="btn" 
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                  <Upload size={16} /> Upload Documents
                </button>
                {/* <button 
                  onClick={() => handleApply(req._id)}
                  className="btn" 
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px' }}>
                  Connect <ChevronRight size={16} />
                </button> */}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {uploadModalReq && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card fade-in" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Submit Documents</h3>
              <button 
                onClick={() => { setUploadModalReq(null); setUploadForm({ file: null, docType: '' }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 20 }}>
              Upload your medical documents for the requirement: <strong>{uploadModalReq.title}</strong>
            </p>

            <form onSubmit={handleUploadSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>Document Type</label>
                <select 
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--gray-200)', borderRadius: 8, outline: 'none', fontSize: 14 }}
                  value={uploadForm.docType}
                  onChange={(e) => setUploadForm(f => ({ ...f, docType: e.target.value }))}
                >
                  <option value="">Select document type...</option>
                  {uploadModalReq.requiredDocs.map(docId => (
                    <option key={docId} value={docId}>
                      {docId.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>File Upload</label>
                <input 
                  type="file"
                  onChange={(e) => setUploadForm(f => ({ ...f, file: e.target.files[0] }))}
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px dashed var(--gray-300)', borderRadius: 8, fontSize: 14, cursor: 'pointer', background: '#fafafa' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => { setUploadModalReq(null); setUploadForm({ file: null, docType: '' }); }} className="btn btn-outline" style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn" disabled={uploading} style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                  {uploading ? <div className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} /> : 'Submit Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </PatientLayout>
  );
}
