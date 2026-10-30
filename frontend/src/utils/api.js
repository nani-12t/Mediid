import axios from 'axios';

// Ensure API URL consistently ends with /api even when configured without it.
const getBaseURL = () => {
  let url = process.env.REACT_APP_API_URL;
  if (!url) {
    const local = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    url = local ? 'http://localhost:5000/api' : 'https://backend-i4iy.vercel.app/api';
  }
  url = url.trim().replace(/\/+$/, '');
  return url.toLowerCase().endsWith('/api') ? url : `${url}/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
});

let backendMode;
let backendConfigPromise;
let accessToken = null;
let refreshPromise;
let sessionEpoch = 0;
let sharedAccessAllowed = false;
let sessionChannel;
let localSessionQueue = Promise.resolve();
const sessionListeners = new Set();
const sessionLockName = `mediid-auth:${api.defaults.baseURL}`;
const authPath = config => (config?.url || '').split('?')[0].startsWith('/auth/');

const usableToken = token => {
  if (typeof token !== 'string' || token.length > 16384) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isFinite(payload.exp) && payload.exp * 1000 > Date.now() + 5000;
  } catch {
    return false;
  }
};

const publishSession = message => sessionChannel?.postMessage(message);
const setAccessToken = (token, broadcast = true) => {
  accessToken = token;
  sharedAccessAllowed = true;
  if (broadcast) publishSession({ type: 'access', token });
};

export const subscribeAuthSession = listener => {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
};

export const clearAuthSession = (broadcast = true) => {
  sessionEpoch += 1;
  accessToken = null;
  sharedAccessAllowed = false;
  localStorage.removeItem('mediid_token');
  localStorage.removeItem('mediid_user');
  sessionStorage.removeItem('hospital_doctor_token');
  sessionStorage.removeItem('hospital_doctor_profile');
  sessionListeners.forEach(listener => listener());
  if (broadcast) publishSession({ type: 'logout' });
};

const openSessionChannel = () => {
  if (sessionChannel || typeof BroadcastChannel === 'undefined') return;
  sessionChannel = new BroadcastChannel(sessionLockName);
  sessionChannel.onmessage = ({ data }) => {
    if (data?.type === 'logout') clearAuthSession(false);
    if (data?.type === 'access-request' && usableToken(accessToken)) {
      publishSession({ type: 'access', token: accessToken });
    }
    if (data?.type === 'access' && sharedAccessAllowed && usableToken(data.token)) {
      setAccessToken(data.token, false);
    }
  };
};

export const getAuthBackend = async () => {
  if (backendMode) return backendMode;
  if (!backendConfigPromise) {
    backendConfigPromise = api.get('/auth/config').then(({ data }) => {
      if (!['legacy', 'postgres'].includes(data.backend)) throw new Error('Authentication configuration is unavailable.');
      backendMode = data.backend;
      if (backendMode === 'postgres') {
        localStorage.removeItem('mediid_token');
        localStorage.removeItem('mediid_user');
        openSessionChannel();
      }
      return backendMode;
    }).catch(error => {
      backendConfigPromise = null;
      throw error;
    });
  }
  return backendConfigPromise;
};

export const saveAuthSession = data => {
  if (backendMode === 'legacy') localStorage.setItem('mediid_token', data.token);
  else if (backendMode === 'postgres') setAccessToken(data.token);
  else throw new Error('Authentication configuration is unavailable.');
};

const withSessionLock = operation => {
  const execute = () => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request(sessionLockName, operation);
    }
    // Cross-tab races without Web Locks remain subject to server replay revocation.
    return operation();
  };
  const result = localSessionQueue.then(execute);
  localSessionQueue = result.catch(() => {});
  return result;
};

export const refreshAuthSession = () => {
  if (refreshPromise) return refreshPromise;
  const previousToken = accessToken;
  const epoch = sessionEpoch;
  sharedAccessAllowed = true;
  refreshPromise = (async () => {
    if (await getAuthBackend() !== 'postgres') throw new Error('Refresh is unavailable in legacy mode.');
    return withSessionLock(async () => {
      if (sessionChannel) {
        publishSession({ type: 'access-request' });
        // Deliver broadcasts queued by the tab which just released this lock.
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (epoch !== sessionEpoch) throw new Error('The authentication session has ended.');
      let response;
      if (accessToken !== previousToken && usableToken(accessToken)) {
        const { data } = await api.get('/auth/me');
        response = { data: { ...data, token: accessToken } };
      } else {
        response = await api.post('/auth/refresh', {});
      }
      if (epoch !== sessionEpoch) throw new Error('The authentication session has ended.');
      setAccessToken(response.data.token);
      sessionListeners.forEach(listener => listener(response.data));
      return response;
    });
  })().catch(error => {
    if ([401, 403].includes(error.response?.status)) clearAuthSession();
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
};

api.interceptors.request.use(async config => {
  if (config.url === '/auth/config') return config;
  const mode = await getAuthBackend();
  if (mode === 'postgres' && authPath(config) && !['get', 'head', 'options'].includes(config.method?.toLowerCase() || 'get')) {
    const { data } = await api.get('/auth/csrf');
    if (typeof data.csrfToken !== 'string' || !data.csrfToken) throw new Error('The security token is unavailable.');
    config.headers['X-Mediid-CSRF'] = data.csrfToken;
  }

  const hospitalRoute = typeof window !== 'undefined' && window.location.pathname.includes('/hospital');
  const doctorToken = config.url?.includes('/doctor-portal') && hospitalRoute
    ? sessionStorage.getItem('hospital_doctor_token') : null;
  const secondaryLogout = config.url === '/auth/logout' && config.method?.toLowerCase() === 'post'
    && config.data?.sessionOnly === true && typeof config._mediidExplicitToken === 'string';
  const token = secondaryLogout ? config._mediidExplicitToken
    : doctorToken || (mode === 'postgres' ? accessToken : localStorage.getItem('mediid_token'));
  config._mediidDoctorSession = Boolean(doctorToken) || secondaryLogout;
  config._mediidAccessToken = token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  return config;
});

const expirePrimarySession = () => {
  clearAuthSession();
  if (typeof window !== 'undefined' && !['/login', '/'].includes(window.location.pathname)) {
    window.location.href = '/login';
  }
};

api.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    if (error.response?.status !== 401 || !config || authPath(config)) throw error;
    if (config._mediidDoctorSession) {
      sessionStorage.removeItem('hospital_doctor_token');
      sessionStorage.removeItem('hospital_doctor_profile');
      window.location.reload();
      throw error;
    }
    if (backendMode === 'postgres' && !config._mediidRetried) {
      config._mediidRetried = true;
      try {
        if (accessToken === config._mediidAccessToken || !usableToken(accessToken)) await refreshAuthSession();
        return await api(config);
      } catch (refreshError) {
        if ([401, 403].includes(refreshError.response?.status)) expirePrimarySession();
        throw refreshError;
      }
    }
    expirePrimarySession();
    throw error;
  }
);

const signIn = (path, data) => {
  const epoch = sessionEpoch;
  return withSessionLock(async () => {
    if (epoch !== sessionEpoch) throw new Error('The authentication session has ended.');
    const response = await api.post(path, data);
    if (epoch !== sessionEpoch) throw new Error('The authentication session has ended.');
    if (data.refresh !== false) {
      // Other tabs must discard the previous account/profile before a new sign-in.
      publishSession({ type: 'logout' });
      saveAuthSession(response.data);
    }
    return response;
  });
};

export const authAPI = {
  config: getAuthBackend,
  register: data => signIn('/auth/register', data),
  login: data => data.refresh === false ? api.post('/auth/login', data) : signIn('/auth/login', data),
  me: () => api.get('/auth/me'),
  refresh: refreshAuthSession,
  logout: async () => {
    if (await getAuthBackend() === 'postgres') {
      return withSessionLock(() => api.post('/auth/logout', {}));
    }
  },
  logoutSecondary: async token => {
    if (await getAuthBackend() === 'postgres') {
      return api.post('/auth/logout', { sessionOnly: true }, { _mediidExplicitToken: token });
    }
  },
  forgotPassword: data => api.post('/auth/forgot-password', data),
  resetPassword: data => api.post('/auth/reset-password', data)
};

// Patient
export const patientAPI = {
  getConfig: () => api.get('/patients/config'),
  getProfile: () => api.get('/patients/profile'),
  updateProfile: (data) => api.put('/patients/profile', data),
  getQR: () => api.get('/patients/qr'),
  addDocument: (data) => api.post('/patients/documents', data),
  deleteDocument: (id) => api.delete(`/patients/documents/${id}`),
  // Unified medical benefits (govt + employer + personal)
  getMedicalBenefits: () => api.get('/patients/medical-benefits'),
  addMedicalBenefit: (data) => api.post('/patients/medical-benefits', data),
  updateMedicalBenefit: (id, data) => api.put(`/patients/medical-benefits/${id}`, data),
  deleteMedicalBenefit: (id) => api.delete(`/patients/medical-benefits/${id}`),
  getTrustedProviders: () => api.get('/patients/trusted-providers'),
  trustDoctor: id => api.post(`/patients/trusted-doctors/${id}`),
  removeTrustedDoctor: id => api.delete(`/patients/trusted-doctors/${id}`),
  trustHospital: id => api.post(`/patients/trusted-hospitals/${id}`),
  removeTrustedHospital: id => api.delete(`/patients/trusted-hospitals/${id}`),
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

// Retain one payment operation key through retries and page reloads in this tab.
export const appointmentPaymentKey = id => {
  const storageKey = `mediid:appointment-payment:${id}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    key = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(storageKey, key);
  }
  return key;
};

// Appointments
export const appointmentAPI = {
  getConfig: () => api.get('/appointments/config'),
  getAvailability: params => api.get('/appointments/availability', { params }),
  getDoctorAppointments: () => api.get('/appointments/doctor'),
  confirm: id => api.post(`/appointments/${id}/confirm`, {}),
  confirmLink: token => api.get(`/appointments/confirm/${encodeURIComponent(token)}`),
  reschedule: (id, slotId) => api.post(`/appointments/${id}/reschedule`, { slotId }),
  checkIn: id => api.post(`/appointments/${id}/check-in`, {}),
  create: (data) => api.post('/appointments', data),
  getMyAppointments: () => api.get('/appointments/my'),
  getHospitalAppointments: (params) => api.get('/appointments/hospital', { params }),
  getPendingCount: () => api.get('/appointments/hospital/count'),
  updateStatus: (id, data) => api.put(`/appointments/${id}/status`, data),
  cancel: (id) => api.delete(`/appointments/${id}`),
  pay: (id, key = appointmentPaymentKey(id)) => api.put(`/appointments/${id}/pay`, {}, { headers: { 'Idempotency-Key': key } })
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
