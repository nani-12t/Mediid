import React, { useState, useEffect } from 'react';
import { Droplet, Heart, Search, MapPin, Phone, Clock, User, CheckCircle, AlertCircle, Plus, Users } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import toast from 'react-hot-toast';

// Mock data for blood banks (in a real app, this would come from an API)
const bloodBanks = [
  {
    id: 'bb001',
    name: 'City Blood Bank',
    address: '123 Medical Center, New Delhi',
    phone: '+91-9876543210',
    email: 'info@citybloodbank.in',
    bloodGroups: {
      'A+': 45, 'A-': 12, 'B+': 28, 'B-': 8, 'AB+': 15, 'AB-': 5, 'O+': 62, 'O-': 18
    },
    operatingHours: '24/7',
    rating: 4.5,
    distance: '2.3 km',
    emergency: true
  },
  {
    id: 'bb002',
    name: 'Regional Blood Center',
    address: '456 Healthcare Complex, Mumbai',
    phone: '+91-9876543211',
    email: 'contact@regionalblood.in',
    bloodGroups: {
      'A+': 38, 'A-': 9, 'B+': 22, 'B-': 6, 'AB+': 12, 'AB-': 3, 'O+': 55, 'O-': 14
    },
    operatingHours: '6:00 AM - 10:00 PM',
    rating: 4.2,
    distance: '3.7 km',
    emergency: false
  },
  {
    id: 'bb003',
    name: 'Apollo Blood Bank',
    address: '789 Hospital Road, Chennai',
    phone: '+91-9876543212',
    email: 'bloodbank@apollohospitals.com',
    bloodGroups: {
      'A+': 52, 'A-': 15, 'B+': 31, 'B-': 9, 'AB+': 18, 'AB-': 7, 'O+': 68, 'O-': 22
    },
    operatingHours: '24/7',
    rating: 4.7,
    distance: '1.8 km',
    emergency: true
  }
];

// Organ donation registration data
const organTypes = [
  { id: 'kidney', name: 'Kidney', description: 'Help save lives by donating one kidney' },
  { id: 'liver', name: 'Liver', description: 'Part of liver can regenerate and save lives' },
  { id: 'heart', name: 'Heart', description: 'Gift of life through heart donation' },
  { id: 'lungs', name: 'Lungs', description: 'Double lung donation can save lives' },
  { id: 'pancreas', name: 'Pancreas', description: 'Help diabetic patients live better' },
  { id: 'intestines', name: 'Intestines', description: 'Complex but life-saving donation' },
  { id: 'corneas', name: 'Corneas', description: 'Restore sight to blind patients' },
  { id: 'skin', name: 'Skin', description: 'Help burn victims recover' },
  { id: 'bone', name: 'Bone/Tissue', description: 'Help with reconstructive surgeries' }
];

export default function BloodBanksAndDonation() {
  const [activeTab, setActiveTab] = useState('blood');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBloodGroup, setSelectedBloodGroup] = useState('');
  const [bloodBanksData, setBloodBanksData] = useState(bloodBanks);
  const [loading, setLoading] = useState(false);

  // Blood request form state
  const [requestForm, setRequestForm] = useState({
    patientName: '',
    bloodGroup: '',
    units: '1',
    hospital: '',
    urgency: 'normal',
    reason: '',
    requesterName: '',
    requesterPhone: '',
    requesterRelation: ''
  });

  // Organ donation form state
  const [donorForm, setDonorForm] = useState({
    name: '',
    age: '',
    bloodGroup: '',
    phone: '',
    email: '',
    address: '',
    emergencyContact: '',
    emergencyPhone: '',
    medicalHistory: '',
    selectedOrgans: [],
    consentGiven: false,
    agreeToTerms: false
  });

  // Organ request form state
  const [organRequestForm, setOrganRequestForm] = useState({
    patientName: '',
    age: '',
    bloodGroup: '',
    organNeeded: '',
    urgency: 'critical',
    hospital: '',
    medicalCondition: '',
    doctorName: '',
    requesterName: '',
    requesterPhone: '',
    requesterRelation: '',
    additionalNotes: ''
  });

  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  // Filter blood banks based on search and blood group
  const filteredBloodBanks = bloodBanksData.filter(bank => {
    const matchesSearch = bank.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bank.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBloodGroup = !selectedBloodGroup || bank.bloodGroups[selectedBloodGroup] > 0;
    return matchesSearch && matchesBloodGroup;
  });

  const handleBloodRequest = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real app, this would call an API
      console.log('Blood request submitted:', requestForm);
      toast.success('Blood request submitted successfully! Blood banks will contact you soon.');
      setRequestForm({
        patientName: '',
        bloodGroup: '',
        units: '1',
        hospital: '',
        urgency: 'normal',
        reason: '',
        requesterName: '',
        requesterPhone: '',
        requesterRelation: ''
      });
    } catch (error) {
      toast.error('Failed to submit blood request. Please try again.');
    }

    setLoading(false);
  };

  const handleOrganRequest = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real app, this would call an API
      console.log('Organ request submitted:', organRequestForm);
      toast.success('Organ transplant request submitted! Medical teams will contact you soon.');
      setOrganRequestForm({
        patientName: '',
        age: '',
        bloodGroup: '',
        organNeeded: '',
        urgency: 'critical',
        hospital: '',
        medicalCondition: '',
        doctorName: '',
        requesterName: '',
        requesterPhone: '',
        requesterRelation: '',
        additionalNotes: ''
      });
    } catch (error) {
      toast.error('Failed to submit organ request. Please try again.');
    }

    setLoading(false);
  };

  const handleOrganDonation = async (e) => {
    e.preventDefault();

    if (!donorForm.consentGiven || !donorForm.agreeToTerms) {
      toast.error('Please provide consent and agree to terms to register as a donor.');
      return;
    }

    if (donorForm.selectedOrgans.length === 0) {
      toast.error('Please select at least one organ to donate.');
      return;
    }

    setLoading(true);

    try {
      // In a real app, this would call an API
      console.log('Organ donation registration:', donorForm);
      toast.success('Thank you for registering as an organ donor! Your registration has been saved.');
      setDonorForm({
        name: '',
        age: '',
        bloodGroup: '',
        phone: '',
        email: '',
        address: '',
        emergencyContact: '',
        emergencyPhone: '',
        medicalHistory: '',
        selectedOrgans: [],
        consentGiven: false,
        agreeToTerms: false
      });
    } catch (error) {
      toast.error('Failed to register as organ donor. Please try again.');
    }

    setLoading(false);
  };

  const toggleOrganSelection = (organId) => {
    setDonorForm(prev => ({
      ...prev,
      selectedOrgans: prev.selectedOrgans.includes(organId)
        ? prev.selectedOrgans.filter(id => id !== organId)
        : [...prev.selectedOrgans, organId]
    }));
  };

  return (
    <PatientLayout title="Blood Banks & Organ Donation">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>
          Blood Banks & Organ Donation
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Find blood donors, request blood, or register as an organ donor to save lives
        </p>
      </div>

      {/* Category Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeTab === 'blood' ? 'active' : ''}`}
          onClick={() => setActiveTab('blood')}
        >
          <Droplet size={16} style={{ marginRight: 6 }} />
          Blood Banks
        </button>
        <button
          className={`tab-btn ${activeTab === 'donation' ? 'active' : ''}`}
          onClick={() => setActiveTab('donation')}
        >
          <Heart size={16} style={{ marginRight: 6 }} />
          Organ Donation
        </button>
      </div>

      {/* Blood Banks Section */}
      {activeTab === 'blood' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Search and Filters */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-input" style={{ position: 'relative', flex: 1, minWidth: 250 }}>
              <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input
                type="text"
                placeholder="Search blood banks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 44px',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 12,
                  fontSize: 14,
                  background: 'var(--white)',
                  outline: 'none'
                }}
              />
            </div>

            <select
              value={selectedBloodGroup}
              onChange={(e) => setSelectedBloodGroup(e.target.value)}
              style={{
                padding: '12px 14px',
                border: '1px solid var(--gray-200)',
                borderRadius: 12,
                fontSize: 14,
                background: 'var(--white)',
                outline: 'none',
                minWidth: 120
              }}
            >
              <option value="">All Blood Groups</option>
              {bloodGroups.map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>

          {/* Blood Request Form */}
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--red)' }}>
              🚨 Emergency Blood Request
            </h3>
            <form onSubmit={handleBloodRequest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Patient Name</label>
                <input
                  type="text"
                  value={requestForm.patientName}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, patientName: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Blood Group Required</label>
                <select
                  value={requestForm.bloodGroup}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, bloodGroup: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Units Required</label>
                <input
                  type="number"
                  min="1"
                  value={requestForm.units}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, units: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Hospital</label>
                <input
                  type="text"
                  value={requestForm.hospital}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, hospital: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Urgency Level</label>
                <select
                  value={requestForm.urgency}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, urgency: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Reason for Request</label>
                <textarea
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Requester Details</h4>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Your Name</label>
                <input
                  type="text"
                  value={requestForm.requesterName}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, requesterName: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Your Phone</label>
                <input
                  type="tel"
                  value={requestForm.requesterPhone}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, requesterPhone: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Relation to Patient</label>
                <input
                  type="text"
                  value={requestForm.requesterRelation}
                  onChange={(e) => setRequestForm(prev => ({ ...prev, requesterRelation: e.target.value }))}
                  placeholder="e.g., Parent, Spouse, Friend"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ padding: '14px 32px', fontSize: 16 }}
                >
                  {loading ? 'Submitting...' : 'Submit Blood Request'}
                </button>
              </div>
            </form>
          </div>

          {/* Blood Banks List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Available Blood Banks</h3>

            {filteredBloodBanks.length === 0 ? (
              <div className="card empty-state">
                <Search size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                <p>No blood banks found matching your criteria</p>
              </div>
            ) : (
              filteredBloodBanks.map(bank => (
                <div key={bank.id} className="card">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      background: bank.emergency ? 'linear-gradient(135deg, var(--red), #dc2626)' : 'linear-gradient(135deg, var(--teal), #0d9488)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Droplet size={26} color="white" />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <h4 style={{ fontSize: 16, fontWeight: 700 }}>{bank.name}</h4>
                        {bank.emergency && <span className="badge" style={{ background: 'var(--red)', color: 'white' }}>24/7 Emergency</span>}
                        <span className="badge badge-teal">★ {bank.rating}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <MapPin size={14} color="var(--gray-500)" />
                        <span style={{ fontSize: 14, color: 'var(--gray-600)' }}>{bank.address}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                        <Clock size={14} color="var(--gray-500)" />
                        <span style={{ fontSize: 14, color: 'var(--gray-600)' }}>{bank.operatingHours}</span>
                        <span style={{ fontSize: 14, color: 'var(--gray-500)', marginLeft: 8 }}>📍 {bank.distance}</span>
                      </div>

                      {/* Blood Group Availability */}
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Available Blood Groups:</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(60px, 1fr))', gap: 6 }}>
                          {Object.entries(bank.bloodGroups).map(([group, count]) => (
                            <div key={group} style={{
                              padding: '6px 8px',
                              borderRadius: 6,
                              background: count > 20 ? 'var(--green-50)' : count > 10 ? 'var(--yellow-50)' : 'var(--red-50)',
                              border: `1px solid ${count > 20 ? 'var(--green-200)' : count > 10 ? 'var(--yellow-200)' : 'var(--red-200)'}`,
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: count > 20 ? 'var(--green-700)' : count > 10 ? 'var(--yellow-700)' : 'var(--red-700)' }}>
                                {group}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--gray-600)' }}>{count} units</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Contact Actions */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => window.open(`tel:${bank.phone}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <Phone size={14} /> Call
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => window.open(`mailto:${bank.email}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <User size={14} /> Contact
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Organ Donation Section */}
      {activeTab === 'donation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Info Banner */}
          <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: 12, padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Heart size={28} color="var(--red)" />
            <div>
              <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>Become an organ donor and save lives</p>
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2 }}>Your decision to donate organs can give someone a second chance at life.</p>
            </div>
          </div>

          {/* Emergency Organ Request Form */}
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--red)' }}>
              🚨 Emergency Organ Transplant Request
            </h3>
            <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 20 }}>
              Submit an urgent request for organ transplantation. This will be forwarded to transplant coordinators and hospitals.
            </p>
            <form onSubmit={handleOrganRequest} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Patient Full Name</label>
                <input
                  type="text"
                  value={organRequestForm.patientName}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, patientName: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Age</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={organRequestForm.age}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, age: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Blood Group</label>
                <select
                  value={organRequestForm.bloodGroup}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, bloodGroup: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Organ Needed</label>
                <select
                  value={organRequestForm.organNeeded}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, organNeeded: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select Organ</option>
                  {organTypes.map(organ => (
                    <option key={organ.id} value={organ.id}>{organ.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Urgency Level</label>
                <select
                  value={organRequestForm.urgency}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, urgency: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="critical">Critical - Immediate transplant needed</option>
                  <option value="urgent">Urgent - Within days</option>
                  <option value="high">High - Within weeks</option>
                  <option value="medium">Medium - Within months</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Hospital</label>
                <input
                  type="text"
                  value={organRequestForm.hospital}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, hospital: e.target.value }))}
                  placeholder="Hospital where transplant will be performed"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Primary Doctor</label>
                <input
                  type="text"
                  value={organRequestForm.doctorName}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, doctorName: e.target.value }))}
                  placeholder="Name of transplant specialist"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Medical Condition</label>
                <textarea
                  value={organRequestForm.medicalCondition}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, medicalCondition: e.target.value }))}
                  placeholder="Describe the medical condition requiring transplant..."
                  rows={3}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Requester Details</h4>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Your Name</label>
                <input
                  type="text"
                  value={organRequestForm.requesterName}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, requesterName: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Your Phone</label>
                <input
                  type="tel"
                  value={organRequestForm.requesterPhone}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, requesterPhone: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Relation to Patient</label>
                <input
                  type="text"
                  value={organRequestForm.requesterRelation}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, requesterRelation: e.target.value }))}
                  placeholder="e.g., Parent, Spouse, Self, Guardian"
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Additional Notes</label>
                <textarea
                  value={organRequestForm.additionalNotes}
                  onChange={(e) => setOrganRequestForm(prev => ({ ...prev, additionalNotes: e.target.value }))}
                  placeholder="Any additional medical information, special requirements, or urgent notes..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ padding: '14px 32px', fontSize: 16 }}
                >
                  {loading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>

          {/* Organ Types */}
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Types of Organ Donation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {organTypes.map(organ => (
                <div key={organ.id} style={{
                  padding: 16,
                  border: `2px solid ${donorForm.selectedOrgans.includes(organ.id) ? 'var(--teal)' : 'var(--gray-200)'}`,
                  borderRadius: 12,
                  background: donorForm.selectedOrgans.includes(organ.id) ? 'var(--teal-50)' : 'var(--white)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                  onClick={() => toggleOrganSelection(organ.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: donorForm.selectedOrgans.includes(organ.id) ? 'var(--teal)' : 'var(--gray-200)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {donorForm.selectedOrgans.includes(organ.id) && <CheckCircle size={16} color="white" />}
                    </div>
                    <h4 style={{ fontSize: 16, fontWeight: 700 }}>{organ.name}</h4>
                  </div>
                  <p style={{ fontSize: 14, color: 'var(--gray-600)' }}>{organ.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Registration Form */}
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Register as Organ Donor</h3>
            <form onSubmit={handleOrganDonation} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Full Name</label>
                <input
                  type="text"
                  value={donorForm.name}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Age</label>
                <input
                  type="number"
                  min="18"
                  max="65"
                  value={donorForm.age}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, age: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Blood Group</label>
                <select
                  value={donorForm.bloodGroup}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, bloodGroup: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  <option value="">Select Blood Group</option>
                  {bloodGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Phone Number</label>
                <input
                  type="tel"
                  value={donorForm.phone}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, phone: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Email Address</label>
                <input
                  type="email"
                  value={donorForm.email}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Address</label>
                <textarea
                  value={donorForm.address}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, address: e.target.value }))}
                  rows={3}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Emergency Contact Name</label>
                <input
                  type="text"
                  value={donorForm.emergencyContact}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, emergencyContact: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Emergency Contact Phone</label>
                <input
                  type="tel"
                  value={donorForm.emergencyPhone}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, emergencyPhone: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Medical History (if any)</label>
                <textarea
                  value={donorForm.medicalHistory}
                  onChange={(e) => setDonorForm(prev => ({ ...prev, medicalHistory: e.target.value }))}
                  placeholder="Please mention any medical conditions, surgeries, or medications..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Consents */}
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--gray-100)', paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    id="consent"
                    checked={donorForm.consentGiven}
                    onChange={(e) => setDonorForm(prev => ({ ...prev, consentGiven: e.target.checked }))}
                    style={{ marginTop: 2 }}
                  />
                  <label htmlFor="consent" style={{ fontSize: 14, lineHeight: 1.4 }}>
                    <strong>Consent:</strong> I hereby give my consent to donate my organs after my death to save lives. I understand that organ donation is a noble cause and will be carried out according to medical and legal procedures.
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 }}>
                  <input
                    type="checkbox"
                    id="terms"
                    checked={donorForm.agreeToTerms}
                    onChange={(e) => setDonorForm(prev => ({ ...prev, agreeToTerms: e.target.checked }))}
                    style={{ marginTop: 2 }}
                  />
                  <label htmlFor="terms" style={{ fontSize: 14, lineHeight: 1.4 }}>
                    <strong>Terms & Conditions:</strong> I agree to the terms and conditions of organ donation as per the guidelines of relevant medical and legal authorities. I understand that my family will be consulted in case of any medical decision.
                  </label>
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center' }}>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ padding: '14px 32px', fontSize: 16 }}
                >
                  {loading ? 'Registering...' : 'Register'}
                </button>
              </div>
            </form>
          </div>

          {/* Information Section */}
          <div className="card">
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Important Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Who Can Donate?</h4>
                <ul style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                  <li>Individuals aged 18-65 years</li>
                  <li>Free from serious medical conditions</li>
                  <li>Not suffering from HIV/AIDS or Hepatitis</li>
                  <li>Family consent is required</li>
                </ul>
              </div>

              <div>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Organ Donation Process</h4>
                <ul style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                  <li>Brain death confirmation by doctors</li>
                  <li>Family consent is mandatory</li>
                  <li>Organs are matched with recipients</li>
                  <li>Free of cost to donor family</li>
                </ul>
              </div>

              <div>
                <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Myths vs Facts</h4>
                <ul style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                  <li>Myth: Doctors won't try to save you if you're a donor</li>
                  <li>Fact: Doctors prioritize saving lives</li>
                  <li>Myth: Rich people get organs first</li>
                  <li>Fact: Organs go to most critical patients</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </PatientLayout>
  );
}
