/**
 * Copie uploads depuis le VPS via SFTP (ssh2).
 * Usage:
 *   VPS_SSH_USER=root VPS_SSH_HOST=51.75.203.65 VPS_SSH_PASSWORD=*** node scripts/fetch-vps-uploads.js
 *   (ou cle SSH sans mot de passe)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const cfg = {
  host: process.env.VPS_SSH_HOST || '51.75.203.65',
  port: Number(process.env.VPS_SSH_PORT || 22),
  username: process.env.VPS_SSH_USER || 'root',
  password: process.env.VPS_SSH_PASSWORD || undefined,
  privateKey: process.env.VPS_SSH_PRIVATE_KEY_PATH
    ? fs.readFileSync(process.env.VPS_SSH_PRIVATE_KEY_PATH)
    : undefined,
  readyTimeout: 30000,
};

const remoteDir = process.env.VPS_UPLOADS_PATH || '/app/uploads/documents';
const localDir = path.join(__dirname, '..', 'uploads', 'documents');

async function downloadDir(sftp, remote, local) {
  fs.mkdirSync(local, { recursive: true });
  const list = await new Promise((resolve, reject) => {
    sftp.readdir(remote, (err, entries) => (err ? reject(err) : resolve(entries || [])));
  });
  let count = 0;
  for (const entry of list) {
    const remotePath = `${remote}/${entry.filename}`.replace(/\\/g, '/');
    const localPath = path.join(local, entry.filename);
    if (entry.attrs.isDirectory()) {
      count += await downloadDir(sftp, remotePath, localPath);
    } else if (entry.attrs.isFile()) {
      await new Promise((resolve, reject) => {
        sftp.fastGet(remotePath, localPath, (err) => (err ? reject(err) : resolve()));
      });
      count++;
      if (count % 20 === 0) console.log(`  ${count} fichiers...`);
    }
  }
  return count;
}

async function main() {
  if (!cfg.password && !cfg.privateKey) {
    const defaultKey = path.join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'id_ed25519');
    if (fs.existsSync(defaultKey)) {
      cfg.privateKey = fs.readFileSync(defaultKey);
    }
  }

  console.log(`SFTP ${cfg.username}@${cfg.host}:${remoteDir} -> ${localDir}`);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn
      .on('ready', () => {
        conn.sftp(async (err, sftp) => {
          if (err) return reject(err);
          try {
            const n = await downloadDir(sftp, remoteDir, localDir);
            console.log(`Copie terminee: ${n} fichier(s)`);
            conn.end();
            resolve();
          } catch (e) {
            conn.end();
            reject(e);
          }
        });
      })
      .on('error', reject)
      .connect(cfg);
  });
}

main().catch((e) => {
  console.error('Echec SFTP:', e.message);
  console.error('Definissez VPS_SSH_PASSWORD ou une cle SSH autorisee sur le VPS.');
  process.exit(1);
});
