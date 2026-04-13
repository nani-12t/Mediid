const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { protect, authorize } = require('../middleware/auth');

const Buyer       = require('../models/marketplace/Buyer');
const Requirement = require('../models/marketplace/Requirement');
const Submission  = require('../models/marketplace/Submission');
const Message     = require('../models/marketplace/Message');

// Multer for in-memory file handling (base64 storage for simplicity)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════
// BUYER PROFILE
// ═══════════════════════════════════════════════════

// GET /api/marketplace/buyer/profile
router.get('/buyer/profile', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });
    res.json(buyer);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/marketplace/buyer/profile
router.put('/buyer/profile', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOneAndUpdate({ user: req.user._id }, req.body, { new: true });
    res.json(buyer);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════
// REQUIREMENTS (Buyer posts data needs)
// ═══════════════════════════════════════════════════

// POST /api/marketplace/requirements — Buyer creates a requirement
router.post('/requirements', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    if (!buyer) return res.status(404).json({ message: 'Buyer profile not found' });

    const req_doc = await Requirement.create({ buyer: buyer._id, ...req.body });
    res.status(201).json(req_doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/requirements — Public list for patients to browse (active only)
router.get('/requirements', protect, async (req, res) => {
  try {
    const reqs = await Requirement.find({ status: 'active' })
      .populate('buyer', 'companyName description phone website user')
      .sort('-createdAt');
    res.json(reqs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/requirements/my — Buyer's own requirements
router.get('/requirements/my', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    const reqs = await Requirement.find({ buyer: buyer._id }).sort('-createdAt');
    res.json(reqs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/marketplace/requirements/:id — Buyer updates a requirement
router.put('/requirements/:id', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    const req_doc = await Requirement.findOneAndUpdate(
      { _id: req.params.id, buyer: buyer._id }, req.body, { new: true }
    );
    if (!req_doc) return res.status(404).json({ message: 'Requirement not found' });
    res.json(req_doc);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// DELETE /api/marketplace/requirements/:id
router.delete('/requirements/:id', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    await Requirement.findOneAndDelete({ _id: req.params.id, buyer: buyer._id });
    res.json({ message: 'Requirement removed' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════
// SUBMISSIONS (Patient submits docs for a requirement)
// ═══════════════════════════════════════════════════

// POST /api/marketplace/submissions — Patient submits documents
router.post('/submissions', protect, authorize('patient'), upload.single('document'), async (req, res) => {
  try {
    const { requirementId, docType } = req.body;
    let fileUrl = '';
    let fileName = '';

    if (req.file) {
      fileUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      fileName = req.file.originalname;
    }

    const docEntry = {
      type: docType,
      fileUrl,
      fileName
    };

    let existing = await Submission.findOne({ requirement: requirementId, patientId: req.user._id });
    
    if (existing) {
      existing.documents.push(docEntry);
      await existing.save();
      return res.status(200).json(existing);
    }

    const submission = await Submission.create({
      requirement: requirementId,
      patientId: req.user._id,
      patientName: req.user.email, // using email as fallback
      documents: [docEntry],
      status: 'pending'
    });
    
    res.status(201).json(submission);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/submissions/my — Patient sees their own submissions
router.get('/submissions/my', protect, authorize('patient'), async (req, res) => {
  try {
    const subs = await Submission.find({ patientId: req.user._id })
      .populate({ path: 'requirement', populate: { path: 'buyer', select: 'companyName phone website' } })
      .sort('-createdAt');
    res.json(subs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/submissions/requirement/:id — Buyer sees submissions for their requirement
router.get('/submissions/requirement/:id', protect, authorize('buyer'), async (req, res) => {
  try {
    const buyer = await Buyer.findOne({ user: req.user._id });
    const req_doc = await Requirement.findOne({ _id: req.params.id, buyer: buyer._id });
    if (!req_doc) return res.status(403).json({ message: 'Not your requirement' });

    const subs = await Submission.find({ requirement: req.params.id }).sort('-createdAt');
    res.json(subs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// PUT /api/marketplace/submissions/:id/status — Buyer accepts/rejects/marks paid
router.put('/submissions/:id/status', protect, authorize('buyer'), async (req, res) => {
  try {
    const { status, payoutAmount } = req.body;
    const sub = await Submission.findByIdAndUpdate(
      req.params.id,
      { status, ...(payoutAmount !== undefined && { payoutAmount }) },
      { new: true }
    );
    if (!sub) return res.status(404).json({ message: 'Submission not found' });
    res.json(sub);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ═══════════════════════════════════════════════════
// MESSAGING SYSTEM
// ═══════════════════════════════════════════════════

// POST /api/marketplace/messages — Send a message
router.post('/messages', protect, async (req, res) => {
  try {
    const { receiverId, content, requirementId } = req.body;
    const msg = await Message.create({
      sender: req.user._id,
      receiver: receiverId,
      content,
      requirement: requirementId || null
    });
    res.status(201).json(msg);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/messages/conversations — Get all conversations for a user
router.get('/messages/conversations', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    // Find all unique conversations involving this user (group by the other party)
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }]
    }).sort('-createdAt');

    const conversationsMap = {};
    messages.forEach(msg => {
      const otherId = msg.sender.toString() === userId.toString()
        ? msg.receiver.toString()
        : msg.sender.toString();

      if (!conversationsMap[otherId]) {
        conversationsMap[otherId] = {
          otherUserId: otherId,
          lastMessage: msg,
          requirementId: msg.requirement,
          unreadCount: 0
        };
      }
      if (msg.receiver.toString() === userId.toString() && !msg.isRead) {
        conversationsMap[otherId].unreadCount++;
      }
    });

    res.json(Object.values(conversationsMap));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/messages/:userId — Get messages with a specific user
router.get('/messages/:userId', protect, async (req, res) => {
  try {
    const myId = req.user._id;
    const theirId = req.params.userId;

    const messages = await Message.find({
      $or: [
        { sender: myId, receiver: theirId },
        { sender: theirId, receiver: myId }
      ]
    }).sort('createdAt');

    // Mark received messages as read
    await Message.updateMany(
      { sender: theirId, receiver: myId, isRead: false },
      { isRead: true }
    );

    res.json(messages);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// GET /api/marketplace/messages/unread/count
router.get('/messages/unread/count', protect, async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user._id, isRead: false });
    res.json({ count });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
