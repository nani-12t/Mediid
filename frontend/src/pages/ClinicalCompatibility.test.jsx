import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import DoctorDashboard from './doctor/Dashboard';
import ClinicalWorkspace from './doctor/ClinicalWorkspace';
import PatientProfile from './patient/Profile';
import { clinicalAPI, patientAPI, appointmentAPI } from '../utils/api';
import { io } from 'socket.io-client';

jest.mock('../components/common/PatientLayout', () => ({ children }) => <main>{children}</main>);
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ logout: jest.fn(), profile: { firstName: 'Synthetic', lastName: 'Patient' } }) }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn(), useSearchParams: () => [new URLSearchParams()] }));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../utils/api', () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
  appointmentAPI: { getConfig: jest.fn(), getDoctorAppointments: jest.fn() },
  patientAPI: { getConfig: jest.fn(), getProfile: jest.fn(), addDocument: jest.fn(), updateProfile: jest.fn() },
  clinicalAPI: Object.fromEntries(['getConfig', 'doctorQueue', 'ehr', 'startEncounter', 'completeEncounter', 'addVital', 'addNote', 'addCondition', 'addAllergy', 'prescription', 'selfEncounters'].map(key => [key, jest.fn()])),
}));

let container, root, bundle, queue, profile;
const mount = async element => { await act(async () => { root.render(element); }); };
const click = async element => { expect(element).toBeTruthy(); await act(async () => { Simulate.click(element); }); };
const button = text => Array.from(container.querySelectorAll('button')).find(row => row.textContent.includes(text));
const input = (text, within = container) => {
  const label = Array.from(within.querySelectorAll('label')).find(row => row.textContent.trim().startsWith(text));
  return label?.querySelector('input,textarea,select') || label?.parentElement.querySelector('input,textarea,select');
};
const change = async (text, value, within = container) => {
  const field = input(text, within); expect(field).toBeTruthy();
  await act(async () => { Simulate.change(field, { target: { value } }); });
};
const submit = async name => { await act(async () => { Simulate.submit(container.querySelector('form[aria-label="' + name + '"]')); }); };
const start = async () => { await mount(<ClinicalWorkspace />); await click(button('Open patient record')); await click(button('Start or resume encounter')); };

beforeEach(() => {
  jest.resetAllMocks(); global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  queue = { appointmentId: 'appointment-1', patientUid: 'MID-TEST0001', patient: { uid: 'MID-TEST0001', firstName: 'Synthetic', lastName: 'Patient' }, organizationName: 'Synthetic Hospital', appointmentDate: '2026-11-02', timeSlot: '23:00', status: 'confirmed', ehrAccess: 'active' };
  bundle = {
    patient: queue.patient, consultation: { appointmentId: 'appointment-1' }, encounters: [
      { id: 'historical-encounter', startTime: '2026-10-01T09:00:00Z', status: 'completed', chiefComplaint: 'Synthetic historical care',
        vitals: [{ id: 'vital-1', temperatureCelsius: '37.20' }], notes: [{ id: 'note-1', assessment: 'Synthetic assessment', plan: 'Synthetic plan' }], conditions: [], allergies: [], prescriptions: [], documents: [] },
    ], conditions: [{ id: 'condition-1', displayName: 'Synthetic condition', clinicalStatus: 'active' }],
    allergies: [{ id: 'allergy-1', substance: 'Synthetic allergen', severity: 'mild' }],
    prescriptions: [{ id: 'rx-1', status: 'active', items: [{ id: 'item-1', medicationName: 'Synthetic medication', dosage: '1 unit', quantity: 2 }] }],
    documents: [{ id: 'document-1', title: 'Synthetic document', type: 'other', fileUrl: 'https://files.example.invalid/reference' }],
    pagination: { hasMore: false },
  };
  profile = { uid: queue.patientUid, emergency: { allergies: ['Synthetic allergen'], chronicConditions: ['Synthetic condition'], currentMedications: ['Synthetic medication 1 unit'] }, documents: [], medicalHistory: [{ id: 'summary-1', diagnosis: 'Synthetic compatibility diagnosis', treatment: 'Synthetic compatibility treatment' }], medicalBenefits: [] };
  clinicalAPI.getConfig.mockResolvedValue({ data: { backend: 'postgres' } });
  clinicalAPI.doctorQueue.mockImplementation(async () => ({ data: { appointments: [queue] } }));
  clinicalAPI.ehr.mockImplementation(async () => ({ data: bundle }));
  clinicalAPI.selfEncounters.mockImplementation(async () => ({ data: bundle }));
  clinicalAPI.startEncounter.mockResolvedValue({ data: { id: 'encounter-1', status: 'in_progress' } });
  for (const name of ['addVital', 'addNote', 'addCondition', 'addAllergy', 'prescription', 'completeEncounter']) clinicalAPI[name].mockResolvedValue({ data: { id: 'created-record' } });
  appointmentAPI.getConfig.mockResolvedValue({ data: { backend: 'postgres' } });
  appointmentAPI.getDoctorAppointments.mockResolvedValue({ data: [] });
  patientAPI.getConfig.mockResolvedValue({ data: { backend: 'postgres' } });
  patientAPI.getProfile.mockImplementation(async () => ({ data: profile }));
  patientAPI.addDocument.mockResolvedValue({ data: {} });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => { await act(async () => { root.unmount(); }); container.remove(); jest.restoreAllMocks(); });

test('explicit PostgreSQL doctor portal loads its own queue without a legacy socket or automatic EHR read', async () => {
  await mount(<DoctorDashboard />);
  expect(clinicalAPI.getConfig).toHaveBeenCalledTimes(1);
  expect(clinicalAPI.doctorQueue).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('EHR available');
  expect(container.textContent).toContain('23:00');
  expect(clinicalAPI.ehr).not.toHaveBeenCalled();
  expect(io).not.toHaveBeenCalled();
});

test.each(['auto', 'legacy'])('invalid or incompatible clinical mode %s fails closed', async backend => {
  clinicalAPI.getConfig.mockResolvedValue({ data: { backend } });
  await mount(<DoctorDashboard />);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(clinicalAPI.doctorQueue).not.toHaveBeenCalled();
  expect(appointmentAPI.getDoctorAppointments).not.toHaveBeenCalled();
  expect(io).not.toHaveBeenCalled();
});

test('confirmed appointment stays locked and safe server denial supplies its own access time', async () => {
  queue.ehrAccess = 'scheduled';
  clinicalAPI.ehr.mockRejectedValue({ response: { status: 403, data: { code: 'CLINICAL_ACCESS_DENIED', reason: 'consultation_not_started', opensAt: '2026-11-02T08:20:00Z', privateToken: 'secret-never-display' } } });
  await mount(<ClinicalWorkspace />);
  expect(container.textContent).toContain('EHR locked');
  expect(container.textContent).not.toContain('EHR available');
  await click(button('Open patient record'));
  expect(container.querySelector('[role="alert"]').textContent).toContain('Your consultation has not started.');
  expect(container.textContent).toContain('Access begins');
  expect(container.textContent).not.toContain('secret-never-display');
  expect(button('Start or resume encounter')).toBeUndefined();
});

test('active EHR renders longitudinal clinical facts and starts using only appointmentId', async () => {
  await start();
  for (const text of ['Synthetic historical care', '37.20', 'Synthetic assessment', 'Synthetic plan', 'Synthetic condition', 'Synthetic allergen', 'Synthetic medication', 'Quantity: 2']) expect(container.textContent).toContain(text);
  expect(clinicalAPI.ehr).toHaveBeenCalledWith('MID-TEST0001', {});
  expect(clinicalAPI.startEncounter).toHaveBeenCalledWith('appointment-1');
  expect(container.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');
});

test('vitals preserve precise decimals and use encounter ID with no client provenance', async () => {
  await start(); await change('Systolic BP', '120'); await change('Temperature Celsius', '37.20'); await change('Weight kg', '65.25'); await change('Height cm', '170.00');
  await submit('Vitals');
  expect(clinicalAPI.addVital).toHaveBeenCalledWith('encounter-1', { systolicBp: 120, temperatureCelsius: '37.20', weightKg: '65.25', heightCm: '170.00' });
});

test('SOAP, condition and allergy forms send only structured facts to the current encounter', async () => {
  await start(); await change('Subjective', 'Synthetic symptom'); await change('Assessment', 'Synthetic new assessment'); await change('Plan', 'Synthetic new plan'); await submit('SOAP note');
  expect(clinicalAPI.addNote).toHaveBeenCalledWith('encounter-1', { noteType: 'progress', subjective: 'Synthetic symptom', assessment: 'Synthetic new assessment', plan: 'Synthetic new plan' });
  await change('Condition name', 'Synthetic diagnosis'); await change('ICD-10 code', 'Z00'); await submit('Condition');
  expect(clinicalAPI.addCondition).toHaveBeenCalledWith('encounter-1', { displayName: 'Synthetic diagnosis', icd10Code: 'Z00', clinicalStatus: 'active' });
  await change('Allergy substance', 'Synthetic second allergen'); await change('Severity', 'moderate'); await submit('Allergy');
  expect(clinicalAPI.addAllergy).toHaveBeenCalledWith('encounter-1', { substance: 'Synthetic second allergen', severity: 'moderate' });
});

test('structured prescription editor sends medicine items and exact appointment/encounter selectors', async () => {
  await start();
  const form = container.querySelector('form[aria-label="Prescription"]');
  for (const [label, value] of [['Medicine', 'Synthetic medicine'], ['Dosage', '2 units'], ['Form', 'tablet'], ['Frequency', 'daily'], ['Duration', '3 days'], ['Quantity', '6'], ['Instructions', 'Synthetic instructions']]) await change(label, value, form);
  await submit('Prescription');
  expect(clinicalAPI.prescription).toHaveBeenCalledWith({ appointmentId: 'appointment-1', encounterId: 'encounter-1', items: [{ medicationName: 'Synthetic medicine', dosage: '2 units', form: 'tablet', frequency: 'daily', duration: '3 days', quantity: 6, instructions: 'Synthetic instructions' }] });
  const serialized = JSON.stringify(clinicalAPI.prescription.mock.calls);
  expect(serialized).not.toMatch(/patientId|doctorId|hospitalId/);
});

test('expired write clears clinical entry and cannot keep showing an unlocked record', async () => {
  await start(); clinicalAPI.addNote.mockRejectedValue({ response: { status: 403, data: { code: 'CLINICAL_ACCESS_DENIED', reason: 'consultation_expired' } } });
  await change('Plan', 'Synthetic plan'); await submit('SOAP note');
  expect(container.querySelector('[role="alert"]').textContent).toContain('Your consultation has expired.');
  expect(container.querySelector('form[aria-label="SOAP note"]')).toBeNull();
  expect(container.querySelector('section[aria-label="Clinical history"]')).toBeNull();
});

test('encounter completion closes all entry forms and refreshes the queue', async () => {
  await start(); await click(button('Complete encounter'));
  expect(clinicalAPI.completeEncounter).toHaveBeenCalledWith('encounter-1');
  expect(container.textContent).toContain('Further clinical entry is closed.');
  expect(container.querySelector('form[aria-label="Prescription"]')).toBeNull();
  expect(clinicalAPI.doctorQueue).toHaveBeenCalledTimes(2);
});

test('patient profile displays real compatibility and structured history with cursor pagination', async () => {
  bundle.pagination = { hasMore: true, nextCursor: 'older-cursor' };
  await mount(<PatientProfile />); await click(button('Clinical History'));
  expect(container.textContent).toContain('Synthetic compatibility diagnosis');
  expect(container.textContent).toContain('Synthetic compatibility treatment');
  expect(container.textContent).toContain('Synthetic historical care');
  expect(button('Save SOAP note')).toBeUndefined();
  expect(clinicalAPI.selfEncounters).toHaveBeenCalledWith({});
  clinicalAPI.selfEncounters.mockResolvedValue({ data: { ...bundle, encounters: [{ id: 'older-encounter', chiefComplaint: 'Synthetic older care', startTime: '2026-09-01', status: 'completed' }], pagination: { hasMore: false } } });
  await click(button('Load older encounters'));
  expect(clinicalAPI.selfEncounters).toHaveBeenLastCalledWith({ cursor: 'older-cursor' });
  expect(container.textContent).toContain('Synthetic older care');
  expect(container.textContent).toContain('Synthetic historical care');
});

test('patient derived clinical arrays are visible and read-only, without expanding public QR fields', async () => {
  await mount(<PatientProfile />);
  expect(input('Allergies').value).toBe('Synthetic allergen'); expect(input('Allergies').disabled).toBe(true);
  expect(input('Active Conditions').value).toBe('Synthetic condition'); expect(input('Active Conditions').disabled).toBe(true);
  expect(input('Current Medications').value).toBe('Synthetic medication 1 unit'); expect(input('Current Medications').disabled).toBe(true);
  expect(container.textContent).toContain('Your active emergency QR card shares your name, blood group, emergency contact and organ-donor choice.');
});

test('PostgreSQL documents submit HTTPS metadata without ever reading a local file as base64', async () => {
  const reader = jest.spyOn(window, 'FileReader').mockImplementation(() => { throw new Error('No local file reader allowed'); });
  await mount(<PatientProfile />); await click(button('Documents'));
  expect(container.querySelector('input[type="file"]')).toBeNull();
  await change('Document title', 'Synthetic external report'); await change('HTTPS reference', 'https://files.example.invalid/report'); await change('File size in bytes', '1200');
  await submit('Document reference');
  expect(patientAPI.addDocument).toHaveBeenCalledWith({ type: 'other', title: 'Synthetic external report', fileUrl: 'https://files.example.invalid/report', fileSizeBytes: 1200 });
  expect(reader).not.toHaveBeenCalled();
  expect(JSON.stringify(patientAPI.addDocument.mock.calls)).not.toContain('base64');
  expect(container.textContent).toContain('Document reference registered.');
});

test.each(['data:application/pdf;base64,abc', 'https://files.example.invalid/report?token=secret', 'http://files.example.invalid/report'])('unsafe document reference %s is rejected without submission', async fileUrl => {
  await mount(<PatientProfile />); await click(button('Documents'));
  await change('Document title', 'Synthetic reference'); await change('HTTPS reference', fileUrl); await submit('Document reference');
  expect(patientAPI.addDocument).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Enter an HTTPS reference without credentials');
});
