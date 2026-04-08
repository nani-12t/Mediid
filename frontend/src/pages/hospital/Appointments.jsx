import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle, XCircle, Clock, Search, Bell, BellOff,
  RefreshCw, Calendar, Phone, User, Stethoscope, MessageSquare,
  ChevronDown, X
} from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';
import { appointmentAPI } from '../../utils/api';
import toast from 'react-hot-toast';

/* ─── constants ─── */
const STATUS_COLORS = {
  pending:     'badge-amber',
  confirmed:   'badge-teal',
  cancelled:   'badge-red',
  completed:   'badge-gray',
  rescheduled: 'badge-blue',
};

const STATUS_ICONS = {
  pending:   '⏳',
  confirmed: '✅',
  cancelled: '❌',
  completed: '🏁',
};

const METHOD_ICONS = {
  app:      '🖥️',
  phone:    '📞',
  whatsapp: '💬',
  sms:      '📱',
  walk_in:  '🚶',
};

const POLL_INTERVAL = 15000; // 15 s auto-refresh

/* ═══════════════════════════════════════════════════ */
export default function HospitalAppointments() {
  const [appointments, setAppointments]   = useState([]);
  const [filter, setFilter]               = useState('pending');
  const [search, setSearch]               = useState('');
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [pendingCount, setPendingCount]   = useState(0);
  const [newCount, setNewCount]           = useState(0);        // badge since last view
  const [autoRefresh, setAutoRefresh]     = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  // For confirm modal
  const [confirmModal, setConfirmModal]   = useState(null);   // apt object
  const [confirmSlot, setConfirmSlot]     = useState('');
  const [confirmDate, setConfirmDate]     = useState('');
  const [confirmNote, setConfirmNote]     = useState('');

  // For reject modal
  const [rejectModal, setRejectModal]     = useState(null);
  const [rejectReason, setRejectReason]   = useState('');

  const timerRef = useRef(null);
  const prevCount = useRef(0);

  /* ── load ── */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const { data } = await appointmentAPI.getHospitalAppointments(params);
      setAppointments(data);
      setLastRefreshed(new Date());

      // Count pending across all statuses for badge
      const { data: countData } = await appointmentAPI.getPendingCount();
      const current = countData.pending || 0;
      // If count increased since last check → new appointments arrived
      if (current > prevCount.current && prevCount.current !== 0) {
        const added = current - prevCount.current;
        setNewCount(n => n + added);
        toast(`🔔 ${added} new appointment request${added > 1 ? 's' : ''}!`, { icon: '🏥', duration: 4000 });
        // Browser notification if allowed
        if (Notification.permission === 'granted') {
          new Notification('MediID – New Appointment', {
            body: `${added} new appointment request${added > 1 ? 's' : ''} received`,
            icon: '/favicon.ico',
          });
        }
      }
      prevCount.current = current;
      setPendingCount(current);
    } catch (e) {
      if (!silent) console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  /* ── initial load + re-load on filter change ── */
  useEffect(() => { load(false); }, [filter]);

  /* ── auto-refresh polling ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(() => load(true), POLL_INTERVAL);
    }
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, load]);

  /* ── ask for browser notification permission ── */
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  /* ── clear new badge when user clicks Pending tab ── */
  useEffect(() => {
    if (filter === 'pending') setNewCount(0);
  }, [filter]);

  /* ── actions ── */
  const handleConfirm = async () => {
    if (!confirmModal) return;
    try {
      await appointmentAPI.updateStatus(confirmModal._id, {
        status: 'confirmed',
        timeSlot: confirmSlot || confirmModal.timeSlot,
        appointmentDate: confirmDate || confirmModal.appointmentDate,
        staffNotes: confirmNote,
      });
      toast.success('✅ Appointment confirmed — SMS sent to patient');
      setConfirmModal(null);
      load(false);
    } catch { toast.error('Action failed'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await appointmentAPI.updateStatus(rejectModal._id, {
        status: 'cancelled',
        staffNotes: rejectReason,
      });
      toast.success('Appointment rejected — patient notified by SMS');
      setRejectModal(null);
      load(false);
    } catch { toast.error('Action failed'); }
  };

  const handleComplete = async (id) => {
    try {
      await appointmentAPI.updateStatus(id, { status: 'completed' });
      toast.success('Marked as completed');
      load(false);
    } catch { toast.error('Action failed'); }
  };

  /* ── filter ── */
  const filtered = appointments.filter(a => {
    const q = search.toLowerCase();
    return !q
      || `${a.patient?.firstName} ${a.patient?.lastName}`.toLowerCase().includes(q)
      || a.doctor?.specialization?.toLowerCase().includes(q)
      || a.patient?.uid?.toLowerCase().includes(q)
      || `${a.doctor?.firstName} ${a.doctor?.lastName}`.toLowerCase().includes(q);
  });

  /* ── shared modal styles ── */
  const overlay  = { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 };
  const modalBox = { background:'#fff', borderRadius:16, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,0.18)', overflow:'hidden' };
  const mHead    = { display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'20px 24px 16px', borderBottom:'1px solid #f1f1f1' };
  const mBody    = { padding:'20px 24px', display:'flex', flexDirection:'column', gap:14 };
  const mFoot    = { padding:'14px 24px 20px', borderTop:'1px solid #f1f1f1', display:'flex', gap:10 };
  const fLabel   = { fontSize:13, fontWeight:500, color:'#374151', marginBottom:5, display:'block' };
  const closeX   = { background:'#f3f4f6', border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, fontSize:13, color:'#6b7280' };

  /* ─────────────────────────────────────── */
  return (
    <HospitalLayout title="Appointments">

      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontFamily:'var(--font-display)', fontWeight:700, marginBottom:2 }}>
            Appointment Requests
            {pendingCount > 0 && (
              <span style={{ marginLeft:10, background:'#ef4444', color:'#fff', borderRadius:999, fontSize:12, fontWeight:700, padding:'2px 9px', verticalAlign:'middle' }}>
                {pendingCount} pending
              </span>
            )}
            {newCount > 0 && (
              <span style={{ marginLeft:6, background:'#f59e0b', color:'#fff', borderRadius:999, fontSize:11, fontWeight:700, padding:'2px 8px', verticalAlign:'middle', animation:'pulse 1s infinite' }}>
                +{newCount} new
              </span>
            )}
          </h2>
          <p style={{ color:'var(--gray-500)', fontSize:14 }}>
            Manage patient appointment requests · auto-refreshes every 15 s
          </p>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {lastRefreshed && (
            <span style={{ fontSize:11, color:'var(--gray-400)' }}>
              Updated {lastRefreshed.toLocaleTimeString('en-IN')}
            </span>
          )}
          <button
            onClick={() => load(true)}
            title="Refresh now"
            style={{ background:'none', border:'1px solid var(--gray-200)', borderRadius:8, padding:'6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:13, color:'var(--gray-600)' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => setAutoRefresh(a => !a)}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            style={{ background: autoRefresh ? '#ecfdf5' : '#f3f4f6', border:`1px solid ${autoRefresh ? '#a7f3d0' : 'var(--gray-200)'}`, borderRadius:8, padding:'6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:13, color: autoRefresh ? '#065f46' : 'var(--gray-500)' }}
          >
            {autoRefresh ? <Bell size={14} /> : <BellOff size={14} />}
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
        </div>
      </div>

      {/* ── Search + Tabs ── */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <div className="search-bar" style={{ flex:1, minWidth:220, marginBottom:0 }}>
          <Search size={16} color="var(--gray-400)" />
          <input placeholder="Search patient name, doctor, ID..." value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--gray-400)' }}><X size={14} /></button>}
        </div>
        <div className="tabs" style={{ marginBottom:0 }}>
          {['pending','confirmed','completed','cancelled','all'].map(s => (
            <button key={s} className={`tab-btn ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)} style={{ textTransform:'capitalize', position:'relative' }}>
              {s}
              {s === 'pending' && pendingCount > 0 && (
                <span style={{ position:'absolute', top:-6, right:-6, background:'#ef4444', color:'#fff', borderRadius:999, fontSize:10, fontWeight:700, minWidth:16, height:16, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <Clock size={32} style={{ margin:'0 auto 12px', opacity:0.3 }} />
          <p>No {filter === 'all' ? '' : filter} appointments</p>
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Date & Time</th>
                <th>Contact</th>
                <th>Via</th>
                <th>Status</th>
                <th style={{ minWidth:160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(apt => (
                <tr key={apt._id} style={{ background: apt.status === 'pending' ? '#fffbeb' : 'transparent' }}>

                  {/* Patient */}
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div className="avatar" style={{ width:34, height:34, fontSize:13, flexShrink:0 }}>
                        {apt.patient?.firstName?.[0] || 'P'}
                      </div>
                      <div>
                        <p style={{ fontSize:13, fontWeight:600 }}>{apt.patient?.firstName} {apt.patient?.lastName}</p>
                        <p style={{ fontSize:11, color:'var(--gray-400)' }}>{apt.patient?.uid}</p>
                        {apt.patient?.phone && (
                          <p style={{ fontSize:11, color:'var(--gray-400)', display:'flex', alignItems:'center', gap:3 }}>
                            <Phone size={10} />{apt.patient.phone}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Doctor */}
                  <td>
                    <p style={{ fontSize:13, fontWeight:500 }}>Dr. {apt.doctor?.firstName} {apt.doctor?.lastName}</p>
                    <p style={{ fontSize:11, color:'var(--teal)', fontWeight:500 }}>{apt.doctor?.specialization}</p>
                  </td>

                  {/* Date */}
                  <td>
                    <p style={{ fontSize:13, fontWeight:500 }}>{new Date(apt.appointmentDate).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</p>
                    <p style={{ fontSize:12, color:'var(--gray-400)' }}>{apt.timeSlot || 'TBD'}</p>
                    <p style={{ fontSize:11, color:'var(--gray-400)' }}>{apt.type}</p>
                  </td>

                  {/* Contact */}
                  <td>
                    <p style={{ fontSize:12, color:'var(--gray-600)' }}>{apt.contactPhone || apt.patient?.phone || '—'}</p>
                    {apt.symptoms && (
                      <p style={{ fontSize:11, color:'var(--gray-400)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={apt.symptoms}>
                        💬 {apt.symptoms}
                      </p>
                    )}
                  </td>

                  {/* Via */}
                  <td style={{ fontSize:13 }}>
                    {METHOD_ICONS[apt.bookingMethod] || '🖥️'} <span style={{ color:'var(--gray-500)' }}>{apt.bookingMethod}</span>
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`badge ${STATUS_COLORS[apt.status]}`} style={{ textTransform:'capitalize', fontSize:11 }}>
                      {STATUS_ICONS[apt.status]} {apt.status}
                    </span>
                    {apt.staffNotes && (
                      <p style={{ fontSize:10, color:'var(--gray-400)', marginTop:3, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={apt.staffNotes}>
                        {apt.staffNotes}
                      </p>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    {apt.status === 'pending' && (
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button
                          style={{ background:'#d1fae5', color:'#065f46', border:'none', borderRadius:6, padding:'5px 10px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
                          onClick={() => { setConfirmModal(apt); setConfirmSlot(apt.timeSlot||''); setConfirmDate(apt.appointmentDate?.split('T')[0]||''); setConfirmNote(''); }}
                        >
                          <CheckCircle size={12} /> Confirm
                        </button>
                        <button
                          style={{ background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:6, padding:'5px 10px', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
                          onClick={() => { setRejectModal(apt); setRejectReason(''); }}
                        >
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    )}
                    {apt.status === 'confirmed' && (
                      <button
                        style={{ background:'#eff6ff', color:'#1d4ed8', border:'none', borderRadius:6, padding:'5px 10px', fontSize:12, fontWeight:600, cursor:'pointer' }}
                        onClick={() => handleComplete(apt._id)}
                      >
                        🏁 Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Confirm Modal ═══ */}
      {confirmModal && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
          <div style={modalBox}>
            <div style={mHead}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:700, color:'#111827', marginBottom:3 }}>Confirm Appointment</h3>
                <p style={{ fontSize:13, color:'#9ca3af' }}>
                  {confirmModal.patient?.firstName} {confirmModal.patient?.lastName} · Dr. {confirmModal.doctor?.firstName} {confirmModal.doctor?.lastName}
                </p>
              </div>
              <button style={closeX} onClick={() => setConfirmModal(null)}><X size={15} /> Close</button>
            </div>
            <div style={mBody}>
              <div style={{ background:'#f0fdf4', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#166534' }}>
                📱 An SMS + WhatsApp will be sent to the patient on confirmation.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={fLabel}>Confirm Date</label>
                  <input className="form-input" type="date"
                    value={confirmDate}
                    onChange={e => setConfirmDate(e.target.value)} />
                </div>
                <div>
                  <label style={fLabel}>Confirm Time Slot</label>
                  <select className="form-input form-select" value={confirmSlot} onChange={e => setConfirmSlot(e.target.value)}>
                    <option value="">Keep existing</option>
                    {['09:00 AM','09:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM','12:00 PM','02:00 PM','02:30 PM','03:00 PM','03:30 PM','04:00 PM','04:30 PM','05:00 PM'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={fLabel}>Note to Patient (optional)</label>
                <textarea className="form-input" rows={2} style={{ resize:'none' }}
                  placeholder="e.g. Please bring previous reports and Aadhaar card"
                  value={confirmNote} onChange={e => setConfirmNote(e.target.value)} />
              </div>
            </div>
            <div style={mFoot}>
              <button onClick={() => setConfirmModal(null)}
                style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', fontSize:14, fontWeight:500, color:'#374151', cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={handleConfirm}
                style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', background:'var(--teal)', fontSize:14, fontWeight:600, color:'#fff', cursor:'pointer' }}>
                ✅ Confirm & Notify Patient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Reject Modal ═══ */}
      {rejectModal && (
        <div style={overlay} onClick={e => { if (e.target === e.currentTarget) setRejectModal(null); }}>
          <div style={modalBox}>
            <div style={mHead}>
              <div>
                <h3 style={{ fontSize:17, fontWeight:700, color:'#111827', marginBottom:3 }}>Reject Appointment</h3>
                <p style={{ fontSize:13, color:'#9ca3af' }}>
                  {rejectModal.patient?.firstName} {rejectModal.patient?.lastName}
                </p>
              </div>
              <button style={closeX} onClick={() => setRejectModal(null)}><X size={15} /> Close</button>
            </div>
            <div style={mBody}>
              <div style={{ background:'#fff1f2', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#9f1239' }}>
                ⚠️ The patient will receive an SMS notifying them of the cancellation.
              </div>
              <div>
                <label style={fLabel}>Reason for rejection <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea className="form-input" rows={3} style={{ resize:'none' }}
                  placeholder="e.g. Doctor unavailable on this date, please rebook..."
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
              </div>
            </div>
            <div style={mFoot}>
              <button onClick={() => setRejectModal(null)}
                style={{ flex:1, padding:'11px 0', borderRadius:10, border:'1px solid #e5e7eb', background:'#fff', fontSize:14, fontWeight:500, color:'#374151', cursor:'pointer' }}>
                Go Back
              </button>
              <button onClick={handleReject} disabled={!rejectReason.trim()}
                style={{ flex:2, padding:'11px 0', borderRadius:10, border:'none', background: rejectReason.trim() ? '#ef4444' : '#fca5a5', fontSize:14, fontWeight:600, color:'#fff', cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>
                ❌ Reject & Notify Patient
              </button>
            </div>
          </div>
        </div>
      )}

    </HospitalLayout>
  );
}