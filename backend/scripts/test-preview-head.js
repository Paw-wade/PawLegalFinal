require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const http = require('http');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const User = require('../models/User');
  const admin = await User.findOne({ role: { $in: ['admin', 'superadmin'] } }).lean();
  if (!admin) throw new Error('No admin user');
  const token = jwt.sign({ id: String(admin._id) }, process.env.JWT_SECRET || 'your-secret-key-here');
  const docId = process.argv[2] || '69c0287faf78289efea3a5ee';

  const head = await request('HEAD', `/api/user/documents/${docId}/preview`, token);
  console.log('HEAD', head.statusCode, head.headers['content-type']);

  const get = await request('GET', `/api/user/documents/${docId}/preview`, token);
  console.log('GET', get.statusCode, get.headers['content-type'], 'bytes', get.body.length);
  console.log('magic', get.body.slice(0, 4).toString());
}

function request(method, path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(process.env.PORT) || 3005,
        path,
        method,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());
