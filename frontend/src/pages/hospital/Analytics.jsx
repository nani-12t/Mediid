import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis 
} from 'recharts';
import { Calendar, Filter, Sparkles, TrendingUp, Clock, CreditCard, Heart, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import HospitalLayout from '../../components/common/HospitalLayout';

// Mock Data Sets based on time filter
const DATA_6M = {
  totalPatients: "468",
  totalPatientsSub: "↑ 18% vs last month",
  revenue: "7.2",
  revenueSub: "↑ 22% growth",
  waitTime: "18m",
  waitTimeSub: "↓ 3min improvement",
  satisfaction: "96%",
  satisfactionSub: "↑ 2% this month",
  monthlyPatients: [
    { month: 'Aug', patients: 320 }, { month: 'Sep', patients: 380 },
    { month: 'Oct', patients: 410 }, { month: 'Nov', patients: 445 },
    { month: 'Dec', patients: 395 }, { month: 'Jan', patients: 468 }
  ],
  channels: [
    { name: 'Aug', OPD: 120, Emergency: 80, Referral: 60, Corporate: 60 },
    { name: 'Sep', OPD: 140, Emergency: 95, Referral: 75, Corporate: 70 },
    { name: 'Oct', OPD: 150, Emergency: 110, Referral: 70, Corporate: 80 },
    { name: 'Nov', OPD: 180, Emergency: 115, Referral: 80, Corporate: 70 },
    { name: 'Dec', OPD: 160, Emergency: 105, Referral: 65, Corporate: 65 },
    { name: 'Jan', OPD: 200, Emergency: 130, Referral: 70, Corporate: 68 }
  ]
};

const DATA_30D = {
  totalPatients: "312",
  totalPatientsSub: "↑ 12% vs last period",
  revenue: "4.8",
  revenueSub: "↑ 15% growth",
  waitTime: "16m",
  waitTimeSub: "↓ 1.5min improvement",
  satisfaction: "95%",
  satisfactionSub: "↑ 1% vs last month",
  monthlyPatients: [
    { month: 'Week 1', patients: 70 }, { month: 'Week 2', patients: 82 },
    { month: 'Week 3', patients: 76 }, { month: 'Week 4', patients: 84 }
  ],
  channels: [
    { name: 'Week 1', OPD: 30, Emergency: 20, Referral: 10, Corporate: 10 },
    { name: 'Week 2', OPD: 35, Emergency: 22, Referral: 15, Corporate: 10 },
    { name: 'Week 3', OPD: 32, Emergency: 20, Referral: 12, Corporate: 12 },
    { name: 'Week 4', OPD: 40, Emergency: 25, Referral: 11, Corporate: 8 }
  ]
};

const DATA_7D = {
  totalPatients: "84",
  totalPatientsSub: "↑ 4% vs last week",
  revenue: "1.2",
  revenueSub: "↑ 5% growth",
  waitTime: "14m",
  waitTimeSub: "↓ 1min improvement",
  satisfaction: "97%",
  satisfactionSub: "↑ 3% vs yesterday",
  monthlyPatients: [
    { month: 'Mon', patients: 12 }, { month: 'Tue', patients: 15 },
    { month: 'Wed', patients: 10 }, { month: 'Thu', patients: 14 },
    { month: 'Fri', patients: 16 }, { month: 'Sat', patients: 9 },
    { month: 'Sun', patients: 8 }
  ],
  channels: [
    { name: 'Mon', OPD: 5, Emergency: 3, Referral: 2, Corporate: 2 },
    { name: 'Tue', OPD: 6, Emergency: 4, Referral: 3, Corporate: 2 },
    { name: 'Wed', OPD: 4, Emergency: 3, Referral: 1, Corporate: 2 },
    { name: 'Thu', OPD: 7, Emergency: 3, Referral: 2, Corporate: 2 },
    { name: 'Fri', OPD: 8, Emergency: 4, Referral: 2, Corporate: 2 },
    { name: 'Sat', OPD: 5, Emergency: 2, Referral: 1, Corporate: 1 },
    { name: 'Sun', OPD: 4, Emergency: 2, Referral: 1, Corporate: 1 }
  ]
};

const deptData = [
  { name: 'Cardiology', value: 28, color: '#f87171' },
  { name: 'General Medicine', value: 22, color: '#38bdf8' },
  { name: 'Orthopaedics', value: 18, color: '#00b4a0' },
  { name: 'Neurology', value: 14, color: '#a78bfa' },
  { name: 'Pediatrics', value: 10, color: '#fbbf24' },
  { name: 'Others', value: 8, color: '#94a3b8' }
];

const resourceUtilization = [
  { subject: 'ICU Beds', A: 110, B: 130, fullMark: 150 },
  { subject: 'OT Load', A: 130, B: 110, fullMark: 150 },
  { subject: 'OPD Cap', A: 95, B: 120, fullMark: 150 },
  { subject: 'Diagnostics', A: 85, B: 90, fullMark: 150 },
  { subject: 'Lab Output', A: 125, B: 105, fullMark: 150 },
  { subject: 'Pharmacy Stock', A: 140, B: 125, fullMark: 150 },
];

const satisfactionData = [
  { month: 'Aug', score: 91 }, { month: 'Sep', score: 93 }, { month: 'Oct', score: 92 },
  { month: 'Nov', score: 95 }, { month: 'Dec', score: 94 }, { month: 'Jan', score: 96 }
];

const KPI = ({ icon: Icon, label, value, sub, color, bg }) => (
  <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 22 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <span style={{ fontSize: 12.5, color: 'var(--gray-500)', fontWeight: 600 }}>{label}</span>
      <div style={{ background: bg || 'var(--gray-50)', padding: 8, borderRadius: 10 }}>
        <Icon size={16} color={color || 'var(--gray-600)'} />
      </div>
    </div>
    <div>
      <p style={{ fontSize: 26, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
        {value}
      </p>
      {sub && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: sub.includes('↓') ? 'var(--coral)' : '#10b981', fontWeight: 600 }}>
          {sub.includes('↓') ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'rgba(9, 14, 26, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 180, 160, 0.25)',
        padding: '12px 16px',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-md)',
        color: 'white',
        fontSize: '12.5px',
        fontFamily: 'var(--font-body)'
      }}>
        <p style={{ fontWeight: 700, marginBottom: 6, color: 'var(--gray-300)' }}>{label}</p>
        {payload.map((entry, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.fill || entry.color || 'var(--teal)' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{entry.name}:</span>
            <span style={{ fontWeight: 700, color: 'white' }}>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function HospitalAnalytics() {
  const [timeRange, setTimeRange] = useState('6m');

  // Select active dataset
  const activeData = timeRange === '7d' ? DATA_7D : (timeRange === '30d' ? DATA_30D : DATA_6M);

  return (
    <HospitalLayout title="Analytics Platform">
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 28 }} className="fade-in">
        <div>
          <h2 style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
            Operations & Performance Analytics
          </h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 13.5 }}>Dynamic telemetry and clinical performance logs.</p>
        </div>
        
        {/* Filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gray-100)', padding: 4, borderRadius: 12, border: '1px solid var(--gray-200)' }}>
          <button 
            onClick={() => setTimeRange('7d')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'var(--transition)',
              background: timeRange === '7d' ? 'var(--white)' : 'transparent',
              color: timeRange === '7d' ? 'var(--navy)' : 'var(--gray-500)',
              boxShadow: timeRange === '7d' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            7 Days
          </button>
          <button 
            onClick={() => setTimeRange('30d')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'var(--transition)',
              background: timeRange === '30d' ? 'var(--white)' : 'transparent',
              color: timeRange === '30d' ? 'var(--navy)' : 'var(--gray-500)',
              boxShadow: timeRange === '30d' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            30 Days
          </button>
          <button 
            onClick={() => setTimeRange('6m')}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'var(--transition)',
              background: timeRange === '6m' ? 'var(--white)' : 'transparent',
              color: timeRange === '6m' ? 'var(--navy)' : 'var(--gray-500)',
              boxShadow: timeRange === '6m' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            6 Months
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16, marginBottom: 28 }} className="fade-in">
        <KPI icon={Heart} label="Total Admitted Patients" value={activeData.totalPatients} sub={activeData.totalPatientsSub} color="var(--teal)" bg="hsl(172, 95%, 95%)" />
        <KPI icon={CreditCard} label="Billing Volume (₹ Lakhs)" value={activeData.revenue} sub={activeData.revenueSub} color="#8b5cf6" bg="#f5f3ff" />
        <KPI icon={Clock} label="Average Clinic Wait Time" value={activeData.waitTime} sub={activeData.waitTimeSub} color="var(--sky)" bg="hsl(200, 95%, 95%)" />
        <KPI icon={TrendingUp} label="Patient Satisfaction Score" value={activeData.satisfaction} sub={activeData.satisfactionSub} color="#10b981" bg="hsl(148, 70%, 94%)" />
      </div>

      {/* Row 1: Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24, marginBottom: 24 }} className="fade-in">
        
        {/* Main Patients flow bar chart */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>Patient Consultations</h3>
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Volume stats for the active range.</p>
            </div>
            <span style={{ fontSize: 11, background: 'rgba(0,180,160,0.1)', color: 'var(--teal)', fontWeight: 700, padding: '4px 8px', borderRadius: 6 }}>
              Live Telemetry
            </span>
          </div>
          
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activeData.monthlyPatients}>
              <defs>
                <linearGradient id="glowingBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--teal-light)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--teal)" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,180,160,0.03)' }} />
              <Bar dataKey="patients" fill="url(#glowingBar)" radius={[6, 6, 0, 0]} maxBarSize={45} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dept Distribution pie chart */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>Department Distribution</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 16 }}>Clinical workload share.</p>
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie 
                  data={deptData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={50}
                  outerRadius={70} 
                  paddingAngle={3}
                  dataKey="value"
                >
                  {deptData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', fontFamily: 'var(--font-display)' }}>100%</span>
              <span style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase' }}>Workload</span>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 16, borderTop: '1px solid var(--gray-100)', paddingTop: 14 }}>
            {deptData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                <span style={{ fontSize: 11, color: 'var(--gray-600)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 95 }}>{d.name}</span>
                <span style={{ fontSize: 10, color: 'var(--gray-400)', marginLeft: 'auto', fontWeight: 600 }}>{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Advanced Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }} className="fade-in">
        {/* Admission Channels stacked Area chart */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>Admission Channels</h3>
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Referral vs Emergency pathways.</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activeData.channels}>
              <defs>
                <linearGradient id="gradOPD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradEmergency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--coral)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--coral)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradReferral" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--sky)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--sky)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="OPD" stroke="var(--teal)" fillOpacity={1} fill="url(#gradOPD)" strokeWidth={1.8} />
              <Area type="monotone" dataKey="Emergency" stroke="var(--coral)" fillOpacity={1} fill="url(#gradEmergency)" strokeWidth={1.8} />
              <Area type="monotone" dataKey="Referral" stroke="var(--sky)" fillOpacity={1} fill="url(#gradReferral)" strokeWidth={1.8} />
            </AreaChart>
          </ResponsiveContainer>
          
          <div style={{ display: 'flex', gap: 16, marginTop: 14, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>OPD Queue</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>Emergency</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sky)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>Referral / Corporate</span>
            </div>
          </div>
        </div>

        {/* Resource Utilization radar chart */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)' }}>Logistics & Resource Radar</h3>
              <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>OPD capacity vs ward utilization rates.</p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={220}>
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={resourceUtilization}>
              <PolarGrid stroke="var(--gray-100)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: 'var(--gray-500)', fontWeight: 600 }} />
              <PolarRadiusAxis angle={30} domain={[0, 150]} tick={{ fontSize: 9 }} tickCount={4} />
              <Radar name="Active Util" dataKey="A" stroke="var(--teal)" fill="var(--teal)" fillOpacity={0.2} strokeWidth={1.8} />
              <Radar name="Buffer Threshold" dataKey="B" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.08} strokeWidth={1} strokeDasharray="3 3" />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>

          <div style={{ display: 'flex', gap: 16, marginTop: 14, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 3, background: 'var(--teal)' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>Active Occupancy</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 3, background: '#8b5cf6', borderBottom: '1px dashed #8b5cf6' }} />
              <span style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 500 }}>Buffer Limit</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Satisfaction Trend line chart */}
      <div className="card fade-in">
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)', marginBottom: 4 }}>Continuous Patient Satisfaction</h3>
        <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 18 }}>6-month average consent trust ratio.</p>
        
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={satisfactionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} />
            <YAxis domain={[80, 100]} tick={{ fontSize: 11, fill: 'var(--gray-400)' }} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="score" 
              stroke="var(--teal)" 
              strokeWidth={3} 
              dot={{ fill: 'var(--teal)', r: 4, stroke: 'white', strokeWidth: 1.5 }} 
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </HospitalLayout>
  );
}
