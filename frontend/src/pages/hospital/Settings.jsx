import React, { useState, useEffect } from 'react';
import { Save, Building2, Phone, Globe, Clock, Award } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { hospitalAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function HospitalSettings() {
  const [form, setForm] = useState({ name: '', type: 'private', contact: { phone: '', email: '', website: '', emergencyPhone: '' }, address: { street: '', city: '', state: '', pincode: '' }, specialties: '', facilities: '', accreditations: '', operatingHours: { weekdays: { open: '08:00', close: '20:00' }, weekends: { open: '09:00', close: '17:00' }, is24x7: false }, totalBeds: '', icuBeds: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await hospitalAPI.getAdminProfile();
        if (data) setForm({ ...form, ...data, specialties: data.specialties?.join(', ') || '', facilities: data.facilities?.join(', ') || '', accreditations: data.accreditations?.join(', ') || '' });
      } catch (e) {}
    };
    load();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await hospitalAPI.updateProfile({ ...form, specialties: form.specialties.split(',').map(s => s.trim()).filter(Boolean), facilities: form.facilities.split(',').map(s => s.trim()).filter(Boolean), accreditations: form.accreditations.split(',').map(s => s.trim()).filter(Boolean) });
      toast.success('Hospital profile updated!');
    } catch { toast.error('Update failed'); }
    setLoading(false);
  };

  return (
    <HospitalLayout title="Settings">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Hospital Settings</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Update hospital information and preferences</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}><Save size={16} /> {loading ? 'Saving...' : 'Save Changes'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Basic Info */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Building2 size={18} color="var(--teal)" />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Basic Information</h3>
          </div>
          <div className="form-group">
            <label className="form-label">Hospital Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Type</label>
            <select className="form-input form-select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="private">Private</option>
              <option value="government">Government</option>
              <option value="trust">Trust / NGO</option>
              <option value="clinic">Clinic</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Total Beds</label>
            <input className="form-input" type="number" value={form.totalBeds} onChange={e => setForm({ ...form, totalBeds: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">ICU Beds</label>
            <input className="form-input" type="number" value={form.icuBeds} onChange={e => setForm({ ...form, icuBeds: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Accreditations (e.g. NABH, JCI)</label>
            <input className="form-input" placeholder="NABH, JCI" value={form.accreditations} onChange={e => setForm({ ...form, accreditations: e.target.value })} />
          </div>
        </div>

        {/* Contact & Address */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Phone size={18} color="var(--teal)" />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Contact & Address</h3>
          </div>
          {['phone', 'email', 'website', 'emergencyPhone'].map(field => (
            <div key={field} className="form-group">
              <label className="form-label">{field === 'emergencyPhone' ? 'Emergency Phone' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
              <input className="form-input" value={form.contact[field] || ''} onChange={e => setForm({ ...form, contact: { ...form.contact, [field]: e.target.value } })} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {['city', 'state', 'pincode'].map(f => (
              <div key={f} className="form-group">
                <label className="form-label">{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                <input className="form-input" value={form.address[f] || ''} onChange={e => setForm({ ...form, address: { ...form.address, [f]: e.target.value } })} />
              </div>
            ))}
          </div>
        </div>

        {/* Specialties & Facilities */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Award size={18} color="var(--teal)" />
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Specialties & Facilities</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Medical Specialties (comma separated)</label>
              <input className="form-input" placeholder="Cardiology, Neurology, Oncology..." value={form.specialties} onChange={e => setForm({ ...form, specialties: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Facilities (comma separated)</label>
              <input className="form-input" placeholder="ICU, Blood Bank, 24/7 Emergency, Pharmacy..." value={form.facilities} onChange={e => setForm({ ...form, facilities: e.target.value })} />
            </div>
          </div>
        </div>
      </div>
    </HospitalLayout>
  );
}
