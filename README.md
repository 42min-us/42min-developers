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

### `openapi/42min.v1.yaml`

The OpenAPI 3.1 description of the public REST API, for generating clients, importing into
Postman or Bruno, and feeding to a coding agent.

It is hand-written, and checked against the running API by a contract test suite that
exercises every documented endpoint and validates the live response, headers and error
bodies against these schemas. That is how the first draft's seven mistakes were found,
including two that would have broken every generated client on every booking write. A
route-coverage check fails the build if an endpoint exists but is undocumented, or the
reverse.

Those checks run in our private repository, because they boot the API against a real
database and cannot run here. What CI in *this* repository enforces is that the file is a
valid OpenAPI 3.1 document, so a malformed spec never reaches you.

If you find a place where this file and the API disagree, the file is probably wrong:
please [open an issue](https://github.com/42min-us/42min-developers/issues/new?labels=specification).

### `server.json`

The [official MCP Registry](https://modelcontextprotocol.io/registry/remote-servers) entry.
Declares this as a remote server on streamable HTTP at `https://api.42min.us/mcp`, so
registry-backed directories can list it without anyone hand-filling a form.

### `mcp/tools.json`

The MCP contract, as a machine-readable snapshot: every tool with its JSON Schema for
arguments, the scopes it needs, whether it writes, and the annotations a client uses to
decide when to ask you before calling. Generated from the running tool registry, not
hand-maintained, and gated by a test that fails when the two disagree.

Read it if you are building a client, or feed it to a coding agent. The table in the
[plugin README](plugins/42min/README.md) is the human summary of the same thing.

### `examples/webhook-receiver`

A working receiver in about 120 lines with no dependencies, and ten tests for
`verify.js` alone. Signature verification is where integrations break: the usual cause is
verifying a re-serialized body rather than the raw bytes, which no amount of reading the
docs makes obvious. Copy `verify.js` and move on.

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
- **There is no test environment yet.** Write operations act on production: they send
  real email and create real calendar events. Test on event types you own, and clean up
  after yourself. (Our help pages use "sandbox" for something else, the per-credential
  isolation of webhook subscriptions.)
- **Ignore unknown response fields.** We add fields without notice; see
  [CHANGELOG.md](CHANGELOG.md) for the full versioning policy and the six-month
  deprecation guarantee.

## Support

Open an [issue](https://github.com/42min-us/42min-developers/issues) for API bugs,
specification errors, or plugin problems. Security reports go to plus@42min.us, not to the
issue tracker: see [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
