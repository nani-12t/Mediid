import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

import PatientDashboard from './pages/patient/Dashboard';
import PatientProfile from './pages/patient/Profile';
// import PatientAppointments from './pages/patient/Appointments';
// import SearchHospitals from './pages/patient/SearchHospitals';
import Insurance from './pages/patient/Insurance';
import BloodBanksAndDonation from './pages/patient/BloodBanksAndDonation';
import History from './pages/patient/History';
import DocumentScanner from './pages/patient/DocumentScanner';
import Bills from './pages/patient/Bills';
// import ConfirmAppointment from './pages/patient/ConfirmAppointment';
import PatientMarketplace from './pages/patient/Marketplace';

import ChatPortal from './pages/common/ChatPortal';

import BuyerDashboard from './pages/buyer/Dashboard';
import PostRequirement from './pages/buyer/PostRequirement';
import ViewSubmissions from './pages/buyer/ViewSubmissions';

// import HospitalDashboard from './pages/hospital/Dashboard';
// import HospitalDoctors from './pages/hospital/Doctors';
// import HospitalStaff from './pages/hospital/Staff';
// import HospitalAppointments from './pages/hospital/Appointments';
// import HospitalReports from './pages/hospital/Reports';
// import HospitalAnalytics from './pages/hospital/Analytics';
// import HospitalSettings from './pages/hospital/Settings';
// import HospitalQR from './pages/hospital/HospitalQR';

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

      {/* Patient */}
      <Route path="/dashboard"    element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>} />
      <Route path="/profile"      element={<ProtectedRoute roles={['patient']}><PatientProfile /></ProtectedRoute>} />
      {/* <Route path="/appointments" element={<ProtectedRoute roles={['patient']}><PatientAppointments /></ProtectedRoute>} /> */}
      {/* <Route path="/search"       element={<ProtectedRoute roles={['patient']}><SearchHospitals /></ProtectedRoute>} /> */}
      {/* <Route path="/insurance"    element={<ProtectedRoute roles={['patient']}><Insurance /></ProtectedRoute>} /> */}
      {/* <Route path="/blood-donation" element={<ProtectedRoute roles={['patient']}><BloodBanksAndDonation /></ProtectedRoute>} /> */}
      <Route path="/history"       element={<ProtectedRoute roles={['patient']}><History /></ProtectedRoute>} />
      <Route path="/scanner"       element={<ProtectedRoute roles={['patient']}><DocumentScanner /></ProtectedRoute>} />
      <Route path="/bills"         element={<ProtectedRoute roles={['patient']}><Bills /></ProtectedRoute>} />
      <Route path="/marketplace"   element={<ProtectedRoute roles={['patient']}><PatientMarketplace /></ProtectedRoute>} />

      {/* Buyer */}
      <Route path="/buyer/dashboard"        element={<ProtectedRoute roles={['buyer']}><BuyerDashboard /></ProtectedRoute>} />
      <Route path="/buyer/post-requirement" element={<ProtectedRoute roles={['buyer']}><PostRequirement /></ProtectedRoute>} />
      <Route path="/buyer/chat"             element={<ProtectedRoute roles={['buyer']}><ChatPortal /></ProtectedRoute>} />
      <Route path="/buyer/submissions/:id"  element={<ProtectedRoute roles={['buyer']}><ViewSubmissions /></ProtectedRoute>} />
      
      {/* Patient Chat */}
      <Route path="/messages"               element={<ProtectedRoute roles={['patient', 'buyer']}><ChatPortal /></ProtectedRoute>} />

      {/* Hospital Admin */}
      {/* <Route path="/hospital"                element={<ProtectedRoute roles={['hospital_admin']}><HospitalDashboard /></ProtectedRoute>} />
      <Route path="/hospital/appointments"   element={<ProtectedRoute roles={['hospital_admin']}><HospitalAppointments /></ProtectedRoute>} />
      <Route path="/hospital/doctors"        element={<ProtectedRoute roles={['hospital_admin']}><HospitalDoctors /></ProtectedRoute>} />
      <Route path="/hospital/staff"          element={<ProtectedRoute roles={['hospital_admin']}><HospitalStaff /></ProtectedRoute>} />
      <Route path="/hospital/reports"        element={<ProtectedRoute roles={['hospital_admin']}><HospitalReports /></ProtectedRoute>} />
      <Route path="/hospital/analytics"      element={<ProtectedRoute roles={['hospital_admin']}><HospitalAnalytics /></ProtectedRoute>} />
      <Route path="/hospital/qr"             element={<ProtectedRoute roles={['hospital_admin']}><HospitalQR /></ProtectedRoute>} />
      <Route path="/hospital/settings"       element={<ProtectedRoute roles={['hospital_admin']}><HospitalSettings /></ProtectedRoute>} /> */}

       {/* Public SMS confirm link — no auth required */}
      {/* <Route path="/confirm-appointment/:token" element={<ConfirmAppointment />} /> */}

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
