/**
 * MediID — Centralized ID & QR Generation Utility
 *
 * ID Format Rules:
 *  Patient:  MID-XXXXXXXX          (MID = Medical ID)
 *  Hospital: HID-XXXXXXXX          (HID = Hospital ID)
 *  Doctor:   HID-XXXXXXXX-DOC-XXXX (Hospital ID prefix + DOC + sequential)
 *  Staff:    HID-XXXXXXXX-STF-XXXX (Hospital ID prefix + STF + sequential)
 *
 * This ensures every doctor/staff ID is traceable back to its hospital.
 */

const QRCode = require('qrcode');
const crypto = require('crypto');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a random uppercase alphanumeric string of given length */
const randomCode = (len = 8) =>
  crypto.randomBytes(len).toString('hex').slice(0, len).toUpperCase();

/** Zero-pad a number: 1 → "0001" */
const pad = (n, size = 4) => String(n).padStart(size, '0');

// ─── ID Generators ──────────────────────────────────────────────────────────

/**
 * Generate a unique Patient Medical ID
 * Format: MID-A3F2C1B9
 */
const generatePatientUID = () => `MID-${randomCode(8)}`;

/**
 * Generate a unique Hospital ID
 * Format: HID-C4E1A2B3
 */
const generateHospitalUID = () => `HID-${randomCode(8)}`;

/**
 * Generate a Doctor ID tied to a hospital
 * Format: HID-C4E1A2B3-DOC-0001
 * @param {string} hospitalUID  - The hospital's UID e.g. "HID-C4E1A2B3"
 * @param {number} sequence     - Sequential number of doctor in this hospital
 */
const generateDoctorUID = (hospitalUID, sequence) =>
  `${hospitalUID}-DOC-${pad(sequence)}`;

/**
 * Generate a Staff ID tied to a hospital
 * Format: HID-C4E1A2B3-STF-0001
 * @param {string} hospitalUID  - The hospital's UID e.g. "HID-C4E1A2B3"
 * @param {number} sequence     - Sequential number of staff in this hospital
 */
const generateStaffUID = (hospitalUID, sequence) =>
  `${hospitalUID}-STF-${pad(sequence)}`;

// ─── QR Code Generator ──────────────────────────────────────────────────────

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

/**
 * Generate a QR code as a base64 data URL
 * @param {object} payload  - Data to encode in QR
 * @param {string} type     - 'patient' | 'hospital' | 'doctor' | 'staff'
 * @returns {Promise<string>} base64 PNG data URL
 */
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
