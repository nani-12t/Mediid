import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import api, { doctorAPI, staffAPI, authAPI, hospitalAPI } from '../../utils/api';
import HospitalManagement from './Management';
import HospitalSettings from './Settings';

jest.mock('../../components/common/HospitalLayout', () => ({ children }) => <main>{children}</main>);
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('react-hot-toast', () => ({
  __esModule: true, default: { success: jest.fn(), error: jest.fn() }
}));
jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  doctorAPI: { search: jest.fn(), updateDoctor: jest.fn(), addDoctor: jest.fn(), deleteDoctor: jest.fn() },
  staffAPI: { search: jest.fn(), createStaff: jest.fn(), deleteStaff: jest.fn() },
  authAPI: { me: jest.fn() },
  hospitalAPI: { getAdminProfile: jest.fn(), updateProfile: jest.fn() }
}));

const hospital = {
  _id: '507f1f77bcf86cd799439011', internalId: 'hospital-internal-fixture',
  uid: 'HID-A123B456', name: 'Synthetic Hospital', type: 'private',
  address: { street: 'Test Road', city: 'Pune', state: 'MH', pincode: '411001', country: 'India', coordinates: { lat: 18, lng: 73 } },
  contact: { phone: '0000000000', email: 'hospital@example.test', website: '', emergencyPhone: '' },
  specialties: ['Cardiology'], facilities: ['ICU'], totalBeds: 70, icuBeds: 9,
  operatingHours: { weekdays: { open: '08:00', close: '20:00' }, weekends: { open: '09:00', close: '17:00' }, is24x7: false },
  user: 'owner-fixture', doctorSequence: 99, rating: { average: 4.9, count: 100 },
  logo: '', photos: [], accreditations: ['Legacy accreditation']
};
const publicDoctor = {
  _id: '507f1f77bcf86cd799439012', internalId: 'doctor-internal-fixture',
  uid: 'HID-A123B456-DOC-0001', firstName: 'Synthetic', lastName: 'Doctor', specialization: 'Cardiology',
  qualifications: ['MBBS'], expertise: ['Cardiology'], languages: ['English'],
  experience: 4, consultationFee: 500, rating: { average: 4.8, count: 40 },
  dutyStatus: 'Available', availability: [{ day: 'Monday' }],
  isPrivatePractice: true, user: 'doctor-user-fixture', qrCode: 'data:image/png;base64,c3ludGhldGlj'
};
let container;
let root;
const mount = async element => { await act(async () => { root.render(element); }); };
const click = async element => { await act(async () => { Simulate.click(element); }); };
const submit = async () => { await act(async () => { Simulate.submit(container.querySelector('form')); }); };
const button = text => Array.from(container.querySelectorAll('button')).find(item => item.textContent.trim() === text);
const change = async (element, value) => {
  await act(async () => { Simulate.change(element, { target: { value } }); });
};

beforeEach(() => {
  jest.clearAllMocks();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(async path => {
    if (path === '/organizations/config') return { data: { backend: 'postgres' } };
    if (path === '/doctors/' + publicDoctor._id + '/manage') {
      return { data: { ...publicDoctor, phone: '1111111111', email: 'doctor@example.test', registrationNumber: 'synthetic-registration' } };
    }
    throw new Error('Unexpected API path');
  });
  hospitalAPI.getAdminProfile.mockResolvedValue({ data: hospital });
  hospitalAPI.updateProfile.mockResolvedValue({ data: hospital });
  authAPI.me.mockResolvedValue({ data: { profile: hospital } });
  doctorAPI.search.mockResolvedValue({ data: [publicDoctor] });
  doctorAPI.updateDoctor.mockResolvedValue({ data: publicDoctor });
  doctorAPI.addDoctor.mockResolvedValue({ data: publicDoctor });
  staffAPI.search.mockResolvedValue({ data: [] });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  localStorage.clear();
  sessionStorage.clear();
});

test('Postgres management scopes its roster and reads authorized private details before an immutable-safe update', async () => {
  await mount(<HospitalManagement />);
  expect(doctorAPI.search).toHaveBeenCalledWith({ hospital: hospital._id });
  await click(container.querySelector('[title="Edit Details"]'));
  expect(api.get).toHaveBeenCalledWith('/doctors/' + publicDoctor._id + '/manage');
  await submit();
  const [id, payload] = doctorAPI.updateDoctor.mock.calls[0];
  expect(id).toBe(publicDoctor._id);
  expect(payload).toEqual({
    firstName: 'Synthetic', lastName: 'Doctor', specialization: 'Cardiology',
    phone: '1111111111', email: 'doctor@example.test',
    qualifications: ['MBBS'], expertise: ['Cardiology'], languages: ['English'],
    experience: 4, consultationFee: 500
  });
  expect(api.post).not.toHaveBeenCalled();
});

test('recruitment displays the one-time credential only in a dismissible admin dialog', async () => {
  const secret = 'synthetic-one-time-activation-fixture';
  doctorAPI.addDoctor.mockResolvedValue({ data: { ...publicDoctor, activation: { secret, expiresAt: '2027-01-01T00:00:00.000Z' } } });
  await mount(<HospitalManagement />);
  await click(button('Add Doctor'));
  await change(container.querySelector('[placeholder="First Name"]'), 'New');
  await change(container.querySelector('[placeholder="Last Name"]'), 'Doctor');
  await change(container.querySelector('form select'), 'Cardiology');
  await submit();
  expect(doctorAPI.addDoctor).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  expect(container.querySelector('#doctor-activation-token').value).toBe(secret);
  expect(container.textContent).toContain('/doctor-activate');
  expect(JSON.stringify(localStorage)).not.toContain(secret);
  expect(JSON.stringify(sessionStorage)).not.toContain(secret);
  expect(window.location.href).not.toContain(secret);
  expect(api.post).not.toHaveBeenCalled();
  await click(button('I have securely shared these details'));
  expect(container.querySelector('#doctor-activation-token')).toBeNull();
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});

test.each([
  ['management', <HospitalManagement />, 'Add Doctor'],
  ['settings', <HospitalSettings />, 'Save Changes']
])('unknown organization configuration disables %s mutations without a legacy fallback', async (name, page, action) => {
  api.get.mockResolvedValue({ data: { backend: 'unknown' } });
  await mount(page);
  expect(button(action).disabled).toBe(true);
  expect(hospitalAPI.getAdminProfile).not.toHaveBeenCalled();
  expect(authAPI.me).not.toHaveBeenCalled();
  expect(doctorAPI.search).not.toHaveBeenCalled();
  expect(doctorAPI.addDoctor).not.toHaveBeenCalled();
  expect(hospitalAPI.updateProfile).not.toHaveBeenCalled();
});

test('Postgres settings saves normalized mutable fields without identity, ratings or legacy operational fields', async () => {
  await mount(<HospitalSettings />);
  await click(button('Save Changes'));
  expect(hospitalAPI.updateProfile).toHaveBeenCalledWith({
    name: hospital.name,
    address: { street: 'Test Road', city: 'Pune', state: 'MH', pincode: '411001', country: 'India' },
    contact: hospital.contact, specialties: hospital.specialties, facilities: hospital.facilities,
    operatingHours: hospital.operatingHours, totalBeds: 70, icuBeds: 9, logo: '', photos: []
  });
  expect(container.querySelector('select').disabled).toBe(true);
  expect(Array.from(container.querySelectorAll('fieldset')).some(fieldset => fieldset.disabled)).toBe(true);
});

test('explicit legacy settings keeps its original profile and operational payload', async () => {
  api.get.mockResolvedValue({ data: { backend: 'legacy' } });
  await mount(<HospitalSettings />);
  await click(button('Save Changes'));
  expect(hospitalAPI.updateProfile.mock.calls[0][0]).toMatchObject({
    _id: hospital._id, type: 'private', rating: hospital.rating,
    accreditations: ['Legacy accreditation'], doctorSequence: 99,
    operationTheaters: { total: '' }, departments: { cardiology: false }
  });
  expect(container.querySelector('select').disabled).toBe(false);
});

test('doctor QR card keeps the public UID and returned QR image available', async () => {
  await mount(<HospitalManagement />);
  await click(container.querySelector('[title="View ID Card"]'));
  expect(container.textContent).toContain(publicDoctor.uid);
  expect(container.querySelector('img[alt="Doctor QR"]').getAttribute('src')).toBe(publicDoctor.qrCode);
});