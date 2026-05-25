import React, { useState } from 'react';
import { 
  Search, QrCode, Pill, Clock, User, Building, 
  ChevronRight, LogOut, FileText, Download, Printer, X, Eye, CheckCircle2, CheckSquare, Square
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function PharmacyDashboard() {
  const { logout, user } = useAuth();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  
  // Checkout states
  const [checkedItems, setCheckedItems] = useState({});
  const [checkoutReceipt, setCheckoutReceipt] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setCheckoutReceipt(null);
    setCheckedItems({});
    try {
      const { data } = await api.get(`/pharmacy-portal/prescription/${search.trim()}`);
      setData(data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Patient not found or no active prescriptions');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const parseMedicinesFromRx = (notesText) => {
    if (!notesText) return [];
    const lines = notesText.split('\n');
    const medicinesList = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      // Match lines starting with numbers like "1. Tab. Metformin -- 1-0-1"
      const match = trimmed.match(/^\d+\.\s*(.*)$/);
      if (match) {
        medicinesList.push({
          id: trimmed,
          name: match[1]
        });
      }
    });

    if (medicinesList.length === 0) {
      // Fallback if notes text has no numbered lines
      medicinesList.push({
        id: 'entire_rx',
        name: 'Dispense full prescription as written below'
      });
    }

    return medicinesList;
  };

  const handleCheckboxChange = (rxId, medId) => {
    const key = `${rxId}-${medId}`;
    setCheckedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCheckout = (rx, meds) => {
    const rxMeds = meds.map(m => m.id);
    const checkedMedsForRx = meds.filter(m => checkedItems[`${rx._id}-${m.id}`]);

    if (checkedMedsForRx.length === 0) {
      toast.error('Please select at least one medicine to dispense.');
      return;
    }

    const receipt = {
      receiptId: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      patientName: data.patient.name,
      patientUid: data.patient.uid,
      patientAge: data.patient.age,
      patientGender: data.patient.gender,
      doctorName: rx.doctorName,
      hospitalName: rx.hospitalName,
      date: new Date().toLocaleString(),
      dispensedMeds: checkedMedsForRx.map(m => m.name),
      allMedsCount: meds.length,
      dispensedCount: checkedMedsForRx.length
    };

    setCheckoutReceipt(receipt);
    toast.success('Dispensing checkout generated!');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', padding: '40px 20px', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={{ maxWidth: 850, margin: '0 auto' }}>
        
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: '#0e4a4a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Pill size={22} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 'bold', color: '#0e4a4a', margin: 0 }}>MediID Pharmacy Desk</h1>
              <p style={{ fontSize: 11, color: '#57606f', margin: 0 }}>Digital Prescription Dispensing Workbench</p>
            </div>
          </div>
          <button 
            onClick={logout} 
            style={{ 
              border: '1px solid #c8d6e5', 
              background: 'white', 
              color: '#57606f', 
              fontWeight: 'bold', 
              padding: '6px 12px',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8 
            }}
          >
            <LogOut size={14} /> SIGN OUT
          </button>
        </div>

        {/* Prescription Lookup Hero */}
        <div style={{ background: '#0e4a4a', borderRadius: 8, padding: '24px 32px', color: 'white', marginBottom: 24, boxShadow: '0 4px 15px rgba(14,74,74,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <QrCode size={22} color="#4cd137" />
            <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>Patient Rx Lookup</h2>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
            Scan the patient's secure digital QR code or enter their Patient Medical ID (MID) below to retrieve verified prescriptions.
          </p>
        </div>

        {/* Search Input Card */}
        <div style={{ background: 'white', borderRadius: 8, padding: '24px 32px', border: '1px solid #cbd5e1', boxShadow: '0 2px 5px rgba(0,0,0,0.02)', marginBottom: 24 }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Enter Patient Medical ID (e.g. MID-XXXXXXXX)" 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: 15, outline: 'none', background: '#fcfcfc' }}
              />
            </div>
            <button 
              type="submit" 
              disabled={loading} 
              style={{ 
                background: '#0e4a4a', 
                color: 'white', 
                border: 'none', 
                padding: '0 32px', 
                borderRadius: 4, 
                fontSize: 14, 
                fontWeight: 'bold', 
                cursor: 'pointer', 
                transition: 'background 0.2s' 
              }}
            >
              {loading ? 'Searching...' : 'Search Profile'}
            </button>
          </form>
        </div>

        {/* Results Block */}
        {data && (
          <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Patient Info Card */}
            <div style={{ 
              background: '#ffffff', 
              borderRadius: 8, 
              border: '1px solid #cbd5e1', 
              padding: '16px 24px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 'bold', color: '#2c3e50', margin: '0 0 4px 0' }}>
                  {data.patient.name}
                </h3>
                <p style={{ fontSize: 12, color: '#7f8c8d', margin: 0 }}>
                  MID: <strong>{data.patient.uid}</strong> &nbsp;|&nbsp; 
                  Age: <strong>{data.patient.age} years</strong> &nbsp;|&nbsp; 
                  Gender: <strong>{data.patient.gender}</strong>
                </p>
              </div>
              <span style={{ fontSize: 10, fontWeight: 'bold', color: '#10b981', background: '#e8fdf5', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: 4 }}>
                PROFILE VERIFIED ✓
              </span>
            </div>

            {/* Prescriptions List */}
            {data.prescriptions.length > 0 ? (
              data.prescriptions.map((rx) => {
                const meds = parseMedicinesFromRx(rx.notes);
                
                return (
                  <div 
                    key={rx._id} 
                    style={{ 
                      background: 'white', 
                      borderRadius: 8, 
                      border: '1px solid #cbd5e1', 
                      overflow: 'hidden', 
                      boxShadow: '0 2px 6px rgba(0,0,0,0.01)' 
                    }}
                  >
                    {/* Prescribing Doctor Metadata */}
                    <div style={{ 
                      padding: '14px 20px', 
                      background: '#f8fafc', 
                      borderBottom: '1px solid #e2e8f0', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center' 
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#2c3e50' }}>Prescription by {rx.doctorName}</div>
                        <div style={{ fontSize: 11, color: '#7f8c8d' }}>
                          Uploaded: {new Date(rx.uploadedAt).toLocaleString()} &nbsp;|&nbsp; Facility: {rx.hospitalName}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ padding: 6, borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}><Printer size={14} color="#7f8c8d" /></button>
                        <button style={{ padding: 6, borderRadius: 4, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer' }}><Download size={14} color="#7f8c8d" /></button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, padding: '20px' }}>
                      {/* Interactive Dispensing Panel (Left) */}
                      <div style={{ flex: 1, borderRight: '1px solid #f1f2f6', paddingRight: '20px' }}>
                        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#0e4a4a', display: 'block', marginBottom: 12 }}>
                          SELECT DRUGS FOR DISPENSING
                        </span>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {meds.map((med, idx) => {
                            const isChecked = !!checkedItems[`${rx._id}-${med.id}`];
                            return (
                              <div 
                                key={idx}
                                onClick={() => handleCheckboxChange(rx._id, med.id)}
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 10, 
                                  padding: '10px 14px', 
                                  borderRadius: 4, 
                                  border: isChecked ? '1px solid #0e4a4a' : '1px solid #cbd5e1',
                                  background: isChecked ? '#e8f2f2' : '#ffffff',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s'
                                }}
                              >
                                {isChecked ? (
                                  <CheckSquare size={18} color="#0e4a4a" />
                                ) : (
                                  <Square size={18} color="#7f8c8d" />
                                )}
                                <span style={{ fontSize: 13, fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? '#0e4a4a' : '#2c3e50' }}>
                                  {med.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: 20 }}>
                          <button 
                            onClick={() => handleCheckout(rx, meds)}
                            style={{ 
                              width: '100%', 
                              background: '#10ac84', 
                              color: 'white', 
                              border: 'none', 
                              padding: '10px 0', 
                              borderRadius: 4, 
                              fontSize: 13, 
                              fontWeight: 'bold', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                          >
                            <CheckCircle2 size={16} /> Complete Checkout & Issue
                          </button>
                        </div>
                      </div>

                      {/* Raw Case notes (Right) */}
                      <div style={{ width: '45%' }}>
                        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#7f8c8d', display: 'block', marginBottom: 10 }}>
                          VERIFIED CLINICAL Rx CASE NOTES
                        </span>
                        <div style={{ 
                          padding: '12px', 
                          background: '#f8fafc', 
                          border: '1px solid #e2e8f0', 
                          borderRadius: 4, 
                          fontFamily: 'monospace', 
                          fontSize: 12, 
                          lineHeight: 1.6, 
                          color: '#2c3e50',
                          whiteSpace: 'pre-wrap',
                          height: 220,
                          overflowY: 'auto'
                        }}>
                          {rx.notes}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ background: 'white', borderRadius: 8, padding: '48px', border: '1px solid #cbd5e1', textAlign: 'center', color: '#7f8c8d' }}>
                <Pill size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
                <p style={{ fontWeight: 'bold', fontSize: 14 }}>No prescriptions found on file from this hospital.</p>
                <p style={{ fontSize: 12 }}>Check patient ID or ensure the doctor has completed consultation and signed the Rx.</p>
              </div>
            )}

            {/* Thermal Receipt Preview Modal / Block */}
            {checkoutReceipt && (
              <div className="fade-in" style={{ 
                background: '#ffffff', 
                border: '2px solid #2c3e50', 
                borderRadius: 8, 
                padding: '24px', 
                marginTop: 10,
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px dashed #cbd5e1', paddingBottom: 10, marginBottom: 15 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 'bold', color: '#0e4a4a', margin: 0 }}>
                    DISPENSING CHECKOUT RECEIPT (MOCKUP)
                  </h4>
                  <button 
                    onClick={() => setCheckoutReceipt(null)}
                    style={{ background: 'transparent', border: 'none', color: '#7f8c8d', cursor: 'pointer' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Receipt Preview */}
                <div style={{ 
                  background: '#fcfcfc', 
                  border: '1px solid #ddd', 
                  padding: '20px', 
                  borderRadius: 4, 
                  fontFamily: 'monospace', 
                  fontSize: 12, 
                  color: '#000000',
                  lineHeight: 1.6,
                  maxWidth: 380,
                  margin: '0 auto',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ textAlign: 'center', marginBottom: 15, borderBottom: '1px dashed #aaa', paddingBottom: 10 }}>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 'bold' }}>MEDIID DIGITAL PHARMACY</h3>
                    <p style={{ margin: 0, fontSize: 10 }}>{checkoutReceipt.hospitalName || 'Medical Clinic'}</p>
                    <p style={{ margin: 0, fontSize: 9 }}>Date: {checkoutReceipt.date}</p>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    ID: {checkoutReceipt.receiptId}<br />
                    Patient: {checkoutReceipt.patientName} (MID-{checkoutReceipt.patientUid.substring(0, 8)})<br />
                    Age/Gen: {checkoutReceipt.patientAge || '—'} / {checkoutReceipt.patientGender || '—'}<br />
                    Doctor: {checkoutReceipt.doctorName}
                  </div>

                  <div style={{ borderTop: '1px dashed #aaa', borderBottom: '1px dashed #aaa', padding: '10px 0', marginBottom: 15 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Dispensed Drug Details</span>
                      <span>Disp: {checkoutReceipt.dispensedCount}/{checkoutReceipt.allMedsCount}</span>
                    </div>
                    {checkoutReceipt.dispensedMeds.map((med, idx) => (
                      <div key={idx} style={{ padding: '2px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span>• {med}</span>
                        <span style={{ fontWeight: 'bold' }}>✓ OK</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ textAlign: 'center', padding: '6px 0', background: '#e8fdf5', border: '1px solid #a7f3d0', borderRadius: 4, color: '#065f46', fontWeight: 'bold', fontSize: 13 }}>
                    ✓ DISPENSING APPROVED & COMPLETE
                  </div>

                  <div style={{ textAlign: 'center', marginTop: 15, fontSize: 9, color: '#777' }}>
                    Thank you for using MediID DigiLocker.<br />
                    Prescription status updated in patient history.
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      <style>{`
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
