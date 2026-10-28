import React, { act } from 'react';
import { randomInt } from 'crypto';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import PatientProfile from './Profile';
import PatientDashboard from './Dashboard';
import { patientAPI, appointmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';

jest.mock('../../components/common/PatientLayout', () => ({ children }) => <main>{children}</main>);
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({
  profile: { uid: 'MID-TEST0001', firstName: 'Synthetic', lastName: 'Patient' },
  user: { email: 'patient@example.invalid' },
}) }));
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
  useNavigate: () => jest.fn(),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('react-hot-toast', () => ({
  __esModule: true, default: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../utils/api', () => ({
  patientAPI: {
    getConfig: jest.fn(), getProfile: jest.fn(), updateProfile: jest.fn(), getQR: jest.fn(),
    addMedicalBenefit: jest.fn(), deleteMedicalBenefit: jest.fn(),
    addDocument: jest.fn(), deleteDocument: jest.fn(),
  },
  appointmentAPI: { getMyAppointments: jest.fn() },
}));

let container;
let root;
let patient;
let syntheticAadhaar;
const mount = async (element = <PatientProfile />) => { await act(async () => { root.render(element); }); };
const click = async element => { await act(async () => { Simulate.click(element); }); };
const change = async (element, value) => {
  await act(async () => { Simulate.change(element, { target: { value } }); });
};
const button = text => Array.from(container.querySelectorAll('button')).find(item => item.textContent.includes(text));
const input = text => {
  const label = Array.from(container.querySelectorAll('label')).find(item => item.textContent.trim().startsWith(text));
  return label?.querySelector('input, select, textarea') || label?.parentElement.querySelector('input, select, textarea');
};
const openBenefits = async source => {
  await click(button('Medical Benefits'));
  await click(button('Add Medical Benefit'));
  if (source !== 'government') await click(button(source === 'employer' ? 'Employer / Company' : 'Personal Insurance'));
  await change(input(source === 'government' ? 'Scheme Name' : 'Insurance Plan Name'), 'Synthetic plan');
};

beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  syntheticAadhaar = Array.from({ length: 12 }, () => String(randomInt(10))).join('');
  patient = {
    _id: '019a2345-6789-7abc-8def-012345678901', uid: 'MID-TEST0001',
    firstName: 'Synthetic', lastName: 'Patient', aadhaarPresent: true,
    emergency: {
      bloodGroup: 'O+', emergencyContactName: 'Synthetic Contact',
      emergencyContactPhone: '+910000000000', emergencyContactRelation: 'Parent',
      organDonor: true, aadhaarPresent: true,
      allergies: [], chronicConditions: [], currentMedications: [],
    },
    medicalBenefits: [], documents: [], bills: [], medicalHistory: [],
  };
  patientAPI.getConfig.mockResolvedValue({ data: { backend: 'postgres' } });
  patientAPI.getProfile.mockImplementation(async () => ({ data: patient }));
  patientAPI.updateProfile.mockImplementation(async () => ({ data: patient }));
  patientAPI.addMedicalBenefit.mockImplementation(async payload => {
    const benefit = { ...payload, _id: 'synthetic-benefit', id: 'synthetic-benefit' };
    patient = { ...patient, medicalBenefits: [...patient.medicalBenefits, benefit] };
    return { data: benefit };
  });
  patientAPI.deleteMedicalBenefit.mockResolvedValue({ data: { message: 'Benefit deactivated' } });
  patientAPI.addDocument.mockResolvedValue({ data: {} });
  patientAPI.getQR.mockResolvedValue({ data: { uid: patient.uid, qrCode: 'synthetic-QR', qrActive: true } });
  appointmentAPI.getMyAppointments.mockRejectedValue({ response: { status: 503, data: { code: 'AUTH_DOMAIN_NOT_MIGRATED' } } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.restoreAllMocks();
});

test('PostgreSQL profile renders safe emergency fields and presence without prefilling an identifier or claiming verification', async () => {
  // Even a malformed compatibility response must never prefill plaintext in PostgreSQL mode.
  patient.emergency.aadhaarNumber = syntheticAadhaar;
  await mount();
  expect(input('Blood Group').value).toBe('O+');
  expect(input('Emergency Contact Name').value).toBe('Synthetic Contact');
  expect(input('Emergency Contact Phone').value).toBe('+910000000000');
  expect(input('Emergency Contact Relationship').value).toBe('Parent');
  expect(input('Organ donor').checked).toBe(true);
  expect(input('Aadhaar Number').value).toBe('');
  expect(container.textContent).toContain('Aadhaar identifier on file');
  expect(container.textContent).not.toMatch(/Aadhaar Verified|automatically check eligibility/i);
  expect(container.textContent.includes(syntheticAadhaar)).toBe(false);
});

test('PostgreSQL emergency save sends only demographic fields and leaves the stored identifier untouched when blank', async () => {
  await mount();
  expect(input('Allergies').disabled).toBe(true);
  expect(input('Chronic Conditions').disabled).toBe(true);
  expect(input('Current Medications').disabled).toBe(true);
  expect(container.textContent).toContain('future longitudinal clinical record');
  await change(input('Emergency Contact Name'), 'Replacement Contact');
  await click(button('Save Emergency Info'));
  expect(patientAPI.updateProfile).toHaveBeenCalledWith({
    emergency: {
      bloodGroup: 'O+', emergencyContactName: 'Replacement Contact',
      emergencyContactPhone: '+910000000000', emergencyContactRelation: 'Parent', organDonor: true,
    },
  });
  expect(toast.success).toHaveBeenCalledWith('Emergency info updated!');
});

test('a new 12-digit Aadhaar replacement is submitted once and removed from the input after saving', async () => {
  await mount();
  await change(input('Aadhaar Number'), syntheticAadhaar);
  await click(button('Save Emergency Info'));
  const submitted = patientAPI.updateProfile.mock.calls[0][0].emergency;
  expect(submitted.aadhaarNumber === syntheticAadhaar).toBe(true);
  expect(input('Aadhaar Number').value).toBe('');
  expect(container.textContent).not.toMatch(/Aadhaar Verified/i);
});

test('partial Aadhaar replacement is rejected without modifying the stored identifier', async () => {
  await mount();
  await change(input('Aadhaar Number'), '12345');
  await click(button('Save Emergency Info'));
  expect(patientAPI.updateProfile).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Enter a new 12-digit Aadhaar number or leave it blank.');
});

test.each([
  ['government', 'ayushman'],
  ['employer', 'group_mediclaim'],
  ['personal', 'individual_insurance'],
])('%s benefits can be created with exact decimal strings and removed from the rendered profile', async (source, type) => {
  await mount();
  await openBenefits(source);
  await change(input('Sum Insured'), '1234567890.12');
  await change(input('Room Rent Limit'), '12345.67');
  await click(button('+ Add Benefit'));
  const payload = patientAPI.addMedicalBenefit.mock.calls[0][0];
  expect(payload).toMatchObject({
    source, type, schemeName: 'Synthetic plan', coverageAmount: '1234567890.12',
    roomRentLimit: '12345.67', familyMembers: [],
  });
  expect(payload).not.toHaveProperty('validFrom');
  expect(payload).not.toHaveProperty('validUntil');
  expect(container.textContent).toContain('Synthetic plan');
  await click(container.querySelector('[aria-label="Remove Synthetic plan"]'));
  expect(patientAPI.deleteMedicalBenefit).toHaveBeenCalledWith('synthetic-benefit');
  expect(container.textContent).not.toContain('Synthetic plan');
});

test.each(['-1', '10000000000.00', '1.234', '1e3'])('invalid PostgreSQL coverage %s never reaches the benefit API', async value => {
  await mount();
  await openBenefits('personal');
  await change(input('Sum Insured'), value);
  await click(button('+ Add Benefit'));
  expect(patientAPI.addMedicalBenefit).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith('Enter a non-negative amount with at most two decimal places.');
});

test('PostgreSQL blank optional dates and amounts are omitted and reversed validity is rejected', async () => {
  await mount();
  await openBenefits('government');
  await change(input('Valid From'), '2027-02-02');
  await change(input('Valid Until'), '2027-01-01');
  await click(button('+ Add Benefit'));
  expect(patientAPI.addMedicalBenefit).not.toHaveBeenCalled();
  await change(input('Valid From'), '');
  await change(input('Valid Until'), '');
  await click(button('+ Add Benefit'));
  const payload = patientAPI.addMedicalBenefit.mock.calls[0][0];
  for (const field of ['coverageAmount', 'roomRentLimit', 'validFrom', 'validUntil']) {
    expect(payload).not.toHaveProperty(field);
  }
});

test('PostgreSQL documents show an explicit deferred message and cannot upload or claim success', async () => {
  await mount();
  await click(button('Documents'));
  expect(container.textContent).toContain('future clinical record phase');
  const uploads = Array.from(container.querySelectorAll('button')).filter(item => /Upload/i.test(item.textContent));
  expect(uploads).toHaveLength(2);
  expect(uploads.every(item => item.disabled)).toBe(true);
  await click(uploads[0]);
  expect(patientAPI.addDocument).not.toHaveBeenCalled();
  expect(patientAPI.deleteDocument).not.toHaveBeenCalled();
  expect(toast.success).not.toHaveBeenCalled();
});

test.each(['unknown', null])('unknown patient configuration %s fails closed without loading profile or enabling mutations', async backend => {
  patientAPI.getConfig.mockResolvedValue({ data: { backend } });
  await mount();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(button('Save Emergency Info').disabled).toBe(true);
  await click(button('Save Emergency Info'));
  await click(button('Medical Benefits'));
  expect(button('Add Medical Benefit').disabled).toBe(true);
  expect(patientAPI.getProfile).not.toHaveBeenCalled();
  expect(patientAPI.updateProfile).not.toHaveBeenCalled();
  expect(patientAPI.addMedicalBenefit).not.toHaveBeenCalled();
});

test('legacy patient mode retains clinical arrays, existing Aadhaar input and document uploads without a verification claim', async () => {
  patientAPI.getConfig.mockResolvedValue({ data: { backend: 'legacy' } });
  patient.emergency = { ...patient.emergency, allergies: ['Synthetic allergy'], aadhaarNumber: syntheticAadhaar };
  await mount();
  expect(input('Aadhaar Number').value === syntheticAadhaar).toBe(true);
  expect(input('Allergies').disabled).toBe(false);
  expect(input('Allergies').value).toBe('Synthetic allergy');
  expect(container.textContent).not.toMatch(/Aadhaar Verified/i);
  await click(button('Save Emergency Info'));
  const emergency = patientAPI.updateProfile.mock.calls[0][0].emergency;
  expect(emergency.allergies).toEqual(['Synthetic allergy']);
  expect(emergency.aadhaarNumber === syntheticAadhaar).toBe(true);
  await click(button('Documents'));
  expect(button('Upload Document').disabled).toBe(false);
  await click(button('Upload Document'));
  await change(input('Title'), 'Synthetic document');
  await click(button('Add Document'));
  expect(patientAPI.addDocument).toHaveBeenCalledWith(expect.objectContaining({ title: 'Synthetic document' }));
  expect(toast.success).toHaveBeenCalledWith('Document added to DigiLocker!');
});

test('legacy benefit submission preserves the prior numeric payload contract', async () => {
  patientAPI.getConfig.mockResolvedValue({ data: { backend: 'legacy' } });
  await mount();
  await openBenefits('employer');
  await change(input('Sum Insured'), '123.45');
  await click(button('+ Add Benefit'));
  expect(patientAPI.addMedicalBenefit.mock.calls[0][0].coverageAmount).toBe(123.45);
});

test('dashboard still requests patient QR independently when appointments are deferred', async () => {
  await mount(<PatientDashboard />);
  expect(patientAPI.getQR).toHaveBeenCalledTimes(1);
  expect(appointmentAPI.getMyAppointments).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('MID-TEST0001');
  expect(container.querySelector('svg')).not.toBeNull();
});
