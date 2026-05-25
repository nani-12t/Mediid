const mongoose = require('mongoose');

/**
 * DoctorSlot — a slot schedule created by a clinic doctor.
 *
 * A slot schedule defines:
 *   - scheduleType: 'date' (one-off specific date) | 'day' (recurring weekly day)
 *   - date / day       : the specific date or day-of-week
 *   - timeSlots        : array of "HH:MM AM/PM" strings the doctor has opened
 *   - maxBookings      : max patients per individual time-slot (default 1)
 *   - isActive         : soft toggle to pause without deleting
 */
const doctorSlotSchema = new mongoose.Schema({
  doctor:   { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospital: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

  // 'date'  → one-off availability for a specific calendar date
  // 'day'   → recurring availability for a day of the week
  scheduleType: {
    type: String,
    enum: ['date', 'day'],
    required: true
  },

  // For scheduleType === 'date': ISO date string e.g. "2025-12-25"
  date: { type: String },

  // For scheduleType === 'day': one of the day names
  day: {
    type: String,
    enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  },

  // Array of individual time-slot strings, e.g. ["9:00 AM", "9:30 AM", "10:00 AM"]
  timeSlots: [{ type: String }],

  // Max patients allowed per individual time slot (1 = one patient per slot)
  maxBookings: { type: Number, default: 1 },

  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure a doctor can't create duplicate day/date schedules
doctorSlotSchema.index({ doctor: 1, scheduleType: 1, date: 1, day: 1 }, { unique: false });

module.exports = mongoose.model('DoctorSlot', doctorSlotSchema);
