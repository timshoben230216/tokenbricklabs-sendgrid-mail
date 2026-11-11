require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const sgMail = require('@sendgrid/mail');
const { buildEmail } = require('./template');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SENDGRID_API_KEY;
const VERIFIED_SENDERS = (process.env.VERIFIED_SENDERS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (API_KEY && API_KEY !== 'your_sendgrid_api_key') {
  sgMail.setApiKey(API_KEY);
}

const MAX_FILES = 5;
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB each (keeps request under Vercel body limits)
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx',
]);

function isAllowedFile(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  return ALLOWED_EXT.has(ext) || ALLOWED_MIME.has(file.mimetype);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(req, file, cb) {
    if (isAllowedFile(file)) return cb(null, true);
    cb(new Error('Only photos (JPG, PNG, GIF, WebP) and documents (PDF, DOC, DOCX) are allowed.'));
  },
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LOGO_EMAIL_PATH = path.join(__dirname, 'public', 'logo-email.png');
const HEADER_EMAIL_PATH = path.join(__dirname, 'public', 'header-email.jpg');
const LOGO_PATH = fs.existsSync(LOGO_EMAIL_PATH) ? LOGO_EMAIL_PATH : path.join(__dirname, 'public', 'logo.png');
const HEADER_PATH = fs.existsSync(HEADER_EMAIL_PATH) ? HEADER_EMAIL_PATH : path.join(__dirname, 'public', '1.png');

function readBase64(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath).toString('base64') : '';
}

const LOGO_BASE64 = readBase64(LOGO_PATH);
const HEADER_BASE64 = readBase64(HEADER_PATH);

const perMinute = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  message: { success: false, error: 'Too many requests. Please wait a minute and try again.' },
});
const perHour = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  message: { success: false, error: 'Hourly send limit reached. Please try again later.' },
});

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;

function isLocalHost(host) {
  return !host || /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}

function publicAssetBase(req) {
  const fromEnv = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = req.get('x-forwarded-host') || req.get('host') || '';
  if (isLocalHost(host)) return '';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${host}`;
}

function resolveEmailAssets(req) {
  const base = publicAssetBase(req);
  if (base) {
    return {
      logoUrl: `${base}/logo-email.png`,
      headerBgUrl: `${base}/header-email.jpg`,
      attachments: [],
    };
  }

  const attachments = [];
  if (HEADER_BASE64) {
    attachments.push({
      content: HEADER_BASE64,
      filename: 'header-email.jpg',
      type: 'image/jpeg',
      disposition: 'inline',
      content_id: 'headerbg',
    });
  }
  if (LOGO_BASE64) {
    attachments.push({
      content: LOGO_BASE64,
      filename: 'logo-email.png',
      type: 'image/png',
      disposition: 'inline',
      content_id: 'logo',
    });
  }
  return {
    logoUrl: LOGO_BASE64 ? 'cid:logo' : '',
    headerBgUrl: HEADER_BASE64 ? 'cid:headerbg' : '',
    attachments,
  };
}

function safeFilename(name) {
  return String(name || 'attachment')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 180) || 'attachment';
}

function mimeForFile(file) {
  if (file.mimetype && file.mimetype !== 'application/octet-stream') return file.mimetype;
  const ext = path.extname(file.originalname || '').toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

function toUserAttachments(files) {
  return (files || []).map((file) => ({
    content: file.buffer.toString('base64'),
    filename: safeFilename(file.originalname),
    type: mimeForFile(file),
    disposition: 'attachment',
  }));
}

function runUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload.array('files', MAX_FILES)(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

app.post('/api/send-email', perMinute, perHour, async (req, res) => {
  try {
    await runUpload(req, res);
  } catch (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Each file must be 3 MB or smaller.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, error: 'You can attach up to 5 files.' });
      }
      return res.status(400).json({ success: false, error: 'Could not process the uploaded files.' });
    }
    return res.status(400).json({ success: false, error: err.message || 'Invalid file upload.' });
  }

  if (!API_KEY || API_KEY === 'your_sendgrid_api_key') {
    return res.status(500).json({
      success: false,
      error: 'Server is missing SENDGRID_API_KEY. Set it in the host environment variables.',
    });
  }
  if (VERIFIED_SENDERS.length === 0) {
    return res.status(500).json({
      success: false,
      error: 'Server is missing VERIFIED_SENDERS. Set it in the host environment variables.',
    });
  }

  const { recipientEmail, senderEmail, recipientName, message, website } = req.body || {};

  // Honeypot: real users never fill this hidden field.
  if (website) return res.json({ success: true });

  const fields = { recipientEmail, senderEmail, recipientName, message };
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
  }

  const files = req.files || [];
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(400).json({ success: false, error: 'Total attachment size must be 8 MB or less.' });
  }

  const to = recipientEmail.trim();
  const from = senderEmail.trim().toLowerCase();
  const name = recipientName.trim();
  const body = message.trim();

  if (!EMAIL_RE.test(to) || to.length > 254) {
    return res.status(400).json({ success: false, error: 'Recipient email address is not valid.' });
  }
  if (!EMAIL_RE.test(from)) {
    return res.status(400).json({ success: false, error: 'Sender email address is not valid.' });
  }
  if (!VERIFIED_SENDERS.includes(from)) {
    return res.status(400).json({
      success: false,
      error: 'This sender address is not verified. Use one of: ' + VERIFIED_SENDERS.join(', '),
    });
  }
  if (name.length > 100 || /[\r\n<>]/.test(name)) {
    return res.status(400).json({ success: false, error: 'Recipient name is not valid.' });
  }
  if (body.length > 5000) {
    return res.status(400).json({ success: false, error: 'Message is too long (max 5000 characters).' });
  }

  const assets = resolveEmailAssets(req);
  const { subject, text, html } = buildEmail(name, body, assets);
  const userAttachments = toUserAttachments(files);

  try {
    const msg = {
      to: { email: to, name },
      from,
      subject,
      text,
      html,
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
      },
    };
    const attachments = [...(assets.attachments || []), ...userAttachments];
    if (attachments.length) msg.attachments = attachments;
    await sgMail.send(msg);
    res.json({ success: true, message: 'Email sent.' });
  } catch (err) {
    console.error('SendGrid error:', err.response ? err.response.body : err.message);
    res.status(502).json({ success: false, error: 'The email could not be sent. Please try again later.' });
  }
});

// Local/dev only. On Vercel the platform invokes the exported app — do not exit the process.
if (require.main === module && !process.env.VERCEL) {
  if (!API_KEY || API_KEY === 'your_sendgrid_api_key') {
    console.error('Missing SENDGRID_API_KEY. Copy .env.example to .env and set it.');
    process.exit(1);
  }
  if (VERIFIED_SENDERS.length === 0) {
    console.error('Missing VERIFIED_SENDERS. Add at least one verified sender to .env.');
    process.exit(1);
  }
  app.listen(PORT, () => console.log(`Mailer running at http://localhost:${PORT}`));
}

module.exports = app;
