'use strict';

/**
 * A minimal, dependency-free 42min webhook receiver.
 *
 *   WEBHOOK_SECRET=whsec_... node server.js
 *
 * Deliberately uses node:http rather than a framework, because the most common
 * way to break signature verification is to let a body parser consume the
 * request first. Everything here works on the raw bytes.
 *
 * The order matters and is the point of the example:
 *
 *   verify -> validate -> store durably -> acknowledge -> process
 *
 * Acknowledging before the delivery is safely written loses the event if you
 * crash in between: 42min has been told you have it and will never retry.
 * Processing before acknowledging blows the 10-second delivery timeout, so you
 * are retried six times for work you already did.
 *
 * `queue/` is a directory of JSON files, which keeps this dependency-free. A
 * real service uses its database or a job queue. What matters is that the write
 * is durable before the 2xx, that a record is only marked processed after the
 * work succeeds, and that unprocessed records are picked up again on restart.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { verifyWebhook } = require('./verify');

const PORT = Number(process.env.PORT || 4242);
const SECRET = process.env.WEBHOOK_SECRET;
const QUEUE_DIR = process.env.QUEUE_DIR || path.join(__dirname, 'queue');

if (!SECRET) {
  console.error('Set WEBHOOK_SECRET to the signing_secret from your subscription.');
  console.error('It is returned only when you create the webhook or rotate its secret.');
  process.exit(1);
}

fs.mkdirSync(QUEUE_DIR, { recursive: true });

const SAFE_ID = /^[A-Za-z0-9_.-]{1,128}$/;
const recordPath = (id) => path.join(QUEUE_DIR, `${id}.json`);

function readRecord(id) {
  try {
    return JSON.parse(fs.readFileSync(recordPath(id), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Create the record, or report that it already exists.
 * `wx` makes creation atomic, so two concurrent retries cannot both win.
 */
function storeDelivery(id, headers, rawBody) {
  let fd;
  try {
    fd = fs.openSync(recordPath(id), 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return { created: false };
    throw err;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({
      deliveryId: id,
      event: headers['x-42min-webhook-event'],
      attempt: headers['x-42min-webhook-attempt'] ?? null,
      receivedAt: new Date().toISOString(),
      processedAt: null,
      body: rawBody.toString('utf8'),
    }));
    fs.fsyncSync(fd);   // durable BEFORE we answer, not merely written
  } finally {
    fs.closeSync(fd);
  }
  return { created: true };
}

/**
 * Mark a record processed atomically: write a sibling then rename. A plain
 * rewrite can be interrupted and leave truncated JSON, which on restart looks
 * like a corrupt record rather than an unprocessed one.
 */
function markProcessed(id) {
  const record = readRecord(id);
  if (!record) return;
  record.processedAt = new Date().toISOString();
  const tmp = `${recordPath(id)}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(record));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, recordPath(id));   // atomic on POSIX
}

/**
 * Run the handler for a stored record, never letting a synchronous throw
 * escape. An earlier version called JSON.parse inside the callback, where a
 * malformed body threw past the promise's .catch() and killed the process.
 */
async function processRecord(id) {
  const record = readRecord(id);
  if (!record || record.processedAt) return;
  try {
    await handleEvent(JSON.parse(record.body));
    markProcessed(id);
  } catch (err) {
    console.error(`handler failed for ${id}, record kept unprocessed:`, err.message);
  }
}

/** Resume anything stored but not processed, e.g. after a crash or restart. */
function resumePending() {
  let pending = 0;
  for (const file of fs.readdirSync(QUEUE_DIR)) {
    if (!file.endsWith('.json')) continue;
    const id = file.slice(0, -'.json'.length);
    const record = readRecord(id);
    if (record && !record.processedAt) {
      pending++;
      process.nextTick(() => processRecord(id));
    }
  }
  if (pending) console.log(`resuming ${pending} unprocessed deliveries`);
  return pending;
}

function readRawBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limitBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function reject(res, status, reason) {
  console.warn(`rejected delivery: ${reason}`);
  res.writeHead(status, { 'content-type': 'application/json' })
     .end(JSON.stringify({ error: reason }));
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhooks/42min') {
    res.writeHead(404).end();
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch {
    res.writeHead(413).end();
    return;
  }

  const verified = verifyWebhook(rawBody, req.headers['x-42min-webhook-signature'], SECRET);
  if (!verified.ok) return reject(res, 401, verified.reason);

  // Identify before storing: a delivery with no id cannot be deduped, and
  // filing it under "unknown" makes every such delivery collide with the last.
  const deliveryId = req.headers['x-42min-webhook-id'];
  if (!deliveryId || !SAFE_ID.test(deliveryId)) return reject(res, 400, 'missing or malformed X-42min-Webhook-Id');
  if (!req.headers['x-42min-webhook-event']) return reject(res, 400, 'missing X-42min-Webhook-Event');

  // Validate BEFORE storing and acknowledging. A body that cannot be parsed
  // will never parse, so accepting it would durably store garbage and report
  // success. Refusing surfaces the problem: 42min retries, then pauses the
  // subscription, which is the signal you want for a genuine defect.
  try {
    JSON.parse(rawBody.toString('utf8'));
  } catch {
    return reject(res, 400, 'body is not valid JSON');
  }

  let stored;
  try {
    stored = storeDelivery(deliveryId, req.headers, rawBody);
  } catch (err) {
    // Could not persist: do NOT acknowledge. Let 42min retry rather than
    // silently dropping the event.
    console.error(`could not store ${deliveryId}:`, err.message);
    res.writeHead(503).end();
    return;
  }

  // Safely stored, so it is honest to say we have it. Answer immediately.
  res.writeHead(204).end();

  if (!stored.created) {
    const existing = readRecord(deliveryId);
    if (existing && existing.processedAt) {
      console.log(`duplicate ${deliveryId}, already processed`);
      return;
    }
    // Stored earlier but never finished: a retry is a second chance, not a
    // duplicate to discard.
    console.log(`retry of unprocessed ${deliveryId}, resuming`);
  }

  process.nextTick(() => processRecord(deliveryId));
});

/**
 * The envelope is { id, event, createdAt, apiVersion, data }, camelCase, unlike
 * the snake_case REST API. `event` uses dot names (booking.created); the REST
 * API takes the underscore form when you manage subscriptions.
 */
async function handleEvent(event) {
  switch (event.event) {
    case 'booking.created':
      console.log(`booking created: ${event.data?.booking?.id ?? '(no id)'}`);
      break;
    case 'booking.canceled':
      console.log(`booking canceled: ${event.data?.booking?.id ?? '(no id)'}`);
      break;
    default:
      // New event types ship without notice. Ignore what you do not handle
      // rather than throwing.
      console.log(`unhandled event ${event.event}`);
  }
}

if (require.main === module) {
  resumePending();
  server.listen(PORT, () => {
    console.log(`listening on http://127.0.0.1:${PORT}/webhooks/42min`);
    console.log(`queue: ${QUEUE_DIR}`);
    console.log('Expose it over HTTPS (42min refuses plain http) and register that URL.');
  });
}

module.exports = { server, resumePending, processRecord, readRecord, QUEUE_DIR };
