import React, { useState, useEffect } from 'react';
import { Plus, Search, Calendar, Clock, User, Stethoscope, Edit2, Trash2, X, CheckCircle, AlertCircle, PlayCircle } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { surgeryAPI, doctorAPI, patientAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const SURGERY_TYPES = [
  'Cardiac Surgery', 'Neurosurgery', 'Orthopedic Surgery', 'General Surgery',
  'Plastic Surgery', 'Vascular Surgery', 'Thoracic Surgery', 'Urological Surgery',
  'Gynecological Surgery', 'Ophthalmic Surgery', 'ENT Surgery', 'Dental Surgery',
  'Emergency Surgery', 'Elective Surgery'
];

const SURGERY_STATUS = ['Scheduled', 'In Progress', 'Completed', 'Cancelled'];
const SURGERY_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const emptySurgery = {
  patientId: '',
  patientName: '',
  doctorId: '',
  doctorName: '',
  surgeryType: '',
  description: '',
  scheduledDate: '',
  scheduledTime: '',
  estimatedDuration: '',
  priority: 'Medium',
  status: 'Scheduled',
  operatingRoom: '',
  anesthesiaType: '',
  notes: '',
  complications: '',
  outcome: ''
};

export default function HospitalSurgeries() {
  const [surgeries, setSurgeries] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editSurgery, setEditSurgery] = useState(null);
  const [form, setForm] = useState(emptySurgery);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming'); // upcoming, completed

  const loadData = async () => {
    try {
      const [surgeryRes, doctorRes, patientRes] = await Promise.allSettled([
        surgeryAPI.search({}),
        doctorAPI.search({}),
        patientAPI.getAllPatients ? patientAPI.getAllPatients() : Promise.resolve({ data: [] })
      ]);

      if (surgeryRes.status === 'fulfilled') setSurgeries(surgeryRes.value.data);
      if (doctorRes.status === 'fulfilled') setDoctors(doctorRes.value.data);
      if (patientRes.status === 'fulfilled') setPatients(patientRes.value.data);
    } catch (e) {}
  };

  useEffect(() => { loadData(); }, []);

  const openAdd = () => { setForm(emptySurgery); setEditSurgery(null); setShowModal(true); };
  const openEdit = (surgery) => {
    setForm({ ...surgery });
    setEditSurgery(surgery._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (editSurgery) {
        await surgeryAPI.updateSurgery(editSurgery, payload);
        toast.success('Surgery updated successfully');
      } else {
        await surgeryAPI.createSurgery(payload);
        toast.success('Surgery scheduled successfully');
      }
      setShowModal(false);
      loadData();
    } catch (e) {
      toast.error(editSurgery ? 'Failed to update surgery' : 'Failed to schedule surgery');
    }
    setLoading(false);
  };

  const updateSurgeryStatus = async (surgeryId, newStatus) => {
    try {
      await surgeryAPI.updateSurgery(surgeryId, { status: newStatus });
      toast.success('Surgery status updated successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to update surgery status');
    }
  };

  const deleteSurgery = async (id) => {
    if (!window.confirm('Are you sure you want to delete this surgery record?')) return;
    try {
      await surgeryAPI.deleteSurgery(id);
      toast.success('Surgery record deleted successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to delete surgery record');
    }
  };

  const filteredSurgeries = surgeries.filter(surgery => {
    const matchesSearch = !search ||
      surgery.patientName?.toLowerCase().includes(search.toLowerCase()) ||
      surgery.doctorName?.toLowerCase().includes(search.toLowerCase()) ||
      surgery.surgeryType?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || surgery.status === filterStatus;
    const matchesType = !filterType || surgery.surgeryType === filterType;

    // Filter by tab
    const isCompleted = surgery.status === 'Completed';
    const isUpcoming = ['Scheduled', 'In Progress'].includes(surgery.status);
    const matchesTab = activeTab === 'upcoming' ? isUpcoming : isCompleted;

    return matchesSearch && matchesStatus && matchesType && matchesTab;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Scheduled': return <Calendar size={16} className="text-blue-500" />;
      case 'In Progress': return <PlayCircle size={16} className="text-orange-500" />;
      case 'Completed': return <CheckCircle size={16} className="text-green-500" />;
      case 'Cancelled': return <AlertCircle size={16} className="text-red-500" />;
      default: return <Clock size={16} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Scheduled': return 'badge-blue';
      case 'In Progress': return 'badge-orange';
      case 'Completed': return 'badge-green';
      case 'Cancelled': return 'badge-red';
      default: return 'badge-gray';
    }
  };

  const upcomingSurgeries = surgeries.filter(s => ['Scheduled', 'In Progress'].includes(s.status)).length;
  const completedSurgeries = surgeries.filter(s => s.status === 'Completed').length;

  return (
    <HospitalLayout title="Surgery Management">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Surgery Management
          </h2>
          <button onClick={openAdd} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Schedule Surgery
          </button>
        </div>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Manage surgical procedures, track schedules, and monitor outcomes
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          <Clock size={16} style={{ marginRight: 6 }} />
          Upcoming ({upcomingSurgeries})
        </button>
        <button
          className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <CheckCircle size={16} style={{ marginRight: 6 }} />
          Completed ({completedSurgeries})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
            <input
              type="text"
              placeholder="Search by patient, doctor, or surgery type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              padding: '12px 14px',
              border: '1px solid var(--gray-200)',
              borderRadius: 12,
              fontSize: 14,
              background: 'var(--white)',
              outline: 'none',
              minWidth: 160
            }}
          >
            <option value="">All Surgery Types</option>
            {SURGERY_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '12px 14px',
              border: '1px solid var(--gray-200)',
              borderRadius: 12,
              fontSize: 14,
              background: 'var(--white)',
              outline: 'none',
              minWidth: 140
            }}
          >
            <option value="">All Status</option>
            {SURGERY_STATUS.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          {(filterType || filterStatus) && (
            <button
              onClick={() => { setFilterType(''); setFilterStatus(''); }}
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 'auto' }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Surgery List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {filteredSurgeries.length === 0 ? (
          <div className="card empty-state" style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center' }}>
            <Stethoscope size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {activeTab === 'upcoming' ? 'No Upcoming Surgeries' : 'No Completed Surgeries'}
            </h3>
            <p style={{ color: 'var(--gray-500)', marginBottom: 16 }}>
              {search || filterType || filterStatus ?
                'Try adjusting your search or filters' :
                activeTab === 'upcoming' ? 'Schedule your first surgery to get started' : 'Completed surgeries will appear here'
              }
            </p>
            {activeTab === 'upcoming' && !search && !filterType && !filterStatus && (
              <button onClick={openAdd} className="btn btn-primary">
                <Plus size={16} style={{ marginRight: 8 }} /> Schedule Surgery
              </button>
            )}
          </div>
        ) : (
          filteredSurgeries.map(surgery => (
            <div key={surgery._id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div className="avatar" style={{
                  width: 56,
                  height: 56,
                  fontSize: 20,
                  flexShrink: 0,
                  background: surgery.status === 'Completed' ? 'linear-gradient(135deg, #10b981, #059669)' :
                           surgery.status === 'In Progress' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
                           'linear-gradient(135deg, #3b82f6, #2563eb)'
                }}>
                  {surgery.patientName?.[0] || 'P'}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <h4 style={{ fontSize: 16, fontWeight: 600 }}>{surgery.patientName}</h4>
                    <span className={`badge ${getStatusColor(surgery.status)}`}>
                      {getStatusIcon(surgery.status)}
                      <span style={{ marginLeft: 4 }}>{surgery.status}</span>
                    </span>
                  </div>

                  <p style={{ fontSize: 14, color: 'var(--teal)', fontWeight: 500, marginBottom: 4 }}>
                    {surgery.surgeryType}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <User size={14} color="var(--gray-500)" />
                    <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                      {activeTab === 'completed' ? 'Performed by' : 'Surgeon:'} {surgery.doctorName}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Calendar size={14} color="var(--gray-500)" />
                    <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>
                      {new Date(surgery.scheduledDate).toLocaleDateString('en-IN')} at {surgery.scheduledTime}
                    </span>
                  </div>

                  {surgery.operatingRoom && (
                    <div style={{ display: 'inline-block', background: 'var(--gray-100)', padding: '4px 8px', borderRadius: 6, fontSize: 12, color: 'var(--gray-700)' }}>
                      Room: {surgery.operatingRoom}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => openEdit(surgery)}
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1 }}
                >
                  <Edit2 size={14} style={{ marginRight: 6 }} /> Edit
                </button>

                {activeTab === 'upcoming' && surgery.status === 'Scheduled' && (
                  <button
                    onClick={() => updateSurgeryStatus(surgery._id, 'In Progress')}
                    className="btn btn-primary btn-sm"
                  >
                    <PlayCircle size={14} style={{ marginRight: 6 }} /> Start
                  </button>
                )}

                {activeTab === 'upcoming' && surgery.status === 'In Progress' && (
                  <button
                    onClick={() => updateSurgeryStatus(surgery._id, 'Completed')}
                    className="btn btn-success btn-sm"
                    style={{ background: '#10b981', border: 'none' }}
                  >
                    <CheckCircle size={14} style={{ marginRight: 6 }} /> Complete
                  </button>
                )}

                <button
                  onClick={() => deleteSurgery(surgery._id)}
                  className="btn btn-outline btn-sm"
                  style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                {editSurgery ? 'Edit Surgery' : 'Schedule New Surgery'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="var(--gray-400)" />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Patient Name *</label>
                  <input
                    type="text"
                    value={form.patientName}
                    onChange={(e) => setForm(prev => ({ ...prev, patientName: e.target.value }))}
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
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Surgeon *</label>
                  <select
                    value={form.doctorId}
                    onChange={(e) => {
                      const selectedDoctor = doctors.find(d => d._id === e.target.value);
                      setForm(prev => ({
                        ...prev,
                        doctorId: e.target.value,
                        doctorName: selectedDoctor ? `${selectedDoctor.firstName} ${selectedDoctor.lastName}` : ''
                      }));
                    }}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="">Select Surgeon</option>
                    {doctors.map(doctor => (
                      <option key={doctor._id} value={doctor._id}>
                        {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Surgery Type *</label>
                  <select
                    value={form.surgeryType}
                    onChange={(e) => setForm(prev => ({ ...prev, surgeryType: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="">Select Surgery Type</option>
                    {SURGERY_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm(prev => ({ ...prev, priority: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    {SURGERY_PRIORITIES.map(priority => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Scheduled Date *</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
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
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Scheduled Time *</label>
                  <input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(e) => setForm(prev => ({ ...prev, scheduledTime: e.target.value }))}
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
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Estimated Duration (hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="12"
                    value={form.estimatedDuration}
                    onChange={(e) => setForm(prev => ({ ...prev, estimatedDuration: e.target.value }))}
                    placeholder="2.5"
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
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Operating Room</label>
                  <input
                    type="text"
                    value={form.operatingRoom}
                    onChange={(e) => setForm(prev => ({ ...prev, operatingRoom: e.target.value }))}
                    placeholder="OR-1, OR-2, etc."
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
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Anesthesia Type</label>
                  <select
                    value={form.anesthesiaType}
                    onChange={(e) => setForm(prev => ({ ...prev, anesthesiaType: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="">Select Anesthesia</option>
                    <option value="General">General</option>
                    <option value="Regional">Regional</option>
                    <option value="Local">Local</option>
                    <option value="Sedation">Sedation</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    {SURGERY_STATUS.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the surgical procedure..."
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

              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes or special instructions..."
                  rows={2}
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

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1 }}>
                  {loading ? 'Saving...' : editSurgery ? 'Update Surgery' : 'Schedule Surgery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
