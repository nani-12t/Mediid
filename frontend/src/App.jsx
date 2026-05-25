import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import DoctorActivation from './pages/auth/DoctorActivation';
import ForgotPassword from './pages/auth/ForgotPassword';

import PatientDashboard from './pages/patient/Dashboard';
import PatientProfile from './pages/patient/Profile';
import PatientAppointments from './pages/patient/Appointments';
import SearchHospitals from './pages/patient/SearchHospitals';
import Insurance from './pages/patient/Insurance';
import BloodBanksAndDonation from './pages/patient/BloodBanksAndDonation';
import History from './pages/patient/History';
import DocumentScanner from './pages/patient/DocumentScanner';
import Bills from './pages/patient/Bills';
import ConfirmAppointment from './pages/patient/ConfirmAppointment';
import PatientMarketplace from './pages/patient/Marketplace';
import VideoConsult from './pages/patient/VideoConsult';
import LabTests from './pages/patient/LabTests';
import DoctorBooking from './pages/patient/DoctorBooking';
import Medicines from './pages/patient/Medicines';

import ChatPortal from './pages/common/ChatPortal';

import BuyerDashboard from './pages/buyer/Dashboard';
import PostRequirement from './pages/buyer/PostRequirement';
import ViewSubmissions from './pages/buyer/ViewSubmissions';

import HospitalDashboard from './pages/hospital/Dashboard';
import HospitalManagement from './pages/hospital/Management';
import HospitalAppointments from './pages/hospital/Appointments';
import HospitalReports from './pages/hospital/Reports';

import DoctorDashboard from './pages/doctor/Dashboard';
import PharmacyDashboard from './pages/pharmacy/Dashboard';
import HospitalAnalytics from './pages/hospital/Analytics';
import HospitalSettings from './pages/hospital/Settings';
import HospitalQR from './pages/hospital/HospitalQR';
import DoctorPortal from './pages/hospital/DoctorPortal';
import PharmacyPortal from './pages/hospital/PharmacyPortal';
import HospitalMarketplace from './pages/hospital/Marketplace';

const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    if (user.role === 'buyer') return <Navigate to="/buyer/dashboard" replace />;
    if (user.role === 'hospital_admin') return <Navigate to="/hospital" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/doctor-activate" element={<DoctorActivation />} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* Patient */}
      <Route path="/dashboard"    element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>} />
      <Route path="/profile"      element={<ProtectedRoute roles={['patient']}><PatientProfile /></ProtectedRoute>} />
      <Route path="/appointments" element={<ProtectedRoute roles={['patient']}><PatientAppointments /></ProtectedRoute>} />
      <Route path="/search"       element={<ProtectedRoute roles={['patient']}><SearchHospitals /></ProtectedRoute>} />
      {/* <Route path="/insurance"    element={<ProtectedRoute roles={['patient']}><Insurance /></ProtectedRoute>} /> */}
      {/* <Route path="/blood-donation" element={<ProtectedRoute roles={['patient']}><BloodBanksAndDonation /></ProtectedRoute>} /> */}
      <Route path="/history"       element={<ProtectedRoute roles={['patient']}><History /></ProtectedRoute>} />
      <Route path="/scanner"       element={<ProtectedRoute roles={['patient']}><DocumentScanner /></ProtectedRoute>} />
      <Route path="/bills"         element={<ProtectedRoute roles={['patient']}><Bills /></ProtectedRoute>} />
      <Route path="/marketplace"   element={<ProtectedRoute roles={['patient']}><PatientMarketplace /></ProtectedRoute>} />
      <Route path="/video-consult" element={<ProtectedRoute roles={['patient']}><VideoConsult /></ProtectedRoute>} />
      <Route path="/lab-tests"     element={<ProtectedRoute roles={['patient']}><LabTests /></ProtectedRoute>} />
      <Route path="/doctor/:id"    element={<ProtectedRoute roles={['patient']}><DoctorBooking /></ProtectedRoute>} />
      <Route path="/medicines"     element={<ProtectedRoute roles={['patient']}><Medicines /></ProtectedRoute>} />

      {/* Buyer */}
      <Route path="/buyer/dashboard"        element={<ProtectedRoute roles={['buyer']}><BuyerDashboard /></ProtectedRoute>} />
      <Route path="/buyer/post-requirement" element={<ProtectedRoute roles={['buyer']}><PostRequirement /></ProtectedRoute>} />
      <Route path="/buyer/chat"             element={<ProtectedRoute roles={['buyer']}><ChatPortal /></ProtectedRoute>} />
      <Route path="/buyer/submissions/:id"  element={<ProtectedRoute roles={['buyer']}><ViewSubmissions /></ProtectedRoute>} />
      
      {/* Patient Chat */}
      <Route path="/messages"               element={<ProtectedRoute roles={['patient', 'buyer', 'hospital_admin', 'doctor']}><ChatPortal /></ProtectedRoute>} />

      {/* Hospital Admin */}
      <Route path="/hospital"                element={<ProtectedRoute roles={['hospital_admin']}><HospitalDashboard /></ProtectedRoute>} />
      <Route path="/hospital/appointments"   element={<ProtectedRoute roles={['hospital_admin']}><HospitalAppointments /></ProtectedRoute>} />
      <Route path="/hospital/management"     element={<ProtectedRoute roles={['hospital_admin']}><HospitalManagement /></ProtectedRoute>} />
      <Route path="/hospital/reports"        element={<ProtectedRoute roles={['hospital_admin']}><HospitalReports /></ProtectedRoute>} />
      <Route path="/hospital/analytics"      element={<ProtectedRoute roles={['hospital_admin']}><HospitalAnalytics /></ProtectedRoute>} />
      <Route path="/hospital/qr"             element={<ProtectedRoute roles={['hospital_admin']}><HospitalQR /></ProtectedRoute>} />
      <Route path="/hospital/settings"       element={<ProtectedRoute roles={['hospital_admin']}><HospitalSettings /></ProtectedRoute>} />
      <Route path="/hospital/doctor-portal"  element={<ProtectedRoute roles={['hospital_admin']}><DoctorPortal /></ProtectedRoute>} />
      <Route path="/hospital/pharmacy-portal" element={<ProtectedRoute roles={['hospital_admin']}><PharmacyPortal /></ProtectedRoute>} />
      <Route path="/hospital/marketplace"     element={<ProtectedRoute roles={['hospital_admin']}><HospitalMarketplace /></ProtectedRoute>} />

      {/* Doctor Portal */}
      <Route path="/doctor" element={<ProtectedRoute roles={['doctor', 'hospital_admin']}><DoctorDashboard /></ProtectedRoute>} />

      {/* Pharmacy Portal */}
      <Route path="/pharmacy" element={<ProtectedRoute roles={['pharmacy', 'hospital_admin']}><PharmacyDashboard /></ProtectedRoute>} />

       {/* Public SMS confirm link — no auth required */}
      <Route path="/confirm-appointment/:token" element={<ConfirmAppointment />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration: 3500, style: { fontFamily: 'DM Sans', fontSize: 14 } }} />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
