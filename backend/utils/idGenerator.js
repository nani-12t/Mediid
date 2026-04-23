/**
 * MediID — Centralized ID & QR Generation Utility
 */

const QRCode = require('qrcode');
const crypto = require('crypto');

// ─── Helpers ────────────────────────────────────────────────────────────────

const randomCode = (len = 8) =>
  crypto.randomBytes(len).toString('hex').slice(0, len).toUpperCase();

const pad = (n, size = 4) => String(n).padStart(size, '0');

// ─── ID Generators ──────────────────────────────────────────────────────────

const generatePatientUID = () => `MID-${randomCode(8)}`;
const generateHospitalUID = () => `HID-${randomCode(8)}`;

const generateDoctorUID = (hospitalUID, sequence) =>
  `${hospitalUID}-DOC-${pad(sequence)}`;

const generateStaffUID = (hospitalUID, sequence) =>
  `${hospitalUID}-STF-${pad(sequence)}`;

// ─── QR Code Generator ──────────────────────────────────────────────────────

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const generateQRCode = async (payload, type = 'entity') => {
  const qrPayload = {
    ...payload,
    type: `mediid_${type}`,
    generatedAt: new Date().toISOString(),
    verifyUrl: `${CLIENT_URL}/verify/${type}/${payload.uid}`
  };

  const colorMap = {
    patient: { dark: '#0a1628', light: '#ffffff' },
    hospital: { dark: '#0e4a4a', light: '#ffffff' },
    doctor: { dark: '#1e3a5f', light: '#ffffff' },
    staff: { dark: '#3b1f5e', light: '#ffffff' }
  };

  return QRCode.toDataURL(JSON.stringify(qrPayload), {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: colorMap[type] || colorMap.patient
  });
};

// ─── Combined: generate UID + QR in one call ────────────────────────────────

const generatePatientIDAndQR = async (extraData = {}) => {
  const uid = generatePatientUID();
  const qrCode = await generateQRCode({ uid, ...extraData }, 'patient');
  return { uid, qrCode };
};

const generateHospitalIDAndQR = async (extraData = {}) => {
  const uid = generateHospitalUID();
  const qrCode = await generateQRCode({ uid, ...extraData }, 'hospital');
  return { uid, qrCode };
};

const generateDoctorIDAndQR = async (hospitalUID, sequence, extraData = {}) => {
  const uid = generateDoctorUID(hospitalUID, sequence);
  const qrCode = await generateQRCode({ uid, hospitalUID, ...extraData }, 'doctor');
  return { uid, qrCode };
};

const generateStaffIDAndQR = async (hospitalUID, sequence, extraData = {}) => {
  const uid = generateStaffUID(hospitalUID, sequence);
  const qrCode = await generateQRCode({ uid, hospitalUID, ...extraData }, 'staff');
  return { uid, qrCode };
};

module.exports = {
  generatePatientUID,
  generateHospitalUID,
  generateDoctorUID,
  generateStaffUID,
  generateQRCode,
  generatePatientIDAndQR,
  generateHospitalIDAndQR,
  generateDoctorIDAndQR,
  generateStaffIDAndQR
};
