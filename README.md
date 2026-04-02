# MediID — Digital Medical ID System (MERN Stack)

**India's Digital Medical ID Platform** — Every patient gets a unique QR-based Medical ID. Doctors, hospitals, pharmacies, and insurance agents can access complete health records with consent.

---

## 🏗️ Project Structure

```
mediid-web/
├── backend/              # Node.js + Express + MongoDB API
│   ├── models/           # Mongoose schemas (User, Patient, Hospital, Doctor, Appointment)
│   ├── routes/           # REST API routes
│   ├── middleware/       # JWT auth middleware
│   └── server.js         # Entry point
│
└── frontend/             # React.js SPA
    └── src/
        ├── pages/
        │   ├── auth/         # Login, Register
        │   ├── patient/      # Dashboard, Profile, Appointments, Search, Insurance
        │   └── hospital/     # Dashboard, Doctors, Appointments, Reports, Analytics, Settings
        ├── components/
        │   └── common/       # PatientLayout, HospitalLayout
        ├── context/          # AuthContext (JWT + role-based)
        └── utils/            # Axios API service
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### 1. Clone & install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
```

### 3. Run the app

```bash
# Terminal 1 — Backend
cd backend
npm run dev   # starts on http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm start     # starts on http://localhost:3000
```

---

## 🔑 Roles & Access

| Role | Email (demo) | Features |
|------|-------------|---------|
| **Patient** | any@email.com | QR code, medical history, appointments, insurance, govt benefits |
| **Hospital Admin** | hospital@email.com | Doctor management, appointment requests, reports, analytics |

---

## 📱 Key Features

### Patient Portal
- ✅ Unique Medical ID (UID) with static QR code
- ✅ Emergency info (blood group, allergies, contacts) — always accessible
- ✅ Search hospitals & doctors by specialization with ratings
- ✅ Book appointments (request system — hospital confirms)
- ✅ Upload medical documents (prescriptions, scans, bills, lab reports)
- ✅ Government health benefits (Ayushman Bharat, ESI, CGHS, state schemes)
- ✅ Health insurance marketplace with direct agent contact

### Hospital Admin Portal
- ✅ Doctor directory with full profiles (qualifications, specialization, expertise)
- ✅ Appointment request management (confirm/reject/reschedule)
- ✅ Medical reports management (X-rays, MRIs, blood tests, etc.)
- ✅ Analytics dashboard (patient trends, revenue, satisfaction)
- ✅ Hospital settings (specialties, facilities, contact, hours)

---

## 🔒 Security
- AES-256 password hashing (bcryptjs)
- JWT authentication with role-based access
- Consent-based data sharing
- Emergency info accessible without auth (QR scan)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Recharts, QRCode.react |
| Backend | Node.js, Express.js, Express Validator |
| Database | MongoDB + Mongoose |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| QR | qrcode (server-side generation) |
| Notifications | react-hot-toast |

---

## 📡 API Endpoints

```
POST   /api/auth/register        Create account (patient or hospital)
POST   /api/auth/login           Login → JWT token
GET    /api/auth/me              Get current user

GET    /api/patients/profile     Patient profile
PUT    /api/patients/profile     Update profile
GET    /api/patients/qr          Get QR code image
GET    /api/patients/scan/:uid   Public scan endpoint (emergency info)
POST   /api/patients/documents   Add document
POST   /api/patients/government-benefits  Add govt benefit card

GET    /api/hospitals            Search hospitals (public)
GET    /api/hospitals/admin/profile  Hospital admin profile

GET    /api/doctors              Search doctors (public)
POST   /api/doctors              Add doctor (hospital admin)
PUT    /api/doctors/:id          Update doctor
DELETE /api/doctors/:id          Remove doctor

POST   /api/appointments         Book appointment (patient)
GET    /api/appointments/my      Patient's appointments
GET    /api/appointments/hospital  Hospital's appointment requests
PUT    /api/appointments/:id/status  Confirm/reject/complete

GET    /api/insurance            Insurance agencies & plans
```

---

## 🔮 Phase 2 Roadmap
- [ ] Pharmacy portal (scan QR → view prescription → dispense)
- [ ] AI appointment booking agent (phone/WhatsApp/SMS via Twilio)
- [ ] Push notifications (Firebase / OneSignal)
- [ ] File upload to AWS S3
- [ ] HL7 FHIR compliance
- [ ] Trusted doctor auto-access rules
- [ ] Wearable device integration
- [ ] Government scheme integration

---

Built with ❤️ for India's healthcare future.
