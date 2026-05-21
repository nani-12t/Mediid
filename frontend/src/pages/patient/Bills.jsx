import React, { useState, useEffect } from 'react';
import { Receipt, Calendar, CreditCard, CheckCircle, Clock, AlertCircle, Download, Eye, Plus, Sparkles } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { patientAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function Bills() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [filter, setFilter] = useState('all');
  
  // Payment state
  const [payingBill, setPayingBill] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // New Custom Bill Simulation State
  const [showSimulateForm, setShowSimulateForm] = useState(false);
  const [newBill, setNewBill] = useState({
    title: '',
    category: 'Laboratory',
    hospitalName: '',
    doctorName: '',
    amount: '',
    dueDate: ''
  });
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);

  const loadBills = async () => {
    try {
      setLoading(true);
      const res = await patientAPI.getBills();
      setBills(res.data);
    } catch (err) {
      console.error('Error fetching bills:', err);
      toast.error('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, []);

  const filteredBills = bills.filter(bill => {
    if (filter === 'all') return true;
    return bill.status === filter;
  });

  const billCounts = bills.reduce((acc, bill) => {
    acc.all += 1;
    if (bill.status === 'paid') acc.paid += 1;
    else if (bill.status === 'pending') acc.pending += 1;
    else acc.unpaid += 1; // map any other status to unpaid
    return acc;
  }, { all: 0, paid: 0, pending: 0, unpaid: 0 });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle size={16} color="#ffffff" />;
      case 'pending':
        return <Clock size={16} color="#ffffff" />;
      case 'unpaid':
      default:
        return <AlertCircle size={16} color="#ffffff" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'unpaid':
      default:
        return '#ef4444';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleDownloadBill = (billId) => {
    toast.success(`Invoice for ${billId} downloaded successfully!`);
  };

  const handleViewBill = (bill) => {
    setSelectedBill(bill);
  };

  const handleOpenPay = (bill) => {
    setPayingBill(bill);
  };

  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!payingBill) return;

    try {
      setIsSubmittingPayment(true);
      await patientAPI.payBill(payingBill.billId, { paymentMethod });
      toast.success(`Successfully paid ${formatCurrency(payingBill.amount)} via ${paymentMethod}!`);
      setPayingBill(null);
      
      // Update local state or reload
      await loadBills();
    } catch (err) {
      console.error('Error paying bill:', err);
      toast.error('Payment failed. Please try again.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleCreateBillSubmit = async (e) => {
    e.preventDefault();
    if (!newBill.title || !newBill.amount) {
      toast.error('Title and Amount are required');
      return;
    }

    try {
      setIsSubmittingBill(true);
      await patientAPI.addCustomBill(newBill);
      toast.success('Diagnostic bill generated successfully!');
      setShowSimulateForm(false);
      setNewBill({
        title: '',
        category: 'Laboratory',
        hospitalName: '',
        doctorName: '',
        amount: '',
        dueDate: ''
      });
      await loadBills();
    } catch (err) {
      console.error('Error creating bill:', err);
      toast.error('Failed to create diagnostic bill');
    } finally {
      setIsSubmittingBill(false);
    }
  };

  const totalBilled = bills.reduce((sum, b) => sum + b.amount, 0);
  const totalPaid = bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + b.amount, 0);
  const pendingAmount = bills.filter(b => b.status !== 'paid').reduce((sum, b) => sum + b.amount, 0);
  const unpaidCount = bills.filter(b => b.status !== 'paid').length;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
            Bills & Expenses
          </h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
            View and manage your medical bills, consultation fees, and diagnostic expenses
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowSimulateForm(!showSimulateForm)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={16} /> Simulate Diagnostic Bill
        </button>
      </div>

      {/* Simulation Form */}
      {showSimulateForm && (
        <div className="card animate-fade-in" style={{ marginBottom: 24, border: '1px solid var(--teal-100)', background: 'var(--teal-50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Sparkles size={20} color="var(--teal)" />
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal-800)' }}>Simulate Diagnostic Lab Bill</h3>
          </div>
          <form onSubmit={handleCreateBillSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Bill Title / Test Name *
              </label>
              <input
                type="text"
                placeholder="e.g. MRI Scan - Brain, CBC Blood Test"
                value={newBill.title}
                onChange={e => setNewBill({ ...newBill, title: e.target.value })}
                required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Category
              </label>
              <select
                value={newBill.category}
                onChange={e => setNewBill({ ...newBill, category: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', background: 'white' }}
              >
                <option value="Laboratory">Laboratory</option>
                <option value="Radiology">Radiology</option>
                <option value="Pharmacy">Pharmacy</option>
                <option value="Consultation">Consultation</option>
                <option value="Surgery">Surgery</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Amount (INR) *
              </label>
              <input
                type="number"
                placeholder="e.g. 2500"
                value={newBill.amount}
                onChange={e => setNewBill({ ...newBill, amount: e.target.value })}
                required
                min="0"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Due Date
              </label>
              <input
                type="date"
                value={newBill.dueDate}
                onChange={e => setNewBill({ ...newBill, dueDate: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Hospital Name
              </label>
              <input
                type="text"
                placeholder="e.g. Apollo Chennai"
                value={newBill.hospitalName}
                onChange={e => setNewBill({ ...newBill, hospitalName: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 6 }}>
                Doctor / Specialist Name
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. Ramesh"
                value={newBill.doctorName}
                onChange={e => setNewBill({ ...newBill, doctorName: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowSimulateForm(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmittingBill}
              >
                {isSubmittingBill ? 'Generating...' : 'Generate Bill'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid var(--teal)' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--teal)', marginBottom: 4 }}>
            {formatCurrency(totalBilled)}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Total Billed</div>
        </div>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>
            {formatCurrency(totalPaid)}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Total Paid</div>
        </div>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>
            {formatCurrency(pendingAmount)}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Pending / Unpaid</div>
        </div>
        <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
            {unpaidCount}
          </div>
          <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>Outstanding Invoices</div>
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
          Pending / Unpaid ({billCounts.pending + billCounts.unpaid})
        </button>
      </div>

      {/* Bills List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredBills.length === 0 ? (
          <div className="card empty-state" style={{ textAlign: 'center', padding: '48px 0' }}>
            <Receipt size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
            <p style={{ color: 'var(--gray-500)' }}>No bills found for the selected filter</p>
          </div>
        ) : (
          filteredBills.map(bill => (
            <div key={bill.billId} className="card hover-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Receipt size={20} color="var(--teal)" />
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{bill.title}</h3>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 10px',
                      borderRadius: 12,
                      background: getStatusColor(bill.status),
                      boxShadow: `0 2px 4px ${getStatusColor(bill.status)}20`,
                    }}>
                      {getStatusIcon(bill.status)}
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'white', textTransform: 'capitalize' }}>
                        {bill.status === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    {bill.isAppointment && (
                      <span style={{ fontSize: 11, background: 'var(--teal-50)', color: 'var(--teal-700)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                        Appointment Fee
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Bill Date</p>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(bill.date)}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Due Date</p>
                      <p style={{ fontSize: 13, fontWeight: 500, color: bill.status !== 'paid' ? '#ef4444' : 'var(--gray-900)' }}>
                        {formatDate(bill.dueDate)}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Facility</p>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{bill.hospitalName || 'MediID Center'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Referrer</p>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{bill.doctorName || 'General Practitioner'}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Amount Due</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{formatCurrency(bill.amount)}</p>
                    </div>
                    {bill.status === 'paid' && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>Settled on</p>
                        <p style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(bill.paidAt || bill.date)}</p>
                        <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Method: {bill.paymentMethod || 'Online Payment'}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignSelf: 'center' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleViewBill(bill)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Eye size={14} /> Details
                  </button>
                  {bill.status !== 'paid' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleOpenPay(bill)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#10b981', borderColor: '#10b981' }}
                    >
                      <CreditCard size={14} /> Pay Now
                    </button>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDownloadBill(bill.billId)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={14} /> Invoice
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bill Details Modal */}
      {selectedBill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 500, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Invoice Details</h3>
              <button
                onClick={() => setSelectedBill(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gray-500)' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ background: 'var(--gray-50)', padding: 16, borderRadius: 8, border: '1px dashed var(--gray-200)' }}>
                <p style={{ fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Transaction Ref</p>
                <p style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace' }}>{selectedBill.billId}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Billing Date</p>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(selectedBill.date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Due Date</p>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{formatDate(selectedBill.dueDate)}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Service Provider</p>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{selectedBill.hospitalName || 'MediID Center'}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Doctor/Attendant</p>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{selectedBill.doctorName || 'General Practitioner'}</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Items Charged</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{selectedBill.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--gray-500)' }}>Category: {selectedBill.category}</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--teal)' }}>{formatCurrency(selectedBill.amount)}</p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Total Charge</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--teal)' }}>{formatCurrency(selectedBill.amount)}</span>
                </div>

                {selectedBill.status === 'paid' ? (
                  <div style={{ padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={16} color="#059669" />
                      <span style={{ fontSize: 13, color: '#059669', fontWeight: 500 }}>
                        Settled on {formatDate(selectedBill.paidAt || selectedBill.date)} via {selectedBill.paymentMethod || 'Online'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', background: '#10b981', borderColor: '#10b981' }}
                    onClick={() => {
                      setSelectedBill(null);
                      handleOpenPay(selectedBill);
                    }}
                  >
                    Proceed to Payment ({formatCurrency(selectedBill.amount)})
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Processing Modal */}
      {payingBill && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Choose Payment Method</h3>
              <button
                onClick={() => setPayingBill(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gray-500)' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePaySubmit}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 8 }}>
                  Paying <strong style={{ color: 'var(--teal)' }}>{formatCurrency(payingBill.amount)}</strong> for:
                </p>
                <p style={{ fontSize: 15, fontWeight: 600, padding: '8px 12px', background: 'var(--gray-50)', borderRadius: 6, border: '1px solid var(--gray-200)' }}>
                  {payingBill.title}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {['UPI', 'Credit / Debit Card', 'Net Banking', 'MediID Digital Wallet'].map(method => (
                  <label
                    key={method}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: paymentMethod === method ? '2px solid var(--teal)' : '1px solid var(--gray-200)',
                      background: paymentMethod === method ? 'var(--teal-50)' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={method}
                      checked={paymentMethod === method}
                      onChange={() => setPaymentMethod(method)}
                      style={{ accentColor: 'var(--teal)' }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-800)' }}>{method}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  onClick={() => setPayingBill(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#10b981', borderColor: '#10b981' }}
                  disabled={isSubmittingPayment}
                >
                  {isSubmittingPayment ? 'Processing...' : 'Pay Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}
