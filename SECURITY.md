# Security policy

## Reporting a vulnerability

Email **plus@42min.us**. Please do not open a public issue for a security report.

Include what you need to demonstrate the problem: affected endpoint or tool, the request
and response, and the impact you believe it has. A proof of concept helps but is not
required to report.

**What to expect**

| Stage | Target |
|---|---|
| Acknowledgment | 1 day |
| Initial assessment | 2 days |
| Fix or mitigation plan | communicated with the assessment |

We will tell you when the issue is resolved and are glad to credit you in the changelog
unless you prefer otherwise.

## Scope

In scope: the 42min public API at `https://api.42min.us`, the MCP server at
`https://api.42min.us/mcp`, and the contents of this repository.

Out of scope: denial of service, volumetric or automated scanning, social engineering,
physical attacks, and findings that require access to an account you do not control.

## Testing responsibly

Test only against data in your own organization. Do not create bookings against other
people's event types while testing: a booking sends real email to a real attendee and
places a real calendar event. There is no sandbox environment yet, so exercise write
operations on event types you own and cancel what you create.
