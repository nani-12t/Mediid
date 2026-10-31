import React, { act } from 'react';
import { randomFillSync } from 'crypto';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import PatientAppointments from './Appointments';
import DoctorBooking from './DoctorBooking';
import ConfirmAppointment from './ConfirmAppointment';
import HospitalAppointments from '../hospital/Appointments';
import DoctorDashboard from '../doctor/Dashboard';
import { appointmentAPI, hospitalAPI } from '../../utils/api';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { io } from 'socket.io-client';

const mockNavigate = jest.fn();
jest.mock('../../components/common/PatientLayout', () => ({ children }) => <main>{children}</main>);
jest.mock('../../components/common/HospitalLayout', () => ({ children }) => <main>{children}</main>);
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: jest.fn() }) }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: 'DOC-TEST0001', token: 'synthetic-confirm-token' }),
  useLocation: () => ({ search: '' }),
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}));
jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
jest.mock('../../utils/api', () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
  hospitalAPI: { search: jest.fn() },
  appointmentAPI: {
    getConfig: jest.fn(), getAvailability: jest.fn(), create: jest.fn(), getMyAppointments: jest.fn(),
    getHospitalAppointments: jest.fn(), getPendingCount: jest.fn(), confirm: jest.fn(),
    confirmLink: jest.fn(), pay: jest.fn(), reschedule: jest.fn(), updateStatus: jest.fn(),
    cancel: jest.fn(), getDoctorAppointments: jest.fn(), checkIn: jest.fn(),
  },
}));
let container, root, appointment;
const mount = async element => { await act(async () => { root.render(element); }); };
const click = async element => { expect(element).toBeTruthy(); await act(async () => { Simulate.click(element); }); };
const change = async (element, value) => { await act(async () => { Simulate.change(element, { target: { value } }); }); };
const button = text => Array.from(container.querySelectorAll('button')).find(item => item.textContent.includes(text));

beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear(); global.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'crypto', { configurable: true, value: { getRandomValues: value => randomFillSync(value) } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appointment = {
    _id: 'synthetic-appointment', id: 'synthetic-appointment', slotId: 'original-slot', rescheduleCount: 0,
    appointmentDate: '2099-10-31', timeSlot: '14:00', status: 'pending', confirmationMode: 'MANUAL',
    appointmentChannel: 'ONLINE', billAmount: '300.00', amountPaid: '0.00', depositAmount: '150.00',
    billStatus: 'pending', paymentHoldStatus: 'HELD', holdExpiresAt: '2099-10-31T08:20:00Z',
    doctor: { id: 'doctor-id', _id: 'doctor-id', uid: 'DOC-TEST0001', firstName: 'Synthetic', lastName: 'Doctor' },
    hospital: { id: 'hospital-id', _id: 'hospital-id', name: 'Synthetic Hospital' },
    patient: { uid: 'MID-TEST0001', firstName: 'Synthetic', lastName: 'Patient' },
  };
  appointmentAPI.getConfig.mockResolvedValue({ data: { backend: 'postgres' } });
  appointmentAPI.getMyAppointments.mockImplementation(async () => ({ data: [appointment] }));
  appointmentAPI.getHospitalAppointments.mockImplementation(async () => ({ data: [appointment] }));
  appointmentAPI.getDoctorAppointments.mockImplementation(async () => ({ data: [appointment] }));
  appointmentAPI.getPendingCount.mockResolvedValue({ data: { pending: 1 } });
  appointmentAPI.confirm.mockResolvedValue({ data: appointment });
  appointmentAPI.updateStatus.mockResolvedValue({ data: appointment });
  appointmentAPI.pay.mockResolvedValue({ data: { appointment } });
  appointmentAPI.reschedule.mockResolvedValue({ data: appointment });
  appointmentAPI.getAvailability.mockResolvedValue({ data: [{ id: 'new-slot', timezone: 'Asia/Kolkata', timeSlot: '15:00', remainingCapacity: 2, channel: 'FLEXIBLE' }] });
  hospitalAPI.search.mockResolvedValue({ data: [{ ...appointment.hospital, doctors: [appointment.doctor] }] });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });

test('invalid appointment mode fails closed without loading appointments', async () => {
  appointmentAPI.getConfig.mockResolvedValue({ data: { backend: 'auto' } });
  await mount(<PatientAppointments />);
  expect(container.querySelector('[role="alert"]').textContent).toContain('temporarily unavailable');
  expect(appointmentAPI.getMyAppointments).not.toHaveBeenCalled();
});

test('PostgreSQL patient acknowledges through the authenticated appointment endpoint without a secret', async () => {
  await mount(<PatientAppointments />); await click(button('Acknowledge Appointment'));
  expect(appointmentAPI.confirm).toHaveBeenCalledWith(appointment._id);
  expect(appointmentAPI.confirmLink).not.toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('requirements still apply'));
});

test('patient sees required deposit, payment deadline and manual confirmation state', async () => {
  appointment.amountPaid = '125.28'; appointment.billStatus = 'deposit_paid';
  await mount(<PatientAppointments />);
  expect(container.textContent).toContain('Deposit due: INR 24.72');
  expect(container.textContent).toContain('Payment deadline:');
  expect(container.textContent).toContain('Waiting for hospital confirmation.');
  expect(container.textContent).toContain('Deposit paid');
  expect(container.textContent).not.toContain('Appointment fee paid.');
});

test('time-based appointment displays scheduled final confirmation', async () => {
  appointment.confirmationMode = 'TIME_BASED';
  await mount(<PatientAppointments />);
  expect(container.textContent).toContain('Final confirmation is scheduled by the provider.');
});

test('payment retry reuses its operation key while a genuine reschedule uses a new key', async () => {
  appointmentAPI.pay.mockRejectedValue(new Error('Temporary outage'));
  await mount(<PatientAppointments />); await click(button('Pay required deposit')); await click(button('Pay required deposit'));
  const first = appointmentAPI.pay.mock.calls[0][1];
  expect(first).toMatch(/^[a-f0-9]{32}$/);
  expect(appointmentAPI.pay.mock.calls[1][1]).toBe(first);
  appointment = { ...appointment, slotId: 'new-slot', rescheduleCount: 1 };
  await click(button('Refresh')); await click(button('Pay required deposit'));
  expect(appointmentAPI.pay.mock.calls[2][1]).not.toBe(first);
});

test('expired appointment is past, accurately labelled, and has no payment or acknowledgement action', async () => {
  appointment.status = 'expired'; await mount(<PatientAppointments />); await click(button('Past (1)'));
  expect(container.textContent).toContain('Expired');
  expect(button('Pay required deposit')).toBeUndefined();
  expect(button('Acknowledge Appointment')).toBeUndefined();
});

test('materialized availability drives patient booking with slotId only', async () => {
  await mount(<DoctorBooking />);
  expect(appointmentAPI.getAvailability).toHaveBeenCalledWith(expect.objectContaining({ doctorId: 'doctor-id', hospitalId: 'hospital-id' }));
  expect(api.get).not.toHaveBeenCalled();
  await click(button('15:00')); await click(button('Book Appointment'));
  expect(appointmentAPI.create).toHaveBeenCalledWith({ slotId: 'new-slot' });
  expect(container.textContent).toContain('Booking does not grant access to your medical history');
});

const newYorkSlot = {
  id: 'new-york-slot', slotStart: '2026-11-01T03:00:00.000Z', slotEnd: '2026-11-01T03:30:00.000Z',
  timezone: 'America/New_York', timeSlot: '23:00', remainingCapacity: 1, channel: 'ONLINE',
};

test('New York cross-date booking displays authoritative 23:00 and sends only slotId', async () => {
  appointmentAPI.getAvailability.mockResolvedValue({ data: [newYorkSlot] });
  await mount(<DoctorBooking />);
  const slot = button('23:00');
  expect(slot.textContent).toContain('America/New_York');
  expect(container.textContent).not.toContain('08:30');
  await click(slot); await click(button('Book Appointment'));
  expect(appointmentAPI.create).toHaveBeenCalledWith({ slotId: 'new-york-slot' });
  expect(appointmentAPI.getAvailability.mock.calls.every(([query]) => !('timezone' in query))).toBe(true);
});

const invalidProviderTimes = [
  ['missing timezone', { timezone: undefined }],
  ['invalid timezone', { timezone: 'Invalid/Timezone' }],
  ['missing timeSlot', { timeSlot: undefined }],
  ['invalid timeSlot', { timeSlot: '24:00' }],
];

test.each(invalidProviderTimes)('PostgreSQL booking excludes a slot with %s', async (_description, invalid) => {
  appointmentAPI.getAvailability.mockResolvedValue({ data: [{ ...newYorkSlot, ...invalid }] });
  await mount(<DoctorBooking />);
  expect(button('23:00')).toBeUndefined();
  expect(button('Book Appointment').disabled).toBe(true);
  expect(container.textContent).toContain('No slots available');
  expect(appointmentAPI.create).not.toHaveBeenCalled();
  expect(api.get).not.toHaveBeenCalled();
});

test('explicit legacy booking retains its supplied time without PostgreSQL timezone requirements', async () => {
  appointmentAPI.getConfig.mockResolvedValue({ data: { backend: 'legacy' } });
  api.get.mockResolvedValue({ data: { slots: [{ time: '15:00', available: true }] } });
  await mount(<DoctorBooking />);
  await click(button('15:00')); await click(button('Confirm Appointment'));
  expect(appointmentAPI.getAvailability).not.toHaveBeenCalled();
  expect(appointmentAPI.create).toHaveBeenCalledWith(expect.objectContaining({ doctor: 'DOC-TEST0001', timeSlot: '15:00' }));
  expect(appointmentAPI.create.mock.calls[0][0]).not.toHaveProperty('slotId');
});

test('booking configuration outage cannot fall back to legacy slots', async () => {
  appointmentAPI.getConfig.mockRejectedValue(new Error('Unavailable'));
  await mount(<DoctorBooking />);
  expect(container.querySelector('[role="alert"]').textContent).toContain('temporarily unavailable');
  expect(api.get).not.toHaveBeenCalled(); expect(appointmentAPI.getAvailability).not.toHaveBeenCalled();
});

test('patient reschedule resolves an existing available slot and sends no arbitrary date mutation', async () => {
  await mount(<PatientAppointments />);
  await change(container.querySelector('input[type="date"]'), '2099-11-01');
  await click(button('Find available slots'));
  expect(appointmentAPI.getAvailability).toHaveBeenCalledWith({ doctorId: 'doctor-id', hospitalId: 'hospital-id', date: '2099-11-01', channel: 'ONLINE' });
  await change(container.querySelector('select'), 'new-slot'); await click(button('Save reschedule'));
  expect(appointmentAPI.reschedule).toHaveBeenCalledWith('synthetic-appointment', 'new-slot');
});

test('New York cross-date rescheduling displays provider time and preserves slot identity', async () => {
  appointmentAPI.getAvailability.mockResolvedValue({ data: [newYorkSlot] });
  await mount(<PatientAppointments />);
  await change(container.querySelector('input[type="date"]'), '2026-10-31');
  await click(button('Find available slots'));
  const option = container.querySelector('option[value="new-york-slot"]');
  expect(option.textContent).toContain('23:00 America/New_York');
  expect(option.textContent).not.toContain('08:30');
  expect(appointmentAPI.getAvailability).toHaveBeenCalledWith({ doctorId: 'doctor-id', hospitalId: 'hospital-id', date: '2026-10-31', channel: 'ONLINE' });
  await change(container.querySelector('select'), 'new-york-slot'); await click(button('Save reschedule'));
  expect(appointmentAPI.reschedule).toHaveBeenCalledWith('synthetic-appointment', 'new-york-slot');
});

test.each(invalidProviderTimes)('PostgreSQL rescheduling excludes a slot with %s', async (_description, invalid) => {
  appointmentAPI.getAvailability.mockResolvedValue({ data: [{ ...newYorkSlot, ...invalid }] });
  await mount(<PatientAppointments />);
  await change(container.querySelector('input[type="date"]'), '2026-10-31');
  await click(button('Find available slots'));
  expect(container.querySelector('select')).toBeNull();
  expect(button('Save reschedule').disabled).toBe(true);
  expect(container.textContent).toContain('No available slots');
  expect(appointmentAPI.reschedule).not.toHaveBeenCalled();
});

test('public PostgreSQL acknowledgement does not claim final appointment confirmation', async () => {
  appointmentAPI.confirmLink.mockResolvedValue({ data: { message: 'Patient acknowledgement recorded. Payment and provider confirmation requirements still apply.', status: 'pending' } });
  await mount(<ConfirmAppointment />);
  expect(container.textContent).toContain('Appointment acknowledged');
  expect(container.textContent).not.toContain('Appointment Confirmed!');
});

test('failed public link cannot be displayed as success', async () => {
  appointmentAPI.confirmLink.mockRejectedValue({ response: { status: 404 } });
  await mount(<ConfirmAppointment />);
  expect(container.textContent).toContain('Invalid Link');
  expect(container.textContent).not.toContain('Appointment acknowledged');
});

test('legacy public confirmation still recognizes its HTML response', async () => {
  appointmentAPI.getConfig.mockResolvedValue({ data: { backend: 'legacy' } });
  appointmentAPI.confirmLink.mockResolvedValue({ data: '<h1>Appointment Confirmed</h1>' });
  await mount(<ConfirmAppointment />); expect(container.textContent).toContain('Appointment Confirmed!');
});

test('hospital PostgreSQL confirmation preserves its reserved date and time', async () => {
  await mount(<HospitalAppointments />); await click(button('Confirm'));
  expect(container.textContent).not.toContain('Confirm Date');
  expect(container.textContent).toContain('Confirm the existing reserved slot');
  await click(button('Confirm & Notify Patient'));
  expect(appointmentAPI.updateStatus).toHaveBeenCalledWith('synthetic-appointment', { status: 'confirmed', staffNotes: '' });
});

test('hospital cannot force a deposit-mode online confirmation from its action button', async () => {
  appointment.confirmationMode = 'DEPOSIT'; await mount(<HospitalAppointments />);
  expect(button('Confirm').disabled).toBe(true);
});

test('PostgreSQL doctor view loads only scheduling metadata and never opens clinical routes or socket', async () => {
  await mount(<DoctorDashboard />);
  expect(appointmentAPI.getDoctorAppointments).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Clinical records and prescribing are reserved for a later phase.');
  expect(api.get).not.toHaveBeenCalled(); expect(io).not.toHaveBeenCalled();
});


test('PostgreSQL doctor checks in before completion and cannot reschedule hospital appointments', async () => {
  appointment.status = 'confirmed'; appointment.hospital.type = 'private';
  appointmentAPI.checkIn.mockImplementation(async () => { appointment = { ...appointment, status: 'checked_in' }; return { data: appointment }; });
  await mount(<DoctorDashboard />);
  expect(button('Mark completed')).toBeUndefined();
  expect(button('Cancel appointment')).toBeUndefined();
  expect(container.querySelector('details')).toBeNull();
  await click(button('Check in'));
  expect(appointmentAPI.checkIn).toHaveBeenCalledWith(appointment._id);
  await click(button('Mark completed'));
  expect(appointmentAPI.updateStatus).toHaveBeenCalledWith(appointment._id, { status: 'completed' });
});

test('PostgreSQL hospital completes only after check-in', async () => {
  appointment.status = 'confirmed';
  appointmentAPI.checkIn.mockImplementation(async () => { appointment = { ...appointment, status: 'checked_in' }; return { data: appointment }; });
  await mount(<HospitalAppointments />);
  expect(button('Complete')).toBeUndefined();
  await click(button('Check in'));
  await click(button('Complete'));
  expect(appointmentAPI.updateStatus).toHaveBeenCalledWith(appointment._id, { status: 'completed' });
});


test.each(['confirmed', 'checked_in'])('PostgreSQL hospital can cancel a %s booking with an attributable reason', async status => {
  appointment.status = status;
  await mount(<HospitalAppointments />);
  await click(button('Cancel appointment'));
  expect(container.textContent).toContain('Cancel Appointment');
  await change(container.querySelector('textarea'), 'Synthetic provider cancellation');
  await click(button('Cancel & Notify Patient'));
  expect(appointmentAPI.updateStatus).toHaveBeenCalledWith(appointment._id, {
    status: 'cancelled', staffNotes: 'Synthetic provider cancellation', reason: 'Synthetic provider cancellation',
  });
});
