// PostgreSQL availability supplies provider-local time; never infer it in the browser.
export const hasProviderSlotTime = slot => {
  if (typeof slot?.timezone !== 'string' || !slot.timezone || slot.timezone !== slot.timezone.trim()
    || typeof slot.timeSlot !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.timeSlot)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: slot.timezone });
    return true;
  } catch {
    return false;
  }
};
