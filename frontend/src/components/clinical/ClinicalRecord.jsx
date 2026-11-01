import React from 'react';

export function clinicalMessage(error) {
  const data = error?.response?.data || {};
  const reasons = {
    consultation_not_started: 'Your consultation has not started.',
    consultation_inactive: 'Your consultation is inactive.',
    consultation_expired: 'Your consultation has expired.',
    no_active_consultation: 'No active consultation is available.',
    provider_membership_inactive: 'Your provider membership is inactive.',
    encounter_completed: 'This encounter is completed. Further clinical entry is closed.',
    wrong_practitioner: 'This consultation is assigned to another practitioner.',
    encounter_reconciliation_required: 'This encounter requires reconciliation before care can continue.',
  };
  if (data.code === 'CLINICAL_ACCESS_DENIED') {
    let message = reasons[data.reason] || 'Clinical access is denied.';
    if (data.opensAt && Number.isFinite(Date.parse(data.opensAt))) message += ' Access begins ' + new Date(data.opensAt).toLocaleString() + '.';
    return message;
  }
  if (data.code === 'CLINICAL_INPUT') return 'Check the entered clinical values and retry.';
  if (data.code === 'CLINICAL_CONFLICT') return 'The clinical record changed or requires reconciliation. Refresh before continuing.';
  return 'Clinical records are temporarily unavailable. Please retry.';
}

export function DocumentLinks({ documents = [] }) {
  return <ul>{documents.map(doc => {
    let safe = false;
    try {
      const url = new URL(doc.fileUrl);
      safe = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
    } catch {}
    return <li key={doc.id || doc._id}>
      {safe ? <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{doc.title || 'Medical document'}</a> : <span>{doc.title || 'Medical document'} (reference unavailable)</span>}
      {' - '}{doc.type?.replace(/_/g, ' ')}{doc.fileName ? ' - ' + doc.fileName : ''}
      {doc.notes && <p>{doc.notes}</p>}
    </li>;
  })}</ul>;
}

function Prescriptions({ rows = [] }) {
  return <>{rows.map(rx => <div key={rx.id}>
    <p>Prescription: {rx.status}{rx.issuedAt ? ' - ' + new Date(rx.issuedAt).toLocaleString() : ''}</p>
    {rx.notes && <p>{rx.notes}</p>}
    <ul>{(rx.items || []).map(item => <li key={item.id}>
      {item.medicationName} - {item.dosage}
      {item.form ? ' - ' + item.form : ''}{item.frequency ? ' - ' + item.frequency : ''}
      {item.duration ? ' - ' + item.duration : ''} - Quantity: {item.quantity}
      {item.instructions && <p>{item.instructions}</p>}
    </li>)}</ul>
  </div>)}</>;
}

export default function ClinicalRecord({ record, onOlder, loading = false }) {
  if (!record) return null;
  return <section aria-label="Clinical history">
    <h2>Clinical history</h2>
    <p>Latest related records are shown. Older encounters are available below.</p>
    <h3>Conditions</h3>
    <ul>{(record.conditions || []).map(row => <li key={row.id}>{row.displayName} - {row.clinicalStatus}{row.icd10Code ? ' (' + row.icd10Code + ')' : ''}</li>)}</ul>
    <h3>Allergies</h3>
    <ul>{(record.allergies || []).map(row => <li key={row.id}>{row.substance}{row.reaction ? ' - ' + row.reaction : ''}{row.severity ? ' - ' + row.severity : ''}</li>)}</ul>
    <h3>Prescriptions</h3><Prescriptions rows={record.prescriptions} />
    <h3>Medical documents</h3><DocumentLinks documents={record.documents} />
    {!(record.encounters || []).length && <p>No clinical encounters recorded.</p>}
    {(record.encounters || []).map(encounter => <article className="card" key={encounter.id} style={{ marginTop: 12 }}>
      <h3>{encounter.chiefComplaint || 'Clinical encounter'}</h3>
      <p>{new Date(encounter.startTime).toLocaleString()} - {encounter.status}</p>
      <p>{encounter.doctor?.name || [encounter.doctor?.firstName, encounter.doctor?.lastName].filter(Boolean).join(' ') || encounter.doctorName} {encounter.hospital?.name || encounter.hospitalName}</p>
      <h4>Vitals</h4>
      {(encounter.vitals || []).map(vital => <dl key={vital.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {[
          ['systolicBp', 'Systolic BP (mmHg)'], ['diastolicBp', 'Diastolic BP (mmHg)'],
          ['heartRate', 'Heart rate (bpm)'], ['respiratoryRate', 'Respiratory rate (/min)'],
          ['temperatureCelsius', 'Temperature (C)'], ['spo2Percentage', 'SpO2 (%)'],
          ['weightKg', 'Weight (kg)'], ['heightCm', 'Height (cm)'], ['bmi', 'BMI'],
        ].filter(([key]) => vital[key] != null).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{vital[key]}</dd></div>)}
      </dl>)}
      <h4>SOAP notes</h4>
      {(encounter.notes || []).map(note => <div key={note.id}>
        <p>{note.noteType}</p>
        {['subjective', 'objective', 'assessment', 'plan'].filter(key => note[key]).map(key => <p key={key}><strong>{key[0].toUpperCase() + key.slice(1)}: </strong>{note[key]}</p>)}
      </div>)}
      <h4>Encounter conditions</h4><ul>{(encounter.conditions || []).map(row => <li key={row.id}>{row.displayName} - {row.clinicalStatus}</li>)}</ul>
      <h4>Encounter allergies</h4><ul>{(encounter.allergies || []).map(row => <li key={row.id}>{row.substance}{row.reaction ? ' - ' + row.reaction : ''}</li>)}</ul>
      <Prescriptions rows={encounter.prescriptions} /><DocumentLinks documents={encounter.documents} />
    </article>)}
    {record.pagination?.hasMore && onOlder && <button disabled={loading} onClick={onOlder}>Load older encounters</button>}
  </section>;
}
