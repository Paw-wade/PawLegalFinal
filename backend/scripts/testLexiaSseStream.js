/**
 * Tests parseur SSE Lexia (aligné sur frontend) + test live POST /api/lexia?stream
 * Usage: node scripts/testLexiaSseStream.js [--no-live]
 */
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function parseLexiaSseChunks(buffer) {
  const events = [];
  const normalized = buffer.replace(/\r\n/g, '\n');
  let rest = normalized;
  let sep;
  while ((sep = rest.indexOf('\n\n')) !== -1) {
    const block = rest.slice(0, sep).trim();
    rest = rest.slice(sep + 2);
    for (const line of block.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        /* JSON tronqué */
      }
    }
  }
  return { events, rest };
}

function applyEvents(events, onDelta) {
  let complete = null;
  for (const ev of events) {
    if (ev.type === 'delta' && typeof ev.text === 'string') onDelta(ev.text);
    if (ev.type === 'error') {
      const msg = typeof ev.error === 'string' ? ev.error : 'Erreur stream';
      throw new Error(msg);
    }
    if (ev.type === 'complete' && ev.success === true) {
      const text = typeof ev.text === 'string' ? ev.text : ev.text != null ? String(ev.text) : '';
      complete = { success: true, text, sources: Array.isArray(ev.sources) ? ev.sources : [] };
    }
  }
  return complete;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runUnitTests() {
  // CRLF entre événements (sans normalisation le vieux parseur échouait)
  const crlf =
    'data: {"type":"delta","text":"Hi"}\r\n\r\n' +
    'data: {"type":"complete","success":true,"text":"Hi","sources":[]}\r\n\r\n';
  const p1 = parseLexiaSseChunks(crlf);
  assert(p1.events.length === 2, `CRLF: attendu 2 events, got ${p1.events.length}`);
  assert(p1.rest === '', 'CRLF: rest doit être vide');
  let acc = '';
  const c1 = applyEvents(p1.events, (t) => {
    acc += t;
  });
  assert(c1 && c1.text === 'Hi', 'complete.text');
  assert(acc === 'Hi', 'deltas');

  // Fragmentation: JSON coupé entre deux chunks TCP
  const partA = 'data: {"type":"delta","text":"';
  const partB = 'abc"}\n\n';
  let buf = partA;
  let { events, rest } = parseLexiaSseChunks(buf);
  assert(events.length === 0, 'fragment 1: pas encore d’event complet');
  buf = rest + partB;
  ({ events, rest } = parseLexiaSseChunks(buf));
  assert(events.length === 1 && events[0].type === 'delta', 'fragment 2: delta reconstitué');
  assert(rest === '', 'rest vide après fragment');

  console.log('✅ Tests unitaires parseur SSE Lexia OK');
}

function postLexiaStream(port, bodyObj) {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/lexia',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'] || '',
            raw,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Même logique que le front : buffer incrémental + parse à chaque chunk. */
function postLexiaStreamIncremental(port, bodyObj) {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    let carry = '';
    const allDeltas = [];
    let lastComplete = null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/lexia',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on('data', (c) => {
          carry += c.toString('utf8');
          const { events, rest } = parseLexiaSseChunks(carry);
          carry = rest;
          try {
            const done = applyEvents(events, (t) => allDeltas.push(t));
            if (done) lastComplete = done;
          } catch (e) {
            reject(e);
          }
        });
        res.on('end', () => {
          const { events, rest: tail } = parseLexiaSseChunks(carry);
          carry = tail;
          try {
            const done = applyEvents(events, (t) => allDeltas.push(t));
            if (done) lastComplete = done;
          } catch (e) {
            return reject(e);
          }
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'] || '',
            allDeltas,
            lastComplete,
            tailBuffer: carry,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runLiveTest(port) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️ Live test ignoré: ANTHROPIC_API_KEY absente dans .env');
    return;
  }
  console.log(`\n📡 Live test SSE → http://127.0.0.1:${port}/api/lexia (stream, anthropic)…`);
  const payload = {
    messages: [{ role: 'user', content: 'Réponds par un seul mot : OK.' }],
    provider: 'anthropic',
    stream: true,
  };
  const r = await postLexiaStreamIncremental(port, payload);
  if (r.statusCode !== 200) {
    console.error('❌ HTTP', r.statusCode, r.contentType);
    throw new Error('Réponse non-200');
  }
  if (!String(r.contentType).includes('text/event-stream')) {
    console.error('❌ Content-Type:', r.contentType);
    throw new Error('Attendu text/event-stream');
  }
  if (!r.lastComplete || r.lastComplete.success !== true) {
    throw new Error('Pas d’événement complete avec success=true');
  }
  if (r.tailBuffer && r.tailBuffer.trim()) {
    console.warn('⚠️ Reste buffer non vide après fin:', JSON.stringify(r.tailBuffer.slice(0, 80)));
  }
  const joined = r.allDeltas.join('');
  console.log('   Deltas (', r.allDeltas.length, 'morceaux ), longueur:', joined.length);
  console.log('   Complete text (extrait):', String(r.lastComplete.text).slice(0, 200).replace(/\n/g, ' '));
  console.log('   Sources:', Array.isArray(r.lastComplete.sources) ? r.lastComplete.sources.length : 0);
  console.log('✅ Live test SSE Lexia OK');
}

async function main() {
  const noLive = process.argv.includes('--no-live');
  runUnitTests();
  if (noLive) return;

  const port = Number(process.env.PORT) || 3005;
  try {
    await runLiveTest(port);
  } catch (e) {
    if (e.code === 'ECONNREFUSED') {
      console.error('❌ Serveur injoignable sur le port', port, '— démarrez le backend puis relancez ce script.');
      process.exitCode = 2;
      return;
    }
    console.error('❌ Live test:', e.message || e);
    process.exitCode = 1;
  }
}

main();
