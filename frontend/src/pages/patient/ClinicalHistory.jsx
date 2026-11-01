import React, { useEffect, useState } from 'react';
import { clinicalAPI, patientAPI } from '../../utils/api';
import ClinicalRecord, { clinicalMessage } from '../../components/clinical/ClinicalRecord';

export default function PatientClinicalHistory({ medicalHistory = [] }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async cursor => {
    setBusy(true); setError('');
    try {
      const { data } = await clinicalAPI.selfEncounters(cursor ? { cursor } : {});
      setRecord(previous => cursor ? { ...data, encounters: [...previous.encounters, ...data.encounters] } : data);
    } catch (err) { setError(clinicalMessage(err)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  return <div className="card">
    <p>Your clinician-recorded history is read-only. Billing is available in a future phase.</p>
    {medicalHistory.length > 0 && <details><summary>Recent medical history</summary>{medicalHistory.map(row => <article key={row.id || row._id}>
      <p>{row.diagnosis}</p><p>{row.treatment}</p><p>{row.doctor} {row.hospital}</p>{row.notes && <p>{row.notes}</p>}
    </article>)}</details>}
    {error && <p role="alert">{error}</p>}
    <button disabled={busy} onClick={() => load()}>Refresh clinical history</button>
    {busy && <p role="status">Loading clinical history...</p>}
    <ClinicalRecord record={record} loading={busy} onOlder={() => load(record.pagination.nextCursor)} />
  </div>;
}

export function DocumentRegistration({ onAdded }) {
  const [form, setForm] = useState({ type: 'other', title: '', fileUrl: '', fileName: '', mimeType: '', fileSizeBytes: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const submit = async event => {
    event.preventDefault(); setMessage('');
    try {
      const url = new URL(form.fileUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || form.fileUrl.length > 2048) throw new Error();
    } catch { setMessage('Enter an HTTPS reference without credentials, query parameters or fragments.'); return; }
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([key, value]) => value !== '' && key !== 'fileSizeBytes'));
      if (form.fileSizeBytes !== '') payload.fileSizeBytes = Number(form.fileSizeBytes);
      await patientAPI.addDocument(payload);
      await onAdded();
      setForm({ type: 'other', title: '', fileUrl: '', fileName: '', mimeType: '', fileSizeBytes: '', notes: '' });
      setMessage('Document reference registered.');
    } catch { setMessage('Unable to register this document reference. Check its metadata and retry.'); }
    finally { setBusy(false); }
  };
  return <form className="card" onSubmit={submit} aria-label="Document reference">
    <h3>Register document reference</h3>
    <p>Use an existing secure HTTPS reference. Local file upload and document deletion are unavailable.</p>
    <fieldset disabled={busy} style={{ border: 0 }}>
      <label>Document type <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
        {['prescription', 'scan', 'bill', 'lab_report', 'discharge_summary', 'other'].map(type => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
      </select></label>
      {[['title', 'Document title', 'text', 255], ['fileUrl', 'HTTPS reference', 'url', 2048], ['fileName', 'File name', 'text', 255], ['mimeType', 'MIME type', 'text', 100], ['fileSizeBytes', 'File size in bytes', 'number', undefined]].map(([key, label, type, maxLength]) => <label key={key} style={{ display: 'block', marginTop: 10 }}>
        {label} <input type={type} maxLength={maxLength} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 104857600 : undefined} step={type === 'number' ? 1 : undefined} required={['title', 'fileUrl'].includes(key)} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      </label>)}
      <label style={{ display: 'block', marginTop: 10 }}>Document notes <textarea maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      <button type="submit">Register document reference</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </form>;
}
