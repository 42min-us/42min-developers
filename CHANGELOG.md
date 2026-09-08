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

- Initial public repository: Cursor plugin and OpenAPI specification.
