import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FileText, CheckCircle, XCircle, Clock, ExternalLink, User } from 'lucide-react';
import BuyerLayout from '../../components/common/BuyerLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function ViewSubmissions() {
  const { id } = useParams();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubmissions();
  }, [id]);

  const fetchSubmissions = async () => {
    try {
      const { data } = await marketplaceAPI.getRequirementSubs(id);
      setSubmissions(data);
    } catch (error) {
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (subId, newStatus) => {
    try {
      await marketplaceAPI.updateSubStatus(subId, { status: newStatus });
      toast.success(`Submission marked as ${newStatus}`);
      fetchSubmissions();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const openFile = (fileUrl) => {
    // Attempt to open the base64 URL directly in a new tab if supported, otherwise warn
    if (fileUrl) {
      const win = window.open();
      if (win) {
        win.document.write(`<iframe src="${fileUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
        win.document.title = "View Document";
      } else {
         toast.error("Please allow popups to view this document");
      }
    }
  };

  const getStatusBadge = (status) => {
    let color, bg, icon;
    switch(status) {
      case 'accepted': 
        color = '#10b981'; bg = '#ecfdf5'; icon = <CheckCircle size={14} />; break;
      case 'rejected': 
        color = '#ef4444'; bg = '#fef2f2'; icon = <XCircle size={14} />; break;
      case 'paid': 
        color = '#8b5cf6'; bg = '#f5f3ff'; icon = <CheckCircle size={14} />; break;
      default: 
        color = '#f59e0b'; bg = '#fffbeb'; icon = <Clock size={14} />; break;
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color, background: bg, textTransform: 'uppercase' }}>
        {icon} {status}
      </span>
    );
  };

  if (loading) {
    return <BuyerLayout title="Submissions"><div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner"/></div></BuyerLayout>;
  }

  return (
    <BuyerLayout title="Requirement Submissions">
      <div style={{ marginBottom: 20 }}>
        <Link to="/buyer/dashboard" style={{ color: 'var(--teal)', fontSize: 14, fontWeight: 600, display: 'inline-block', marginBottom: 12 }}>
          &larr; Back to Dashboard
        </Link>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--gray-900)' }}>Patient Submissions</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 15 }}>Review documents submitted by patients for your requirement.</p>
      </div>

      {submissions.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
          <FileText size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <h3 style={{ fontSize: 18, color: 'var(--gray-800)', fontWeight: 600, marginBottom: 8 }}>No Submissions Yet</h3>
          <p>No patients have submitted documents for this requirement.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {submissions.map((sub) => (
            <div key={sub._id} className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, background: 'var(--teal)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <User size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--gray-900)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      Patient Submission
                      {getStatusBadge(sub.status)}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--gray-500)' }}>
                      Submitted on {new Date(sub.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                {sub.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleUpdateStatus(sub._id, 'accepted')} className="btn" style={{ padding: '8px 16px', fontSize: 13, background: '#10b981' }}>Approve</button>
                    <button onClick={() => handleUpdateStatus(sub._id, 'rejected')} className="btn btn-outline" style={{ padding: '8px 16px', fontSize: 13, color: '#ef4444', borderColor: '#ef4444' }}>Reject</button>
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 12 }}>Attached Documents ({sub.documents.length})</h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {sub.documents.map((doc, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
                    <FileText size={20} color="var(--teal)" style={{ marginRight: 12 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {doc.fileName || `${doc.type} Document`}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-500)', textTransform: 'capitalize' }}>
                        {doc.type}
                      </p>
                    </div>
                    {doc.fileUrl && (
                      <button 
                        onClick={() => openFile(doc.fileUrl)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', padding: 4 }}
                        title="View Document"
                      >
                        <ExternalLink size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </BuyerLayout>
  );
}
