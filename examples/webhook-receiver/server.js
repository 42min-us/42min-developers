'use strict';

/**
 * A minimal, dependency-free 42min webhook receiver.
 *
 *   WEBHOOK_SECRET=whsec_... node server.js
 *
 * Deliberately uses node:http rather than a framework, because the most common
 * way to break signature verification is to let a body parser consume the
 * request first. Everything here works on the raw bytes.
 */

const http = require('node:http');
const { verifyWebhook } = require('./verify');

const PORT = Number(process.env.PORT || 4242);
const SECRET = process.env.WEBHOOK_SECRET;

if (!SECRET) {
  console.error('Set WEBHOOK_SECRET to the signing_secret from your subscription.');
  console.error('It is returned only when you create the webhook or rotate its secret.');
  process.exit(1);
}

// Deliveries retry, and a retry reuses X-42min-Webhook-Id. Without dedupe you
// will process the same event up to six times. A real service keeps this in a
// database with a TTL, not in memory.
const seen = new Map();
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

function alreadyHandled(deliveryId) {
  const now = Date.now();
  for (const [id, at] of seen) if (now - at > DEDUPE_TTL_MS) seen.delete(id);
  if (seen.has(deliveryId)) return true;
  seen.set(deliveryId, now);
  return false;
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
    // 401 is not retried into success, but 42min will retry anyway. That is
    // correct: a genuine secret mismatch needs your attention, not silence.
    console.warn(`rejected delivery: ${result.reason}`);
    res.writeHead(401, { 'content-type': 'application/json' })
       .end(JSON.stringify({ error: result.reason }));
    return;
  }

  const deliveryId = req.headers['x-42min-webhook-id'];
  const eventName = req.headers['x-42min-webhook-event'];
  const attempt = req.headers['x-42min-webhook-attempt'];

  // Acknowledge FIRST, work afterwards. Delivery times out after 10 seconds;
  // anything slower is recorded as a failure and retried, even if your handler
  // eventually succeeded. Any 2xx acknowledges.
  res.writeHead(204).end();

  if (alreadyHandled(deliveryId)) {
    console.log(`duplicate ${eventName} ${deliveryId} (attempt ${attempt}), ignored`);
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.error(`delivery ${deliveryId} was signed but is not valid JSON`);
    return;
  }

  handleEvent(event).catch((err) => {
    console.error(`handler failed for ${deliveryId}:`, err);
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
  console.log('Expose it over HTTPS (42min refuses plain http) and register that URL.');
});
