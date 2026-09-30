# MEDIID Platform — Current Architecture & Technical Audit

## 1. Executive Summary

MEDIID is currently a full-stack digital health management and patient identification platform consisting of:
- **Frontend**: Single-page application built with React 18, React Router v6, Tailwind CSS & vanilla CSS utilities, Lucide icons, and Axios.
- **Backend**: Node.js (v18+) with Express 4, Mongoose 8 (MongoDB ODM), JWT authentication, Socket.IO, BullMQ / In-Memory scheduler fallback, and Twilio / Nodemailer notification services.
- **Data Stores**: Two MongoDB database instances/namespaces:
  1. Primary MongoDB (`mediid`) containing Users, Patients, Hospitals, Doctors, Staff, Appointments, ConsultationSessions, AccessLogs, Notifications, BloodRequests, and MedicineOrders.
  2. Secondary MongoDB (`mediid_marketplace`) containing Buyers, Requirements, Submissions, and Messages.

This technical audit provides a baseline analysis of all existing data models, API endpoints, role structures, authentication/authorization flows, technical debt, and security vulnerabilities prior to the PostgreSQL migration.

---

## 2. Existing Folder Structure

### Backend (`/backend`)
```
backend/
├── config/
│   └── db.js                 # Primary and Marketplace MongoDB connections & DNS overrides
├── middleware/
│   └── auth.js               # protect (JWT verification) & authorize (role verification)
├── models/
│   ├── AccessLog.js          # Audit log for doctor access to patient records
│   ├── Appointment.js        # Patient-Doctor-Hospital booking records & confirmation states
│   ├── BloodRequest.js       # Emergency blood donation requests from patients
│   ├── ConsultationSession.js# Time-bounded access token for doctor consultation window
│   ├── Doctor.js             # Doctor profile, credentials, and hospital linkage
│   ├── DoctorSlot.js         # Doctor schedule availability (day recurring or date specific)
│   ├── Hospital.js           # Hospital organization profile, counters, and references
│   ├── MedicineOrder.js      # Patient medication delivery orders
│   ├── Notification.js       # In-app, SMS, and email dispatch tracking
│   ├── Patient.js            # Core longitudinal patient record (heavily denormalized)
│   ├── Pharmacy.js           # Hospital pharmacy entity linking User to Hospital
│   ├── Staff.js              # Hospital non-physician staff (nurses, tech, receptionist)
│   ├── User.js               # Authentication credentials, role, and reset tokens
│   └── marketplace/
│       ├── Buyer.js          # Research/Pharma buyer profile
│       ├── Message.js        # Direct messaging between marketplace parties
│       ├── Requirement.js    # Data buyer requests for medical datasets
│       └── Submission.js     # Patient anonymized document submissions for compensation
├── routes/
│   ├── appointments.js       # Booking, status updates, SMS verification links
│   ├── auth.js               # Register, login, doctor activation, forgot/reset password
│   ├── bloodRequests.js      # Blood requirement posting and patient history
│   ├── doctorPortal.js       # Doctor queue, patient profile access, prescription issuance, slots
│   ├── doctors.js            # Public doctor search, hospital admin doctor recruitment
│   ├── hospitalAdmin.js      # Doctor & Pharmacy credential creation by hospital admin
│   ├── hospitals.js          # Public hospital search, top rated calculation, admin profile
│   ├── insurance.js          # Static mock insurance providers & plans
│   ├── marketplace.js        # Buyer profile, requirements, submissions, chat messaging
│   ├── medicineOrders.js     # Order placement, patient order history
│   ├── ocr.js                # Google Cloud Vision integration with fallback prescription generator
│   ├── patients.js           # Patient profile, documents, benefits, and unified billing
│   ├── pharmacyPortal.js     # Prescription lookup by patient UID and dispensing checkout
│   ├── reports.js            # Hospital-side document upload for patient records
│   └── staff.js              # Hospital staff recruitment and scanning
├── utils/
│   ├── idGenerator.js        # Algorithmic UID generator (MID, HID, hierarchical) & QR codes
│   ├── notifications.js      # Twilio SMS/WhatsApp dispatcher
│   ├── scheduler.js          # BullMQ queue or 30s in-memory polling interval
│   └── socket.js             # Socket.IO real-time event broadcasting
├── .env                      # Secrets & environmental configuration
├── package.json              # Dependency manifests
├── seed.js                   # Comprehensive demo data seeder (880+ lines)
└── server.js                 # Express application bootstrapping and routing registration
```

### Frontend (`/frontend`)
```
frontend/src/
├── components/               # Navbar, Sidebar, Modal, QRScanner, StatusBadge, etc.
├── context/
│   └── AuthContext.jsx       # Global auth state, token storage, user roles
├── pages/
│   ├── auth/                 # Login, Register, DoctorActivation, ForgotPassword
│   ├── buyer/                # BuyerDashboard, PostRequirement, ViewSubmissions
│   ├── common/               # ChatPortal (Marketplace messages)
│   ├── doctor/               # DoctorDashboard
│   ├── hospital/             # HospitalDashboard, Management, Appointments, Reports, Analytics, QR, Settings, DoctorPortal, PharmacyPortal, Marketplace, Surgeries
│   ├── patient/              # Dashboard, Profile, Appointments, SearchHospitals, Insurance, BloodBanks, History, DocumentScanner, Bills, ConfirmAppointment, Marketplace, VideoConsult, LabTests, DoctorBooking, Medicines
│   └── Landing.jsx           # Public marketing landing page
├── utils/
│   └── api.js                # Axios client with request/response interceptors and grouped API methods
└── App.jsx                   # React Router route registry and role route protectors
```

---

## 3. Existing Models Specification

### 1. `User` (`models/User.js`)
* **Purpose**: Primary identity and credentials for authentication across all portals.
* **Fields**:
  - `email`: String, sparse, unique, lowercase, trim.
  - `uid`: String, sparse, unique, trim (used by activated doctors).
  - `password`: String, required, minlength 6 (bcrypt hashed via pre-save hook).
  - `role`: String, enum: `['patient', 'hospital_admin', 'doctor', 'buyer', 'pharmacy']`, required.
  - `isActive`: Boolean, default `true`.
  - `googleId`: String.
  - `resetPasswordToken`: String (6-digit OTP).
  - `resetPasswordExpire`: Date.
  - `lastLogin`: Date.
  - `createdAt`: Date, default `Date.now`.
* **Validation & Hooks**: Pre-save password hashing with salt rounds 12; method `comparePassword(candidate)`.

### 2. `Patient` (`models/Patient.js`)
* **Purpose**: Patient demographic, emergency profile, clinical history, documents, benefits, and custom bills.
* **Fields**:
  - `user`: ObjectId, ref: `User`, required, 1:1 association.
  - `uid`: String, unique, default: `generatePatientUID()` (e.g., `MID-XXXXXXXX`).
  - `qrCode`: String (base64 data URL).
  - `firstName`: String, required.
  - `lastName`: String, required.
  - `dateOfBirth`: Date.
  - `gender`: String, enum: `['male', 'female', 'other']`.
  - `phone`: String.
  - `address`: Embedded Object (`street`, `city`, `state`, `pincode`, `country` default 'India').
  - `profilePhoto`: String (URL or base64).
  - `emergency`: Embedded Object:
    - `bloodGroup`: Enum: `['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']`.
    - `allergies`: Array of Strings.
    - `chronicConditions`: Array of Strings.
    - `currentMedications`: Array of Strings.
    - `emergencyContactName`: String.
    - `emergencyContactPhone`: String.
    - `emergencyContactRelation`: String.
    - `aadhaarNumber`: String.
    - `organDonor`: Boolean, default `false`.
  - `medicalHistory`: Array of Embedded Objects:
    - `date`: Date, `diagnosis`: String, `treatment`: String, `hospital`: String, `doctor`: String, `notes`: String.
  - `documents`: Array of Embedded Objects (`medicalDocumentSchema`):
    - `type`: Enum: `['prescription', 'scan', 'bill', 'lab_report', 'discharge_summary', 'other']`.
    - `title`: String, `fileUrl`: String, `fileName`: String, `fileSize`: Number.
    - `uploadedBy`: ObjectId, ref: `User`.
    - `hospitalName`: String, `doctorName`: String, `notes`: String, `uploadedAt`: Date.
  - `bills`: Array of Embedded Objects (`billSchema`):
    - `billId`: String, required, `title`: String, `category`: String, `hospitalName`: String, `doctorName`: String.
    - `amount`: Number, required, `status`: Enum: `['pending', 'paid']`, `date`: Date, `dueDate`: Date, `paidAt`: Date, `paymentMethod`: String.
  - `medicalBenefits`: Array of Embedded Objects (`medicalBenefitSchema`):
    - `source`: Enum: `['government', 'employer', 'personal']`, `type`: String, `schemeName`: String, `cardNumber`: String, `policyNumber`: String, `beneficiaryName`: String, `employerName`: String, `employeeId`: String, `designation`: String, `insurerName`: String, `tpaName`: String, `tpaPhone`: String, `coverageAmount`: Number, `roomRentLimit`: Number, `familyCovered`: Boolean, `familyMembers`: [String], `validFrom`: Date, `validUntil`: Date, `hospitalNetwork`: String, `claimProcess`: String, `helplineNumber`: String, `notes`: String, `isActive`: Boolean, `addedAt`: Date.
  - `governmentBenefits`: Array of Embedded Objects (Legacy fallback).
  - `insurancePolicies`: Array of Embedded Objects.
  - `trustedDoctors`: Array of ObjectIds, ref: `Doctor`.
  - `trustedHospitals`: Array of ObjectIds, ref: `Hospital`.
  - `qrActive`: Boolean, default `true`.
  - `createdAt`, `updatedAt`: Date.
* **Virtual**: `fullName` (`firstName + " " + lastName`).

### 3. `Hospital` (`models/Hospital.js`)
* **Purpose**: Hospital establishment profile, operational timings, and staffing roster.
* **Fields**:
  - `user`: ObjectId, ref: `User`, required.
  - `uid`: String, unique, default: `generateHospitalUID()` (e.g., `HID-XXXXXXXX`).
  - `qrCode`: String (base64 data URL).
  - `name`: String, required.
  - `registrationNumber`: String.
  - `type`: Enum: `['government', 'private', 'trust', 'clinic']`, default `private`.
  - `address`: Embedded Object (`street`, `city`, `state`, `pincode`, `coordinates`: `{ lat: Number, lng: Number }`).
  - `contact`: Embedded Object (`phone`, `email`, `website`, `emergencyPhone`).
  - `specialties`: Array of Strings.
  - `facilities`: Array of Strings.
  - `operatingHours`: Embedded Object (`weekdays`: `{ open, close }`, `weekends`: `{ open, close }`, `is24x7`: Boolean).
  - `totalBeds`, `icuBeds`: Number.
  - `logo`: String, `photos`: Array of Strings.
  - `rating`: Embedded Object (`average`: Number default 0, `count`: Number default 0).
  - `doctors`: Array of ObjectIds, ref: `Doctor`.
  - `staff`: Array of ObjectIds, ref: `Staff`.
  - `pharmacy`: ObjectId, ref: `Pharmacy`.
  - `doctorSequence`: Number, default 0 (atomic counter for hierarchical UIDs).
  - `staffSequence`: Number, default 0 (atomic counter for hierarchical UIDs).
  - `accreditations`: Array of Strings (e.g., `['NABH', 'JCI']`).
  - `isVerified`: Boolean, default `false`.
  - `isActive`: Boolean, default `true`.
  - `createdAt`: Date.

### 4. `Doctor` (`models/Doctor.js`)
* **Purpose**: Physician profile, hospital association, consultation schedule, and credentials.
* **Fields**:
  - `user`: ObjectId, ref: `User` (optional initially until activated).
  - `hospital`: ObjectId, ref: `Hospital`, required in current MongoDB schema.
  - `uid`: String, unique (e.g., `HID-C4E1A2B3-DOC-0001`).
  - `qrCode`: String (base64 data URL).
  - `firstName`, `lastName`: String, required.
  - `qualifications`: Array of Strings.
  - `specialization`: String, required.
  - `subSpecialties`: Array of Strings.
  - `experience`: Number, `registrationNumber`: String, `phone`: String, `email`: String, `photo`: String.
  - `consultationFee`: Number.
  - `availability`: Array of Objects (`day`: Enum of weekdays, `startTime`: String, `endTime`: String, `maxAppointments`: Number).
  - `expertise`, `languages`: Array of Strings.
  - `rating`: Embedded Object (`average`: Number default 0, `count`: Number default 0).
  - `status`: Enum: `['available', 'busy', 'on_leave', 'offline']`, default `available`.
  - `isActive`: Boolean, default `true`.
  - `createdAt`: Date.
* **Virtual**: `fullName` (`Dr. ${firstName} ${lastName}`).

### 5. `Staff` (`models/Staff.js`)
* **Purpose**: Hospital clinical support and administrative personnel.
* **Fields**:
  - `hospital`: ObjectId, ref: `Hospital`, required.
  - `uid`: String, unique (e.g., `HID-C4E1A2B3-STF-0001`).
  - `qrCode`: String (base64 data URL).
  - `firstName`, `lastName`: String, required.
  - `role`: Enum: `['nurse', 'receptionist', 'lab_technician', 'pharmacist', 'ward_boy', 'security', 'administrator', 'radiologist', 'physiotherapist', 'other']`, required.
  - `department`, `employeeId`: String.
  - `qualifications`: Array of Strings, `experience`: Number, `phone`: String, `email`: String, `photo`: String.
  - `dateOfJoining`: Date, `shift`: Enum: `['morning', 'afternoon', 'night', 'rotational']`.
  - `status`: Enum: `['active', 'on_leave', 'inactive']`, `isActive`: Boolean default `true`.
  - `createdAt`: Date.

### 6. `Appointment` (`models/Appointment.js`)
* **Purpose**: Consultation bookings connecting patient, doctor, and hospital.
* **Fields**:
  - `patient`: ObjectId, ref: `Patient`, required.
  - `doctor`: ObjectId, ref: `Doctor`, required.
  - `hospital`: ObjectId, ref: `Hospital`, required.
  - `appointmentDate`: Date, required.
  - `timeSlot`: String (e.g., `"10:30 AM"`).
  - `status`: Enum: `['pending', 'PENDING', 'reminder_sent', 'REMINDER_SENT', 'confirmed', 'CONFIRMED', 'checked_in', 'CHECKED_IN', 'completed', 'COMPLETED', 'expired', 'EXPIRED', 'cancelled', 'CANCELLED', 'rescheduled', 'RESCHEDULED']`, default `pending`.
  - `type`: Enum: `['consultation', 'follow_up', 'emergency', 'procedure', 'video', 'teleconsultation']`.
  - `bookingMethod`: Enum: `['app', 'phone', 'whatsapp', 'sms', 'walk_in']`.
  - `preferredContactMethod`: Enum: `['whatsapp', 'sms', 'phone', 'email']`.
  - `contactPhone`, `symptoms`, `notes`: String.
  - `confirmToken`: String, default: UUIDv4.
  - `confirmTokenUsed`: Boolean, default `false`.
  - `patientConfirmedAt`: Date.
  - `handledBy`: ObjectId, ref: `User`.
  - `staffNotes`: String.
  - `confirmedAt`: Date, `confirmationMethod`: String, `confirmationTime`: Date.
  - `consultationSessionId`: ObjectId, ref: `ConsultationSession`.
  - `prescription`: Embedded Object (`uploadedAt`: Date, `fileUrl`: String, `notes`: String).
  - `billAmount`: Number, `billStatus`: Enum: `['pending', 'paid', 'insurance_claimed']`.
  - `createdAt`, `updatedAt`: Date.

### 7. `DoctorSlot` (`models/DoctorSlot.js`)
* **Purpose**: Custom slot configuration created by doctors for specific calendar dates or recurring weekdays.
* **Fields**:
  - `doctor`: ObjectId, ref: `Doctor`, required.
  - `hospital`: ObjectId, ref: `Hospital`, required.
  - `scheduleType`: Enum: `['date', 'day']`, required.
  - `date`: String (ISO date string, e.g., `"2025-12-25"`).
  - `day`: Enum of weekdays.
  - `timeSlots`: Array of Strings (e.g., `["09:00 AM", "09:30 AM"]`).
  - `maxBookings`: Number, default 1.
  - `isActive`: Boolean, default `true`.
  - `createdAt`, `updatedAt`: Date.

### 8. `ConsultationSession` (`models/ConsultationSession.js`)
* **Purpose**: Ephemeral token granting doctor time-bounded read/write access to patient EHR.
* **Fields**:
  - `patient`: ObjectId, ref: `Patient`, required.
  - `doctor`: ObjectId, ref: `Doctor`, required.
  - `appointment`: ObjectId, ref: `Appointment`, required.
  - `token`: String, required.
  - `status`: Enum: `['active', 'completed', 'expired']`, default `active`.
  - `expiresAt`: Date, required.
  - `createdAt`: Date, `completedAt`: Date.

### 9. `AccessLog` (`models/AccessLog.js`)
* **Purpose**: Audit trail of every attempt to access patient records.
* **Fields**:
  - `doctor`: ObjectId, ref: `Doctor`.
  - `patient`: ObjectId, ref: `Patient`, required.
  - `appointment`: ObjectId, ref: `Appointment`.
  - `accessedBy`: ObjectId, ref: `User`, required.
  - `accessedAt`: Date, default `Date.now`.
  - `action`: String, required (e.g., `'view_patient_profile'`).
  - `status`: Enum: `['allowed', 'denied']`, required.
  - `reason`: String.
  - `sessionUsed`: ObjectId, ref: `ConsultationSession`.

### 10. `Pharmacy` (`models/Pharmacy.js`)
* **Purpose**: Hospital-affiliated dispensing pharmacy account.
* **Fields**:
  - `user`: ObjectId, ref: `User`, required.
  - `hospital`: ObjectId, ref: `Hospital`, required.
  - `name`: String, default `'Hospital Pharmacy'`.
  - `contact`: Embedded Object (`email`: String, `phone`: String).
  - `createdAt`: Date.

### 11. `BloodRequest` (`models/BloodRequest.js`)
* **Purpose**: Emergency blood replacement requests.
* **Fields**:
  - `patient`: ObjectId, ref: `Patient`, required.
  - `patientName`: String, `bloodGroup`: Enum of 8 groups, `units`: Number, `hospital`: String, `urgency`: Enum: `['normal', 'urgent', 'critical']`, `reason`: String, `requesterName`: String, `requesterPhone`: String, `requesterRelation`: String, `status`: Enum: `['pending', 'fulfilled', 'cancelled']`.
  - `createdAt`: Date.

### 12. `MedicineOrder` (`models/MedicineOrder.js`)
* **Purpose**: Direct-to-home patient medicine ordering.
* **Fields**:
  - `patient`: ObjectId, ref: `Patient`, required.
  - `items`: Array of Objects (`medicineId`, `name`, `price`, `quantity`).
  - `totalAmount`: Number, `address`: Embedded Object, `status`: Enum: `['pending', 'preparing', 'shipped', 'delivered']`, `paymentStatus`: Enum: `['pending', 'paid']`, `paymentMethod`: String, `prescriptionUrl`: String.
  - `createdAt`: Date.

### 13. `Notification` (`models/Notification.js`)
* **Purpose**: SMS/WhatsApp/In-app message transmission log.
* **Fields**:
  - `patient`: ObjectId, ref: `Patient`, required.
  - `appointment`: ObjectId, ref: `Appointment`.
  - `type`: Enum: `['in_app', 'sms', 'email']`.
  - `status`: Enum: `['pending', 'sent', 'failed']`.
  - `message`: String, `recipient`: String, `sentAt`: Date, `error`: String, `createdAt`: Date.

### 14. Marketplace Models (`models/marketplace/*`)
* **`Buyer`**: `user` (ref: `User`), `companyName`, `description`, `website`, `phone`, `address`, `createdAt`.
* **`Requirement`**: `buyer` (ref: `Buyer`), `title`, `amount` (string representation, e.g., "500 patients"), `dataNeeded`, `description`, `pricing`: `{ prescriptions, scans, xrays, labReports }`, `requiredDocs`: Array of Strings, `status`: Enum: `['active', 'closed', 'completed']`.
* **`Submission`**: `requirement` (ref: `Requirement`), `patientId` (ObjectId), `patientName`, `documents`: Array of Objects (`type`, `fileUrl`, `fileName`, `uploadedAt`), `status`: Enum: `['pending', 'accepted', 'rejected', 'paid']`, `payoutAmount`: Number.
* **`Message`**: `requirement` (ref: `Requirement`), `sender` (ObjectId), `receiver` (ObjectId), `content`: String, `isRead`: Boolean, `createdAt`: Date.

---

## 4. Existing User Roles & Authorization

### Roles
1. `patient`: General citizen/patient accessing profile, booking visits, managing documents, viewing bills, ordering medicines, and participating in data sharing.
2. `hospital_admin`: Hospital administrator managing hospital profile, recruiting doctors & staff, configuring pharmacy, viewing hospital-wide appointments and uploaded clinical reports.
3. `doctor`: Healthcare practitioner checking daily queue, viewing patient longitudinal EHR during active appointment window, configuring consultation slots, and submitting prescriptions.
4. `pharmacy`: Hospital pharmacist looking up patient prescriptions issued by doctors of the same hospital and recording dispensing and counter bills.
5. `buyer`: Research organization or pharmaceutical entity posting data requirements, evaluating patient submissions, issuing payouts, and messaging patients.

### Authentication & Authorization Flow
* **Authentication**: Token-based using JWT (`jsonwebtoken`). On login or registration, the backend signs a token containing `{ id: user._id }` with a 7-day expiration.
* **Token Transport**: Transmitted in the `Authorization: Bearer <token>` HTTP header.
* **Middleware (`protect`)**: Extracts Bearer token, verifies secret, queries `User.findById(decoded.id).select('-password')`, and attaches the document to `req.user`.
* **Middleware (`authorize(...roles)`)**: Checks if `roles.includes(req.user.role)`. Returns HTTP 403 if unauthorized.
* **Doctor Multi-Token Session Quirk**: In `frontend/src/utils/api.js`, when a user accesses `/hospital/doctor-portal`, an isolated doctor token is stored in `sessionStorage.getItem('hospital_doctor_token')` and overrides the primary token for doctor-portal requests.

---

## 5. Technical Debt, Risks & Schema Antipatterns

### 1. Massive Document Denormalization on `Patient`
* The `Patient` document embeds `medicalHistory`, `documents`, `bills`, `medicalBenefits`, `governmentBenefits`, and `insurancePolicies` directly.
* Over years of care, a single patient could have hundreds of documents, scans (some stored as base64 strings), and bills, rapidly inflating the document toward MongoDB's 16MB BSON limit.
* Updating a single document requires reading and re-saving the entire patient document, creating high write-amplification and write-conflict risks.

### 2. Base64 File Storage Directly in MongoDB
* In `marketplace.js` and `Patient.js`, files uploaded via Multer are converted directly into base64 data URLs:
  ```javascript
  fileUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  ```
* Base64 encoding inflates file size by ~33% and stores binary blobs directly in database rows.

### 3. Dual MongoDB Connection Split
* The codebase uses two separate database connections (`mediid` and `mediid_marketplace`).
* Cross-database transactions and joins are impossible in MongoDB without manual application-level hydration.

### 4. Case-Sensitivity Inconsistencies in Enum Definitions
* `Appointment.js` contains redundant case variants to avoid validation crashes:
  ```javascript
  enum: ['pending', 'PENDING', 'confirmed', 'CONFIRMED', 'completed', 'COMPLETED', ...]
  ```

### 5. Weak Purpose-of-Use and Break-Glass Controls
* Doctor access checks in `doctorPortal.js` strictly check if an active `ConsultationSession` exists for the calendar day. There is no emergency "break-glass" mechanism for trauma or ICU encounters where an appointment does not exist beforehand.
* Hospital admins currently have total bypass to read any patient document without an audit log entry being enforced in all code paths.

### 6. Logic Embedded in Express Route Handlers
* Routes directly instantiate models, perform database queries, implement business validation, send Twilio SMS, initialize crypto tokens, and write HTTP responses in 300+ line router files.
* There is no separation between routing, controllers, domain services, and repository layers.
