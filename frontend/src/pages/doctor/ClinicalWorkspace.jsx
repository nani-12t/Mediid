import React, { useEffect, useRef, useState } from 'react';
import { clinicalAPI } from '../../utils/api';
import ClinicalRecord, { clinicalMessage } from '../../components/clinical/ClinicalRecord';

const vitalFields = [
  ['systolicBp', 'Systolic BP (mmHg)', 1, 400], ['diastolicBp', 'Diastolic BP (mmHg)', 1, 300],
  ['heartRate', 'Heart rate (bpm)', 1, 400], ['respiratoryRate', 'Respiratory rate (/min)', 1, 150],
  ['temperatureCelsius', 'Temperature Celsius', 20, 50, true], ['spo2Percentage', 'SpO2 (%)', 0, 100],
  ['weightKg', 'Weight kg', 0.01, 999.99, true], ['heightCm', 'Height cm', 0.01, 999.99, true],
];
const emptyMedicine = () => ({ medicationName: '', dosage: '', form: '', frequency: '', duration: '', quantity: '1', instructions: '' });
const compact = values => Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
const fieldStyle = { display: 'block', margin: '8px 0' };

export default function ClinicalWorkspace({ onCompleted }) {
  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [record, setRecord] = useState(null);
  const [encounter, setEncounter] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [vitals, setVitals] = useState({});
  const [note, setNote] = useState({ noteType: 'progress', subjective: '', objective: '', assessment: '', plan: '' });
  const [condition, setCondition] = useState({ displayName: '', icd10Code: '', clinicalStatus: 'active', verificationStatus: '', diagnosedDate: '' });
  const [allergy, setAllergy] = useState({ substance: '', reaction: '', severity: '' });
  const [items, setItems] = useState([emptyMedicine()]);
  const [rxNotes, setRxNotes] = useState('');
  const request = useRef(0);
  const loadQueue = async () => {
    try { const { data } = await clinicalAPI.doctorQueue(); setAppointments(data.appointments); }
    catch (err) { setAppointments([]); setRecord(null); setEncounter(null); setError(clinicalMessage(err)); }
  };
  useEffect(() => { loadQueue(); return () => { request.current += 1; }; }, []);
  const open = async (appointment, cursor) => {
    const current = ++request.current;
    setBusy(true); setError(''); setMessage('');
    if (!cursor) {
      setSelected(appointment); setRecord(null); setEncounter(null); setVitals({});
      setNote({ noteType: 'progress', subjective: '', objective: '', assessment: '', plan: '' });
      setCondition({ displayName: '', icd10Code: '', clinicalStatus: 'active', verificationStatus: '', diagnosedDate: '' });
      setAllergy({ substance: '', reaction: '', severity: '' }); setItems([emptyMedicine()]); setRxNotes('');
    }
    try {
      const { data } = await clinicalAPI.ehr(appointment.patientUid || appointment.patient.uid, cursor ? { cursor } : {});
      if (request.current === current) setRecord(previous => cursor ? { ...data, encounters: [...previous.encounters, ...data.encounters] } : data);
    } catch (err) {
      if (request.current === current) { setRecord(null); setEncounter(null); setError(clinicalMessage(err)); }
    } finally { if (request.current === current) setBusy(false); }
  };
  const run = async (operation, after) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data } = await operation();
      await after(data);
    } catch (err) {
      setError(clinicalMessage(err));
      if ([403, 409].includes(err.response?.status)) { setRecord(null); setEncounter(null); }
    } finally { setBusy(false); }
  };
  const reloadRecord = async () => {
    const { data } = await clinicalAPI.ehr(selected.patientUid || selected.patient.uid, {});
    setRecord(data); setMessage('Clinical entry saved.');
  };
  const save = (event, operation, reset) => {
    event.preventDefault();
    run(operation, async () => { reset(); await reloadRecord(); });
  };
  const active = encounter?.status === 'in_progress';
  return <section aria-label="Doctor clinical workspace">
    <h1>Clinical queue</h1>
    <button disabled={busy} onClick={() => { setError(''); loadQueue(); }}>Refresh clinical queue</button>
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!appointments.length && !error && <p>No appointments in your clinical queue.</p>}
    {appointments.map(appointment => <article className="card" key={appointment.appointmentId} style={{ marginTop: 12 }}>
      <h2>{appointment.patient?.firstName} {appointment.patient?.lastName}</h2>
      <p>{appointment.organizationName} - {String(appointment.appointmentDate || '').slice(0, 10)} - {appointment.timeSlot}</p>
      <p>Status: {appointment.status}</p>
      <p>{appointment.ehrAccess === 'active' ? 'EHR available - authorization is checked when opened.' : 'EHR locked - ' + (appointment.ehrAccess || 'unavailable')}</p>
      {appointment.opensAt && <p>Access begins: {new Date(appointment.opensAt).toLocaleString()}</p>}
      {appointment.expiresAt && <p>Access ends: {new Date(appointment.expiresAt).toLocaleString()}</p>}
      {appointment.symptoms && <p>Symptoms: {appointment.symptoms}</p>}
      <button disabled={busy} onClick={() => open(appointment)}>Open patient record</button>
    </article>)}
    {busy && <p role="status">Loading clinical records...</p>}
    {record && selected && <div className="card" style={{ marginTop: 20 }}>
      <h2>{record.patient.firstName} {record.patient.lastName} - {record.patient.uid}</h2>
      {!encounter && <button disabled={busy} onClick={() => run(() => clinicalAPI.startEncounter(selected.appointmentId), data => { setEncounter(data); setMessage('Encounter ready for clinical entry.'); })}>Start or resume encounter</button>}
      {encounter && <p>Current encounter: {encounter.status}</p>}
      {active && <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
        <h3>Record vitals</h3>
        <form aria-label="Vitals" onSubmit={event => save(event, () => clinicalAPI.addVital(encounter.id, Object.fromEntries(Object.entries(vitals).filter(([, value]) => value !== '').map(([key, value]) => [key, vitalFields.find(field => field[0] === key)[4] ? value : Number(value)]))), () => setVitals({}))}>
          {vitalFields.map(([key, label, min, max, decimal]) => <label key={key} style={fieldStyle}>{label} <input type="number" min={min} max={max} step={decimal ? '0.01' : '1'} value={vitals[key] || ''} onChange={e => setVitals({ ...vitals, [key]: e.target.value })} /></label>)}
          <button type="submit">Save vitals</button>
        </form>
        <h3>Record SOAP note</h3>
        <form aria-label="SOAP note" onSubmit={event => save(event, () => clinicalAPI.addNote(encounter.id, compact(note)), () => setNote({ noteType: 'progress', subjective: '', objective: '', assessment: '', plan: '' }))}>
          <label style={fieldStyle}>Note type <select value={note.noteType} onChange={e => setNote({ ...note, noteType: e.target.value })}>{['progress', 'consultation', 'discharge', 'procedure'].map(type => <option key={type}>{type}</option>)}</select></label>
          {['subjective', 'objective', 'assessment', 'plan'].map(key => <label key={key} style={fieldStyle}>{key[0].toUpperCase() + key.slice(1)} <textarea maxLength={4000} value={note[key]} onChange={e => setNote({ ...note, [key]: e.target.value })} /></label>)}
          <button type="submit">Save SOAP note</button>
        </form>
        <h3>Record condition</h3>
        <form aria-label="Condition" onSubmit={event => save(event, () => clinicalAPI.addCondition(encounter.id, compact(condition)), () => setCondition({ displayName: '', icd10Code: '', clinicalStatus: 'active', verificationStatus: '', diagnosedDate: '' }))}>
          <label style={fieldStyle}>Condition name <input required maxLength={255} value={condition.displayName} onChange={e => setCondition({ ...condition, displayName: e.target.value })} /></label>
          <label style={fieldStyle}>ICD-10 code <input maxLength={16} value={condition.icd10Code} onChange={e => setCondition({ ...condition, icd10Code: e.target.value })} /></label>
          <label style={fieldStyle}>Condition status <select value={condition.clinicalStatus} onChange={e => setCondition({ ...condition, clinicalStatus: e.target.value })}><option value="active">Active</option><option value="resolved">Resolved</option></select></label>
          <label style={fieldStyle}>Verification status <input maxLength={32} value={condition.verificationStatus} onChange={e => setCondition({ ...condition, verificationStatus: e.target.value })} /></label>
          <label style={fieldStyle}>Diagnosed date <input type="date" value={condition.diagnosedDate} onChange={e => setCondition({ ...condition, diagnosedDate: e.target.value })} /></label>
          <button type="submit">Save condition</button>
        </form>
        <h3>Record allergy</h3>
        <form aria-label="Allergy" onSubmit={event => save(event, () => clinicalAPI.addAllergy(encounter.id, compact(allergy)), () => setAllergy({ substance: '', reaction: '', severity: '' }))}>
          <label style={fieldStyle}>Allergy substance <input required maxLength={255} value={allergy.substance} onChange={e => setAllergy({ ...allergy, substance: e.target.value })} /></label>
          <label style={fieldStyle}>Allergy reaction <textarea maxLength={2000} value={allergy.reaction} onChange={e => setAllergy({ ...allergy, reaction: e.target.value })} /></label>
          <label style={fieldStyle}>Severity <select value={allergy.severity} onChange={e => setAllergy({ ...allergy, severity: e.target.value })}><option value="">Unspecified</option>{['mild', 'moderate', 'severe', 'fatal'].map(value => <option key={value}>{value}</option>)}</select></label>
          <button type="submit">Save allergy</button>
        </form>
        <h3>Structured prescription</h3>
        <form aria-label="Prescription" onSubmit={event => save(event, () => clinicalAPI.prescription({ appointmentId: selected.appointmentId, encounterId: encounter.id, ...(rxNotes ? { notes: rxNotes } : {}), items: items.map(item => ({ ...compact(item), quantity: Number(item.quantity) })) }), () => { setItems([emptyMedicine()]); setRxNotes(''); })}>
          {items.map((item, index) => <fieldset key={index} style={{ margin: '12px 0' }}><legend>Medicine {index + 1}</legend>
            {[['medicationName', 'Medicine', 255], ['dosage', 'Dosage', 100], ['form', 'Form', 50], ['frequency', 'Frequency', 100], ['duration', 'Duration', 50], ['quantity', 'Quantity'], ['instructions', 'Instructions', 2000]].map(([key, label, maxLength]) => <label key={key} style={fieldStyle}>{label} <input type={key === 'quantity' ? 'number' : 'text'} min={key === 'quantity' ? 1 : undefined} max={key === 'quantity' ? 100000 : undefined} step={key === 'quantity' ? 1 : undefined} maxLength={maxLength} required={['medicationName', 'dosage', 'quantity'].includes(key)} value={item[key]} onChange={e => setItems(items.map((row, i) => i === index ? { ...row, [key]: e.target.value } : row))} /></label>)}
            {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove medicine {index + 1}</button>}
          </fieldset>)}
          <button type="button" disabled={items.length >= 50} onClick={() => setItems([...items, emptyMedicine()])}>Add medicine</button>
          <label style={fieldStyle}>Prescription notes <textarea maxLength={4000} value={rxNotes} onChange={e => setRxNotes(e.target.value)} /></label>
          <button type="submit">Save structured prescription</button>
        </form>
        <button onClick={() => { if (window.confirm('Complete this encounter? Further clinical entry will be closed.')) run(() => clinicalAPI.completeEncounter(encounter.id), async () => { setEncounter(null); setRecord(null); setMessage('Encounter completed. Further clinical entry is closed.'); await loadQueue(); onCompleted?.(); }); }}>Complete encounter</button>
      </fieldset>}
      <ClinicalRecord record={record} loading={busy} onOlder={() => open(selected, record.pagination.nextCursor)} />
    </div>}
  </section>;
}
