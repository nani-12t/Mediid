/**
 * MediID — Centralized ID & QR Generation Utility
 *
 * ID Format Rules:
 *  Patient:  MID-XXXXXXXX          (MID = Medical ID)
 *  Hospital: HID-XXXXXXXX          (HID = Hospital ID)
 *  
 * Hierarchy:
 *  Senior Doctor:  HID-XXXXXXXX-SRDOC-XXXX
 *  Junior Doctor:  HID-XXXXXXXX-JRDOC-XXXX
 *  Nurse:          HID-XXXXXXXX-NUR-XXXX
 *  Lab Technician: HID-XXXXXXXX-LAB-XXXX
 *  Pharmacist:     HID-XXXXXXXX-PHR-XXXX
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

/**
 * Generate a hierarchical ID tied to a hospital
 * @param {string} hospitalUID - e.g. "HID-C4E1A2B3"
 * @param {string} roleCode    - e.g. "SRDOC", "JRDOC", "NUR", "LAB", "PHR"
 * @param {number} sequence    - Sequential number
 */
const generateHierarchicalUID = (hospitalUID, roleCode, sequence) => 
  `${hospitalUID}-${roleCode}-${pad(sequence)}`;

// Backward compatibility or specialized helpers
const generateDoctorUID = (hospitalUID, sequence, type = 'SRDOC') => {
  const tStr = String(type || 'SRDOC');
  const roleCode = tStr.includes('Senior') ? 'SRDOC' : 'JRDOC';
  return generateHierarchicalUID(hospitalUID, roleCode, sequence);
};

const generateStaffUID = (hospitalUID, sequence, role = 'nurse') => {
  const roleMap = {
    nurse: 'NUR',
    lab_technician: 'LAB',
    pharmacist: 'PHR',
    receptionist: 'REC',
    radiologist: 'RAD',
    administrator: 'ADM'
  };
  const roleCode = roleMap[role] || 'STF';
  return generateHierarchicalUID(hospitalUID, roleCode, sequence);
};

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
    patient:  { dark: '#0a1628', light: '#ffffff' },
    hospital: { dark: '#0e4a4a', light: '#ffffff' },
    doctor:   { dark: '#1e3a5f', light: '#ffffff' },
    staff:    { dark: '#3b1f5e', light: '#ffffff' }
  };

  return QRCode.toDataURL(JSON.stringify(qrPayload), {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: colorMap[type] || colorMap.patient
  });
};

// ─── Combined: generate UID + QR ────────────────────────────────────────────

const generatePatientIDAndQR = async (extraData = {}) => {
  const uid = generatePatientUID();
  const qrCode = await generateQRCode({ uid, ...extraData }, 'patient');
  return { uid, qrCode };
};

const generateHospitalIDAndQR = async (registrationNumberOrExtraData = {}, extraData = {}) => {
  let reg = '';
  let finalExtra = {};
  if (typeof registrationNumberOrExtraData === 'string') {
    reg = registrationNumberOrExtraData;
    finalExtra = extraData;
  } else {
    finalExtra = registrationNumberOrExtraData || {};
    reg = finalExtra.registrationNumber || '';
  }
  const cleanReg = reg ? String(reg).trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : randomCode(8);
  const uid = `HID-${cleanReg}`;
  const qrCode = await generateQRCode({ uid, ...finalExtra }, 'hospital');
  return { uid, qrCode };
};

const generateDoctorIDAndQR = async (hospitalUID, sequence, doctorType, extraData = {}) => {
  const uid = generateDoctorUID(hospitalUID, sequence, doctorType);
  const qrCode = await generateQRCode({ uid, hospitalUID, ...extraData }, 'doctor');
  return { uid, qrCode };
};

const generateStaffIDAndQR = async (hospitalUID, sequence, role, extraData = {}) => {
  const uid = generateStaffUID(hospitalUID, sequence, role);
  const qrCode = await generateQRCode({ uid, hospitalUID, ...extraData }, 'staff');
  return { uid, qrCode };
};

module.exports = {
  generatePatientUID,
  generateHospitalUID,
  generateDoctorUID,
  generateStaffUID,
  generateHierarchicalUID,
  generateQRCode,
  generatePatientIDAndQR,
  generateHospitalIDAndQR,
  generateDoctorIDAndQR,
  generateStaffIDAndQR
};
