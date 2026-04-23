import React, { useState, useEffect } from 'react';
import { Archive, Clock, CheckCircle, XCircle, FileText, ChevronRight, DollarSign, Download } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function Submissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMySubmissions();
  }, []);

  const fetchMySubmissions = async () => {
    try {
      const { data } = await marketplaceAPI.getMySubmissions();
      setSubmissions(data);
    } catch (error) {
      toast.error('Failed to load your submissions');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'accepted': 
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#ecfdf5', color: '#10b981' }}><CheckCircle size={14} /> Accepted</span>;
      case 'rejected': 
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#ef4444' }}><XCircle size={14} /> Rejected</span>;
      case 'paid': 
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#f0f9ff', color: '#0ea5e9' }}><CheckCircle size={14} /> Paid</span>;
      case 'pending':
      default: 
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#fffbeb', color: '#f59e0b' }}><Clock size={14} /> Pending Review</span>;
    }
  };

  return (
    <PatientLayout title="My Submissions">
      <div style={{ marginBottom: 24, maxWidth: 800 }}>
        <h2 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 8 }}>
          My Submissions
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 15, lineHeight: 1.5 }}>
          Track the status of data requirements you've submitted to buyers.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : submissions.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
          <Archive size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, color: 'var(--gray-800)', fontWeight: 600, marginBottom: 8 }}>No Submissions Found</h3>
          <p>You haven't submitted any medical records to the marketplace yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
          {submissions.map((sub) => (
            <div key={sub._id} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>
                    {sub.requirement?.title || 'Unknown Requirement'}
                  </h3>
                  <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>
                    Buyer: <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>{sub.requirement?.buyer?.companyName || 'Unknown Buyer'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    Submitted on: {new Date(sub.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  {getStatusBadge(sub.status)}
                </div>
              </div>

              {(sub.status === 'paid' && sub.payoutAmount) ? (
                <div style={{ background: '#f0fdfa', padding: '12px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, color: '#14b8a6', fontWeight: 600 }}>
                  <DollarSign size={18} /> Payout Received: ${sub.payoutAmount}
                </div>
              ) : null}

              <div>
                <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-600)', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Submitted Documents
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sub.documents.map((doc, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--gray-50)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--gray-200)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ background: 'var(--blue)', color: '#fff', padding: 8, borderRadius: 8 }}>
                          <FileText size={18} />
                        </div>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', textTransform: 'capitalize' }}>
                            {doc.type.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          {doc.fileName && <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>{doc.fileName}</p>}
                        </div>
                      </div>
                      {doc.fileUrl && (
                        <a href={doc.fileUrl} download={doc.fileName || 'document'} style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--blue)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          <Download size={14} /> View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}
    </PatientLayout>
  );
}
