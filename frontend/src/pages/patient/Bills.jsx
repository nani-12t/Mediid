import React, { useState, useEffect } from 'react';
import { Receipt, Calendar, CreditCard, CheckCircle, Clock, AlertCircle, Download, Eye } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import toast from 'react-hot-toast';

// Mock data for bills (in a real app, this would come from an API)
const mockBills = [
  {
    id: 'BILL-2024-001',
    date: '2024-01-15',
    dueDate: '2024-02-15',
    status: 'paid',
    totalAmount: 2500,
    paidAmount: 2500,
    paymentDate: '2024-01-20',
    paymentMethod: 'Credit Card',
    items: [
      { description: 'Consultation Fee', amount: 500, category: 'Consultation' },
      { description: 'Blood Test (CBC)', amount: 800, category: 'Laboratory' },
      { description: 'X-Ray Chest', amount: 600, category: 'Radiology' },
      { description: 'Medicines', amount: 600, category: 'Pharmacy' }
    ],
    hospital: 'City General Hospital',
    doctor: 'Dr. Sarah Johnson'
  },
  {
    id: 'BILL-2024-002',
    date: '2024-02-10',
    dueDate: '2024-03-10',
    status: 'paid',
    totalAmount: 1800,
    paidAmount: 1800,
    paymentDate: '2024-02-12',
    paymentMethod: 'UPI',
    items: [
      { description: 'Follow-up Consultation', amount: 400, category: 'Consultation' },
      { description: 'MRI Scan', amount: 1400, category: 'Radiology' }
    ],
    hospital: 'City General Hospital',
    doctor: 'Dr. Sarah Johnson'
  },
  {
    id: 'BILL-2024-003',
    date: '2024-03-05',
    dueDate: '2024-04-05',
    status: 'pending',
    totalAmount: 3200,
    paidAmount: 0,
    items: [
      { description: 'Surgery Consultation', amount: 800, category: 'Consultation' },
      { description: 'CT Scan', amount: 1200, category: 'Radiology' },
      { description: 'Ultrasound', amount: 700, category: 'Radiology' },
      { description: 'Pathology Tests', amount: 500, category: 'Laboratory' }
    ],
    hospital: 'Apollo Medical Center',
    doctor: 'Dr. Michael Chen'
  },
  {
    id: 'BILL-2024-004',
    date: '2024-01-08',
    dueDate: '2024-02-08',
    status: 'unpaid',
    totalAmount: 950,
    paidAmount: 0,
    items: [
      { description: 'Dental Consultation', amount: 300, category: 'Consultation' },
      { description: 'Dental X-Ray', amount: 200, category: 'Radiology' },
      { description: 'Teeth Cleaning', amount: 450, category: 'Dental' }
    ],
    hospital: 'Smile Dental Clinic',
    doctor: 'Dr. Emily Davis'
  }
];

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // Simulate API call
    const loadBills = async () => {
      setLoading(true);
      // In a real app, this would be: await patientAPI.getBills();
      setTimeout(() => {
        setBills(mockBills);
        setLoading(false);
      }, 1000);
    };

    loadBills();
  }, []);

  const filteredBills = bills.filter(bill => {
    if (filter === 'all') return true;
    return bill.status === filter;
  });

  const billCounts = bills.reduce((acc, bill) => {
    acc.all += 1;
    acc[bill.status] += 1;
    return acc;
  }, { all: 0, paid: 0, pending: 0, unpaid: 0 });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={16} color="#10b981" />;
      case 'pending':
        return <Clock size={16} color="#f59e0b" />;
      case 'unpaid':
        return <AlertCircle size={16} color="#ef4444" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'unpaid':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDownloadBill = (billId) => {
    // In a real app, this would download the bill PDF
    toast.success('Bill download started');
  };

  const handleViewBill = (bill) => {
    setSelectedBill(bill);
  };

  if (loading) {
    return (
      <PatientLayout title="Bills & Expenses">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <div className="loading-spinner"></div>
        </div>
      </PatientLayout>
    );
  }

  return (
    <PatientLayout title="Bills & Expenses">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
          Bills & Expenses
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          View and manage your medical bills and expenses
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
            {formatCurrency(bills.reduce((sum, bill) => sum + bill.totalAmount, 0))}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Total Billed</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>
            {formatCurrency(bills.filter(b => b.status === 'paid').reduce((sum, bill) => sum + bill.paidAmount, 0))}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Total Paid</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
            {formatCurrency(bills.filter(b => b.status === 'pending').reduce((sum, bill) => sum + bill.totalAmount, 0))}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Pending Amount</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
            {bills.filter(b => b.status === 'unpaid').length}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Unpaid Bills</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.2s',
            background: filter === 'all' ? 'var(--teal)' : 'var(--gray-100)',
            color: filter === 'all' ? 'white' : 'var(--gray-700)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          All Bills ({billCounts.all})
        </button>
        <button
          onClick={() => setFilter('paid')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.2s',
            background: filter === 'paid' ? 'var(--teal)' : 'var(--gray-100)',
            color: filter === 'paid' ? 'white' : 'var(--gray-700)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          Paid ({billCounts.paid})
        </button>
        <button
          onClick={() => setFilter('pending')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.2s',
            background: filter === 'pending' ? 'var(--teal)' : 'var(--gray-100)',
            color: filter === 'pending' ? 'white' : 'var(--gray-700)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          Pending ({billCounts.pending})
        </button>
        <button
          onClick={() => setFilter('unpaid')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.2s',
            background: filter === 'unpaid' ? 'var(--teal)' : 'var(--gray-100)',
            color: filter === 'unpaid' ? 'white' : 'var(--gray-700)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          Unpaid ({billCounts.unpaid})
        </button>
      </div>

      {/* Bills List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredBills.length === 0 ? (
          <div className="card empty-state">
            <Receipt size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <p>No bills found for the selected filter</p>
          </div>
        ) : (
          filteredBills.map(bill => (
            <div key={bill.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Receipt size={20} color="var(--teal)" />
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{bill.id}</h3>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '6px 12px',
                      borderRadius: bill.status === 'paid' ? '20px' : bill.status === 'pending' ? '15px' : '8px',
                      background: bill.status === 'paid'
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : bill.status === 'pending'
                        ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                      border: `1px solid ${getStatusColor(bill.status)}30`,
                      boxShadow: `0 2px 4px ${getStatusColor(bill.status)}20`,
                      transform: bill.status === 'paid' ? 'scale(1.02)' : 'scale(1)'
                    }}>
                      {getStatusIcon(bill.status)}
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'white', textTransform: 'capitalize' }}>
                        {bill.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Bill Date</p>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(bill.date)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Due Date</p>
                      <p style={{ fontSize: 14, fontWeight: 500, color: bill.status === 'unpaid' ? '#ef4444' : 'var(--gray-900)' }}>
                        {formatDate(bill.dueDate)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Hospital</p>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{bill.hospital}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Doctor</p>
                      <p style={{ fontSize: 14, fontWeight: 500 }}>{bill.doctor}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Total Amount</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{formatCurrency(bill.totalAmount)}</p>
                    </div>
                    {bill.status === 'paid' && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Paid on</p>
                        <p style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(bill.paymentDate)}</p>
                        <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>{bill.paymentMethod}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleViewBill(bill)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Eye size={14} /> View Details
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDownloadBill(bill.id)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={14} /> Download
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bill Details Modal */}
      {selectedBill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Bill Details - {selectedBill.id}</h3>
              <button
                onClick={() => setSelectedBill(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-500)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Bill Date</p>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(selectedBill.date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Due Date</p>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{formatDate(selectedBill.dueDate)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Hospital</p>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{selectedBill.hospital}</p>
                </div>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 2 }}>Doctor</p>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{selectedBill.doctor}</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Bill Items</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedBill.items.map((item, index) => (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 6 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500 }}>{item.description}</p>
                        <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>{item.category}</p>
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>{formatCurrency(item.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>Total Amount</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{formatCurrency(selectedBill.totalAmount)}</span>
                </div>
                {selectedBill.status === 'paid' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#ecfdf5', borderRadius: 6, border: '1px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle size={16} color="#059669" />
                      <span style={{ fontSize: 14, color: '#059669', fontWeight: 500 }}>
                        Paid on {formatDate(selectedBill.paymentDate)} via {selectedBill.paymentMethod}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}
