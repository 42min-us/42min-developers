'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { verifyWebhook } = require('./verify');

const SECRET = 'whsec_example_secret_do_not_use';

/**
 * Sign exactly the way 42min does, derived independently from the documented
 * scheme rather than by calling the code under test. If this helper and
 * verify.js ever disagree, one of them is wrong about the contract.
 */
function sign(body, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { header: `t=${timestamp},v1=${mac}`, timestamp };
}

const BODY = JSON.stringify({
  id: 'evt_11111111-2222-3333-4444-555555555555',
  event: 'booking.created',
  createdAt: '2026-09-09T12:00:00.000Z',
  apiVersion: '2026-04-01',
  data: { booking: { id: 'bk_123' } },
});

test('accepts a genuine signature', () => {
  const { header } = sign(BODY);
  assert.deepEqual(verifyWebhook(BODY, header, SECRET), { ok: true });
});

test('accepts when the body arrives as a Buffer, as it does over the wire', () => {
  const { header } = sign(BODY);
  assert.deepEqual(verifyWebhook(Buffer.from(BODY, 'utf8'), header, SECRET), { ok: true });
});

test('rejects a tampered body', () => {
  const { header } = sign(BODY);
  const tampered = BODY.replace('bk_123', 'bk_456');
  assert.equal(verifyWebhook(tampered, header, SECRET).ok, false);
});

test('rejects a signature made with a different secret', () => {
  const { header } = sign(BODY, 'whsec_attacker');
  assert.equal(verifyWebhook(BODY, header, SECRET).ok, false);
});

test('rejects a replayed delivery outside the tolerance window', () => {
  const old = Math.floor(Date.now() / 1000) - 3600;
  const { header } = sign(BODY, SECRET, old);
  const res = verifyWebhook(BODY, header, SECRET);
  assert.equal(res.ok, false);
  assert.match(res.reason, /tolerance/);
});

test('accepts a delivery inside the tolerance window', () => {
  const recent = Math.floor(Date.now() / 1000) - 60;
  const { header } = sign(BODY, SECRET, recent);
  assert.deepEqual(verifyWebhook(BODY, header, SECRET), { ok: true });
});

test('rejects a malformed or missing header without throwing', () => {
  for (const bad of ['', 'garbage', 't=123', 'v1=abc', 't=abc,v1=def', undefined, null]) {
    const res = verifyWebhook(BODY, bad, SECRET);
    assert.equal(res.ok, false, `expected rejection for ${JSON.stringify(bad)}`);
  }
});

test('a wrong-length signature is rejected, not a crash', () => {
  // crypto.timingSafeEqual throws on length mismatch; verify.js must guard it.
  const { timestamp } = sign(BODY);
  assert.doesNotThrow(() => verifyWebhook(BODY, `t=${timestamp},v1=deadbeef`, SECRET));
  assert.equal(verifyWebhook(BODY, `t=${timestamp},v1=deadbeef`, SECRET).ok, false);
});

test('verifies against raw bytes, not a re-serialized object', () => {
  // The body 42min signed has this exact spacing. A receiver that parses and
  // re-stringifies produces different bytes and never matches. This is the
  // most common integration failure.
  const spaced = '{"event":"booking.created", "data":{"x":1}}';
  const { header } = sign(spaced);
  assert.deepEqual(verifyWebhook(spaced, header, SECRET), { ok: true });
  const reserialized = JSON.stringify(JSON.parse(spaced));
  assert.notEqual(reserialized, spaced);
  assert.equal(verifyWebhook(reserialized, header, SECRET).ok, false);
});

test('handles non-ASCII bodies byte-for-byte', () => {
  const unicode = JSON.stringify({ event: 'booking.created', data: { name: 'Ana Gestión 日本語' } });
  const { header } = sign(unicode);
  assert.deepEqual(verifyWebhook(Buffer.from(unicode, 'utf8'), header, SECRET), { ok: true });
});
