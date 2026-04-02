import React from 'react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { FileText, Upload, Search, Filter } from 'lucide-react';

const SAMPLE_REPORTS = [
  { id: 1, patient: 'Arjun Sharma', type: 'X-Ray', title: 'Chest X-Ray', date: '2025-01-20', status: 'completed', priority: 'normal' },
  { id: 2, patient: 'Priya Nair', type: 'MRI', title: 'Brain MRI - Contrast', date: '2025-01-21', status: 'pending', priority: 'urgent' },
  { id: 3, patient: 'Ramesh Patel', type: 'Blood Test', title: 'CBC + HBA1c Panel', date: '2025-01-22', status: 'completed', priority: 'normal' },
  { id: 4, patient: 'Sunita Verma', type: 'CT Scan', title: 'Abdominal CT', date: '2025-01-22', status: 'reviewing', priority: 'high' },
  { id: 5, patient: 'Mohan Das', type: 'Ultrasound', title: 'Liver Ultrasound', date: '2025-01-23', status: 'completed', priority: 'normal' },
];

export default function HospitalReports() {
  return (
    <HospitalLayout title="Medical Reports">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Medical Reports</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Manage patient reports — X-rays, lab results, scans, and more</p>
        </div>
        <button className="btn btn-primary"><Upload size={16} /> Upload Report</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={18} color="var(--gray-400)" />
          <input placeholder="Search by patient name or report type..." />
        </div>
        <button className="btn btn-secondary"><Filter size={16} /> Filter</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Report Type</th>
              <th>Title</th>
              <th>Date</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_REPORTS.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{r.patient}</td>
                <td>
                  <span className="badge badge-blue" style={{ fontSize: 11 }}>{r.type}</span>
                </td>
                <td style={{ fontSize: 13 }}>{r.title}</td>
                <td style={{ fontSize: 13, color: 'var(--gray-500)' }}>{r.date}</td>
                <td>
                  <span className={`badge ${r.priority === 'urgent' ? 'badge-red' : r.priority === 'high' ? 'badge-amber' : 'badge-gray'}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {r.priority}
                  </span>
                </td>
                <td>
                  <span className={`badge ${r.status === 'completed' ? 'badge-teal' : r.status === 'pending' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                    {r.status}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-secondary">View</button>
                    <button className="btn btn-sm btn-secondary">Download</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HospitalLayout>
  );
}
