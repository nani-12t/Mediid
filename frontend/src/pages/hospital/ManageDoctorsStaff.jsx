import React, { useState, useEffect } from 'react';
import {
  Plus, Search, Clock, User, Users, Calendar, Edit2, Trash2, X, CheckCircle, AlertCircle,
  PlayCircle, StopCircle, UserCheck, CalendarDays, FileText, Settings, LogOut,
  Briefcase, Timer, CheckSquare, XSquare, AlertTriangle, Bell
} from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { doctorAPI, staffAPI, shiftAPI, attendanceAPI, leaveAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STAFF_ROLES = [
  'Doctor', 'Nurse', 'Receptionist', 'Administrator', 'Technician', 'Pharmacist',
  'Lab Technician', 'Security Guard', 'Housekeeping', 'Maintenance', 'IT Support'
];

const DEPARTMENTS = [
  'Emergency', 'Surgery', 'Medicine', 'Pediatrics', 'Obstetrics & Gynecology',
  'Cardiology', 'Neurology', 'Orthopedics', 'Radiology', 'Laboratory',
  'Pharmacy', 'Administration', 'IT', 'Security', 'Housekeeping', 'Maintenance'
];

const SHIFT_TYPES = ['Morning Shift', 'Evening Shift', 'Night Shift'];
const LEAVE_TYPES = ['Casual', 'Sick', 'Emergency'];
const ATTENDANCE_STATUS = ['On Duty', 'Not Checked In', 'Shift Completed', 'On Leave'];

const emptyStaff = {
  firstName: '', lastName: '', role: '', department: '', duties: '',
  shiftType: 'Morning Shift', shiftStartTime: '09:00', shiftEndTime: '17:00',
  employeeId: '', phone: '', email: '', emergencyContact: '', status: 'Active'
};

const emptyLeaveRequest = {
  leaveType: 'Casual', startDate: '', endDate: '', reason: ''
};

export default function ManageDoctorsStaff() {
  const [activeTab, setActiveTab] = useState('staff'); // staff, shifts, attendance, leaves
  const [staff, setStaff] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [form, setForm] = useState(emptyStaff);
  const [loading, setLoading] = useState(false);
  const [filterRole, setFilterRole] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Shift management states
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [currentShift, setCurrentShift] = useState(null);

  // Leave management states
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState(emptyLeaveRequest);
  const [isEmergencyLeave, setIsEmergencyLeave] = useState(false);

  // Attendance tracking states
  const [attendanceStats, setAttendanceStats] = useState({
    onDuty: 0, notCheckedIn: 0, shiftCompleted: 0, onLeave: 0
  });

  const loadData = async () => {
    try {
      const [staffRes, doctorRes, shiftRes, attendanceRes, leaveRes] = await Promise.allSettled([
        staffAPI.search({}),
        doctorAPI.search({}),
        shiftAPI.getAllShifts ? shiftAPI.getAllShifts() : Promise.resolve({ data: [] }),
        attendanceAPI.getTodayLogs ? attendanceAPI.getTodayLogs() : Promise.resolve({ data: [] }),
        leaveAPI.getAllRequests ? leaveAPI.getAllRequests() : Promise.resolve({ data: [] })
      ]);

      if (staffRes.status === 'fulfilled') setStaff(staffRes.value.data);
      if (doctorRes.status === 'fulfilled') setDoctors(doctorRes.value.data);
      if (shiftRes.status === 'fulfilled') setShifts(shiftRes.value.data);
      if (attendanceRes.status === 'fulfilled') {
        setAttendanceLogs(attendanceRes.value.data);
        updateAttendanceStats(attendanceRes.value.data);
      }
      if (leaveRes.status === 'fulfilled') setLeaveRequests(leaveRes.value.data);
    } catch (e) {}
  };

  const updateAttendanceStats = (logs) => {
    const stats = { onDuty: 0, notCheckedIn: 0, shiftCompleted: 0, onLeave: 0 };
    logs.forEach(log => {
      if (log.status === 'On Duty') stats.onDuty++;
      else if (log.status === 'Not Checked In') stats.notCheckedIn++;
      else if (log.status === 'Shift Completed') stats.shiftCompleted++;
      else if (log.status === 'On Leave') stats.onLeave++;
    });
    setAttendanceStats(stats);
  };

  useEffect(() => { loadData(); }, []);

  const openAdd = () => { setForm(emptyStaff); setEditStaff(null); setShowModal(true); };
  const openEdit = (member) => {
    setForm({ ...member });
    setEditStaff(member._id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (editStaff) {
        await staffAPI.updateStaff(editStaff, payload);
        toast.success('Staff member updated successfully');
      } else {
        await staffAPI.createStaff(payload);
        toast.success('Staff member added successfully');
      }
      setShowModal(false);
      loadData();
    } catch (e) {
      toast.error(editStaff ? 'Failed to update staff member' : 'Failed to add staff member');
    }
    setLoading(false);
  };

  const deleteStaff = async (id) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) return;
    try {
      await staffAPI.deleteStaff(id);
      toast.success('Staff member deleted successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to delete staff member');
    }
  };

  // Shift Management Functions
  const assignShift = async (staffId, shiftData) => {
    try {
      await shiftAPI.assignShift({ staffId, ...shiftData });
      toast.success('Shift assigned successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to assign shift');
    }
  };

  const checkInShift = async (staffId) => {
    try {
      await attendanceAPI.checkIn(staffId);
      toast.success('Checked in successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to check in');
    }
  };

  const checkOutShift = async (staffId) => {
    try {
      await attendanceAPI.checkOut(staffId);
      toast.success('Checked out successfully');
      loadData();
    } catch (e) {
      toast.error('Failed to check out');
    }
  };

  // Leave Management Functions
  const submitLeaveRequest = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...leaveForm, isEmergency: isEmergencyLeave };
      await leaveAPI.submitRequest(payload);
      toast.success(isEmergencyLeave ? 'Emergency leave requested' : 'Leave request submitted');
      setShowLeaveModal(false);
      setLeaveForm(emptyLeaveRequest);
      setIsEmergencyLeave(false);
      loadData();
    } catch (e) {
      toast.error('Failed to submit leave request');
    }
  };

  const processLeaveRequest = async (requestId, action) => {
    try {
      await leaveAPI.processRequest(requestId, { action });
      toast.success(`Leave request ${action.toLowerCase()}d`);
      loadData();
    } catch (e) {
      toast.error(`Failed to ${action.toLowerCase()} leave request`);
    }
  };

  const allStaff = [...staff, ...doctors];
  const filteredStaff = allStaff.filter(member => {
    const matchesSearch = !search ||
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      member.email?.toLowerCase().includes(search.toLowerCase()) ||
      member.employeeId?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !filterRole || member.role === filterRole;
    const matchesDepartment = !filterDepartment || member.department === filterDepartment;
    const matchesStatus = !filterStatus || member.status === filterStatus;
    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  const pendingLeaves = leaveRequests.filter(req => req.status === 'Pending').length;
  const todayAttendance = attendanceLogs.filter(log => {
    const logDate = new Date(log.date).toDateString();
    const today = new Date().toDateString();
    return logDate === today;
  });

  return (
    <HospitalLayout title="Manage Doctors & Staff">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Doctors & Staff Management
          </h2>
          <button onClick={openAdd} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} /> Add Staff Member
          </button>
        </div>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Comprehensive management of doctors, staff, shifts, attendance, and leave requests
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          <Users size={16} style={{ marginRight: 6 }} />
          Staff ({allStaff.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'shifts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shifts')}
        >
          <Clock size={16} style={{ marginRight: 6 }} />
          Shifts ({shifts.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          <CheckSquare size={16} style={{ marginRight: 6 }} />
          Attendance ({todayAttendance.length})
        </button>
        <button
          className={`tab-btn ${activeTab === 'leaves' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaves')}
        >
          <CalendarDays size={16} style={{ marginRight: 6 }} />
          Leave Requests ({pendingLeaves})
        </button>
      </div>

      {/* Staff Management Tab */}
      {activeTab === 'staff' && (
        <>
          {/* Search and Filters */}
          <div className="card" style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 250 }}>
                <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                <input
                  type="text"
                  placeholder="Search by name, email, or employee ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 44px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 12,
                    fontSize: 14,
                    background: 'var(--white)',
                    outline: 'none'
                  }}
                />
              </div>

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 12,
                  fontSize: 14,
                  background: 'var(--white)',
                  outline: 'none',
                  minWidth: 140
                }}
              >
                <option value="">All Roles</option>
                {STAFF_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>

              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 12,
                  fontSize: 14,
                  background: 'var(--white)',
                  outline: 'none',
                  minWidth: 140
                }}
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '12px 14px',
                  border: '1px solid var(--gray-200)',
                  borderRadius: 12,
                  fontSize: 14,
                  background: 'var(--white)',
                  outline: 'none',
                  minWidth: 140
                }}
              >
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="On Leave">On Leave</option>
              </select>

              {(filterRole || filterDepartment || filterStatus) && (
                <button
                  onClick={() => { setFilterRole(''); setFilterDepartment(''); setFilterStatus(''); }}
                  className="btn btn-secondary btn-sm"
                  style={{ marginLeft: 'auto' }}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Staff List */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {filteredStaff.length === 0 ? (
              <div className="card empty-state" style={{ gridColumn: '1 / -1', padding: '48px 24px', textAlign: 'center' }}>
                <UserCheck size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Staff Members Found</h3>
                <p style={{ color: 'var(--gray-500)', marginBottom: 16 }}>
                  {(filterRole || filterDepartment || filterStatus) ? 'Try adjusting your search or filters' : 'Start by adding your first staff member'}
                </p>
                {!search && !filterRole && !filterDepartment && !filterStatus && (
                  <button onClick={openAdd} className="btn btn-primary">
                    <Plus size={16} style={{ marginRight: 8 }} /> Add Staff Member
                  </button>
                )}
              </div>
            ) : (
              filteredStaff.map(member => (
                <div key={member._id} className="card" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div className="avatar" style={{
                      width: 56, height: 56, fontSize: 18,
                      background: member.role === 'Doctor' ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' :
                               member.role === 'Nurse' ? 'linear-gradient(135deg, #10b981, #059669)' :
                               'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                    }}>
                      {member.firstName?.[0]}{member.lastName?.[0]}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <h4 style={{ fontSize: 16, fontWeight: 600 }}>{member.firstName} {member.lastName}</h4>
                        <span className={`badge ${member.status === 'Active' ? 'badge-green' : member.status === 'On Leave' ? 'badge-yellow' : 'badge-gray'}`}>
                          {member.status || 'Active'}
                        </span>
                      </div>

                      <p style={{ fontSize: 14, color: 'var(--teal)', fontWeight: 500, marginBottom: 4 }}>
                        {member.role} • {member.department}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>ID: {member.employeeId}</p>

                      {member.shiftType && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <Clock size={12} color="var(--gray-500)" />
                          <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                            {member.shiftType}: {member.shiftStartTime} - {member.shiftEndTime}
                          </span>
                        </div>
                      )}

                      {member.duties && (
                        <p style={{ fontSize: 12, color: 'var(--gray-600)', fontStyle: 'italic' }}>
                          {member.duties}
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button
                      onClick={() => openEdit(member)}
                      className="btn btn-outline btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Edit2 size={14} style={{ marginRight: 6 }} /> Edit
                    </button>
                    <button
                      onClick={() => deleteStaff(member._id)}
                      className="btn btn-outline btn-sm"
                      style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Shifts Tab */}
      {activeTab === 'shifts' && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Shift Management</h3>
          <p style={{ color: 'var(--gray-500)', marginBottom: 24 }}>
            Assign and manage shifts for doctors and staff members
          </p>

          {/* Shift Assignment Form */}
          <div style={{ marginBottom: 24, padding: 16, background: 'var(--gray-50)', borderRadius: 8 }}>
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Assign New Shift</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Staff Member</label>
                <select style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--gray-200)' }}>
                  <option value="">Select Staff</option>
                  {allStaff.map(member => (
                    <option key={member._id} value={member._id}>
                      {member.firstName} {member.lastName} - {member.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Shift Type</label>
                <select style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--gray-200)' }}>
                  {SHIFT_TYPES.map(shift => (
                    <option key={shift} value={shift}>{shift}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Start Time</label>
                <input
                  type="time"
                  defaultValue="09:00"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--gray-200)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>End Time</label>
                <input
                  type="time"
                  defaultValue="17:00"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--gray-200)' }}
                />
              </div>

              <button className="btn btn-primary" style={{ height: 36 }}>
                Assign Shift
              </button>
            </div>
          </div>

          {/* Current Shift Assignments */}
          <div>
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Current Shift Assignments</h4>
            <div style={{ display: 'grid', gap: 12 }}>
              {allStaff.filter(member => member.shiftType).map(member => (
                <div key={member._id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: 12, background: 'var(--gray-50)', borderRadius: 8
                }}>
                  <div>
                    <h5 style={{ fontSize: 14, fontWeight: 600 }}>{member.firstName} {member.lastName}</h5>
                    <p style={{ fontSize: 12, color: 'var(--gray-600)' }}>{member.role} • {member.department}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 14, fontWeight: 500 }}>{member.shiftType}</p>
                    <p style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                      {member.shiftStartTime} - {member.shiftEndTime}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm">
                      <Edit2 size={14} />
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ color: '#dc2626' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <>
          {/* Attendance Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981', marginBottom: 8 }}>
                {attendanceStats.onDuty}
              </div>
              <div style={{ fontSize: 14, color: 'var(--gray-600)' }}>On Duty</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                {attendanceStats.notCheckedIn}
              </div>
              <div style={{ fontSize: 14, color: 'var(--gray-600)' }}>Not Checked In</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>
                {attendanceStats.shiftCompleted}
              </div>
              <div style={{ fontSize: 14, color: 'var(--gray-600)' }}>Shift Completed</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
                {attendanceStats.onLeave}
              </div>
              <div style={{ fontSize: 14, color: 'var(--gray-600)' }}>On Leave</div>
            </div>
          </div>

          {/* Attendance Logs */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Today's Attendance</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Staff Member</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Check-in</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Check-out</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Hours</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayAttendance.map(log => (
                    <tr key={log._id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        {log.staffName}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {log.role}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {log.checkInTime ? new Date(log.checkInTime).toLocaleTimeString() : '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString() : '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {log.totalHours ? `${log.totalHours}h` : '-'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${
                          log.status === 'On Duty' ? 'badge-green' :
                          log.status === 'Shift Completed' ? 'badge-blue' :
                          log.status === 'On Leave' ? 'badge-yellow' : 'badge-gray'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Leave Requests Tab */}
      {activeTab === 'leaves' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>Leave Requests</h3>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="btn btn-primary"
            >
              Apply Leave
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {leaveRequests.map(request => (
              <div key={request._id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 16, background: 'var(--gray-50)', borderRadius: 8
              }}>
                <div>
                  <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {request.staffName}
                  </h4>
                  <p style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 4 }}>
                    {request.leaveType} Leave • {new Date(request.startDate).toLocaleDateString()} - {new Date(request.endDate).toLocaleDateString()}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                    {request.reason}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`badge ${
                    request.status === 'Approved' ? 'badge-green' :
                    request.status === 'Rejected' ? 'badge-red' : 'badge-yellow'
                  }`}>
                    {request.status}
                  </span>

                  {request.status === 'Pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => processLeaveRequest(request._id, 'Approve')}
                        className="btn btn-success btn-sm"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                      >
                        <CheckCircle size={14} style={{ marginRight: 4 }} />
                        Approve
                      </button>
                      <button
                        onClick={() => processLeaveRequest(request._id, 'Reject')}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: 12, padding: '4px 8px', color: '#dc2626', borderColor: '#dc2626' }}
                      >
                        <XSquare size={14} style={{ marginRight: 4 }} />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                {editStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="var(--gray-400)" />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>First Name *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Last Name *</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Role *</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="">Select Role</option>
                    {STAFF_ROLES.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Department *</label>
                  <select
                    value={form.department}
                    onChange={(e) => setForm(prev => ({ ...prev, department: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Employee ID *</label>
                  <input
                    type="text"
                    value={form.employeeId}
                    onChange={(e) => setForm(prev => ({ ...prev, employeeId: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Shift Type</label>
                  <select
                    value={form.shiftType}
                    onChange={(e) => setForm(prev => ({ ...prev, shiftType: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="Morning Shift">Morning Shift</option>
                    <option value="Evening Shift">Evening Shift</option>
                    <option value="Night Shift">Night Shift</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Shift Start Time</label>
                  <input
                    type="time"
                    value={form.shiftStartTime}
                    onChange={(e) => setForm(prev => ({ ...prev, shiftStartTime: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Shift End Time</label>
                  <input
                    type="time"
                    value={form.shiftEndTime}
                    onChange={(e) => setForm(prev => ({ ...prev, shiftEndTime: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Duties & Responsibilities</label>
                  <textarea
                    value={form.duties}
                    onChange={(e) => setForm(prev => ({ ...prev, duties: e.target.value }))}
                    placeholder="Describe the staff member's duties and responsibilities..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14,
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Emergency Contact</label>
                  <input
                    type="tel"
                    value={form.emergencyContact}
                    onChange={(e) => setForm(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    placeholder="Emergency contact number"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1 }}>
                  {loading ? 'Saving...' : editStaff ? 'Update Staff' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {showLeaveModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                {isEmergencyLeave ? 'Emergency Leave Request' : 'Apply for Leave'}
              </h3>
              <button onClick={() => setShowLeaveModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="var(--gray-400)" />
              </button>
            </div>

            <form onSubmit={submitLeaveRequest} style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Leave Type</label>
                <select
                  value={leaveForm.leaveType}
                  onChange={(e) => setLeaveForm(prev => ({ ...prev, leaveType: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14
                  }}
                >
                  {LEAVE_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Start Date</label>
                  <input
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, startDate: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>End Date</label>
                  <input
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm(prev => ({ ...prev, endDate: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid var(--gray-200)',
                      borderRadius: 8,
                      fontSize: 14
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Reason</label>
                <textarea
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Please provide reason for leave..."
                  rows={3}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    fontSize: 14,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isEmergencyLeave}
                    onChange={(e) => setIsEmergencyLeave(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>This is an emergency leave request</span>
                </label>
                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                  Emergency requests will notify admin immediately for urgent approval
                </p>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => setShowLeaveModal(false)} className="btn btn-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {isEmergencyLeave ? 'Request Emergency Leave' : 'Submit Leave Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
