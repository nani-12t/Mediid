const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const vision = require('@google-cloud/vision');

// Configure multer for memory storage so we can send the buffer directly to Google Cloud Vision
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Configure Google Cloud Vision client
// Note: This automatically looks for process.env.GOOGLE_APPLICATION_CREDENTIALS
let clientInstance = null;
const getVisionClient = () => {
  if (clientInstance) return clientInstance;
  try {
    clientInstance = new vision.ImageAnnotatorClient();
    return clientInstance;
  } catch (error) {
    console.error("⚠️ Google Cloud Vision client failed to initialize:", error.message);
    return null;
  }
};

/**
 * @route POST /api/ocr/analyze
 * @desc Accepts an image file (prescription, lab report, scan), runs OCR, and returns the raw text
 * @access Private (Requires valid token)
 */
router.post('/analyze', protect, upload.single('document'), async (req, res) => {
  try {
    const client = getVisionClient();
    if (!client) {
      return res.status(503).json({
        message: 'OCR service is currently unavailable. Ensure GOOGLE_APPLICATION_CREDENTIALS is set in the backend environment.',
      });
    }

    let fileBuffer;
    
    if (req.file) {
      fileBuffer = req.file.buffer;
    } else if (req.body.fileUrl) {
      // Fetch the remote file if a URL is provided
      const response = await fetch(req.body.fileUrl);
      if (!response.ok) throw new Error('Failed to fetch remote file');
      const arrayBuffer = await response.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      return res.status(400).json({ message: 'No document file or fileUrl provided' });
    }

    // Pass the file buffer to Google Cloud Vision API
    // documentTextDetection is optimized for high-density text like reports/prescriptions
    const [result] = await client.documentTextDetection(fileBuffer);
    const fullTextAnnotation = result.fullTextAnnotation;
    
    if (!fullTextAnnotation || !fullTextAnnotation.text) {
      return res.status(200).json({ 
        message: 'No text could be extracted from this image.', 
        rawText: '' 
      });
    }

    res.status(200).json({
      message: 'OCR analysis complete',
      rawText: fullTextAnnotation.text,
      // For more advanced parsing, the frontend could also request pages/blocks, but returning the raw string is easiest for standard LLM ingestion
    });

  } catch (error) {
    console.error('OCR Error:', error);
    
    // Check if error is related to authentication
    if (error.message && error.message.includes('Could not load the default credentials')) {
      return res.status(500).json({
        message: 'Google Cloud Credentials missing. Administrator must provide a valid google-credentials.json service account key.',
        error: error.message
      });
    }
    
    res.status(500).json({ message: 'Server error during OCR analysis', error: error.message });
  }
});

module.exports = router;
