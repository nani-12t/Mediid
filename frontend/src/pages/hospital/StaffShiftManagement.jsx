import React, { useState, useEffect } from 'react';
import { Clock, PlayCircle, StopCircle, Calendar, User, MapPin } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { shiftAPI, attendanceAPI, leaveAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function StaffShiftManagement() {
  const [currentShift, setCurrentShift] = useState(null);
  const [attendanceToday, setAttendanceToday] = useState(null);
  const [shiftHistory, setShiftHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Casual', startDate: '', endDate: '', reason: ''
  });

  const loadData = async () => {
    try {
      // Get current shift assignment
      const shiftRes = await shiftAPI.getStaffShifts('current-user-id'); // Replace with actual user ID
      if (shiftRes.data.length > 0) {
        setCurrentShift(shiftRes.data[0]);
      }

      // Get today's attendance
      const attendanceRes = await attendanceAPI.getTodayLogs();
      const todayLog = attendanceRes.data.find(log =>
        log.staffId === 'current-user-id' && // Replace with actual user ID
        new Date(log.date).toDateString() === new Date().toDateString()
      );
      setAttendanceToday(todayLog);

      // Get shift history (last 7 days)
      const historyRes = await shiftAPI.getShiftHistory('current-user-id'); // Replace with actual user ID
      setShiftHistory(historyRes.data.slice(0, 7));
    } catch (e) {
      console.error('Error loading shift data:', e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      await attendanceAPI.checkIn('current-user-id'); // Replace with actual user ID
      toast.success('Successfully checked in!');
      loadData();
    } catch (e) {
      toast.error('Failed to check in');
    }
    setLoading(false);
  };

  const handleCheckOut = async () => {
    setLoading(true);
    try {
      await attendanceAPI.checkOut('current-user-id'); // Replace with actual user ID
      toast.success('Successfully checked out!');
      loadData();
    } catch (e) {
      toast.error('Failed to check out');
    }
    setLoading(false);
  };

  const submitLeaveRequest = async (e) => {
    e.preventDefault();
    try {
      await leaveAPI.submitRequest(leaveForm);
      toast.success('Leave request submitted successfully');
      setShowLeaveModal(false);
      setLeaveForm({ leaveType: 'Casual', startDate: '', endDate: '', reason: '' });
    } catch (e) {
      toast.error('Failed to submit leave request');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'On Duty': return '#10b981';
      case 'Shift Completed': return '#3b82f6';
      case 'Not Checked In': return '#f59e0b';
      case 'On Leave': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const canCheckIn = currentShift && (!attendanceToday || attendanceToday.status === 'Not Checked In');
  const canCheckOut = attendanceToday && attendanceToday.status === 'On Duty';

  return (
    <HospitalLayout title="My Shift & Attendance">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700 }}>
          My Shift Management
        </h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>
          Manage your shifts, check in/out, and request leave
        </p>
      </div>

      {/* Current Shift & Check-in/out */}
      <div className="card" style={{ marginBottom: 24, padding: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Current Shift</h3>

        {currentShift ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Clock size={20} color="var(--teal)" />
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 600 }}>{currentShift.shiftType}</h4>
                <p style={{ fontSize: 14, color: 'var(--gray-600)' }}>
                  {currentShift.startTime} - {currentShift.endTime}
                </p>
              </div>
            </div>

            {/* Status Display */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: 20, background: 'var(--gray-50)',
              marginBottom: 16
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: getStatusColor(attendanceToday?.status || 'Not Checked In')
              }}></div>
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                {attendanceToday?.status || 'Not Checked In'}
              </span>
            </div>

            {/* Check-in/out Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              {canCheckIn && (
                <button
                  onClick={handleCheckIn}
                  disabled={loading}
                  className="btn btn-success"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <PlayCircle size={16} />
                  Check In
                </button>
              )}

              {canCheckOut && (
                <button
                  onClick={handleCheckOut}
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f59e0b', border: 'none' }}
                >
                  <StopCircle size={16} />
                  Check Out
                </button>
              )}

              <button
                onClick={() => setShowLeaveModal(true)}
                className="btn btn-outline"
                style={{ marginLeft: 'auto' }}
              >
                Request Leave
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--gray-500)' }}>
            <Clock size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No Shift Assigned</h4>
            <p>Your shift schedule will appear here when assigned by the administrator.</p>
          </div>
        )}
      </div>

      {/* Today's Attendance Details */}
      {attendanceToday && (
        <div className="card" style={{ marginBottom: 24, padding: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Today's Attendance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 4 }}>Check-in Time</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {attendanceToday.checkInTime ? new Date(attendanceToday.checkInTime).toLocaleTimeString() : '-'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 4 }}>Check-out Time</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {attendanceToday.checkOutTime ? new Date(attendanceToday.checkOutTime).toLocaleTimeString() : '-'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 4 }}>Total Hours</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                {attendanceToday.totalHours ? `${attendanceToday.totalHours}h` : '-'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: getStatusColor(attendanceToday.status) }}>
                {attendanceToday.status}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift History */}
      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Recent Shift History</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--gray-200)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Shift</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Check-in</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Check-out</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Hours</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shiftHistory.map((shift, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    {new Date(shift.date).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {shift.shiftType}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {shift.checkInTime ? new Date(shift.checkInTime).toLocaleTimeString() : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {shift.checkOutTime ? new Date(shift.checkOutTime).toLocaleTimeString() : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {shift.totalHours ? `${shift.totalHours}h` : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      color: getStatusColor(shift.status),
                      fontWeight: 500,
                      fontSize: 12
                    }}>
                      {shift.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leave Request Modal */}
      {showLeaveModal && (
        <div className="modal-overlay" onClick={() => setShowLeaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>Request Leave</h3>
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
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Emergency">Emergency Leave</option>
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

              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => setShowLeaveModal(false)} className="btn btn-outline" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </HospitalLayout>
  );
}
