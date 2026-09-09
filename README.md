# 42min developers

Public packaging and contracts for [42min](https://42min.us), a meeting scheduling
platform. This repository holds what you need to build on 42min or connect an AI agent to
it. The product itself is closed source.

| | |
|---|---|
| **REST API** | `https://api.42min.us/v1` |
| **MCP server** | `https://api.42min.us/mcp` |
| **Documentation** | [42min.us/help/api](https://42min.us/help/api) |
| **Status** | OAuth 2.1, Dynamic Client Registration, personal access tokens |

## What is here

### `plugins/42min`

The 42min plugin for Cursor. Connects the editor's agent to your 42min account over OAuth
and exposes 35 scheduling tools. See its [README](plugins/42min/README.md).

Any MCP client can connect without this plugin, by pointing at
`https://api.42min.us/mcp`. The server publishes OAuth protected-resource metadata, so a
compliant client discovers everything else on its own.

### `openapi/` — coming soon

An OpenAPI 3.1 description of the public REST API, for generating clients, importing into
Postman or Bruno, and feeding to a coding agent. It is in progress and not yet published
here.

Until it lands, the full REST reference — every `/v1` endpoint with its request and
response — lives at [42min.us/help/api](https://42min.us/help/api).

### `examples/` — coming soon

Small working programs, starting with a webhook receiver. Signature verification is where
integrations most often break: the usual cause is verifying a re-serialized body rather
than the raw bytes. These examples are in progress and not yet published here.

## Authentication in one paragraph

Two mechanisms. **OAuth 2.1** with PKCE for applications acting on behalf of a user,
including Dynamic Client Registration, so a client can register itself without a support
ticket. **Personal access tokens** for scripts acting as one person. Both carry scopes;
the API refuses anything a token's scopes do not cover. Discovery documents live at
`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`.

Full detail: [Authentication](https://42min.us/help/api/authentication).

## Things worth knowing before you build

- **Mutating booking calls accept `Idempotency-Key`.** Retry with the same key. A new key
creates a second booking.
- **`PATCH /v1/bookings/{uid}` uses ETags.** Read the ETag, send it back as `If-Match`, and
a concurrent edit fails loudly instead of silently overwriting.
- **There is no sandbox yet.** Write operations against production send real email and
create real calendar events. Test on event types you own, and clean up after yourself.
- **Ignore unknown response fields.** We add fields without notice; see
[CHANGELOG.md](CHANGELOG.md) for the full versioning policy and the six-month
deprecation guarantee.

## Support

Open an [issue](https://github.com/42min-us/42min-developers/issues) for API bugs,
specification errors, or plugin problems. Security reports go to plus@42min.us, not to the
issue tracker: see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
