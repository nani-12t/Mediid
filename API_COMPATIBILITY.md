# MEDIID API Compatibility Audit (Frozen)

## 1. Overview & Compatibility Contract

To ensure that the existing React frontend continues operating seamlessly during and after the PostgreSQL migration:
1. **Endpoint URLs must NOT change** (e.g., `/api/auth/login`, `/api/patients/profile`, `/api/appointments`).
2. **HTTP Request bodies must be accepted in their current structure**.
3. **HTTP Response shapes must preserve legacy JSON keys**, even if PostgreSQL normalizes the underlying data into separate relational tables.

---

## 2. Comprehensive Endpoint & Frontend Consumer Mapping

| Frontend Screen | HTTP Method & Path | Existing Response Shape | Target Backend Module | Underlying PostgreSQL Entities |
| :--- | :--- | :--- | :--- | :--- |
| `pages/auth/Login.jsx` | `POST /api/auth/login` | `{ token, user: { id, email, role }, profile }` | `auth` | `users`, `patients` / `doctors` / `hospitals` / `buyers` |
| `pages/auth/Register.jsx` | `POST /api/auth/register` | `{ token, user, profile }` | `auth` | `users`, `patients`, `hospitals`, `buyers` |
| `pages/auth/DoctorActivation.jsx` | `POST /api/auth/doctor-activate` | `{ token, user, profile }` | `auth` | `users`, `doctors` |
| `context/AuthContext.jsx` | `GET /api/auth/me` | `{ user, profile }` | `auth` | `users`, `patients` / `doctors` / `hospitals` |
| `pages/patient/Profile.jsx` | `GET /api/patients/profile` | Full Patient object (demographics, emergency, documents, benefits, bills) | `patients` | `patients`, `patient_benefits`, `medical_documents`, `billing_records` |
| `pages/patient/Profile.jsx` | `PUT /api/patients/profile` | Updated Patient object | `patients` | `patients` |
| `pages/patient/Dashboard.jsx` | `GET /api/patients/qr` | `{ uid, qrCode }` | `patients` | `patients` |
| `components/EmergencyCard.jsx` | `GET /api/patients/scan/:uid` | `{ uid, name, emergency }` | `patients` | `patients` |
| `pages/patient/Bills.jsx` | `GET /api/patients/bills` | Array of bills (`billId, title, category, hospitalName, doctorName, amount, status, date, dueDate`) | `billing` | `billing_records`, `appointments` |
| `pages/patient/Bills.jsx` | `POST /api/patients/bills` | Created bill object | `billing` | `billing_records` |
| `pages/patient/Bills.jsx` | `PUT /api/patients/bills/:id/pay` | `{ message, bill }` | `billing` | `billing_records`, `appointments` |
| `pages/patient/Appointments.jsx` | `GET /api/appointments/my` | Array of populated appointments | `appointments` | `appointments`, `doctors`, `hospitals`, `patients` |
| `pages/patient/Appointments.jsx` | `POST /api/appointments` | Created populated appointment | `appointments` | `appointments` |
| `pages/patient/ConfirmAppointment.jsx`| `GET /api/appointments/confirm/:token`| HTML confirmation page or `{ status }` | `appointments` | `appointments`, `encounters`, `consultation_sessions` |
| `pages/doctor/Dashboard.jsx` | `GET /api/doctor-portal/queue` | `{ doctor, appointments: [...] }` | `doctors` / `appointments` | `doctors`, `appointments`, `patients` |
| `pages/doctor/Dashboard.jsx` | `GET /api/doctor-portal/patient/:uid` | Patient object with clinical documents and history | `ehr` | `patients`, `encounters`, `clinical_notes`, `prescriptions`, `medical_documents` |
| `pages/doctor/Dashboard.jsx` | `POST /api/doctor-portal/prescription`| `{ message }` | `prescriptions` | `prescriptions`, `prescription_items`, `encounters`, `medical_documents` |
| `pages/hospital/Appointments.jsx`| `GET /api/appointments/hospital` | Array of appointments for the hospital | `appointments` | `appointments`, `doctors`, `patients` |
| `pages/hospital/Management.jsx` | `GET /api/doctors` | Array of doctors | `doctors` | `doctors`, `hospitals` |
| `pages/hospital/Management.jsx` | `POST /api/doctors` | Created doctor object with `uid` and `qrCode` | `doctors` | `doctors`, `hospitals` |
| `pages/hospital/Management.jsx` | `GET /api/staff` | Array of staff members | `hospitals` | `hospital_memberships` |
| `pages/hospital/Management.jsx` | `POST /api/staff` | Created staff member with `uid` and `qrCode` | `hospitals` | `hospital_memberships` |
| `pages/pharmacy/Dashboard.jsx` | `GET /api/pharmacy-portal/prescription/:uid` | `{ patient, prescriptions: [...] }` | `pharmacy` | `patients`, `prescriptions`, `prescription_items` |
| `pages/pharmacy/Dashboard.jsx` | `POST /api/pharmacy-portal/dispense` | `{ message, billId }` | `pharmacy` | `prescriptions`, `billing_records`, `encounters` |
| `pages/buyer/Dashboard.jsx` | `GET /api/marketplace/requirements/my`| Array of buyer requirements | `marketplace` | `research_requirements` |
| `pages/buyer/PostRequirement.jsx` | `POST /api/marketplace/requirements` | Created requirement object | `marketplace` | `research_requirements` |
| `pages/buyer/ViewSubmissions.jsx` | `GET /api/marketplace/submissions/requirement/:id` | Array of submissions | `marketplace` | `dataset_submissions`, `submission_documents` |
| `pages/common/ChatPortal.jsx` | `GET /api/marketplace/messages/conversations` | Array of enriched conversation cards | `messaging` | `marketplace_messages`, `users` |
| `pages/common/ChatPortal.jsx` | `GET /api/marketplace/messages/:userId` | Array of chat messages between two users | `messaging` | `marketplace_messages` |
| `pages/common/ChatPortal.jsx` | `POST /api/marketplace/messages` | Created message object | `messaging` | `marketplace_messages` |

---

## 3. Backward Compatibility Response Adapter Pattern

When the frontend queries `GET /api/patients/profile`, it expects the nested arrays `documents`, `bills`, `medicalBenefits`, and `medicalHistory` on the root JSON object.

### The Service-Level Presentation DTO
Rather than returning raw relational rows, the `patient.service.ts` will assemble the response using a presentation adapter:

```typescript
// Example in src/shared/mappers/patient.mapper.ts
export function toLegacyPatientDTO(
  patientRecord: any,
  documents: any[] = [],
  bills: any[] = [],
  benefits: any[] = [],
  encounters: any[] = []
) {
  return {
    _id: patientRecord.id,
    id: patientRecord.id,
    uid: patientRecord.uid,
    firstName: patientRecord.firstName,
    lastName: patientRecord.lastName,
    dateOfBirth: patientRecord.dateOfBirth,
    gender: patientRecord.gender,
    phone: patientRecord.phone,
    profilePhoto: patientRecord.profilePhotoUrl,
    address: {
      street: patientRecord.street,
      city: patientRecord.city,
      state: patientRecord.state,
      pincode: patientRecord.pincode,
      country: patientRecord.country
    },
    emergency: {
      bloodGroup: patientRecord.bloodGroup ? patientRecord.bloodGroup.replace('_POS', '+').replace('_NEG', '-') : null,
      organDonor: patientRecord.organDonor,
      emergencyContactName: patientRecord.emergencyContactName,
      emergencyContactPhone: patientRecord.emergencyContactPhone,
      emergencyContactRelation: patientRecord.emergencyContactRelation,
      allergies: patientRecord.allergies || [],
      chronicConditions: patientRecord.chronicConditions || [],
      currentMedications: patientRecord.currentMedications || []
    },
    // Hydrated from normalized tables
    documents: documents.map(d => ({
      _id: d.id,
      id: d.id,
      type: d.type,
      title: d.title,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      fileSize: d.fileSizeBytes,
      uploadedAt: d.uploadedAt,
      doctorName: d.doctorName,
      hospitalName: d.hospitalName,
      notes: d.notes
    })),
    bills: bills.map(b => ({
      billId: b.billCode || b.id,
      title: b.title,
      category: b.category,
      hospitalName: b.hospitalName,
      doctorName: b.doctorName,
      amount: Number(b.amount),
      status: b.status,
      date: b.createdAt,
      dueDate: b.dueDate
    })),
    medicalBenefits: benefits.map(b => ({
      _id: b.id,
      source: b.source,
      type: b.type,
      schemeName: b.schemeName,
      cardNumber: b.cardNumber,
      policyNumber: b.policyNumber,
      beneficiaryName: b.beneficiaryName,
      coverageAmount: Number(b.coverageAmount)
    })),
    medicalHistory: encounters.map(e => ({
      date: e.startTime,
      diagnosis: e.chiefComplaint,
      treatment: e.clinicalNotes?.[0]?.assessment || '',
      hospital: e.hospital?.name || '',
      doctor: e.doctor ? `Dr. ${e.doctor.firstName} ${e.doctor.lastName}` : '',
      notes: e.clinicalNotes?.[0]?.plan || ''
    }))
  };
}
```

This guarantees **100% backward compatibility** for all existing React views and hooks without requiring a single frontend change.

---

## 4. Appointment Domain Backward Compatibility Mappers (Phase 1.3)

To ensure existing frontend views (`Appointments.jsx`, `Management.jsx`, `doctor-portal/queue`, `ConfirmAppointment.jsx`) continue working seamlessly while backend scheduling is partitioned across `HospitalAppointment` and `PrivateClinicAppointment`:

### 4.1 Unified Appointment Presentation Adapter
The backend service maps both `HospitalAppointment` and `PrivateClinicAppointment` records to the canonical JSON response expected by React:

```typescript
// Example in src/shared/mappers/appointment.mapper.ts
export function toLegacyAppointmentDTO(
  record: any, // HospitalAppointment | PrivateClinicAppointment | Appointment
  doctor: any,
  hospital?: any,
  patient?: any
) {
  return {
    _id: record.id,
    id: record.id,
    patient: patient ? {
      _id: patient.id,
      id: patient.id,
      uid: patient.uid,
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone
    } : record.patientId,
    doctor: doctor ? {
      _id: doctor.id,
      id: doctor.id,
      uid: doctor.uid,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      specialization: doctor.specialization,
      consultationFee: Number(record.totalFee || doctor.consultationFee || 500)
    } : record.doctorId,
    hospital: hospital ? {
      _id: hospital.id,
      id: hospital.id,
      uid: hospital.uid,
      name: hospital.name,
      address: hospital.street ? `${hospital.street}, ${hospital.city}` : hospital.city
    } : (record.hospitalId || record.clinicHospitalId || null),
    appointmentDate: record.appointmentDate,
    timeSlot: record.timeSlot,
    status: record.status,
    bookingMethod: record.bookingChannel ? record.bookingChannel.toLowerCase() : (record.bookingMethod || 'app'),
    preferredContactMethod: record.preferredContactMethod || 'whatsapp',
    contactPhone: record.contactPhone,
    symptoms: record.symptoms,
    notes: record.notes,
    confirmToken: record.confirmToken,
    confirmTokenUsed: record.confirmTokenUsed,
    patientConfirmedAt: record.patientConfirmedAt,
    confirmedAt: record.confirmedAt,
    confirmationMethod: record.confirmationMethod,
    billAmount: Number(record.totalFee || record.billAmount || 500),
    billStatus: record.paymentHoldStatus === 'PAID' ? 'paid' : (record.billStatus || 'pending'),
    // Phase 1.3 augmented fields preserved for modern clients
    holdExpiresAt: record.holdExpiresAt,
    paymentHoldStatus: record.paymentHoldStatus,
    depositAmount: record.depositAmount ? Number(record.depositAmount) : undefined,
    rescheduleCount: record.rescheduleCount || 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
```

This guarantees zero regressions across existing endpoints (`/api/appointments`, `/api/appointments/my`, `/api/appointments/hospital`, `/api/doctor-portal/queue`, `/api/doctor-portal/slots/available`).
