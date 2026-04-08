/**
 * MediID — Notification Utility
 * ================================
 * Twilio SMS + WhatsApp with patient self-confirm link.
 *
 * Setup (backend/.env):
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_PHONE_NUMBER=+91xxxxxxxxxx
 *   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
 *   CLIENT_URL=http://localhost:3000
 *
 * Then: cd backend && npm install twilio
 */

let twilioClient = null;

const getTwilio = () => {
  if (twilioClient) return twilioClient;
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || sid.startsWith('AC_your') || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
    return null;
  }
  try {
    twilioClient = require('twilio')(sid, token);
    return twilioClient;
  } catch {
    console.warn('⚠️  twilio not installed → run: cd backend && npm install twilio');
    return null;
  }
};

/* ── phone normaliser ── */
const normalisePhone = (phone) => {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10)                        return `+91${d}`;
  if (d.length === 12 && d.startsWith('91'))  return `+${d}`;
  if (String(phone).startsWith('+'))          return phone;
  return `+${d}`;
};

/* ── raw send ── */
const sendSMS = async (to, body) => {
  if (!to) return false;
  const client = getTwilio();
  if (!client) {
    console.log(`\n📱 [SMS DEV]\n   To  : ${to}\n   Msg : ${body}\n`);
    return true;
  }
  try {
    const m = await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to });
    console.log(`✅ SMS → ${to}  SID:${m.sid}`);
    return true;
  } catch (e) {
    console.error(`❌ SMS failed → ${to}: ${e.message}`);
    return false;
  }
};

const sendWhatsApp = async (to, body) => {
  if (!to) return false;
  const client = getTwilio();
  const from   = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  if (!client) {
    console.log(`\n💬 [WA DEV]\n   To  : whatsapp:${to}\n   Msg : ${body}\n`);
    return true;
  }
  try {
    const m = await client.messages.create({ body, from, to: `whatsapp:${to}` });
    console.log(`✅ WhatsApp → ${to}  SID:${m.sid}`);
    return true;
  } catch (e) {
    console.error(`❌ WhatsApp failed → ${to}: ${e.message}`);
    return false;
  }
};

/* ════════════════════════════════════════════
   MESSAGE TEMPLATES
   apt = populated Appointment document
   confirmUrl = full URL patient taps to confirm
════════════════════════════════════════════ */

const buildBookedSMS = (apt, confirmUrl) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const dept      = apt.doctor?.specialization || 'OP Consulting';
  const hosp      = apt.hospital?.name || 'the hospital';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time      = apt.timeSlot || 'Time TBD';
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';

  return [
    `MediID: Dear ${patient},`,
    ``,
    `We have received your appointment request for OP Consulting with ${doc} (${dept}) at ${hosp}.`,
    ``,
    `Date: ${date}`,
    `Time: ${time}`,
    `Status: Awaiting your confirmation`,
    ``,
    `Please CONFIRM your appointment by tapping the link below:`,
    `${confirmUrl}`,
    ``,
    `If you did not book this, call: ${hospPhone}`,
    `- MediID Health`,
  ].join('\n');
};

const buildBookedWhatsApp = (apt, confirmUrl) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const dept      = apt.doctor?.specialization || 'OP Consulting';
  const hosp      = apt.hospital?.name || 'the hospital';
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time      = apt.timeSlot || 'Time to be confirmed';
  const pid       = apt.patient?.uid || '';

  return `🏥 *MediID – Appointment Request Received*

Dear ${patient} 👋

We have received your appointment request for *OP Consulting*.

📋 *Appointment Details:*
👨‍⚕️ Doctor: *${doc}*
🩺 Department: *${dept}*
🏥 Hospital: *${hosp}*
📅 Date: ${date}
⏰ Time: ${time}
🆔 Patient ID: ${pid}
📌 Status: *Awaiting Your Confirmation*

✅ *Please confirm your appointment by tapping below:*
${confirmUrl}

_This link is valid for 48 hours. Tap once to confirm._

❓ Questions? Call: ${hospPhone}

_MediID – Your Digital Health Companion_`;
};

const buildConfirmedSMS = (apt) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const dept      = apt.doctor?.specialization || 'OP Consulting';
  const hosp      = apt.hospital?.name || 'the hospital';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time      = apt.timeSlot || 'Time TBD';
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';

  return [
    `MediID: ✅ CONFIRMED!`,
    ``,
    `Dear ${patient}, your appointment with ${doc} (${dept}) at ${hosp} is now CONFIRMED.`,
    ``,
    `Date: ${date} at ${time}`,
    ``,
    `Please arrive 15 min early. Carry Aadhaar + medical reports.`,
    `Hospital: ${hospPhone}`,
    `- MediID Health`,
  ].join('\n');
};

const buildConfirmedWhatsApp = (apt) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const dept      = apt.doctor?.specialization || 'OP Consulting';
  const hosp      = apt.hospital?.name || 'the hospital';
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time      = apt.timeSlot || 'Confirmed time';
  const pid       = apt.patient?.uid || '';

  return `✅ *MediID – Appointment CONFIRMED!*

Dear ${patient}, great news!

Your appointment has been *CONFIRMED* ✅

📋 *Confirmed Details:*
👨‍⚕️ Doctor: *${doc}*
🩺 Department: *${dept}*
🏥 Hospital: *${hosp}*
📅 Date: *${date}*
⏰ Time: *${time}*
🆔 Patient ID: ${pid}

📌 *Please arrive 15 minutes early*
🪪 Carry: Aadhaar card + previous medical reports
📞 Hospital: ${hospPhone}

_MediID – Your Digital Health Companion_`;
};

const buildCancelledSMS = (apt) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const hosp      = apt.hospital?.name || 'the hospital';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';

  return [
    `MediID: Dear ${patient},`,
    `Your appointment with ${doc} at ${hosp} on ${date} has been CANCELLED.`,
    `To rebook, open MediID or call: ${hospPhone}`,
    `- MediID Health`,
  ].join('\n');
};

const buildCancelledWhatsApp = (apt) => {
  const patient   = apt.patient?.firstName || 'Patient';
  const doc       = `Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}`;
  const hosp      = apt.hospital?.name || 'the hospital';
  const hospPhone = apt.hospital?.contact?.phone || apt.hospital?.contact?.emergencyPhone || '';
  const date      = new Date(apt.appointmentDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return `❌ *MediID – Appointment Cancelled*

Dear ${patient},

Your appointment with *${doc}* at *${hosp}* on ${date} has been *cancelled*.

To rebook, open the MediID app or call: ${hospPhone}

_MediID – Your Digital Health Companion_`;
};

/* ════════════════════════════════════════════
   MAIN DISPATCHER
════════════════════════════════════════════ */

/**
 * sendAppointmentNotification
 *
 * @param {Object} apt         — fully populated Appointment document
 * @param {'booked'|'confirmed'|'cancelled'} type
 * @param {string} [overridePhone]
 * @param {string} [confirmToken]  — needed only for 'booked', to build confirm URL
 */
const sendAppointmentNotification = async (apt, type, overridePhone = null, confirmToken = null) => {
  const rawPhone = overridePhone || apt.contactPhone || apt.patient?.phone || null;
  const phone    = normalisePhone(rawPhone);

  if (!phone) {
    console.warn(`⚠️  Notification(${type}) skipped — no phone number`);
    return;
  }

  const clientUrl   = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
  const confirmUrl  = confirmToken
    ? `${clientUrl}/confirm-appointment/${confirmToken}`
    : `${clientUrl}/appointments`;

  let sms, wa;

  if (type === 'booked') {
    sms = buildBookedSMS(apt, confirmUrl);
    wa  = buildBookedWhatsApp(apt, confirmUrl);
  } else if (type === 'confirmed') {
    sms = buildConfirmedSMS(apt);
    wa  = buildConfirmedWhatsApp(apt);
  } else if (type === 'cancelled') {
    sms = buildCancelledSMS(apt);
    wa  = buildCancelledWhatsApp(apt);
  } else {
    return;
  }

  await sendSMS(phone, sms);
  await sendWhatsApp(phone, wa);
};

/* ── Legacy compat ── */
const sendSMSMessage      = sendSMS;
const sendWhatsAppMessage = sendWhatsApp;
const generateAppointmentMessage = (apt, channel = 'sms') => {
  const type = apt.status === 'confirmed' ? 'confirmed' : apt.status === 'cancelled' ? 'cancelled' : 'booked';
  const url  = `${(process.env.CLIENT_URL || 'http://localhost:3000')}/appointments`;
  return channel === 'whatsapp' ? buildBookedWhatsApp(apt, url) : buildBookedSMS(apt, url);
};

module.exports = {
  sendAppointmentNotification,
  sendSMSMessage,
  sendWhatsAppMessage,
  generateAppointmentMessage,
  normalisePhone,
};