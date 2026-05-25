import React, { useState, useEffect } from 'react';
import { Database, Search, ChevronRight, DollarSign, Briefcase, MessageSquare } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { marketplaceAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function HospitalMarketplace() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { profile } = useAuth();
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
    try {
      const selectedReq = requirements.find(r => r._id === reqId);
      if (!selectedReq) return;

      const loadingToast = toast.loading('Connecting with buyer...');
      
      // Auto-create chat and send introduction from the hospital admin
      await marketplaceAPI.sendMessage({
        receiverId: selectedReq.buyer.user,
        requirementId: selectedReq._id,
        content: `Hi! We are the administration staff of "${profile?.name || 'our healthcare institution'}". We are interested in your research requirement: "${selectedReq.title}" and would like to discuss submitting anonymized patient cohorts matching your filters.`
      });

      toast.success('Connected! Opening chat.', { id: loadingToast });
      navigate('/messages', { state: { targetUserId: selectedReq.buyer.user }});
      
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to connect');
    }
  };

  const filteredRequirements = requirements.filter(req => 
    req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.buyer.companyName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <HospitalLayout title="Research Data Marketplace">
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 640 }}>
          <p style={{ color: 'var(--gray-500)', fontSize: 14, lineHeight: 1.5 }}>
            Browse data campaigns posted by medical research organizations, pharmaceutical companies, and health AI startups. Connect directly with researchers to submit matching anonymized clinical cohorts.
          </p>
        </div>
        
        <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input 
            type="text" 
            placeholder="Search campaigns..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '10px 14px 10px 38px', 
              border: '1.5px solid var(--gray-200)', 
              borderRadius: 10, 
              fontSize: 13, 
              outline: 'none',
              background: '#fff'
            }} 
          />
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : filteredRequirements.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--gray-500)' }}>
          <Database size={48} style={{ margin: '0 auto 16px', opacity: 0.2, color: 'var(--teal)' }} />
          <h3 style={{ fontSize: 16, color: 'var(--gray-800)', fontWeight: 600, marginBottom: 8 }}>No Campaigns Found</h3>
          <p style={{ fontSize: 13 }}>No research data requests match your query at the moment.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
          {filteredRequirements.map(req => (
            <div key={req._id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid rgba(148, 163, 184, 0.08)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-800)', marginBottom: 4 }}>{req.title}</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 16px', color: 'var(--gray-500)', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                      <Briefcase size={13} /> {req.buyer.companyName}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                      <Database size={13} /> Required Sample: {req.amount}
                    </span>
                  </div>
                </div>
                <span className="badge badge-teal" style={{ fontSize: 11, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Open Campaign
                </span>
              </div>

              <div style={{ background: 'var(--gray-50)', padding: 14, borderRadius: 10, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>
                <strong>Objective:</strong> {req.description}
              </div>

              <div>
                <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Target Price Guide</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {req.requiredDocs.map(docId => (
                    <div key={docId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--gray-200)', padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, color: 'var(--gray-700)' }}>
                      <span style={{ textTransform: 'capitalize' }}>{docId.replace(/([A-Z])/g, ' $1').trim()}</span>
                      {req.pricing?.[docId] > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', color: '#10b981', background: '#ecfdf5', padding: '1px 6px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                           <DollarSign size={11} /> {req.pricing[docId]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', margin: '4px -24px -24px -24px', padding: '14px 24px', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'var(--gray-50)', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                <button 
                  onClick={() => handleApply(req._id)}
                  className="btn btn-outline" 
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13 }}>
                  <MessageSquare size={14} /> Connect & Chat <ChevronRight size={14} />
                </button>
              </div>

            </div>
          ))}
        </div>
      )}
    </HospitalLayout>
  );
}
