# Webhook receiver

A working 42min webhook receiver in about 120 lines, with no dependencies.

```bash
WEBHOOK_SECRET=whsec_... node server.js     # listens on :4242
node --test                                  # 10 verification tests
```

`verify.js` is the part worth copying. It is self-contained and has no
dependencies beyond `node:crypto`.

## How 42min signs a delivery

Every delivery carries four headers:

| Header | Meaning |
|---|---|
| `X-42min-Webhook-Signature` | `t=<unix-seconds>,v1=<hex>` |
| `X-42min-Webhook-Event` | Event name, dot form: `booking.created` |
| `X-42min-Webhook-Id` | Delivery id. **Stable across retries**, so use it to dedupe |
| `X-42min-Webhook-Attempt` | 1 on the first try, incrementing on each retry |

The signature is `HMAC-SHA256(secret, "<timestamp>.<raw body>")`, hex-encoded.

Your signing secret is returned as `signing_secret` when you create the
subscription or rotate it, and **never again**. Store it when you see it.

## The four ways this usually goes wrong

**Verifying a re-serialized body.** This is the big one. Most frameworks parse
JSON before your handler runs, and `JSON.stringify(parsed)` does not reproduce
the bytes that were signed: key order, spacing and unicode escaping can all
differ. You must verify against the raw bytes. That is why this example uses
`node:http` directly. In Express, use `express.raw({type: 'application/json'})`
on the webhook route specifically, not `express.json()`.

**Comparing signatures with `===`.** String comparison short-circuits on the
first differing byte, which leaks how much of a guess was correct. Use
`crypto.timingSafeEqual`, and check length first because it throws on a
mismatch.

**Ignoring the timestamp.** The signature alone stays valid forever, so anyone
who captures one delivery can replay it indefinitely. 42min does not enforce a
window for you. This example rejects anything outside five minutes.

**Acknowledging in the wrong order.** The order is:

> verify → store durably → acknowledge → process

Acknowledging before the delivery is safely written loses the event permanently
if you crash in between: 42min has been told you have it and will never retry.
Processing before acknowledging blows the **10-second** delivery timeout, so you
are retried six times for work you already did. Storing first is what lets you
answer fast and still keep the event.

One consequence people miss: when processing succeeds, **mark** the stored
record, do not delete it. Deleting destroys the dedupe evidence, and a retry
arriving afterwards looks new and is processed twice. Prune by age instead,
comfortably past the 12-hour retry window.

## Retries and pausing

Any `2xx` acknowledges. Anything else, including a timeout or a connection
error, is retried: **6 attempts total**, after 1m, 5m, 30m, 2h and 12h.

**Redirects are not followed.** A 301 or 302 counts as a failure, so register
the final URL. An `http` to `https` upgrade or a trailing-slash redirect will
silently fail every delivery.

After 5 consecutive fully-exhausted deliveries the subscription is paused
automatically. Any success, or editing the webhook, resets the counter.

## The payload

```json
{
  "id": "evt_<uuid>",
  "event": "booking.created",
  "createdAt": "2026-09-09T12:00:00.000Z",
  "apiVersion": "2026-04-01",
  "data": { }
}
```

Note the envelope is camelCase, unlike the snake_case REST API. The `event`
field uses dot names; the REST API accepts and returns the underscore form
(`booking_created`) when you manage subscriptions. See
[`openapi/42min.v1.yaml`](../../openapi/42min.v1.yaml).

New event types and fields ship without notice, so ignore what you do not
recognize rather than failing on it.

## Requirements

Your URL must be **HTTPS** and publicly resolvable. 42min refuses plain HTTP
and blocks private, loopback and link-local addresses, so `localhost` will not
work: use a tunnel during development and register the tunnel's URL.
