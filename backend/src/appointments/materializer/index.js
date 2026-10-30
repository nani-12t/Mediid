'use strict';
// PostgreSQL performs calendar/timezone conversion, UUIDv7 generation, membership
// locking and exclusion checks. Node never builds slots from its process timezone.
async function materializeAppointments(repository,days){
 if(!Number.isInteger(days)||days<7||days>90)throw new (require('../errors').AppointmentError)('APPOINTMENT_INPUT');
 return repository.materialize(days);
}
module.exports={materializeAppointments};
