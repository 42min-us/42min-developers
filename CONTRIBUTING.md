# Contributing

This repository holds public packaging and contracts for 42min: the Cursor plugin, the
OpenAPI specification for the public API, and examples. The 42min product itself is
closed source and is not developed here.

## What is useful here

- Corrections to the OpenAPI specification where it disagrees with the live API. These are
  the most valuable reports we get: a wrong contract silently generates wrong clients.
- Fixes to the plugin manifests, rules or documentation.
- New examples, or improvements to existing ones.
- Bug reports against the API or the MCP server. Open an issue; product fixes land in the
  private codebase and ship from there.

## What cannot be accepted here

Changes to API behavior. If the specification and the API disagree, say so in an issue and
we will decide which one is wrong. Do not "fix" the specification to describe behavior you
would prefer.

## Before you push

Run the publication gate. It is installed as a pre-push hook, and you should run it
directly while working:

```
git config core.hooksPath .githooks   # once, after cloning
./scripts/check-publish.sh
```

It blocks secrets, key material and internal paths from reaching a public repository.
Because disclosure is irreversible, this runs locally before the push rather than only in
CI.

## Pull requests

One topic per pull request, with a description of what changed and why. CI must pass and a
code owner must approve. For anything larger than a fix, open an issue first so we can
agree on the shape before you spend time on it.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md).
