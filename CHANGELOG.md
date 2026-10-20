# Changelog

Changes to the 42min public API, the MCP server, and this repository.

## Versioning policy

The REST API is versioned in the path. `/v1` is stable.

**Additive changes ship without notice.** New endpoints, new optional parameters, new
fields in a response, and new MCP tools may appear at any time. Clients must ignore
unknown fields rather than rejecting them. A client that validates responses strictly
against a fixed field list will break on a routine release, and that is a client bug.

**Breaking changes get a new major path segment.** A superseded major version keeps
working for **at least six months** from the announcement here, and its responses carry a
`Sunset` header for the whole deprecation period. Six months is a stated number rather
than "a reasonable notice period", because an unquantified promise is not one.

Breaking means: removing or renaming a field or endpoint, narrowing an accepted input,
changing a status code or error code for an unchanged condition, or tightening a
validation rule that previously passed.

MCP tools follow the same contract. A tool may gain optional arguments; removing a tool or
changing its meaning is a breaking change.

## Unreleased

- **A token acts as its user.** Since 2026-10-20, `/v1/bookings` returns and changes
  exactly what the member behind the token can see in 42min: a user the bookings they
  host, a manager those of the groups they manage, an admin or owner the whole
  organization. A booking outside that scope is reported as `booking_not_found`.
  Before this, every token read the whole organization. An app connected by an admin
  sees no difference; one connected by a regular user now sees that user's bookings.
- **`Idempotency-Key` is per user and per endpoint.** A key reused by another member
  of the same organization, or sent to another endpoint, is a new request rather than
  a replay of the first response.
- **Webhook subscriptions belong to the member who created them.** Two members who
  connected the same OAuth app no longer see or change each other's subscriptions, and
  a subscription delivers only the bookings its creator may see, by the same rule as
  the token above.
- **Payments.** Event types carry a read-only `payment` (provider, amount in minor
  units, currency) when the public booking page charges, and bookings carry a
  `payment` summary (status, amounts, receipt) in REST responses and in webhook
  deliveries. Bookings created through this API or MCP are never paid.
- `requires_confirmation` on an event type is described: an approval rule on the public
  booking page may turn a booking into a request the host approves; bookings created
  through this API or MCP are always confirmed at once.
- The recognized tracking keys in a booking's `urlParams` are listed in the webhook
  payload description.
- "Single-use links" are now called **secret links** in scope descriptions and MCP tool
  titles. Scope names, tool names and arguments are unchanged.
- The user `email` fields note that an address can change; identify a user by `id`.

- **Recurring meeting series.** Eight new endpoints under `/v1/series`: list, get,
  create, update, pause, resume, end, and change host, governed by two new scopes,
  `series:read` and `series:write`. Bookings that belong to a series now carry
  `series_id` and `series_index`, in REST responses and in webhook deliveries, and
  `GET /v1/bookings` accepts a `series_id` filter.
- **Eight MCP tools for recurring series**: `list_recurring`, `get_recurring`,
  `create_recurring`, `update_recurring`, `pause_recurring`, `resume_recurring`,
  `end_recurring` and `change_recurring_host`, bringing the server to 43 tools. The
  `mcp:scheduling:read` and `mcp:scheduling:write` aliases now include the series
  scopes, so existing OAuth connections pick them up on their next grant.
- `GET /v1/event-types/{idOrSlug}` is now described correctly: it takes a UUID, or
  `username/event_slug` sent as one path segment with the slash percent-encoded
  (`ada%2Fintro-call`). A bare slug is a 400, which the operation now declares.
- The attendee `phone` and `sms_opt_in` fields on booking creation are documented:
  opting into text messages needs a phone number in international format, otherwise
  the request is rejected with `attendee_phone_required` or `attendee_phone_invalid`.

- Initial public repository: Cursor plugin and OpenAPI specification.
- `openapi/42min.v1.yaml` published: OpenAPI 3.1 covering the six `/v1` resources, both
  security schemes, the error envelope, pagination, and the eight webhook events.
- The specification is served at `https://api.42min.us/openapi.yaml`, with CORS, so
  browser tooling and coding agents can load it directly.
- `examples/webhook-receiver`: a dependency-free receiver with correct signature
  verification, replay rejection, retry-safe dedupe and ten tests.
- `mcp/tools.json`: the MCP tool contract as a generated, drift-gated snapshot. Every
  tool with its argument schema, required scopes, mutation flag and client annotations.
