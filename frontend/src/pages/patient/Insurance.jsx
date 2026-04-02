import React, { useState, useEffect } from 'react';
import { Shield, Star, Phone, Mail, ChevronDown, ChevronUp, CheckCircle, Search, Users, Building, Award, MapPin } from 'lucide-react';
import PatientLayout from '../../components/common/PatientLayout';
import { insuranceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// Government Benefits Data
const governmentBenefits = [
  {
    id: 'ayushman',
    name: 'Ayushman Bharat - PMJAY',
    schemeName: 'Pradhan Mantri Jan Arogya Yojana',
    coverage: '₹5,00,000',
    description: 'Cashless treatment at empaneled hospitals for over 1,300 procedures',
    eligibility: 'Families below poverty line, senior citizens, vulnerable groups',
    benefits: [
      'Hospitalization coverage up to ₹5 lakh per family per year',
      'Cashless treatment at empaneled hospitals',
      'No cap on family size',
      'Pre and post hospitalization expenses covered',
      'Free follow-up care for 15 days'
    ],
    states: 'Available in all states and UTs',
    website: 'https://pmjay.gov.in'
  },
  {
    id: 'cghs',
    name: 'Central Government Health Scheme (CGHS)',
    schemeName: 'CGHS',
    coverage: 'Comprehensive',
    description: 'Medical facilities for central government employees and pensioners',
    eligibility: 'Central government employees, pensioners, and their dependents',
    benefits: [
      'OPD treatment at CGHS dispensaries',
      'Specialist consultation',
      'Diagnostic tests and investigations',
      'Hospitalization in empaneled hospitals',
      'Dental and eye care',
      'Emergency medical services'
    ],
    states: 'Available in Delhi NCR and other major cities',
    website: 'https://cghs.gov.in'
  },
  {
    id: 'esi',
    name: 'Employees State Insurance Scheme',
    schemeName: 'ESI',
    coverage: '₹2,00,000',
    description: 'Social security scheme for employees in organized sector',
    eligibility: 'Employees earning up to ₹21,000 per month',
    benefits: [
      'Medical treatment for self and family',
      'Sickness benefit during medical leave',
      'Maternity benefit for women employees',
      'Disablement benefit for employment injury',
      'Dependents benefit in case of death',
      'Funeral expenses'
    ],
    states: 'Available in all states and major cities',
    website: 'https://www.esic.gov.in'
  }
];

export default function Insurance() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('govt');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await insuranceAPI.getAgencies();
        setAgencies(data);
      } catch (e) {}
      setLoading(false);
    };
    load();
  }, []);

  const filteredAgencies = agencies.filter(agency =>
    agency.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGovernmentBenefits = governmentBenefits.filter(benefit =>
    benefit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    benefit.schemeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    benefit.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const contactAgent = (agent, method) => {
    if (method === 'phone') { window.open(`tel:${agent.phone}`); }
    else if (method === 'email') { window.open(`mailto:${agent.email}`); }
    toast.success(`Connecting you with ${agent.name}...`);
  };

  if (loading) return <PatientLayout title="Health Insurance"><div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }} /></div></PatientLayout>;

  return (
    <PatientLayout title="Health Insurance">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>Health Insurance</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14 }}>Browse government benefits and private insurance plans</p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: 24 }}>
        <div className="search-input" style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
          <input
            type="text"
            placeholder="Search health insurance and government benefits..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
      </div>

      {/* Category Tabs */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeCategory === 'govt' ? 'active' : ''}`}
          onClick={() => setActiveCategory('govt')}
        >
          <Award size={16} style={{ marginRight: 6 }} />
          Government Benefits ({searchTerm ? filteredGovernmentBenefits.length : governmentBenefits.length})
        </button>
        <button
          className={`tab-btn ${activeCategory === 'private' ? 'active' : ''}`}
          onClick={() => setActiveCategory('private')}
        >
          <Building size={16} style={{ marginRight: 6 }} />
          Private Insurance ({searchTerm ? filteredAgencies.length : agencies.length})
        </button>
      </div>

      {/* Government Benefits Section */}
      {activeCategory === 'govt' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Info Banner */}
          <div style={{ background: 'linear-gradient(135deg, #e0f2fe, #ccfbf1)', borderRadius: 12, padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Award size={28} color="var(--teal)" />
            <div>
              <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>Government health benefits for eligible citizens</p>
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2 }}>Access subsidized healthcare through various government schemes and programs.</p>
            </div>
          </div>

          {filteredGovernmentBenefits.length === 0 ? (
            <div className="card empty-state">
              <Search size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
              <p>No government benefits found matching "{searchTerm}"</p>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setSearchTerm('')}
              >
                Clear Search
              </button>
            </div>
          ) : (
            filteredGovernmentBenefits.map(benefit => (
              <div key={benefit.id} className="card">
                {/* Benefit Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, var(--navy), #1a3a5c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Award size={26} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{benefit.name}</h3>
                      <span className="badge badge-teal" style={{ fontSize: 11 }}>Government Scheme</span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--gray-600)', marginTop: 4 }}>{benefit.description}</p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Shield size={13} color="var(--teal)" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal)' }}>{benefit.coverage} coverage</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={13} color="var(--gray-500)" />
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{benefit.eligibility}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={13} color="var(--gray-500)" />
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{benefit.states}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setExpanded(expanded === benefit.id ? null : benefit.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
                    {expanded === benefit.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>

                {/* Benefits Details (expanded) */}
                {expanded === benefit.id && (
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gray-100)' }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Benefits Covered</h4>
                    <div style={{ background: 'var(--gray-50)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                        {benefit.benefits.map((item, index) => (
                          <li key={index} style={{ fontSize: 14, color: 'var(--gray-700)', display: 'flex', gap: 8 }}>
                            <span style={{ color: 'var(--teal)', flexShrink: 0 }}>✓</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <a
                        href={benefit.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Award size={16} />
                        Learn More
                      </a>
                      <button
                        className="btn btn-outline"
                        onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(benefit.name + ' application process')}`, '_blank')}
                      >
                        Application Process
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Private Insurance Section */}
      {activeCategory === 'private' && (
        <>
          {/* Info Banner */}
          <div style={{ background: 'linear-gradient(135deg, #e0f2fe, #ccfbf1)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Shield size={28} color="var(--teal)" />
            <div>
              <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--navy)' }}>Protect your health with the right insurance</p>
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 2 }}>Compare plans, get expert advice, and enroll — all without leaving MediID.</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {filteredAgencies.length === 0 ? (
              <div className="card empty-state">
                <Search size={40} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                <p>No insurance providers found matching "{searchTerm}"</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => setSearchTerm('')}
                >
                  Clear Search
                </button>
              </div>
            ) : (
              filteredAgencies.map(agency => (
                <div key={agency.id} className="card">
                  {/* Agency Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, var(--navy), #1a3a5c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Shield size={26} color="white" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700 }}>{agency.name}</h3>
                        <span className="badge badge-teal" style={{ fontSize: 11 }}>✓ Verified</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Star size={13} color="#f59e0b" fill="#f59e0b" />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{agency.rating}</span>
                          <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>({agency.reviews?.toLocaleString()})</span>
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>🏆 {agency.claimSettlement} claim settlement</span>
                        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Est. {agency.established}</span>
                      </div>
                    </div>
                    <button onClick={() => setExpanded(expanded === agency.id ? null : agency.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>
                      {expanded === agency.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>

                  {/* Plans & Agents (expanded) */}
                  {expanded === agency.id && (
                    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gray-100)' }}>
                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Available Plans</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14, marginBottom: 24 }}>
                        {agency.plans?.map(plan => (
                          <div key={plan.id} className="insurance-plan-card" style={{ cursor: 'pointer', outline: selectedPlan?.id === plan.id ? '2px solid var(--teal)' : 'none' }}
                            onClick={() => setSelectedPlan(selectedPlan?.id === plan.id ? null : plan)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span className="badge" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 11 }}>{plan.type}</span>
                              {selectedPlan?.id === plan.id && <CheckCircle size={16} color="var(--teal)" />}
                            </div>
                            <p style={{ fontSize: 16, fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: 4 }}>{plan.name}</p>
                            <p style={{ color: 'var(--teal)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>₹{Number(plan.coverage).toLocaleString('en-IN')}</p>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 }}>Premium from ₹{Number(plan.premium).toLocaleString()}/yr</p>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                              {plan.features?.map(f => (
                                <li key={f} style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 4, display: 'flex', gap: 6 }}>
                                  <span style={{ color: 'var(--teal)' }}>✓</span> {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>

                      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Talk to an Agent</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                        {agency.agents?.map(agent => (
                          <div key={agent.id} style={{ background: 'var(--gray-50)', borderRadius: 12, padding: 16, border: '1px solid var(--gray-100)' }}>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                              <div className="avatar" style={{ width: 44, height: 44, fontSize: 16, flexShrink: 0 }}>{agent.name[0]}</div>
                              <div>
                                <p style={{ fontWeight: 600, fontSize: 14 }}>{agent.name}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Star size={12} color="#f59e0b" fill="#f59e0b" />
                                  <span style={{ fontSize: 12, fontWeight: 600 }}>{agent.rating}</span>
                                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>· {agent.experience} yrs exp.</span>
                                </div>
                                <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>🗣 {agent.languages?.join(', ')}</p>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => contactAgent(agent, 'phone')}>
                                <Phone size={14} /> Call Agent
                              </button>
                              <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => contactAgent(agent, 'email')}>
                                <Mail size={14} /> Email
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </PatientLayout>
  );
}
