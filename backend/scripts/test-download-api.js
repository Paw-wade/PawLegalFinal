/**
 * Teste GET /api/user/documents/:id/download sur plusieurs origines.
 * Usage: node scripts/test-download-api.js [documentId]
 */
require('dotenv').config();
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const docId = process.argv[2] || '6a0a0b7f39d3d6faa0ca41ff';
const origins = [
  'http://127.0.0.1:3005',
  'https://pwqtkrqhmcu2bzpu1uun6zof.51.75.203.65.sslip.io',
  'https://api.adapapers.fr',
  'https://www.adapapers.fr',
];

function fetchDownload(origin, token) {
  return new Promise((resolve) => {
    const url = `${origin.replace(/\/+$/, '')}/api/user/documents/${docId}/download`;
    const lib = url.startsWith('https') ? https : http;
    const opts = {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
      timeout: 15000,
    };
    if (lib === https && /sslip\.io/i.test(url)) {
      opts.rejectUnauthorized = false;
    }
    const req = lib.request(url, opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          origin,
          status: res.statusCode,
          ct: res.headers['content-type'],
          len: buf.length,
          pdf: buf.slice(0, 5).toString() === '%PDF-',
          bodyPreview: buf.slice(0, 120).toString('utf8'),
        });
      });
    });
    req.on('error', (e) => resolve({ origin, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ origin, error: 'timeout' });
    });
    req.end();
  });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({ email: 'wadepaw@gmail.com' }).select('_id').lean();
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '90d',
  });
  await mongoose.disconnect();

  for (const origin of origins) {
    const r = await fetchDownload(origin, token);
    console.log(JSON.stringify(r));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
