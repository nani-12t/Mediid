import React, { useState, useRef } from 'react';
import {
  Search, ShoppingCart, Plus, Minus, ChevronRight,
  Upload, Sparkles, MapPin, CreditCard, ShoppingBag, Trash2,
  MessageCircle, X, Pill
} from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { ocrAPI, medicineOrderAPI } from '../../utils/api';
import toast from 'react-hot-toast';

/* ── Data ─────────────────────────────────────────────────────────────── */
const HEALTH_CONDITIONS = [
  { name: 'SKIN\nCARE', bg: 'linear-gradient(135deg,#b8d4e8,#9bbfd4)', img: '🌸' },
  { name: 'SEXUAL\nWELLNESS', bg: 'linear-gradient(135deg,#c8dfc8,#a8c8a8)', img: '💚' },
  { name: 'WEIGHT\nMANAGEMENT', bg: 'linear-gradient(135deg,#d4c8d4,#c0afc0)', img: '⚖️' },
  { name: 'PAIN\nRELIEF', bg: 'linear-gradient(135deg,#c8c4d8,#b0abc4)', img: '💊' },
];

const CATEGORIES = [
  { name: 'BABY\nCARE', bg: 'linear-gradient(135deg,#f4c2c2,#e8a8a8)', img: '👶' },
  { name: 'FITNESS &\nWELLNESS', bg: 'linear-gradient(135deg,#c2c2c2,#a8a8a8)', img: '🏃' },
  { name: 'FAMILY\nCARE', bg: 'linear-gradient(135deg,#c8d4c8,#b0c4b0)', img: '👨‍👩‍👧' },
  { name: 'ALTERNATE\nMEDICINES', bg: 'linear-gradient(135deg,#d4c8b8,#c4b8a8)', img: '🌿' },
];

const POPULAR_PRODUCTS = [
  { id: 1, name: 'NAN PRO 2 REFILL 400GM', company: 'Nestlé', price: 775, image: '🥛', originalPrice: 890 },
  { id: 2, name: 'LACTOGEN PRO 2 FOLLOW UP REFILL POWDER 400GM', company: 'Nestlé', price: 450, image: '🍼', originalPrice: 520 },
  { id: 3, name: 'APOLLO PHARMACY HAND WASH LEMON GRASS 250ML', company: 'Apollo', price: 90, image: '🧴', originalPrice: 120 },
  { id: 4, name: 'CERELAC STAGE 1 WHEAT APPLE REFILL 300GM', company: 'Nestlé', price: 265, image: '🌾', originalPrice: 310 },
  { id: 5, name: 'APOLLO PHARMACY HAND WASH AQUA BLUE 250ML', company: 'Apollo', price: 80, image: '🫧', originalPrice: 110 },
];

const MEDICINES = [
  { id: 1, name: 'Paracetamol 500mg', company: 'GlaxoSmithKline', price: 40, originalPrice: 60, discount: '33% OFF', type: 'Tablet', stripSize: '15 Tablets', image: '💊' },
  { id: 2, name: 'Vitamin C 500mg', company: 'Abbott', price: 120, originalPrice: 150, discount: '20% OFF', type: 'Chewable', stripSize: '30 Tablets', image: '🍊' },
  { id: 3, name: 'Dolo 650', company: 'Micro Labs', price: 30, originalPrice: 35, discount: '14% OFF', type: 'Tablet', stripSize: '15 Tablets', image: '💊' },
  { id: 4, name: 'Vicks VapoRub', company: 'P&G', price: 85, originalPrice: 100, discount: '15% OFF', type: 'Ointment', stripSize: '25g', image: '🧴' },
  { id: 5, name: 'Digital Thermometer', company: 'Omron', price: 250, originalPrice: 350, discount: '28% OFF', type: 'Device', stripSize: '1 Unit', image: '🌡️' },
  { id: 6, name: 'Hand Sanitizer', company: 'Dettol', price: 50, originalPrice: 75, discount: '33% OFF', type: 'Liquid', stripSize: '100ml', image: '🧼' },
];

/* ── Shared: big category tile ─────────────────────────────────────── */
const BigTile = ({ item }) => (
  <div style={{
    flex: '0 0 calc(25% - 14px)', minWidth: 0,
    borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
    background: item.bg, position: 'relative', height: 120,
    display: 'flex', alignItems: 'flex-end', padding: '12px 14px'
  }}>
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '45%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>
      {item.img}
    </div>
    <p style={{ fontSize: 12, fontWeight: 800, color: 'white', lineHeight: 1.35, whiteSpace: 'pre-line', textShadow: '0 1px 4px rgba(0,0,0,0.3)', zIndex: 1 }}>
      {item.name}
    </p>
  </div>
);

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function Medicines() {
  const [cart, setCart] = useState({});
  const [search, setSearch] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [address, setAddress] = useState({ street: '', city: '', state: '', pincode: '' });
  const [paymentMethod, setPaymentMethod] = useState('Cash on Delivery');
  const fileInputRef = useRef(null);

  const addToCart = (id) => {
    setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
    toast.success('Added to cart');
  };
  const removeFromCart = (id) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[id] > 1) next[id]--; else delete next[id];
      return next;
    });
  };
  const deleteFromCart = (id) => {
    setCart(prev => { const n = { ...prev }; delete n[id]; return n; });
    toast.success('Removed from cart');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setIsUploading(true);
      toast.loading('Scanning prescription with AI OCR...', { id: 'ocr' });
      const formData = new FormData();
      formData.append('document', file);
      const res = await ocrAPI.analyze(formData);
      const text = res.data.rawText;
      setOcrText(text);
      setShowOcrModal(true);
      const lowerText = text.toLowerCase();
      const detected = [];
      MEDICINES.forEach(med => {
        const kw = med.name.split(' ')[0].toLowerCase();
        if (lowerText.includes(kw)) {
          setCart(prev => ({ ...prev, [med.id]: (prev[med.id] || 0) + 1 }));
          detected.push(med.name);
        }
      });
      toast.success(detected.length ? `Added to cart: ${detected.join(', ')}` : 'No matching products found.', { id: 'ocr', duration: 4000 });
    } catch {
      toast.error('OCR failed. Using simulation.', { id: 'ocr' });
      setCart(prev => ({ ...prev, 3: (prev[3] || 0) + 1, 2: (prev[2] || 0) + 1 }));
      setOcrText(`Rx - MEDICAL PRESCRIPTION (Simulated)\nPatient: Arjun Kumar\nDate: ${new Date().toLocaleDateString('en-IN')}\n\n1. Dolo 650 - Qty: 10\n2. Vitamin C 500mg - Qty: 30\n\nDr. Ramesh Sharma`);
      setShowOcrModal(true);
    } finally {
      setIsUploading(false);
      e.target.value = null;
    }
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    const items = Object.entries(cart).map(([id, qty]) => {
      const med = MEDICINES.find(m => m.id === parseInt(id));
      return { medicineId: med.id, name: med.name, price: med.price, quantity: qty };
    });
    if (!items.length) { toast.error('Cart is empty'); return; }
    if (!address.street || !address.city || !address.state || !address.pincode) { toast.error('Fill delivery address'); return; }
    try {
      setIsSubmittingOrder(true);
      const totalAmount = items.reduce((s, i) => s + i.price * i.quantity, 0);
      await medicineOrderAPI.create({ items, totalAmount: totalAmount > 500 ? totalAmount : totalAmount + 50, address, paymentMethod });
      toast.success('Order placed successfully!');
      setCart({}); setShowCheckout(false); setAddress({ street: '', city: '', state: '', pincode: '' });
    } catch { toast.error('Failed to place order'); }
    finally { setIsSubmittingOrder(false); }
  };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const subtotal = Object.entries(cart).reduce((s, [id, q]) => s + (MEDICINES.find(m => m.id === parseInt(id))?.price || 0) * q, 0);
  const shipping = subtotal > 500 || subtotal === 0 ? 0 : 50;
  const total = subtotal + shipping;

  return (
    <PatientLayout title="Buy Medicines">
      <div style={{ background: '#fff', minHeight: '100vh', fontFamily: 'var(--font-body)' }}>

        {/* ── Global Search Bar ─────────────────────────────────── */}
        <div style={{ background: 'white', padding: '14px 24px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '0 14px' }}>
              <Search size={16} color="#9ca3af" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search for medicines, health products and more"
                style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 14, color: '#111827', padding: '12px 0' }}
              />
            </div>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => cartCount > 0 && setShowCheckout(true)}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart size={20} color="white" />
              </div>
              {cartCount > 0 && (
                <span style={{ position: 'absolute', top: -5, right: -5, background: '#ef4444', color: 'white', fontSize: 10, fontWeight: 700, width: 17, height: 17, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cartCount}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Hero Banner ──────────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(to right, #e8f5f0, #f0f9f4)', padding: '32px 24px', marginBottom: 0 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
            <div style={{ maxWidth: 480 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>TRUSTED CARE</p>
              <h1 style={{ fontSize: 32, fontWeight: 800, color: '#111827', marginBottom: 12, lineHeight: 1.2 }}>Genuine medicines</h1>
              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, maxWidth: 400, marginBottom: 20 }}>
                All medicines & health products are sourced from MediID's trusted network of verified pharmacies and medical stores.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => fileInputRef.current.click()}
                  disabled={isUploading}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Upload size={15} /> {isUploading ? 'Scanning...' : 'Upload Prescription'}
                </button>
                <button style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', color: '#374151', border: '1.5px solid #d1d5db', borderRadius: 8, padding: '11px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <Sparkles size={15} color="#0ea5e9" /> AI Scan (OCR)
                </button>
              </div>
            </div>
            <div style={{ fontSize: 120, lineHeight: 1, flexShrink: 0, display: 'flex', gap: 8 }}>
              <span style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.1))' }}>💊</span>
              <span style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.1))' }}>🧴</span>
            </div>
          </div>
          {/* Dot indicators */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
            {[true, false, false].map((active, i) => (
              <div key={i} style={{ width: active ? 18 : 6, height: 6, borderRadius: 3, background: active ? '#0ea5e9' : '#cbd5e1', transition: 'width 0.3s' }} />
            ))}
          </div>
        </div>

        {/* Hidden file input */}
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,application/pdf" onChange={handleFileChange} />

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px' }}>

          {/* ── Browse by Health Condition ───────────────────────── */}
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginBottom: 6 }}>Browse medicines & health products</h2>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>Health condition</p>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 4 }}>
                {HEALTH_CONDITIONS.map(item => <BigTile key={item.name} item={item} />)}
              </div>
              <button style={{
                position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, borderRadius: '50%', background: 'white',
                border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <ChevronRight size={16} color="#374151" />
              </button>
            </div>
          </section>

          {/* ── Categories ───────────────────────────────────────── */}
          <section style={{ marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 14 }}>Categories</p>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 4 }}>
                {CATEGORIES.map(item => <BigTile key={item.name} item={item} />)}
              </div>
              <button style={{
                position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
                width: 34, height: 34, borderRadius: '50%', background: 'white',
                border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <ChevronRight size={16} color="#374151" />
              </button>
            </div>
          </section>

          {/* ── Popular Products ─────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 16 }}>Popular Products</p>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 4 }}>
                {POPULAR_PRODUCTS.map(p => (
                  <div key={p.id} style={{
                    minWidth: 150, flexShrink: 0, cursor: 'pointer'
                  }}>
                    <div style={{
                      width: '100%', height: 130, background: '#f9fafb',
                      borderRadius: 12, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 64, marginBottom: 10,
                      border: '1px solid #f3f4f6'
                    }}>
                      {p.image}
                    </div>
                    <p style={{ fontSize: 11.5, fontWeight: 600, color: '#111827', lineHeight: 1.4, marginBottom: 4 }}>{p.name}</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>₹{p.price}.00</p>
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
            </div>
          </section>

          {/* ── Divider ──────────────────────────────────────────── */}
          <div style={{ height: 1, background: '#e5e7eb', marginBottom: 48 }} />

          {/* ── Promo Banners ─────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 48 }}>
            {/* Consult a doctor */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 6 }}>INTRODUCING CONSULTATION DESK</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20, lineHeight: 1.4 }}>
                Don't self medicate. Talk to an expert. Consult a doctor in less than 2 minutes.
              </p>
              <div style={{
                borderRadius: 16, overflow: 'hidden',
                background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
                padding: '32px 28px', position: 'relative', minHeight: 160,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer'
              }}>
                <div style={{ position: 'absolute', top: 20, right: 20, fontSize: 64 }}>👩‍⚕️</div>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'white', lineHeight: 1.3, marginBottom: 14 }}>
                  Chat with a<br /><span style={{ fontSize: 26, fontWeight: 900 }}>DOCTOR</span>
                </p>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', border: '2px solid white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <ChevronRight size={16} color="white" />
                </div>
              </div>
            </div>

            {/* Fast Delivery */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 6 }}>INTRODUCING FAST DELIVERY</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 20, lineHeight: 1.4 }}>
                Tired of waiting in a queue? Too weak to go down and buy medicines?
              </p>
              <div style={{
                borderRadius: 16, overflow: 'hidden',
                background: 'linear-gradient(135deg, #94a3b8, #64748b)',
                padding: '32px 28px', position: 'relative', minHeight: 160,
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: 'pointer'
              }}>
                <div style={{ position: 'absolute', top: 20, right: 20, fontSize: 64 }}>🚚</div>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'white', lineHeight: 1.3, marginBottom: 14 }}>
                  Home Delivery in<br /><span style={{ fontSize: 26, fontWeight: 900 }}>24 – 48 HOURS</span>
                </p>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', border: '2px solid white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <ChevronRight size={16} color="white" />
                </div>
              </div>
            </div>
          </div>

          {/* ── All Medicines Product Grid ───────────────────────── */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>All Healthcare Products</h2>
              <button style={{ fontSize: 13, color: '#0ea5e9', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>View All <ChevronRight size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {MEDICINES.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).map(m => (
                <div key={m.id} style={{ background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: 140, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60, position: 'relative' }}>
                    {m.image}
                    <span style={{ position: 'absolute', top: 8, left: 8, background: '#fef2f2', color: '#ef4444', fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4 }}>{m.discount}</span>
                  </div>
                  <div style={{ padding: '14px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 3, lineHeight: 1.35 }}>{m.name}</h4>
                      <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{m.company}</p>
                      <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>{m.stripSize}</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>₹{m.price}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'line-through' }}>₹{m.originalPrice}</span>
                      </div>
                    </div>
                    {cart[m.id] ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0ea5e9', borderRadius: 8, padding: '8px 14px' }}>
                        <button onClick={() => removeFromCart(m.id)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Minus size={15} /></button>
                        <span style={{ color: 'white', fontWeight: 800, fontSize: 14 }}>{cart[m.id]}</span>
                        <button onClick={() => addToCart(m.id)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><Plus size={15} /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(m.id)} style={{ width: '100%', padding: '9px 0', border: '1.5px solid #0ea5e9', borderRadius: 8, background: 'white', color: '#0ea5e9', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        Add to Cart
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── OCR Result Modal ──────────────────────────────────── */}
        {showOcrModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowOcrModal(false)}>
            <div className="modal" style={{ maxWidth: 500 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="#0ea5e9" />
                  <h3 style={{ fontSize: 17, fontWeight: 700 }}>AI Prescription Scan Result</h3>
                </div>
                <button onClick={() => setShowOcrModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', border: '1px solid #e5e7eb', marginBottom: 20, maxHeight: 280, overflowY: 'auto' }}>
                {ocrText}
              </div>
              <button onClick={() => setShowOcrModal(false)} style={{ width: '100%', padding: '12px 0', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Close & View Cart
              </button>
            </div>
          </div>
        )}

        {/* ── Checkout Side Drawer ──────────────────────────────── */}
        {showCheckout && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', maxWidth: 440, height: '100%', background: 'white', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingBag size={20} color="#0ea5e9" />
                  <h3 style={{ fontSize: 17, fontWeight: 700 }}>My Cart</h3>
                </div>
                <button onClick={() => setShowCheckout(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {Object.keys(cart).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
                    <ShoppingCart size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  Object.entries(cart).map(([id, qty]) => {
                    const med = MEDICINES.find(m => m.id === parseInt(id));
                    return (
                      <div key={id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, background: '#f9fafb', borderRadius: 10 }}>
                        <span style={{ fontSize: 28 }}>{med.image}</span>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{med.name}</h4>
                          <p style={{ fontSize: 11, color: '#6b7280' }}>{med.company}</p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9', marginTop: 3 }}>₹{med.price} × {qty}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1.5px solid #e5e7eb', borderRadius: 8, padding: '4px 8px' }}>
                          <button onClick={() => removeFromCart(med.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><Minus size={12} /></button>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{qty}</span>
                          <button onClick={() => addToCart(med.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><Plus size={12} /></button>
                        </div>
                        <button onClick={() => deleteFromCart(med.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={16} /></button>
                      </div>
                    );
                  })
                )}
              </div>

              {Object.keys(cart).length > 0 && (
                <form onSubmit={handleCheckoutSubmit}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={15} color="#0ea5e9" /> Delivery Address</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    {[
                      { key: 'street', placeholder: 'Street Address *' },
                      { key: 'city', placeholder: 'City *' },
                      { key: 'state', placeholder: 'State *' },
                      { key: 'pincode', placeholder: 'Pincode *' },
                    ].map(f => (
                      <input key={f.key} type="text" placeholder={f.placeholder} value={address[f.key]}
                        onChange={e => setAddress({ ...address, [f.key]: e.target.value })} required
                        style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' }} />
                    ))}
                  </div>

                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={15} color="#0ea5e9" /> Payment</h4>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    {['Cash on Delivery', 'UPI', 'Card'].map(m => (
                      <label key={m} style={{ flex: 1, padding: '9px 4px', border: paymentMethod === m ? '1.5px solid #0ea5e9' : '1.5px solid #e5e7eb', borderRadius: 8, textAlign: 'center', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: paymentMethod === m ? '#0ea5e9' : '#6b7280', background: 'white' }}>
                        <input type="radio" name="pay" value={m} checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} style={{ display: 'none' }} />{m}
                      </label>
                    ))}
                  </div>

                  <div style={{ background: '#f9fafb', padding: 14, borderRadius: 10, marginBottom: 18 }}>
                    {[['Subtotal', `₹${subtotal}`], ['Delivery', shipping === 0 ? 'FREE' : `₹${shipping}`]].map(([l, v]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280', marginBottom: 6 }}><span>{l}</span><span style={{ color: v === 'FREE' ? '#10b981' : undefined, fontWeight: v === 'FREE' ? 700 : undefined }}>{v}</span></div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 4 }}>
                      <span>Total</span><span style={{ color: '#0ea5e9' }}>₹{total}</span>
                    </div>
                  </div>

                  <button type="submit" disabled={isSubmittingOrder} style={{ width: '100%', padding: '14px 0', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                    {isSubmittingOrder ? 'Placing Order...' : `Place Order · ₹${total}`}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </PatientLayout>
  );
}
