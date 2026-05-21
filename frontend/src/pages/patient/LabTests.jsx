import React, { useState } from 'react';
import {
  Search, MapPin, Phone, MessageCircle, ChevronRight, ChevronLeft,
  FlaskConical, Home, FileCheck, Star, Clock, ShoppingCart, Plus, X
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';

/* ── Data ─────────────────────────────────────────────────────────────── */
const TOP_TESTS = [
  { id: 1, name: 'Thyroid Profile Total', alias: 'Known as Thyroid Profile, Total Blood', originalPrice: 1200, price: 420 },
  { id: 2, name: 'Complete Blood Count', alias: 'Known as Complete Blood Count, Automated Blood', originalPrice: 600, price: 330 },
  { id: 3, name: 'Lipid Profile', alias: 'Known as Lipid Profile, Total Blood', originalPrice: 980, price: 620 },
  { id: 4, name: 'Liver Function Test', alias: 'Known as Liver Function Tests Blood', originalPrice: 1200, price: 790 },
  { id: 5, name: 'Dengue NS1', alias: 'Known as Dengue NS1, Antigen For Blood', originalPrice: 900, price: 630 },
  { id: 6, name: 'Malaria Antigen', alias: 'Known as Malaria Antigen For Blood', originalPrice: 700, price: 500 },
];

const PACKAGES = {
  featured: [
    { id: 1, name: 'Vitamin Deficiency Health C...', age: 'For Age 11–20yrs', tests: 5, price: 899, originalPrice: 1400, discount: '35%', image: '👩‍⚕️' },
    { id: 2, name: 'Young Indian Health Checku...', age: 'For Age 20–30yrs', tests: 90, price: 2599, originalPrice: 4100, discount: '36%', image: '🧑' },
    { id: 3, name: 'Comprehensive Full Body Ch...', age: 'For Age 15–100yrs', tests: 106, price: 3499, originalPrice: 4600, discount: '23%', image: '👨‍👩‍👧' },
    { id: 4, name: 'Annual Health Check...', age: 'For Age 15–100yrs', tests: 72, price: 3499, originalPrice: 5200, discount: '32%', image: '💊' },
  ],
  womens: [
    { id: 5, name: "Women's Wellness Panel", age: 'For Age 20–50yrs', tests: 48, price: 1299, originalPrice: 2100, discount: '38%', image: '👩' },
    { id: 6, name: "PCOS/Hormonal Profile", age: 'For Age 18–45yrs', tests: 16, price: 999, originalPrice: 1600, discount: '37%', image: '🩺' },
    { id: 7, name: "Bone & Joint Health", age: 'For Age 30–60yrs', tests: 12, price: 699, originalPrice: 1100, discount: '36%', image: '💪' },
    { id: 8, name: "Fertility & Thyroid Test", age: 'For Age 20–40yrs', tests: 22, price: 1599, originalPrice: 2400, discount: '33%', image: '🌸' },
  ],
  mens: [
    { id: 9, name: "Men's Comprehensive Health", age: 'For Age 25–60yrs', tests: 62, price: 1999, originalPrice: 3200, discount: '37%', image: '👨' },
    { id: 10, name: "Cardiac Risk Profile", age: 'For Age 30–70yrs', tests: 18, price: 1199, originalPrice: 1800, discount: '33%', image: '❤️' },
    { id: 11, name: "Sports & Fitness Panel", age: 'For Age 18–45yrs', tests: 30, price: 1499, originalPrice: 2400, discount: '37%', image: '🏃' },
    { id: 12, name: "Prostate & Hormonal Check", age: 'For Age 40–75yrs', tests: 14, price: 799, originalPrice: 1300, discount: '38%', image: '🩻' },
  ],
};

const HEALTH_CONCERNS = [
  { name: 'Fever', icon: '🌡️', bg: '#fff5f5' },
  { name: 'Diabetes', icon: '🩸', bg: '#ecfdf5' },
  { name: 'Skin', icon: '👤', bg: '#f5f3ff' },
  { name: 'Kidney', icon: '🫘', bg: '#fff7ed' },
  { name: 'Digestion', icon: '🥣', bg: '#f0f9ff' },
  { name: 'Cancer', icon: '🎗️', bg: '#fdf2f8' },
];

const VITAL_CHECKUPS = [
  { name: 'Lipid Profile', tests: 'LDL Cholesterol, HDL Cholesterol + 5 Tests', icon: '❤️', color: '#fee2e2' },
  { name: 'Liver Profile', tests: 'Gamma Glutamyl Transferase, Total Bilirubin + 5 Tests', icon: '🟤', color: '#fef9c3' },
  { name: 'Blood Sugar', tests: 'HbA1C, Fasting Blood Sugar + 3 Tests', icon: '🩸', color: '#ede9fe' },
];

/* ── Sub-components ───────────────────────────────────────────────────── */
const TestCard = ({ test, onAdd, inCart }) => (
  <div style={{
    background: 'white', borderRadius: 10, border: '1.5px solid #e5e7eb',
    padding: '14px 14px 12px', minWidth: 170, maxWidth: 190,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    transition: 'box-shadow 0.2s', cursor: 'default'
  }}>
    <div>
      <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.35 }}>{test.name}</p>
      <p style={{ fontSize: 10.5, color: '#6b7280', lineHeight: 1.4, marginBottom: 10 }}>{test.alias}</p>
    </div>
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>₹{test.price}</span>
        <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>₹{test.originalPrice}</span>
      </div>
      <button
        onClick={onAdd}
        style={{
          width: '100%', padding: '7px 0', border: '1.5px solid #0ea5e9',
          borderRadius: 6, background: inCart ? '#0ea5e9' : 'white',
          color: inCart ? 'white' : '#0ea5e9', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', transition: 'all 0.2s', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: 4
        }}
      >
        {inCart ? <><FlaskConical size={12} /> IN CART</> : 'ADD TO CART'}
      </button>
    </div>
  </div>
);

const PackageCard = ({ pkg }) => {
  const bgColors = ['#fce7f3', '#e0f2fe', '#ecfdf5', '#fef3c7'];
  const bg = bgColors[pkg.id % bgColors.length];
  return (
    <div style={{
      minWidth: 215, maxWidth: 230,
      background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14,
      overflow: 'hidden', flexShrink: 0, cursor: 'pointer',
      transition: 'box-shadow 0.2s',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <div style={{
        height: 140, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 64, position: 'relative'
      }}>
        {pkg.image}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: '#059669', color: 'white', fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 4
        }}>
          {pkg.discount} OFF
        </span>
        <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 10, color: '#374151', background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
          Includes {pkg.tests} tests
        </span>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <p style={{ fontSize: 12.5, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.35 }}>{pkg.name}</p>
        <p style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 10 }}>{pkg.age}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>₹{pkg.price}</span>
          <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>₹{pkg.originalPrice}</span>
        </div>
        <button style={{
          width: '100%', padding: '8px 0', border: '1.5px solid #111827',
          borderRadius: 6, background: 'white', color: '#111827',
          fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }}>
          Book Now
        </button>
      </div>
    </div>
  );
};

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function LabTests() {
  const [cart, setCart] = useState({});
  const [pkgTab, setPkgTab] = useState('featured');
  const [city, setCity] = useState('Bangalore');
  const [search, setSearch] = useState('');

  const toggleCart = (id) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id]; else next[id] = true;
      return next;
    });
  };

  const cartCount = Object.keys(cart).length;

  return (
    <PatientLayout title="Lab Tests">
      <div style={{ background: '#fff', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

        {/* ── Sticky Header ────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'white', borderBottom: '1px solid #e5e7eb',
          padding: '12px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap'
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap' }}>
            Book Lab Tests Online
          </h1>

          {/* Search + city */}
          <div style={{ flex: 1, minWidth: 260, maxWidth: 580, display: 'flex', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRight: '1.5px solid #e5e7eb', cursor: 'pointer', flexShrink: 0 }}>
              <MapPin size={15} color="#6b7280" />
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                style={{ border: 'none', background: 'none', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', outline: 'none' }}
              >
                {['Bangalore', 'Chennai', 'Delhi', 'Mumbai', 'Hyderabad'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
              <Search size={15} color="#9ca3af" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search for tests, packages & profiles"
                style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 13, color: '#111827', padding: '11px 0' }}
              />
            </div>
          </div>

          {/* CTA buttons + cart */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Phone size={15} /> Book via Call
            </button>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#25d366', color: 'white', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <MessageCircle size={15} /> Book via Whatsapp
            </button>
            {cartCount > 0 && (
              <div style={{ position: 'relative', cursor: 'pointer' }}>
                <ShoppingCart size={24} color="#374151" />
                <span style={{
                  position: 'absolute', top: -6, right: -6, background: '#ef4444',
                  color: 'white', fontSize: 10, fontWeight: 700, width: 17, height: 17,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>{cartCount}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Top Booked Tests ─────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Top Booked Diagnostic Tests</h2>
              <button style={{ fontSize: 13, color: '#0ea5e9', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>View all <ChevronRight size={14} /></button>
            </div>
            <p style={{ fontSize: 12, color: '#10b981', fontWeight: 700, marginBottom: 20 }}>⚡ Get reports within 24hrs</p>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
              {TOP_TESTS.map(t => (
                <TestCard key={t.id} test={t} inCart={!!cart[t.id]} onAdd={() => toggleCart(t.id)} />
              ))}
            </div>
          </section>

          {/* ── Popular Health Checkup Packages ─────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 16 }}>Popular Health Checkup Packages</h2>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1.5px solid #e5e7eb', marginBottom: 24, gap: 0 }}>
              {[
                { key: 'featured', label: 'Featured Checkups' },
                { key: 'womens', label: "Women's Health" },
                { key: 'mens', label: "Men's Health" },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setPkgTab(tab.key)}
                  style={{
                    padding: '9px 18px', border: 'none', background: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    color: pkgTab === tab.key ? '#0ea5e9' : '#6b7280',
                    borderBottom: pkgTab === tab.key ? '2.5px solid #0ea5e9' : '2.5px solid transparent',
                    marginBottom: -2
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Package cards scrollable row */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 18, overflowX: 'auto', paddingBottom: 10 }}>
                {(PACKAGES[pkgTab] || []).map(pkg => <PackageCard key={pkg.id} pkg={pkg} />)}
              </div>
              <button style={{
                position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, borderRadius: '50%', background: 'white',
                border: '1.5px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}>
                <ChevronRight size={18} color="#374151" />
              </button>
            </div>
          </section>

          {/* ── How it works ─────────────────────────────────────── */}
          <section style={{ background: '#f8fafc', borderRadius: 18, padding: '40px 32px', marginBottom: 48, textAlign: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 36 }}>How it works?</h2>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, flexWrap: 'wrap' }}>
              {[
                { icon: <FlaskConical size={26} color="#0ea5e9" />, label: 'Book tests &\npackages' },
                { icon: <Home size={26} color="#0ea5e9" />, label: 'Home sample\ncollection' },
                { icon: <FileCheck size={26} color="#0ea5e9" />, label: 'Reports in\nMediID app' },
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <div style={{ textAlign: 'center', maxWidth: 120, padding: '0 8px' }}>
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', background: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}>
                      {step.icon}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0ea5e9', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{step.label}</p>
                  </div>
                  {i < 2 && (
                    <div style={{ width: 80, borderTop: '2px dashed #cbd5e1', flexShrink: 0, marginBottom: 40 }} />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── Find Tests by Health Concern ─────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Find Tests by Health Concern</h2>
              <button style={{ fontSize: 13, color: '#0ea5e9', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ChevronRight size={14} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 24, overflowX: 'auto', paddingBottom: 8 }}>
              {HEALTH_CONCERNS.map(item => (
                <div key={item.name} style={{ textAlign: 'center', minWidth: 90, cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{
                    width: 90, height: 90, borderRadius: '50%', background: item.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36, margin: '0 auto 10px',
                    border: '1.5px solid #e5e7eb'
                  }}>
                    {item.icon}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{item.name}</p>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'white',
                  border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                }}>
                  <ChevronRight size={18} color="#374151" />
                </button>
              </div>
            </div>
          </section>

          {/* ── Recommended Vital Checkups ───────────────────────── */}
          <section>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 20 }}>
              Recommended <span style={{ color: '#ef4444' }}>Vital</span> Checkups
            </h2>
            <div style={{ display: 'flex', gap: 18, overflowX: 'auto', paddingBottom: 8 }}>
              {VITAL_CHECKUPS.map(v => (
                <div key={v.name} style={{
                  minWidth: 240, border: '1.5px solid #e5e7eb', borderRadius: 14,
                  padding: '18px 18px 16px', background: 'white',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                }}>
                  <div>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: v.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 10 }}>
                      {v.icon}
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', marginBottom: 6 }}>{v.name}</p>
                    <p style={{ fontSize: 11.5, color: '#6b7280', lineHeight: 1.5, marginBottom: 18 }}>{v.tests}</p>
                  </div>
                  <button style={{
                    padding: '8px 22px', border: '1.5px solid #d1d5db', borderRadius: 7,
                    background: 'white', color: '#111827', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', alignSelf: 'flex-end'
                  }}>
                    Book
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button style={{
                  width: 40, height: 40, borderRadius: '50%', background: 'white',
                  border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                }}>
                  <ChevronRight size={18} color="#374151" />
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>
    </PatientLayout>
  );
}
