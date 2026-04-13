import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Database, Activity, Clock, ChevronRight, FileText, CheckCircle } from 'lucide-react';
import BuyerLayout from '../../components/common/BuyerLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function BuyerDashboard() {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data } = await marketplaceAPI.getMyRequirements();
      setRequirements(data);
    } catch (error) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const activeReqs = requirements.filter(r => r.status === 'active').length;

  if (loading) {
    return (
      <BuyerLayout title="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner"/></div>
      </BuyerLayout>
    );
  }

  return (
    <BuyerLayout title="Dashboard">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 30 }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 24 }}>
          <div style={{ width: 48, height: 48, background: '#f0fdfa', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Activity size={24} />
          </div>
          <div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500, marginBottom: 4 }}>Active Requirements</p>
            <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)' }}>{activeReqs}</h3>
          </div>
        </div>
        
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 24 }}>
          <div style={{ width: 48, height: 48, background: '#eff6ff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <Database size={24} />
          </div>
          <div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', fontWeight: 500, marginBottom: 4 }}>Total Requirements</p>
            <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)' }}>{requirements.length}</h3>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--gray-800)' }}>My Requirements</h2>
        <Link to="/buyer/post-requirement" className="btn btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Post New
        </Link>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {requirements.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>
            <Database size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <p>You haven't posted any data requirements yet.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Title</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Target</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Status</th>
                <th style={{ padding: '12px 20px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Date</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(req => (
                <tr key={req._id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '16px 20px' }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-800)', marginBottom: 2 }}>{req.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>{req.dataNeeded}</p>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gray-600)' }}>{req.amount}</td>
                  <td style={{ padding: '16px 20px' }}>
                    <span style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      background: req.status === 'active' ? '#e6f7f5' : '#f3f4f6',
                      color: req.status === 'active' ? 'var(--teal)' : 'var(--gray-600)'
                    }}>
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 13, color: 'var(--gray-500)' }}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                     <Link to={`/buyer/submissions/${req._id}`} className="btn btn-outline btn-sm" style={{ padding: '6px 10px', fontSize: 12 }}>
                       View Submissions
                     </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </BuyerLayout>
  );
}
