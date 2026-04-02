const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Mock WhatsApp/SMS service - in production, integrate with actual providers
const sendWhatsAppMessage = async (phone, message) => {
  console.log(`📱 WhatsApp to ${phone}: ${message}`);
  // In production: Use WhatsApp Business API or Twilio WhatsApp
  return true;
};

const sendSMSMessage = async (phone, message) => {
  console.log(`💬 SMS to ${phone}: ${message}`);
  // In production: Use Twilio SMS or similar service
  return true;
};

const generateAppointmentMessage = (appointment, type) => {
  const doctorName = `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`;
  const hospitalName = appointment.hospital.name;
  const date = new Date(appointment.appointmentDate).toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const time = appointment.timeSlot || 'To be confirmed';

  const messages = {
    whatsapp: {
      booking: `🗓️ *Appointment Booked - MediID*

Hello! Your appointment has been successfully booked.

📋 *Details:*
• Doctor: ${doctorName}
• Hospital: ${hospitalName}
• Date: ${date}
• Time: ${time}
• Status: Pending Confirmation

⏰ Please arrive 15 minutes early.
📞 Contact hospital: ${appointment.hospital.phone || 'Check hospital details'}

*MediID - Your Health Companion*
_Powered by System_`.trim(),

      confirmation: `✅ *Appointment Confirmed - MediID*

Great news! Your appointment has been confirmed.

📋 *Confirmed Details:*
• Doctor: ${doctorName}
• Hospital: ${hospitalName}
• Date: ${date}
• Time: ${time}
• Status: Confirmed

⏰ Please arrive 15 minutes early.
📍 Location: ${appointment.hospital.address || 'Check hospital details'}

*MediID - Your Health Companion*
_Powered by System_`.trim(),

      reminder: `⏰ *Appointment Reminder - MediID*

Your appointment is in 15 minutes!

📋 *Details:*
• Doctor: ${doctorName}
• Hospital: ${hospitalName}
• Date: ${date}
• Time: ${time}

⏰ Please arrive on time.
📞 Contact: ${appointment.contactPhone || appointment.patient.phone}

*MediID - Your Health Companion*
_Powered by System_`.trim()
    },

    sms: {
      booking: `MediID: Appointment booked with ${doctorName} at ${hospitalName} on ${date} ${time}. Status: Pending. Arrive 15min early. System generated.`,

      confirmation: `MediID: Appointment CONFIRMED with ${doctorName} at ${hospitalName} on ${date} ${time}. Arrive 15min early. System generated.`,

      reminder: `MediID: Reminder - Your appointment with ${doctorName} starts in 15 minutes at ${hospitalName}. System generated.`
    }
  };

  return messages[type][appointment.status === 'confirmed' ? 'confirmation' : appointment.status === 'pending' ? 'booking' : 'reminder'];
};

module.exports = {
  sendWhatsAppMessage,
  sendSMSMessage,
  generateAppointmentMessage
};
