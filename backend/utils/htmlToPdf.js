const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Génération PDF à partir de HTML/CSS via un navigateur Chromium headless
 * (Chrome/Edge/Chromium) en ligne de commande — sans dépendance npm lourde.
 * En production, définir CHROME_PATH sur le binaire chromium du serveur.
 */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  return null;
}

async function htmlToPdf(html) {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error('Aucun navigateur Chromium trouvé pour la génération PDF (définir CHROME_PATH).');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fiche-'));
  const htmlPath = path.join(dir, 'in.html');
  const pdfPath = path.join(dir, 'out.pdf');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const fileUrl = 'file://' + htmlPath.replace(/\\/g, '/');
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=5000',
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ];
  await new Promise((resolve, reject) => {
    const proc = spawn(chrome, args, { windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', () => {
      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) resolve();
      else reject(new Error('Échec de la génération PDF : ' + err.slice(0, 500)));
    });
  });
  const buf = fs.readFileSync(pdfPath);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  return buf;
}

module.exports = { htmlToPdf, findChrome };
