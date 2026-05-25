import axios from 'axios';

// Ensure API URL consistently ends with /api even if configured without it in Vercel
const getBaseURL = () => {
  let url = process.env.REACT_APP_API_URL;
  
  if (!url) {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      url = 'http://localhost:5000/api';
    } else {
      url = 'https://backend-i4iy.vercel.app/api';
    }
  }
  
  // Strip trailing slashes and ensure /api is exactly there
  url = url.trim().replace(/\/+$/, '');
  
  if (!url.toLowerCase().endsWith('/api')) {
    url = `${url}/api`;
  }
  
  console.log('🌐 API Base URL:', url);
  return url;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
});

// Attach token to every request
api.interceptors.request.use(config => {
  const isHospitalRoute = typeof window !== 'undefined' && window.location.pathname.includes('/hospital');
  
  if (config.url && config.url.includes('/doctor-portal') && isHospitalRoute) {
    const docToken = sessionStorage.getItem('hospital_doctor_token');
    if (docToken) {
      config.headers.Authorization = `Bearer ${docToken}`;
      return config;
    }
  }
  const token = localStorage.getItem('mediid_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    const isAuthRequest = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/register');
    
    if (err.response?.status === 401 && !isAuthRequest) {
      const authHeader = err.config?.headers?.Authorization || err.config?.headers?.authorization;
      const isDoctorRequest = err.config?.url?.includes('/doctor-portal');
      const docToken = sessionStorage.getItem('hospital_doctor_token');
      
      if (isDoctorRequest && docToken && authHeader === `Bearer ${docToken}`) {
        console.warn('🔑 Doctor session expired or invalid token. Clearing doctor session.');
        sessionStorage.removeItem('hospital_doctor_token');
        sessionStorage.removeItem('hospital_doctor_profile');
        window.location.reload();
      } else {
        console.warn('🔑 Session expired or invalid token. Clearing storage.');
        localStorage.removeItem('mediid_token');
        localStorage.removeItem('mediid_user');
        sessionStorage.removeItem('hospital_doctor_token');
        sessionStorage.removeItem('hospital_doctor_profile');
        
        // Only redirect if we aren't already trying to login
        if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data)
};

// Patient
export const patientAPI = {
  getProfile: () => api.get('/patients/profile'),
  updateProfile: (data) => api.put('/patients/profile', data),
  getQR: () => api.get('/patients/qr'),
  addDocument: (data) => api.post('/patients/documents', data),
  deleteDocument: (id) => api.delete(`/patients/documents/${id}`),
  // Unified medical benefits (govt + employer + personal)
  addMedicalBenefit: (data) => api.post('/patients/medical-benefits', data),
  deleteMedicalBenefit: (id) => api.delete(`/patients/medical-benefits/${id}`),
  // Legacy
  addGovernmentBenefit: (data) => api.post('/patients/government-benefits', data),
  scanUID: (uid) => api.get(`/patients/scan/${uid}`),
  // Bills & Expenses
  getBills: () => api.get('/patients/bills'),
  addCustomBill: (data) => api.post('/patients/bills', data),
  payBill: (billId, data) => api.put(`/patients/bills/${billId}/pay`, data)
};

// Hospital
export const hospitalAPI = {
  search: (params) => api.get('/hospitals', { params }),
  getTopRated: () => api.get('/hospitals/top'),          // top 3 by weighted rating
  getById: (id) => api.get(`/hospitals/${id}`),
  getAdminProfile: () => api.get('/hospitals/admin/profile'),
  updateProfile: (data) => api.put('/hospitals/admin/profile', data)
};

// Doctors
export const doctorAPI = {
  search: (params) => api.get('/doctors', { params }),
  addDoctor: (data) => api.post('/doctors', data),
  updateDoctor: (id, data) => api.put(`/doctors/${id}`, data),
  deleteDoctor: (id) => api.delete(`/doctors/${id}`)
};

// Staff
export const staffAPI = {
  search: (params) => api.get('/staff', { params }),
  createStaff: (data) => api.post('/staff', data),
  updateStaff: (id, data) => api.put(`/staff/${id}`, data),
  deleteStaff: (id) => api.delete(`/staff/${id}`)
};

// Surgery
export const surgeryAPI = {
  search: (params) => api.get('/surgeries', { params }),
  createSurgery: (data) => api.post('/surgeries', data),
  updateSurgery: (id, data) => api.put(`/surgeries/${id}`, data),
  deleteSurgery: (id) => api.delete(`/surgeries/${id}`)
};

// Shift Management
export const shiftAPI = {
  getAllShifts: () => api.get('/shifts'),
  assignShift: (data) => api.post('/shifts/assign', data),
  updateShift: (id, data) => api.put(`/shifts/${id}`, data),
  deleteShift: (id) => api.delete(`/shifts/${id}`),
  getStaffShifts: (staffId) => api.get(`/shifts/staff/${staffId}`),
  getShiftHistory: (staffId) => api.get(`/shifts/history/${staffId}`)
};

// Attendance Tracking
export const attendanceAPI = {
  checkIn: (staffId) => api.post('/attendance/check-in', { staffId }),
  checkOut: (staffId) => api.post('/attendance/check-out', { staffId }),
  getTodayLogs: () => api.get('/attendance/today'),
  getStaffLogs: (staffId, params) => api.get(`/attendance/staff/${staffId}`, { params }),
  getAllLogs: (params) => api.get('/attendance', { params }),
  updateLog: (id, data) => api.put(`/attendance/${id}`, data)
};

// Leave Management
export const leaveAPI = {
  submitRequest: (data) => api.post('/leave/request', data),
  getAllRequests: () => api.get('/leave/requests'),
  getStaffRequests: (staffId) => api.get(`/leave/requests/${staffId}`),
  processRequest: (id, data) => api.put(`/leave/request/${id}/process`, data),
  getLeaveBalance: (staffId) => api.get(`/leave/balance/${staffId}`),
  cancelRequest: (id) => api.delete(`/leave/request/${id}`)
};

// Appointments
export const appointmentAPI = {
  create: (data) => api.post('/appointments', data),
  getMyAppointments: () => api.get('/appointments/my'),
  getHospitalAppointments: (params) => api.get('/appointments/hospital', { params }),
  getPendingCount: () => api.get('/appointments/hospital/count'),
  updateStatus: (id, data) => api.put(`/appointments/${id}/status`, data),
  cancel: (id) => api.delete(`/appointments/${id}`),
  pay: (id) => api.put(`/appointments/${id}/pay`)
};

// Insurance
export const insuranceAPI = {
  getAgencies: () => api.get('/insurance')
};

// Reports
export const reportAPI = {
  upload: (data) => api.post('/reports/upload', data),
  getHospitalReports: () => api.get('/reports/hospital')
};

// OCR
export const ocrAPI = {
  analyze: (formData) => api.post('/ocr/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
};

// Marketplace
export const marketplaceAPI = {
  // Buyer profile
  getBuyerProfile:    ()       => api.get('/marketplace/buyer/profile'),
  updateBuyerProfile: (data)   => api.put('/marketplace/buyer/profile', data),

  // Requirements
  createRequirement:  (data)   => api.post('/marketplace/requirements', data),
  getAllRequirements:  ()       => api.get('/marketplace/requirements'),
  getMyRequirements:  ()       => api.get('/marketplace/requirements/my'),
  updateRequirement:  (id, d)  => api.put(`/marketplace/requirements/${id}`, d),
  deleteRequirement:  (id)     => api.delete(`/marketplace/requirements/${id}`),

  // Submissions
  submitDocs:         (data)   => api.post('/marketplace/submissions', data),
  submitDocuments:    (formData) => api.post('/marketplace/submissions', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMySubmissions:   ()       => api.get('/marketplace/submissions/my'),
  getRequirementSubs: (id)     => api.get(`/marketplace/submissions/requirement/${id}`),
  updateSubStatus:    (id, d)  => api.put(`/marketplace/submissions/${id}/status`, d),

  // Messaging
  sendMessage:        (data)   => api.post('/marketplace/messages', data),
  getConversations:   ()       => api.get('/marketplace/messages/conversations'),
  getMessages:        (uid)    => api.get(`/marketplace/messages/${uid}`),
  getUnreadCount:     ()       => api.get('/marketplace/messages/unread/count'),
};

// Blood Requests API
export const bloodRequestAPI = {
  create: (data) => api.post('/blood-requests', data),
  getMyRequests: () => api.get('/blood-requests/my'),
};

// Medicine Orders API
export const medicineOrderAPI = {
  create: (data) => api.post('/medicine-orders', data),
  getMyOrders: () => api.get('/medicine-orders/my'),
};

// Doctor Portal
export const doctorPortalAPI = {
  getQueue: () => api.get('/doctor-portal/queue'),
  getPatient: (uid) => api.get(`/doctor-portal/patient/${uid}`),
  savePrescription: (data) => api.post('/doctor-portal/prescription', data)
};

// Pharmacy Portal
export const pharmacyPortalAPI = {
  getPrescriptions: (uid) => api.get(`/pharmacy-portal/prescription/${uid}`),
  dispensePrescription: (data) => api.post('/pharmacy-portal/dispense', data)
};

export default api;