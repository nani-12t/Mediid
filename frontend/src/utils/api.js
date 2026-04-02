import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' }
});

// Attach token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('mediid_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mediid_token');
      localStorage.removeItem('mediid_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
};

// Patient
export const patientAPI = {
  getProfile: () => api.get('/patients/profile'),
  updateProfile: (data) => api.put('/patients/profile', data),
  getQR: () => api.get('/patients/qr'),
  addDocument: (data) => api.post('/patients/documents', data),
  deleteDocument: (id) => api.delete(`/patients/documents/${id}`),
  addGovernmentBenefit: (data) => api.post('/patients/government-benefits', data),
  scanUID: (uid) => api.get(`/patients/scan/${uid}`)
};

// Hospital
export const hospitalAPI = {
  search: (params) => api.get('/hospitals', { params }),
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
  updateStatus: (id, data) => api.put(`/appointments/${id}/status`, data),
  cancel: (id) => api.delete(`/appointments/${id}`)
};

// Insurance
export const insuranceAPI = {
  getAgencies: () => api.get('/insurance')
};

// Reports
export const reportAPI = {
  upload: (data) => api.post('/reports/upload', data)
};

export default api;
