import React, { useState } from 'react';
import { appointmentAPI } from '../../utils/api';

export default function AppointmentReschedule({ appointment, onChanged }) {
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState([]);
  const [slotId, setSlotId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const find = async () => {
    setBusy(true); setError(''); setSlots([]); setSlotId('');
    try {
      const { data } = await appointmentAPI.getAvailability({
        doctorId: appointment.doctor.id || appointment.doctor._id || appointment.doctor.uid,
        hospitalId: appointment.hospital.id || appointment.hospital._id || appointment.hospital.uid,
        date, channel: appointment.appointmentChannel === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
      });
      const next = (Array.isArray(data) ? data : data.slots || []).filter(slot => slot.id !== appointment.slotId);
      setSlots(next);
      if (!next.length) setError('No available slots for this date.');
    } catch (err) { setError(err.response?.data?.message || 'Availability is temporarily unavailable.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await appointmentAPI.reschedule(appointment.id || appointment._id, slotId); setSlotId(''); setSlots([]); await onChanged(); }
    catch (err) { setError(err.response?.data?.message || 'Rescheduling failed.'); }
    finally { setBusy(false); }
  };
  return <details style={{ marginTop: 12 }}>
    <summary>Reschedule appointment</summary>
    <p>Choose an available slot. Provider cutoffs, payment and confirmation requirements apply.</p>
    <label>New appointment date <input type="date" value={date} onChange={event => { setDate(event.target.value); setSlots([]); setSlotId(''); }} /></label>
    <button type="button" disabled={!date || busy} onClick={find}>Find available slots</button>
    {slots.length > 0 && <label>New appointment slot <select value={slotId} onChange={event => setSlotId(event.target.value)}>
      <option value="">Select a slot</option>
      {slots.map(slot => <option key={slot.id} value={slot.id}>{slot.timeSlot || new Date(slot.slotStart).toLocaleString('en-IN', { timeZone: slot.timezone || 'Asia/Kolkata' })} ({slot.remainingCapacity} seats available)</option>)}
    </select></label>}
    <button type="button" disabled={!slotId || busy} onClick={save}>Save reschedule</button>
    {error && <p role="alert">{error}</p>}
  </details>;
}
