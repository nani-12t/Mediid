import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import HospitalLayout from '../../components/common/HospitalLayout';

const monthlyData = [
  { month: 'Aug', patients: 320, revenue: 4.8 }, { month: 'Sep', patients: 380, revenue: 5.6 },
  { month: 'Oct', patients: 410, revenue: 6.1 }, { month: 'Nov', patients: 445, revenue: 6.8 },
  { month: 'Dec', patients: 395, revenue: 5.9 }, { month: 'Jan', patients: 468, revenue: 7.2 }
];
const deptData = [
  { name: 'Cardiology', value: 28, color: '#f97066' },
  { name: 'General', value: 22, color: '#38bdf8' },
  { name: 'Orthopaedics', value: 18, color: '#00b4a0' },
  { name: 'Neurology', value: 14, color: '#8b5cf6' },
  { name: 'Pediatrics', value: 10, color: '#f59e0b' },
  { name: 'Others', value: 8, color: '#94a3b8' }
];
const satisfactionData = [
  { month: 'Aug', score: 91 }, { month: 'Sep', score: 93 }, { month: 'Oct', score: 92 },
  { month: 'Nov', score: 95 }, { month: 'Dec', score: 94 }, { month: 'Jan', score: 96 }
];

const KPI = ({ label, value, sub, color }) => (
  <div className="stat-card">
    <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 6 }}>{label}</p>
    <p style={{ fontSize: 30, fontFamily: 'var(--font-display)', fontWeight: 800, color: color || 'var(--gray-900)' }}>{value}</p>
    {sub && <p style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>{sub}</p>}
  </div>
);

export default function HospitalAnalytics() {
  return (
    <HospitalLayout title="Analytics">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 2 }}>Performance Analytics</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Insights and trends for the last 6 months</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <KPI label="Total Patients (Jan)" value="468" sub="↑ 18% vs last month" color="var(--teal)" />
        <KPI label="Revenue (₹ Lakhs)" value="7.2" sub="↑ 22% growth" color="#8b5cf6" />
        <KPI label="Avg. Wait Time" value="18m" sub="↓ 3min improvement" color="#38bdf8" />
        <KPI label="Satisfaction Score" value="96%" sub="↑ 2% this month" color="#10b981" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Monthly Patients */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Monthly Patient Count</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
              <Bar dataKey="patients" fill="var(--teal)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department Distribution */}
        <div className="card">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Department Distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={deptData} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                {deptData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {deptData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Satisfaction trend */}
      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Patient Satisfaction Trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={satisfactionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--gray-100)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis domain={[85, 100]} tick={{ fontSize: 12 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} formatter={(v) => `${v}%`} />
            <Line type="monotone" dataKey="score" stroke="var(--teal)" strokeWidth={2.5} dot={{ fill: 'var(--teal)', r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </HospitalLayout>
  );
}
