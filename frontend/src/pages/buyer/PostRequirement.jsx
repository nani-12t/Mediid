import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, DollarSign, List, FileImage, Image as ImageIcon, Send } from 'lucide-react';
import BuyerLayout from '../../components/common/BuyerLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const DOC_TYPES = [
  { id: 'prescriptions', label: 'Prescriptions', icon: <FileText size={16} /> },
  { id: 'scans', label: 'Scan Reports', icon: <FileImage size={16} /> },
  { id: 'xrays', label: 'X-Rays', icon: <ImageIcon size={16} /> },
  { id: 'labReports', label: 'Lab Reports', icon: <List size={16} /> }
];

export default function PostRequirement() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    amount: '',
    dataNeeded: '',
    description: '',
    requiredDocs: [],
    pricing: {
      prescriptions: '',
      scans: '',
      xrays: '',
      labReports: ''
    }
  });

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  
  const toggleDoc = (docId) => {
    setForm(f => {
      const isSelected = f.requiredDocs.includes(docId);
      return {
        ...f,
        requiredDocs: isSelected ? f.requiredDocs.filter(d => d !== docId) : [...f.requiredDocs, docId]
      };
    });
  };

  const setPrice = (docId, val) => {
    setForm(f => ({ ...f, pricing: { ...f.pricing, [docId]: val } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.amount || !form.dataNeeded || form.requiredDocs.length === 0) {
      toast.error('Please fill all required fields and select at least one document type.');
      return;
    }

    setLoading(true);
    try {
      // Clean up pricing (convert string to numbers, default 0 if empty)
      const cleanPricing = {};
      Object.keys(form.pricing).forEach(k => {
        cleanPricing[k] = parseFloat(form.pricing[k]) || 0;
      });

      await marketplaceAPI.createRequirement({
        ...form,
        pricing: cleanPricing
      });

      toast.success('Requirement posted successfully!');
      navigate('/buyer/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to post requirement');
    } finally {
      setLoading(false);
    }
  };

  const inpStyles = { width: '100%', padding: '12px 14px', border: '1.5px solid var(--gray-200)', borderRadius: 10, fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' };
  const lblStyles = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 };

  return (
    <BuyerLayout title="Post New Data Requirement">
      <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={lblStyles}>Title <span style={{color:'red'}}>*</span></label>
              <input style={inpStyles} placeholder="e.g. Cardiology Data for ML Research" value={form.title} onChange={e => setField('title', e.target.value)} />
            </div>

            <div>
              <label style={lblStyles}>Target Amount <span style={{color:'red'}}>*</span></label>
              <input style={inpStyles} placeholder="e.g. 500 patients" value={form.amount} onChange={e => setField('amount', e.target.value)} />
            </div>

            <div>
              <label style={lblStyles}>Data Needed <span style={{color:'red'}}>*</span></label>
              <input style={inpStyles} placeholder="e.g. ecg reports" value={form.dataNeeded} onChange={e => setField('dataNeeded', e.target.value)} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={lblStyles}>Detailed Description <span style={{color:'red'}}>*</span></label>
              <textarea style={{ ...inpStyles, minHeight: 120, resize: 'vertical' }} placeholder="e.g. We are doing ML research. Please submit your documents if you have '3avb'..." value={form.description} onChange={e => setField('description', e.target.value)} />
            </div>
          </div>

          <div style={{ background: 'var(--gray-50)', padding: 24, borderRadius: 12, marginBottom: 24, border: '1px solid var(--gray-200)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 16 }}>Required Documents & Pricing Settings</h3>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 20 }}>Select the types of documents you need and specify the price you are willing to pay per document.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {DOC_TYPES.map(doc => {
                const isSelected = form.requiredDocs.includes(doc.id);
                return (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleDoc(doc.id)} style={{ width: 18, height: 18, accentColor: 'var(--teal)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: isSelected ? 'var(--gray-900)' : 'var(--gray-500)' }}>
                        {doc.icon}
                        <span style={{ fontWeight: 500, fontSize: 14 }}>{doc.label}</span>
                      </div>
                    </label>

                    {isSelected && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign size={16} color="var(--gray-400)" />
                        <input
                          type="number"
                          placeholder="Price"
                          style={{ ...inpStyles, width: 120, padding: '8px 12px' }}
                          value={form.pricing[doc.id]}
                          onChange={e => setPrice(doc.id, e.target.value)}
                        />
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>/ doc</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn" style={{ width: '100%', padding: 14, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {loading ? <div className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} /> : <><Send size={18} /> Post Marketplace Requirement</>}
          </button>
        </form>
      </div>
    </BuyerLayout>
  );
}
