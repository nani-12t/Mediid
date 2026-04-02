const express = require('express');
const router = express.Router();

// Insurance Agency mock data route (in production this comes from DB)
router.get('/', (req, res) => {
  res.json([
    {
      id: '1', name: 'Star Health Insurance', rating: 4.7, reviews: 12500,
      claimSettlement: '94.44%', logo: null, established: 2006,
      plans: [
        { id: 'p1', name: 'Star Comprehensive', type: 'Individual', coverage: 500000, premium: 8999, features: ['Cashless at 14000+ hospitals', 'No room rent limit', 'Mental health cover'] },
        { id: 'p2', name: 'Star Family Health', type: 'Family', coverage: 1000000, premium: 18999, features: ['6 members covered', 'Maternity cover', 'Newborn cover'] }
      ],
      agents: [
        { id: 'a1', name: 'Rajesh Kumar', rating: 4.8, experience: 8, phone: '+91-9876543210', email: 'rajesh@starhealth.com', languages: ['Hindi', 'English'] }
      ]
    },
    {
      id: '2', name: 'HDFC ERGO Health', rating: 4.6, reviews: 9800,
      claimSettlement: '91.23%', logo: null, established: 2002,
      plans: [
        { id: 'p3', name: 'Optima Restore', type: 'Individual', coverage: 300000, premium: 6499, features: ['Auto recharge of SI', 'Restore benefit', 'Reload benefit'] },
        { id: 'p4', name: 'Optima Senior', type: 'Senior Citizen', coverage: 500000, premium: 24999, features: ['No pre-policy medical', 'Day care procedures', 'AYUSH cover'] }
      ],
      agents: [
        { id: 'a2', name: 'Priya Sharma', rating: 4.9, experience: 12, phone: '+91-9765432109', email: 'priya@hdfcergo.com', languages: ['Hindi', 'English', 'Tamil'] }
      ]
    },
    {
      id: '3', name: 'Niva Bupa (Max Bupa)', rating: 4.5, reviews: 7600,
      claimSettlement: '90.13%', logo: null, established: 2008,
      plans: [
        { id: 'p5', name: 'ReAssure 2.0', type: 'Family', coverage: 1000000, premium: 15999, features: ['Unlimited restore', 'Direct claim settlement', 'Booster benefit'] },
        { id: 'p6', name: 'GoActive', type: 'Individual', coverage: 200000, premium: 3999, features: ['OPD cover', 'Wellness benefits', 'Annual health check'] }
      ],
      agents: [
        { id: 'a3', name: 'Amit Patel', rating: 4.7, experience: 6, phone: '+91-9654321098', email: 'amit@maxbupa.com', languages: ['Hindi', 'Gujarati', 'English'] }
      ]
    }
  ]);
});

module.exports = router;
