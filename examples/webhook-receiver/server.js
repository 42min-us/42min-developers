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
 * The order below is the whole point:
 *
 *   verify  ->  store durably  ->  acknowledge  ->  process
 *
 * Acknowledging before the delivery is safely written means a crash between
 * the 2xx and the work loses the event permanently: 42min has been told you
 * have it and will never retry. Processing before acknowledging means the
 * 10-second delivery timeout fires and you get retried anyway, six times, for
 * work you already did. Storing first is what lets you answer fast AND keep
 * the event.
 *
 * `queue/` here is a directory of JSON files, which keeps the example
 * dependency-free. A real service uses its database or a job queue. What
 * matters is that the write is durable before the 2xx.
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

/**
 * Write the delivery to disk and flush it, so it survives a crash immediately
 * after we answer. Returns false if this delivery id is already stored, which
 * is how retries are deduped: X-42min-Webhook-Id is stable across attempts.
 *
 * The `wx` flag makes creation atomic, so two concurrent retries cannot both
 * decide they are the first.
 */
function storeDelivery(deliveryId, headers, rawBody) {
  const safeId = String(deliveryId || '').replace(/[^A-Za-z0-9_.-]/g, '_') || 'unknown';
  const file = path.join(QUEUE_DIR, `${safeId}.json`);
  let fd;
  try {
    fd = fs.openSync(file, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw err;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({
      deliveryId: safeId,
      event: headers['x-42min-webhook-event'],
      attempt: headers['x-42min-webhook-attempt'],
      receivedAt: new Date().toISOString(),
      body: rawBody.toString('utf8'),
    }));
    fs.fsyncSync(fd);   // durable before we answer, not merely written
  } finally {
    fs.closeSync(fd);
  }
  return true;
}

/** Record that a delivery was handled, WITHOUT removing the dedupe evidence. */
function markProcessed(deliveryId) {
  const safeId = String(deliveryId || '').replace(/[^A-Za-z0-9_.-]/g, '_') || 'unknown';
  const file = path.join(QUEUE_DIR, `${safeId}.json`);
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.processedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(record));
  } catch (err) {
    console.error(`could not mark ${safeId} processed:`, err);
  }
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

  const result = verifyWebhook(rawBody, req.headers['x-42min-webhook-signature'], SECRET);
  if (!result.ok) {
    // 42min retries a non-2xx, which is correct: a genuine secret mismatch
    // needs your attention rather than silence.
    console.warn(`rejected delivery: ${result.reason}`);
    res.writeHead(401, { 'content-type': 'application/json' })
       .end(JSON.stringify({ error: result.reason }));
    return;
  }

  const deliveryId = req.headers['x-42min-webhook-id'];
  const eventName = req.headers['x-42min-webhook-event'];

  let isNew;
  try {
    isNew = storeDelivery(deliveryId, req.headers, rawBody);
  } catch (err) {
    // Could not persist: do NOT acknowledge. Let 42min retry, because the
    // alternative is silently dropping the event.
    console.error(`could not store ${deliveryId}:`, err);
    res.writeHead(503).end();
    return;
  }

  // Safely stored, so it is honest to say we have it. Answer immediately:
  // delivery times out after 10 seconds.
  res.writeHead(204).end();

  if (!isNew) {
    console.log(`duplicate ${eventName} ${deliveryId}, already stored`);
    return;
  }

  // Failures here do not lose the event: the stored record stays put for a
  // retry or for inspection. A real worker would poll the store rather than
  // run inline like this.
  //
  // Success MARKS the record, it does not delete it. Deleting would destroy
  // the dedupe evidence, and a retry arriving afterwards would look new and be
  // processed a second time. Prune by age instead, well beyond the retry
  // window, which ends 12 hours after the first attempt.
  process.nextTick(() => {
    handleEvent(JSON.parse(rawBody.toString('utf8')))
      .then(() => markProcessed(deliveryId))
      .catch((err) => console.error(`handler failed for ${deliveryId}, record kept:`, err));
  });
});

/**
 * The envelope is:
 *   { id, event, createdAt, apiVersion, data }
 * Note it is camelCase, unlike the snake_case REST API.
 *
 * `event` here uses dot names (booking.created). The REST API accepts and
 * returns the underscore form (booking_created) when you manage subscriptions.
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

server.listen(PORT, () => {
  console.log(`listening on http://127.0.0.1:${PORT}/webhooks/42min`);
  console.log(`queue: ${QUEUE_DIR}`);
  console.log('Expose it over HTTPS (42min refuses plain http) and register that URL.');
});
