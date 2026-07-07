require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const http = require('http');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const User = require('../models/User');
  const admin = await User.findOne({ role: { $in: ['admin', 'superadmin'] } }).lean();
  const token = jwt.sign({ id: String(admin._id) }, process.env.JWT_SECRET || 'your-secret-key-here');
  const docId = process.argv[2] || '6a0a0a1a39d3d6faa0ca41ef';

  const get = await request('GET', `/api/user/documents/${docId}/preview`, token);
  console.log('GET', get.statusCode, get.headers['content-type']);
  console.log('body', JSON.stringify(get.body.toString()));
  console.log('hex', get.body.toString('hex'));
}

function request(method, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 3005, path, method, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

main().finally(() => mongoose.disconnect());
