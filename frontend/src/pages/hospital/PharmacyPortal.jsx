import React, { useState, useEffect } from 'react';
import { 
  Pill, Search, Lock, User, Check, Trash2, Plus, Printer, 
  FileText, AlertCircle, Calendar, DollarSign, CheckCircle, 
  LogOut, X, Heart, Activity
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { authAPI, pharmacyPortalAPI } from '../../utils/api';
import HospitalLayout from '../../components/common/HospitalLayout';
import toast from 'react-hot-toast';

export default function PharmacyPortal() {
  const { profile: adminProfile } = useAuth(); // Logged-in hospital admin profile

  // Workbench states
  const [searchQuery, setSearchQuery] = useState('');
  const [patientData, setPatientData] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  
  // Dispensing items state
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [dispenseList, setDispenseList] = useState([]); // Array of { name, qty, price, dispensed }
  const [extraItems, setExtraItems] = useState([]); // Array of { name, qty, price }
  const [extraInput, setExtraInput] = useState({ name: '', qty: 1, price: '' });
  
  // Checkout & Receipt Modal
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [dispenseLoading, setDispenseLoading] = useState(false);

  // Lookup Patient Prescriptions
  const handlePatientLookup = async (uidToSearch) => {
    const uid = (uidToSearch || searchQuery).trim().toUpperCase();
    if (!uid) return;

    setPatientLoading(true);
    setSelectedPrescription(null);
    setDispenseList([]);
    setExtraItems([]);
    
    try {
      const { data } = await pharmacyPortalAPI.getPrescriptions(uid);
      setPatientData(data);
      toast.success(`Prescriptions loaded for: ${data.patient.name}`);
      
      // Auto-select latest prescription if available
      if (data.prescriptions && data.prescriptions.length > 0) {
        selectPrescription(data.prescriptions[0]);
      }
    } catch (err) {
      console.error(err);
      setPatientData(null);
      toast.error(err.response?.data?.message || 'Patient or Prescriptions not found.');
    } finally {
      setPatientLoading(false);
    }
  };

  // Parse prescription text block into checklist items
  const selectPrescription = (rx) => {
    setSelectedPrescription(rx);
    
    // Attempt to parse medicines out of prescriptionText
    // Standard format generated in DoctorPortal:
    // "1. Tab/Syp. Paracetamol -- 1-0-1 -- 5 Days (After food)"
    const list = [];
    const text = rx.notes || '';
    const lines = text.split('\n');
    
    lines.forEach(line => {
      // Check if line contains doctor prescribed medicines format
      const match = line.match(/^\d+\.\s*(?:Tab\/Syp\.\s*)?([^\-]+)--\s*([^\-]+)--\s*(\d+)\s*Days?/i);
      if (match) {
        const name = match[1].trim();
        const duration = parseInt(match[3].trim(), 10) || 5;
        const dosage = match[2].trim();
        
        // Calculate a sensible default quantity: e.g. if dosage is "1-0-1", that's 2 per day * duration
        let timesPerDay = 1;
        if (dosage.includes('-')) {
          timesPerDay = dosage.split('-').reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
        }
        const qty = Math.max(1, Math.ceil(timesPerDay * duration));

        list.push({
          name,
          qty,
          dosage,
          price: 15, // Mock default price per pill
          dispensed: true
        });
      }
    });

    // If parsing failed or found nothing, but there is text, add a placeholder summary row
    if (list.length === 0 && text.trim()) {
      list.push({
        name: 'Prescribed Course (General advice/compounded Rx)',
        qty: 1,
        dosage: 'As advised',
        price: 100,
        dispensed: true
      });
    }

    setDispenseList(list);
  };

  // Update checkoff fields
  const toggleDispenseItem = (index) => {
    const updated = [...dispenseList];
    updated[index].dispensed = !updated[index].dispensed;
    setDispenseList(updated);
  };

  const updateItemQty = (index, val) => {
    const qty = Math.max(0, parseInt(val, 10) || 0);
    const updated = [...dispenseList];
    updated[index].qty = qty;
    setDispenseList(updated);
  };

  const updateItemPrice = (index, val) => {
    const price = Math.max(0, parseFloat(val) || 0);
    const updated = [...dispenseList];
    updated[index].price = price;
    setDispenseList(updated);
  };

  // Extra OTC line items handlers
  const handleAddExtraItem = (e) => {
    e.preventDefault();
    if (!extraInput.name.trim() || !extraInput.price) return;
    
    setExtraItems([
      ...extraItems,
      {
        name: extraInput.name.trim(),
        qty: Math.max(1, parseInt(extraInput.qty, 10) || 1),
        price: Math.max(0, parseFloat(extraInput.price) || 0)
      }
    ]);
    setExtraInput({ name: '', qty: 1, price: '' });
  };

  const removeExtraItem = (idx) => {
    setExtraItems(extraItems.filter((_, i) => i !== idx));
  };

  // Calculation summaries
  const getSubtotal = () => {
    const rxTotal = dispenseList
      .filter(i => i.dispensed)
      .reduce((sum, item) => sum + (item.qty * item.price), 0);
      
    const extraTotal = extraItems.reduce((sum, item) => sum + (item.qty * item.price), 0);
    return rxTotal + extraTotal;
  };

  const getTax = () => Math.round(getSubtotal() * 0.05); // 5% GST
  const getTotal = () => getSubtotal() + getTax();

  // Complete Dispensing Flow
  const handleDispenseSubmit = async () => {
    const activeDispensed = dispenseList.filter(i => i.dispensed);
    const allItemsToIssue = [...activeDispensed, ...extraItems];

    if (allItemsToIssue.length === 0) {
      return toast.error('No medicines selected for checkout dispense.');
    }

    setDispenseLoading(true);
    try {
      const payload = {
        patientId: patientData.patient._id || patientData.patient.id,
        prescriptionId: selectedPrescription?._id,
        medicines: allItemsToIssue.map(m => ({ name: m.name, qty: m.qty })),
        totalAmount: getTotal()
      };

      const { data } = await pharmacyPortalAPI.dispensePrescription(payload);
      
      // Store checkout receipt details for rendering
      setReceiptData({
        billId: data.billId,
        patientName: patientData.patient.name,
        patientUid: patientData.patient.uid,
        doctorName: selectedPrescription?.doctorName || 'Hospital Doctor',
        date: new Date(),
        items: allItemsToIssue,
        subtotal: getSubtotal(),
        tax: getTax(),
        total: getTotal()
      });
      
      toast.success('Record Synced & Medications Issued Successfully!');
      setShowReceipt(true);
      
      // Clear current search to refresh or allow next patient
      setPatientData(null);
      setSelectedPrescription(null);
      setDispenseList([]);
      setExtraItems([]);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      toast.error('Dispensing checkout failed. Please retry.');
    } finally {
      setDispenseLoading(false);
    }
  };

  // Quick seed profiles list
  const quickPatients = [
    { name: 'Arjun Sharma', uid: 'MID-ARJUNSHARMA01', desc: 'Diabetes Rx' },
    { name: 'Priya Nair', uid: 'MID-PRIYANAIR02', desc: 'Migraine Rx' },
    { name: 'Ramesh Patel', uid: 'MID-RAMESHPATEL03', desc: 'Hypertension Rx' }
  ];


  // Render Pharmacy Workbench
  return (
    <HospitalLayout title="Pharmacy Desk">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 60, fontFamily: 'var(--font-body)' }} className="fade-in">
        
        {/* Workbench Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderRadius: 20,
          padding: '24px 30px',
          color: 'white',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48,
              height: 48,
              background: 'rgba(0, 180, 160, 0.15)',
              border: '1.5px solid rgba(0, 180, 160, 0.3)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Pill size={24} color="var(--teal-light)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>
                  Pharmacy Station Counter
                </span>
                <span style={{ fontSize: 11, background: 'var(--teal)', color: 'white', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
                  Live Dispensing
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Workbench layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
          
          {/* Left panel: Patient search */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--navy)' }}>
                <Search size={16} /> Lookup Patient ID
              </h3>
              
              <form onSubmit={(e) => { e.preventDefault(); handlePatientLookup(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input 
                  type="text"
                  placeholder="Enter Patient MID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--gray-200)', fontSize: 13, outline: 'none' }}
                />
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 0', fontSize: 13, borderRadius: 10, width: '100%' }}>
                  Load Prescription Locker
                </button>
              </form>

              {/* Quick seed profiles helper */}
              <div style={{ marginTop: 20, borderTop: '1px solid var(--gray-100)', paddingTop: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Test Prescriptions:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {quickPatients.map(p => (
                    <div 
                      key={p.uid}
                      onClick={() => {
                        setSearchQuery(p.uid);
                        handlePatientLookup(p.uid);
                      }}
                      style={{
                        fontSize: 11.5,
                        padding: '8px 10px',
                        background: 'var(--gray-50)',
                        borderRadius: 8,
                        cursor: 'pointer',
                        border: '1px solid transparent',
                        transition: 'all 0.2s',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      className="card-hover-effect"
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--gray-700)' }}>{p.name}</span>
                        <p style={{ fontSize: 9.5, color: 'var(--gray-400)', margin: 0 }}>{p.desc}</p>
                      </div>
                      <strong style={{ color: 'var(--teal)', fontSize: 10 }}>Load</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Active prescriptions & itemizer checklist */}
          <div className="card" style={{ minHeight: 480, display: 'flex', flexDirection: 'column', padding: 0 }}>
            {patientLoading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }}>
                <div className="spinner" style={{ width: 28, height: 28 }} />
                <span style={{ fontSize: 14, color: 'var(--gray-500)', fontWeight: 600 }}>Fetching prescriptions...</span>
              </div>
            ) : !patientData ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40, color: 'var(--gray-400)', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, background: 'var(--gray-50)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--gray-200)' }}>
                  <Pill size={36} color="var(--gray-300)" />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 800, color: 'var(--gray-800)' }}>Ready for Lookup</h4>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-400)', maxWidth: 380 }}>
                    Enter a patient's Medical ID (MID) or click one of the quick test profiles to check off and dispense prescribed medicines.
                  </p>
                </div>
              </div>
            ) : (
              <div className="fade-in">
                {/* Patient Banner */}
                <div style={{
                  background: 'var(--gray-50)',
                  borderBottom: '1px solid var(--gray-200)',
                  padding: '20px 24px',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 16
                }}>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div className="avatar" style={{ width: 48, height: 48, background: 'linear-gradient(135deg, var(--teal) 0%, var(--sky) 100%)', fontSize: 18, color: 'white', fontWeight: 800 }}>
                      {patientData.patient.name[0]}
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 2px 0', fontSize: 16, fontWeight: 800, color: 'var(--gray-900)' }}>
                        {patientData.patient.name}
                      </h3>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--gray-500)', display: 'flex', gap: 12 }}>
                        <span>UID: <strong>{patientData.patient.uid}</strong></span>
                        <span>Age: <strong>{patientData.patient.age} Yrs</strong></span>
                        <span>Gender: <strong>{patientData.patient.gender}</strong></span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Prescription select strip */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase' }}>Active Prescriptions:</span>
                  {patientData.prescriptions.length === 0 ? (
                    <span style={{ fontSize: 12.5, color: 'var(--coral)', fontWeight: 600 }}>No prescriptions registered at this hospital.</span>
                  ) : (
                    patientData.prescriptions.map((rx, idx) => (
                      <button 
                        key={rx._id}
                        onClick={() => selectPrescription(rx)}
                        style={{
                          background: selectedPrescription?._id === rx._id ? 'var(--navy)' : 'var(--gray-50)',
                          color: selectedPrescription?._id === rx._id ? 'white' : 'var(--gray-700)',
                          border: '1px solid var(--gray-200)',
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <FileText size={13} /> Rx: {new Date(rx.uploadedAt).toLocaleDateString()}
                      </button>
                    ))
                  )}
                </div>

                {/* Main Dispensing Workbench Panels */}
                {selectedPrescription && (
                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                    
                    {/* Prescription Details Card */}
                    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 12, padding: 14, background: '#fafafa' }}>
                      <div style={{ display: 'flex', justifycontent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Issued by: <strong>{selectedPrescription.doctorName}</strong></span>
                        <span style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>Date: {new Date(selectedPrescription.uploadedAt).toLocaleString()}</span>
                      </div>
                      <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 8, padding: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Doctor Clinical Notes / Diagnosis</span>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-700)', whiteSpace: 'pre-line' }}>{selectedPrescription.notes}</p>
                      </div>
                    </div>

                    {/* Prescription Item Checker */}
                    <div>
                      <h4 style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                        Prescription Medication Check-Off
                      </h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1.5px solid var(--gray-200)', color: 'var(--gray-500)', fontSize: 11.5 }}>
                            <th style={{ padding: '6px 8px', width: 40 }}>Issue</th>
                            <th style={{ padding: '6px 8px' }}>Medication Name</th>
                            <th style={{ padding: '6px 8px', width: 120 }}>Dosage Pattern</th>
                            <th style={{ padding: '6px 8px', width: 100 }}>Total Qty</th>
                            <th style={{ padding: '6px 8px', width: 120 }}>Price per Unit (₹)</th>
                            <th style={{ padding: '6px 8px', width: 100, textAlign: 'right' }}>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dispenseList.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)', color: item.dispensed ? 'var(--gray-800)' : 'var(--gray-400)' }}>
                              <td style={{ padding: '10px 8px' }}>
                                <input 
                                  type="checkbox"
                                  checked={item.dispensed}
                                  onChange={() => toggleDispenseItem(idx)}
                                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '10px 8px', fontWeight: 600 }}>{item.name}</td>
                              <td style={{ padding: '10px 8px' }}>{item.dosage}</td>
                              <td style={{ padding: '10px 8px' }}>
                                <input 
                                  type="number"
                                  min="0"
                                  value={item.qty}
                                  onChange={e => updateItemQty(idx, e.target.value)}
                                  disabled={!item.dispensed}
                                  style={{ width: 60, padding: '4px 6px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 12 }}
                                />
                              </td>
                              <td style={{ padding: '10px 8px' }}>
                                <input 
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={item.price}
                                  onChange={e => updateItemPrice(idx, e.target.value)}
                                  disabled={!item.dispensed}
                                  style={{ width: 70, padding: '4px 6px', border: '1px solid var(--gray-200)', borderRadius: 6, fontSize: 12 }}
                                />
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                                ₹{item.dispensed ? (item.qty * item.price).toFixed(2) : '0.00'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Extra OTC Items Row adder */}
                    <div>
                      <h4 style={{ fontSize: 13, color: 'var(--navy)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                        Add Extra OTC Medicines & Consumables
                      </h4>
                      <form onSubmit={handleAddExtraItem} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <input 
                          type="text" 
                          placeholder="Item Name (e.g. Cough Syrup, Band-aids)"
                          value={extraInput.name}
                          onChange={e => setExtraInput({ ...extraInput, name: e.target.value })}
                          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 12.5 }}
                        />
                        <input 
                          type="number" 
                          min="1"
                          placeholder="Qty"
                          value={extraInput.qty}
                          onChange={e => setExtraInput({ ...extraInput, qty: e.target.value })}
                          style={{ width: 60, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 12.5 }}
                        />
                        <input 
                          type="number" 
                          min="0"
                          step="0.5"
                          placeholder="Price (₹)"
                          value={extraInput.price}
                          onChange={e => setExtraInput({ ...extraInput, price: e.target.value })}
                          style={{ width: 85, padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--gray-200)', fontSize: 12.5 }}
                        />
                        <button 
                          type="submit" 
                          className="btn" 
                          style={{ background: 'rgba(0,180,160,0.1)', color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
                        >
                          <Plus size={14} /> Add OTC
                        </button>
                      </form>

                      {extraItems.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--gray-100)', borderRadius: 10, padding: 12, background: 'var(--gray-50)' }}>
                          {extraItems.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ background: 'var(--sky)', color: 'white', padding: '1px 5px', borderRadius: 4, fontSize: 9.5, fontWeight: 700 }}>OTC</span>
                                <strong>{item.name}</strong>
                                <span style={{ color: 'var(--gray-400)' }}>x{item.qty} (@ ₹{item.price})</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <strong style={{ color: 'var(--gray-800)' }}>₹{(item.qty * item.price).toFixed(2)}</strong>
                                <button type="button" onClick={() => removeExtraItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Dispense action + pricing summary layout */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--gray-200)', paddingTop: 20 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>Subtotal: ₹{getSubtotal().toFixed(2)}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--gray-500)' }}>GST (5%): ₹{getTax().toFixed(2)}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--gray-900)' }}>Total Due: ₹{getTotal().toFixed(2)}</span>
                      </div>
                      
                      <button 
                        onClick={handleDispenseSubmit}
                        disabled={dispenseLoading}
                        className="btn btn-primary"
                        style={{
                          padding: '12px 24px',
                          fontSize: 14,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          boxShadow: 'var(--shadow-teal)'
                        }}
                      >
                        {dispenseLoading ? (
                          <div className="spinner" style={{ width: 16, height: 16, borderTopColor: 'white' }} />
                        ) : (
                          <>
                            <CheckCircle size={16} /> Complete Checkout & Issue
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Printable Thermal Receipt Modal overlay */}
      {showReceipt && receiptData && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'white',
            borderRadius: 20,
            padding: 30,
            maxWidth: 420,
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20
          }} className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>Medication Receipt Signed</h3>
              <button 
                onClick={() => setShowReceipt(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Thermal Slip mockup */}
            <div style={{
              background: '#f8fafc',
              border: '2px dashed var(--gray-300)',
              padding: 20,
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#334155',
              lineHeight: 1.5,
              borderRadius: 8,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <p style={{ fontWeight: 'bold', fontSize: 14, margin: '0 0 2px 0', textTransform: 'uppercase' }}>{adminProfile?.name || 'Apollo Chennai'}</p>
                <p style={{ margin: '0 0 8px 0', fontSize: 10 }}>PHARMACY COUNTER RECEIPT</p>
                <p style={{ margin: 0 }}>--------------------------------</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                <p style={{ margin: 0 }}><strong>Bill ID:</strong> {receiptData.billId}</p>
                <p style={{ margin: 0 }}><strong>Date:</strong> {receiptData.date.toLocaleString()}</p>
                <p style={{ margin: 0 }}><strong>Patient:</strong> {receiptData.patientName} ({receiptData.patientUid})</p>
                <p style={{ margin: 0 }}><strong>Dr.:</strong> {receiptData.doctorName}</p>
              </div>

              <p style={{ margin: '0 0 4px 0' }}>--------------------------------</p>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px dashed #cbd5e1' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0' }}>Item</th>
                    <th style={{ textAlign: 'center', width: 40 }}>Qty</th>
                    <th style={{ textAlign: 'right', width: 80 }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 0', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                      <td style={{ textAlign: 'center' }}>{item.qty}</td>
                      <td style={{ textAlign: 'right' }}>₹{(item.qty * item.price).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: '4px 0 0 0' }}>--------------------------------</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', marginTop: 10, fontWeight: 'bold' }}>
                <p style={{ margin: 0 }}>Subtotal: ₹{receiptData.subtotal.toFixed(2)}</p>
                <p style={{ margin: 0 }}>GST (5%): ₹{receiptData.tax.toFixed(2)}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, textDecoration: 'underline' }}>Total Paid: ₹{receiptData.total.toFixed(2)}</p>
              </div>

              <div style={{ textAlign: 'center', marginTop: 20 }}>
                {/* Simulated barcode */}
                <p style={{ letterSpacing: 4, margin: '0 0 4px 0', fontSize: 14 }}>||||| | ||| |||| | |||||</p>
                <p style={{ fontSize: 9, margin: 0 }}>THANK YOU - MEDICINES DISPENSED</p>
              </div>
            </div>

            {/* Print & Close Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button 
                onClick={() => { window.print(); }} 
                className="btn btn-primary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 12 }}
              >
                <Printer size={16} /> Print Slip
              </button>
              <button 
                onClick={() => setShowReceipt(false)} 
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px 0', borderRadius: 12 }}
              >
                Close Desk
              </button>
            </div>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
