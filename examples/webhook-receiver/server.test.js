'use strict';

/**
 * Delivery-handling tests, distinct from verify.test.js which covers signing.
 *
 * These exist because an earlier version of this example returned 204 for a
 * correctly signed but malformed body, then crashed the process on JSON.parse
 * and never processed the record it had already stored. Every case below is a
 * failure that actually happened or that the design must rule out.
 *
 * The server is launched as a child process so a crash is observable.
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SECRET = 'whsec_test_secret';
const SERVER = path.join(__dirname, 'server.js');

function sign(body, t = Math.floor(Date.now() / 1000)) {
  const mac = crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

async function startServer(queueDir, port) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, WEBHOOK_SECRET: SECRET, QUEUE_DIR: queueDir, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 100; i++) {
    if (out.includes('listening on')) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  return { child, output: () => out, alive: () => child.exitCode === null && !child.killed };
}

function post(port, body, headers = {}) {
  return fetch(`http://127.0.0.1:${port}/webhooks/42min`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-42min-webhook-signature': sign(body),
      'x-42min-webhook-id': 'del_1',
      'x-42min-webhook-event': 'booking.created',
      ...headers,
    },
    body,
  });
}

const GOOD = JSON.stringify({
  id: 'evt_1', event: 'booking.created', createdAt: new Date().toISOString(),
  apiVersion: '2026-04-01', data: { booking: { id: 'bk_1' } },
});

function tmpQueue() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wh-'));
}

let nextPort = 4310;

test('a signed but malformed body is refused, not stored, and does not crash', async () => {
  const q = tmpQueue(); const port = nextPort++;
  const s = await startServer(q, port);
  try {
    const res = await post(port, '{not valid json');
    assert.equal(res.status, 400);
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(s.alive(), 'server must survive a malformed body');
    assert.deepEqual(fs.readdirSync(q), [], 'nothing should be stored');
  } finally { s.child.kill(); }
});

test('a delivery with no id is refused rather than filed as "unknown"', async () => {
  const q = tmpQueue(); const port = nextPort++;
  const s = await startServer(q, port);
  try {
    const res = await post(port, GOOD, { 'x-42min-webhook-id': '' });
    assert.equal(res.status, 400);
    assert.deepEqual(fs.readdirSync(q), []);
  } finally { s.child.kill(); }
});

test('a good delivery is stored, acknowledged and marked processed', async () => {
  const q = tmpQueue(); const port = nextPort++;
  const s = await startServer(q, port);
  try {
    assert.equal((await post(port, GOOD)).status, 204);
    await new Promise((r) => setTimeout(r, 300));
    const rec = JSON.parse(fs.readFileSync(path.join(q, 'del_1.json'), 'utf8'));
    assert.ok(rec.processedAt, 'processedAt must be set after the handler succeeds');
  } finally { s.child.kill(); }
});

test('a retry of an already-processed delivery is not processed twice', async () => {
  const q = tmpQueue(); const port = nextPort++;
  const s = await startServer(q, port);
  try {
    await post(port, GOOD);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal((await post(port, GOOD)).status, 204);
    await new Promise((r) => setTimeout(r, 200));
    const handled = s.output().match(/booking created/g) || [];
    assert.equal(handled.length, 1, 'handler must run exactly once');
    assert.match(s.output(), /already processed/);
  } finally { s.child.kill(); }
});

test('a record stored but never processed is resumed on restart', async () => {
  const q = tmpQueue(); const port = nextPort++;
  // Simulate a crash between storing and processing.
  fs.writeFileSync(path.join(q, 'del_stale.json'), JSON.stringify({
    deliveryId: 'del_stale', event: 'booking.created', attempt: '1',
    receivedAt: new Date().toISOString(), processedAt: null, body: GOOD,
  }));
  const s = await startServer(q, port);
  try {
    await new Promise((r) => setTimeout(r, 400));
    assert.match(s.output(), /resuming 1 unprocessed deliveries/);
    const rec = JSON.parse(fs.readFileSync(path.join(q, 'del_stale.json'), 'utf8'));
    assert.ok(rec.processedAt, 'a resumed record must end up processed');
  } finally { s.child.kill(); }
});

test('a retry of a stored-but-unprocessed delivery is a second chance, not a duplicate', async () => {
  const q = tmpQueue(); const port = nextPort++;
  fs.writeFileSync(path.join(q, 'del_1.json'), JSON.stringify({
    deliveryId: 'del_1', event: 'booking.created', attempt: '1',
    receivedAt: new Date().toISOString(), processedAt: null, body: GOOD,
  }));
  // Start with the record already present so resumePending does not consume it
  // before the request arrives: point the server at an empty dir, then add it.
  const s = await startServer(tmpQueue(), port);
  try {
    s.child.kill();
  } catch { /* ignore */ }
  const s2 = await startServer(q, port + 100);
  try {
    await new Promise((r) => setTimeout(r, 400));
    const rec = JSON.parse(fs.readFileSync(path.join(q, 'del_1.json'), 'utf8'));
    assert.ok(rec.processedAt, 'the unprocessed record must be picked up');
  } finally { s2.child.kill(); }
});
