# 42min for Cursor

Connect Cursor to your [42min](https://42min.us) account and manage scheduling from the
editor: event types, availability, bookings, round-robin distribution, meeting polls and
lead-routing forms.

The plugin does not ship a server. It points Cursor at 42min's hosted MCP server at
`https://api.42min.us/mcp`, which authorizes you over OAuth.

## Install

The marketplace submission is pending. Until it is accepted, install locally by copying
this directory into `~/.cursor/plugins/local`:

```bash
git clone https://github.com/42min-us/42min-developers.git
mkdir -p ~/.cursor/plugins/local/42min
cp -R 42min-developers/plugins/42min/. ~/.cursor/plugins/local/42min/
```

On Windows, in PowerShell:

```powershell
git clone https://github.com/42min-us/42min-developers.git
New-Item -ItemType Directory -Force -Path "$HOME\.cursor\plugins\local\42min"
Copy-Item -Recurse -Force "42min-developers\plugins\42min\*" "$HOME\.cursor\plugins\local\42min\"
```

Then restart Cursor, or run **Developer: Reload Window** from the command palette.
The plugin and its MCP server appear under Customize.

## Authorization

There is no API key to paste. On first use Cursor opens a browser window, you sign in to
42min and approve the connection, and the token is stored by Cursor. The server advertises
its own OAuth metadata, so no other configuration is required.

Two scopes govern access:

| Scope | Grants |
|---|---|
| `mcp:scheduling:read` | Every read tool below |
| `mcp:scheduling:write` | The tools marked *(write)* |

The server registers only the tools your granted scopes cover, and re-checks on every
call: tools you cannot use are not merely refused, they are never offered. It acts as
you, inside your organization, and never sees another tenant's data.

**Connecting over OAuth grants both scopes.** The consent screen is approve-or-deny, not
a menu, so there is no read-only option on this path. If you want an assistant that can
look but not touch, connect with a
[personal access token](https://42min.us/help/ai-assistants/connecting-your-assistant)
scoped to `:read` only. Minting a token requires the Admin role.

## Tools

The server exposes **35 tools**. Write tools are marked; everything else is read-only.

### Profile

| Tool | What it does |
|---|---|
| `get_me` | The connected user's profile (name, username, timezone, locale) plus their organization and MCP role. |

### Event types

| Tool | What it does |
|---|---|
| `get_event_type` | Full detail for one event type (duration, location, questions, limits) by UUID or "username/slug". |
| `list_event_types` | List bookable meeting templates (event types), optionally filtered by active status, host user, or slug. |
| `set_event_type_status` *(write)* | Turn a bookable event type on or off. |

### Availability

| Tool | What it does |
|---|---|
| `add_out_of_office` *(write)* | Block a whole-day date range (inclusive) during which the connected user has no bookable slots anywhere — every schedule and event type, and round-robin skips them. |
| `add_schedule_override` *(write)* | Add or replace a date-specific override on one of the connected user's own availability schedules. |
| `delete_out_of_office` *(write)* | Delete one of the connected user's out of office periods by id (ids come from get_schedules or add_out_of_office). |
| `get_schedules` | The connected user's own availability schedules (weekly intervals). |

### Slots

| Tool | What it does |
|---|---|
| `check_slot` | Check whether one specific start time is bookable for an event type. |
| `find_available_slots` | Open booking slots for an event type over a date range (max 31 days). |

### Bookings

| Tool | What it does |
|---|---|
| `cancel_booking` *(write)* | Cancel a booking by uid. |
| `create_booking` *(write)* | Book a meeting for an attendee at a start time on any active event type in the organization (public-page parity). |
| `get_booking` | One booking by uid, including labeled form responses (answers to since-deleted questions are omitted), routing form answers, location/conferencing URL, and no-show status. |
| `list_bookings` | List bookings with filters (status, date range, event type, attendee email, host). host_user_ids (array) supersedes host_user_id. |
| `reschedule_booking` *(write)* | Move a booking to a new start time. |

### Meetings

| Tool | What it does |
|---|---|
| `list_meetings` | Host-side meetings view (upcoming/past/date range), with status, event type, and host filters (host_user_ids array supersedes host_user_id). |
| `set_meeting_no_show` *(write)* | Mark or unmark a past, confirmed meeting as a no-show. |

### Contacts

| Tool | What it does |
|---|---|
| `get_contact` | One contact plus their full meeting history (capped, most recent first). |
| `search_contacts` | Search contacts by name/email, with meeting counts and tags. |

### Roundtables

| Tool | What it does |
|---|---|
| `create_roundtable` *(write)* | Create a DRAFT group scheduling poll (roundtable) on one of your event types, with 1-20 candidate time slots and — for access_mode "invitees" — up to 50 email participants. |
| `get_roundtable` | Full poll state for one roundtable: candidate slots, participants, per-slot vote tallies, and confirmed booking. |
| `list_roundtables` | List group scheduling polls (roundtables) with status, vote counts, and confirmed time. |
| `publish_roundtable` *(write)* | Publish a draft roundtable: opens voting, immediately emails every invited participant (invitees mode), and places tentative calendar holds on all candidate slots on the host calendar. |

### Routing forms

| Tool | What it does |
|---|---|
| `duplicate_routing_form` *(write)* | Copy a routing form, including its questions and rules — the copied rules keep working on the copy, and destinations are copied as is. |
| `evaluate_routing_form` | Test routing (dry run) |
| `get_routing_form` | The full definition of one routing form: its questions (question_id is what list_routing_responses answer filters and evaluate_routing_form answers use) and its rules. |
| `get_routing_form_stats` | One call for 'how is this form converting / where do leads land'. |
| `get_routing_response` | Get one routing form response |
| `list_routing_forms` | List the lead-qualification routing forms you can access, newest first, with their public URL, status and question/rule/response counts. |
| `list_routing_responses` | Lead-qualification submissions for one routing form: what each lead answered, which rule matched, where they were sent, and the booking they made if any. |
| `set_routing_form_status` *(write)* | Turn a routing form on or off. |

### Single-use links

| Tool | What it does |
|---|---|
| `create_single_use_links` *(write)* | Generate one-time booking links (quantity 1-10) for an event type you manage, returning shareable URLs. |
| `delete_single_use_link` *(write)* | Delete an unused single-use booking link so it can no longer be used to book. |
| `list_single_use_links` | List one-time booking links with created/booked/expired status. |

### Users

| Tool | What it does |
|---|---|
| `list_users` | List organization members (id, name, email, username, role, status, timezone). |

## Included guidance

`rules/42min.md` teaches the agent how to use these tools well: verify a slot before
booking it, never infer a timezone, confirm before anything that emails a real person,
retry writes with the same idempotency key. Without it a model will happily invent a
start time and book it.

## Requirements

A 42min account. Sign up at [42min.us](https://42min.us). The plugin works with any
Cursor version that supports remote MCP servers with OAuth.

## Documentation and support

- [API and MCP documentation](https://42min.us/help/api)
- [Report a problem](https://github.com/42min-us/42min-developers/issues)
- Security issues: see [SECURITY.md](../../SECURITY.md)

## License

MIT. See [LICENSE](../../LICENSE).
