const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const { sendSMSMessage } = require('./notifications');
const nodemailer = require('nodemailer');

let Queue = null;
let Worker = null;
let redisClient = null;
let useRedis = false;
const inMemoryJobs = new Map();

// Initialize BullMQ / Redis connection
const initScheduler = async () => {
  // Start periodic cleanup job (runs every 30s in all environments)
  setInterval(runCleanUpJobs, 30000);
  console.log('🧹 Periodic cleanup jobs started (running every 30 seconds)');

  const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
  const REDIS_PORT = process.env.REDIS_PORT || 6379;

  try {
    const IORedis = require('ioredis');
    redisClient = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
      lazyConnect: true,          // don't auto-connect; we'll call .connect() once
      retryStrategy: () => null,  // disable automatic retry — fail fast
      enableOfflineQueue: false
    });

    let redisResolved = false;

    redisClient.on('error', (err) => {
      if (!redisResolved) {
        redisResolved = true;
        console.warn('⚠️ Redis not available — using In-Memory Scheduler:', err.message);
        disableRedis();
      }
    });

    redisClient.on('connect', () => {
      if (!redisResolved) {
        redisResolved = true;
        console.log('✅ Connected to Redis for BullMQ!');
        setupBullMQ();
      }
    });

    // Trigger the single connection attempt
    redisClient.connect().catch(() => {}); // errors handled by 'error' listener
  } catch (err) {
    console.warn('⚠️ BullMQ/ioredis init failed. Falling back to In-Memory Scheduler...');
    disableRedis();
  }
};

const disableRedis = () => {
  useRedis = false;
  // Start in-memory periodic check every 30 seconds
  setInterval(runInMemoryPeriodicCheck, 30000);
  console.log('🕒 In-memory periodic check started (polling every 30 seconds)');
};

const setupBullMQ = () => {
  useRedis = true;
  const { Queue: BullQueue, Worker: BullWorker } = require('bullmq');

  Queue = new BullQueue('appointment-reminders', { connection: redisClient });

  Worker = new BullWorker('appointment-reminders', async (job) => {
    const { appointmentId } = job.data;
    await processReminder(appointmentId);
  }, { connection: redisClient });

  console.log('🚀 BullMQ Queue and Worker initialized!');
};

// Process the actual reminder logic
const processReminder = async (appointmentId) => {
  try {
    const apt = await Appointment.findById(appointmentId)
      .populate('patient')
      .populate('doctor')
      .populate('hospital');

    if (!apt) return;
    
    // Only send reminders for pending appointments
    const curStatus = String(apt.status || 'pending').toLowerCase();
    if (curStatus !== 'pending') {
      return;
    }

    console.log(`⏰ Processing reminder for appointment: ${appointmentId} (Patient: ${apt.patient?.firstName})`);

    // Update status
    apt.status = 'reminder_sent';
    apt.updatedAt = new Date();
    await apt.save();

    const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
    const confirmUrl = `${clientUrl}/confirm-appointment/${apt.confirmToken}`;

    const smsBody = `MediID: Dear ${apt.patient?.firstName || 'Patient'}, please confirm your appointment with Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName} at ${apt.hospital?.name || 'the clinic'} scheduled for ${apt.timeSlot}. Click here to confirm: ${confirmUrl}`;
    
    const emailBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Confirm Your Appointment</h2>
        <p style="color: #475569; font-size: 16px; line-height: 1.5;">Dear ${apt.patient?.firstName || 'Patient'},</p>
        <p style="color: #475569; font-size: 16px; line-height: 1.5;">You have an upcoming appointment with <strong>Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName}</strong> at <strong>${apt.hospital?.name || 'Clinic'}</strong>.</p>
        <p style="color: #475569; font-size: 16px;"><strong>Scheduled Time:</strong> ${apt.timeSlot}</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${confirmUrl}" style="background-color: #00b4a0; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Confirm Appointment</a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">MediID — Secure Digital Medical ID System</p>
      </div>
    `;

    // 1. Create In-App Notification
    await Notification.create({
      patient: apt.patient._id,
      appointment: apt._id,
      type: 'in_app',
      status: 'sent',
      message: `Appointment reminder: Click here to confirm your appointment with Dr. ${apt.doctor?.firstName} ${apt.doctor?.lastName} at ${apt.timeSlot}.`,
      recipient: apt.patient.user ? apt.patient.user.toString() : apt.patient._id.toString(),
      sentAt: new Date()
    });

    // 2. Send SMS via Twilio simulator
    const phone = apt.contactPhone || apt.patient?.phone;
    if (phone) {
      const smsSuccess = await sendSMSMessage(phone, smsBody);
      await Notification.create({
        patient: apt.patient._id,
        appointment: apt._id,
        type: 'sms',
        status: smsSuccess ? 'sent' : 'failed',
        message: smsBody,
        recipient: phone,
        sentAt: new Date()
      });
    }

    // 3. Send Email
    const email = apt.patient?.email;
    if (email) {
      const emailSuccess = await sendEmail(email, 'Confirm Your Appointment', emailBody);
      await Notification.create({
        patient: apt.patient._id,
        appointment: apt._id,
        type: 'email',
        status: emailSuccess ? 'sent' : 'failed',
        message: smsBody,
        recipient: email,
        sentAt: new Date()
      });
    }

    // Notify doctor portal of reminder sent (realtime)
    const { getIo } = require('./socket');
    const io = getIo();
    if (io) {
      io.emit('doctor_notification', {
        type: 'reminder_sent',
        appointmentId: apt._id,
        message: `Reminder sent to patient ${apt.patient?.firstName} ${apt.patient?.lastName}`
      });
    }

  } catch (err) {
    console.error(`❌ Process reminder failed for ${appointmentId}:`, err);
  }
};

// Send Email helper
const sendEmail = async (email, subject, html) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@mediid.com';

  if (!host || !user || !pass) {
    console.log(`\n📧 [EMAIL DEV]`);
    console.log(`   To      : ${email}`);
    console.log(`   Subject : ${subject}`);
    console.log(`   Body    : (HTML Content printed below)\n${html.replace(/<[^>]*>/g, '').trim()}\n`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: port == 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: `"MediID" <${from}>`,
      to: email,
      subject,
      html
    });
    return true;
  } catch (err) {
    console.error(`❌ Email failed to ${email}:`, err.message);
    return false;
  }
};

// Helper function to combine appointmentDate and timeSlot
function getAppointmentStartDateTime(date, timeSlotStr) {
  if (!date || !timeSlotStr) return null;
  const match = String(timeSlotStr).trim().match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hours < 12) {
    hours += 12;
  }
  if (ampm === 'AM' && hours === 12) {
    hours = 0;
  }
  
  const apptTime = new Date(date);
  apptTime.setHours(hours, minutes, 0, 0);
  return apptTime;
}

// Schedule reminder (can be called upon appointment creation)
const scheduleAppointmentReminder = async (appointment) => {
  const apptTime = getAppointmentStartDateTime(appointment.appointmentDate, appointment.timeSlot);
  if (!apptTime) return;

  const reminderTime = new Date(apptTime.getTime() - 60 * 60 * 1000); // 1 hour before
  const now = new Date();
  const delayMs = reminderTime.getTime() - now.getTime();

  console.log(`📅 Scheduling reminder for Appt ${appointment._id} at ${reminderTime} (Delay: ${delayMs}ms)`);

  if (useRedis && Queue) {
    // If Redis is active, add to BullMQ with a delay
    await Queue.add(`reminder-${appointment._id}`, { appointmentId: appointment._id }, {
      delay: delayMs > 0 ? delayMs : 0,
      jobId: appointment._id.toString()
    });
  } else {
    // If in-memory, cancel any existing timeout for this appointment first
    if (inMemoryJobs.has(appointment._id.toString())) {
      clearTimeout(inMemoryJobs.get(appointment._id.toString()));
    }

    const timeoutId = setTimeout(async () => {
      inMemoryJobs.delete(appointment._id.toString());
      await processReminder(appointment._id);
    }, delayMs > 0 ? delayMs : 0);

    inMemoryJobs.set(appointment._id.toString(), timeoutId);
  }
};

// Periodic database backup poll (safety net for in-memory scheduler)
const runInMemoryPeriodicCheck = async () => {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find pending appointments scheduled within the next hour
    const pendingAppointments = await Appointment.find({
      status: { $in: ['pending', 'PENDING'] },
      appointmentDate: { $lte: oneHourFromNow }
    });

    for (const apt of pendingAppointments) {
      // Check if we should trigger immediately
      const apptTime = getAppointmentStartDateTime(apt.appointmentDate, apt.timeSlot);
      if (apptTime) {
        const reminderTime = new Date(apptTime.getTime() - 60 * 60 * 1000);
        if (now >= reminderTime) {
          await processReminder(apt._id);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error running periodic check:', err);
  }
};

// Periodic database cleanup job to auto-expire appointments and sessions
const runCleanUpJobs = async () => {
  try {
    const now = new Date();

    // 1. Expire unconfirmed appointments whose start time + 1 hour has passed
    const unconfirmed = await Appointment.find({
      status: { $in: ['pending', 'PENDING', 'reminder_sent', 'REMINDER_SENT'] }
    });

    for (const apt of unconfirmed) {
      const apptTime = getAppointmentStartDateTime(apt.appointmentDate, apt.timeSlot);
      if (apptTime) {
        const expiryThreshold = new Date(apptTime.getTime() + 60 * 60 * 1000); // 1 hour after start
        if (now > expiryThreshold) {
          apt.status = 'expired';
          apt.updatedAt = now;
          await apt.save();
          console.log(`❌ Appointment ${apt._id} expired (unconfirmed)`);
        }
      }
    }

    // 2. Expire active ConsultationSessions whose expiresAt has passed
    const ConsultationSession = require('../models/ConsultationSession');
    const expiredSessions = await ConsultationSession.find({
      status: 'active',
      expiresAt: { $lte: now }
    });

    for (const sess of expiredSessions) {
      sess.status = 'expired';
      await sess.save();
      console.log(`🔒 ConsultationSession ${sess._id} expired`);

      // Also update the corresponding appointment status if it is not completed
      await Appointment.findByIdAndUpdate(sess.appointment, {
        status: 'expired',
        updatedAt: now
      });
    }

  } catch (err) {
    console.error('❌ Error running cleanup jobs:', err);
  }
};

module.exports = {
  initScheduler,
  scheduleAppointmentReminder,
  processReminder,
  getAppointmentStartDateTime
};
