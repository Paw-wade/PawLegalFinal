require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const https = require('https');

async function head(url) {
  return new Promise((resolve) => {
    const opts = { method: 'HEAD', timeout: 8000 };
    if (/sslip\.io/i.test(url)) opts.rejectUnauthorized = false;
    const req = https.request(url, opts, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

async function main() {
  await mongoose.connect(
    process.env.TENANT_WADEPAW_MONGODB_URI || process.env.MONGODB_URI
  );
  const Document = require('../models/Document');
  const docs = await Document.find({}).select('cheminFichier nomFichier nom').lean();

  let cloudOk = 0;
  let cloudDead = 0;
  let appPath = 0;
  let localRel = 0;

  for (const d of docs) {
    const p = String(d.cheminFichier || '');
    if (/cloudinary/i.test(p)) {
      const st = await head(p.split('?')[0]);
      if (st >= 200 && st < 400) cloudOk++;
      else cloudDead++;
    } else if (/^\/app\//.test(p)) appPath++;
    else if (/^uploads\//.test(p)) localRel++;
  }

  console.log({
    total: docs.length,
    cloudinaryOk: cloudOk,
    cloudinaryDead: cloudDead,
    dockerAppPaths: appPath,
    localUploadsPaths: localRel,
    likelyLostOnVps: appPath,
  });
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
