---
description: How to use the 42min scheduling tools correctly, including timezone handling and which operations are destructive.
alwaysApply: false
---

# Working with 42min

These rules apply when using the `42min` MCP server. It acts as the connected user
(the person who authorized the plugin), scoped to their organization.

## Always verify a slot before booking

Never construct a start time and call `create_booking` with it. Availability depends on
the host's schedule, connected calendars, buffers and minimum notice, none of which are
visible from a calendar date alone.

1. `find_available_slots` for a date range, or `check_slot` for one specific time.
2. Only then `create_booking` or `reschedule_booking`.

If a booking fails with `slot_unavailable`, call `find_available_slots` and offer the
user real alternatives rather than retrying a guess.

## Timezones are explicit, never inferred

Slot output is UTC ISO. When showing times to a person, convert to a timezone you were
actually told about: the attendee's, the host's from `get_me`, or one the user named.
Do not assume the machine's local timezone is anyone's. When a user says "3pm", ask
whose 3pm if it is not already established.

## Confirm before anything that reaches other people

These operations send email, place calendar holds, or take down a live page. Describe
what will happen and get explicit confirmation first:

- `publish_roundtable` sends invitations to every participant and places tentative
  holds on all candidate slots. It cannot be undone through this server.
- `cancel_booking` notifies the attendee and removes the calendar event.
- `reschedule_booking` notifies the attendee.
- `set_event_type_status` and `set_routing_form_status`, when turning something off,
  immediately stop new public bookings or submissions. A routing form that other forms
  chain into will send those leads to a dead page.
- `create_single_use_links` mints shareable booking URLs.

Read operations need no confirmation.

## Retries use the idempotency key, not a second call

Write tools accept an `idempotency_key`. On a timeout or an unclear failure, retry with
the *same* key. A new key means a new booking. Never "just try again" without it.

## Paginate rather than guessing

List tools are cursor- or page-based and cap their output. When a result reports
`next_cursor`, `next_page` or a `next_*_offset`, follow it before concluding something
does not exist. Several routing form tools page questions, rules and answers separately;
if the form was edited between calls, restart the paging from the beginning.

## Scope failures are not bugs

The server registers only the tools the granted scopes cover, and re-checks per call. If
a write tool is missing or returns an insufficient-scope error, the user authorized
read-only access. Tell them to reauthorize with write scope; do not look for a
workaround.

## Bookings made on someone else's event type

`create_booking` works against any active event type in the organization, matching the
public booking page. A booking made on a colleague's or team event type cannot afterwards
be retrieved or canceled through this server. The attendee manages it through the
reschedule and cancel links they were emailed. Say so when it applies rather than
promising later changes.
