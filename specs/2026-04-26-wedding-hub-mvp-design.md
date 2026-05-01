# Wedding Guest Hub — MVP Design Spec

## Product Thesis

A form-based wedding site generator for destination and multi-day weddings. Couples get a polished site in minutes. Guests get a personalized view showing only their events. The differentiator is per-event guest group visibility — something Zola and The Knot don't do.

**Not:** a drag-and-drop builder, a social network, a vendor marketplace, or a wedding planning suite.

---

## Target User

Couples hosting destination or multi-day weddings (75–250 guests) who care about guest experience, not just RSVP collection. Best first users: warm referrals from the founder's network.

---

## Templates (v1)

Two templates at launch:

- **Modern Luxury** — dark/black background, gold accents, editorial serif typography
- **Romantic Classic** — warm ivory, serif fonts, gold line details, timeless feel

Couples pick one at setup. No switching after. No mixing.

---

## Core Sections (always included)

| Section | Description |
|---|---|
| Hero / Cover | Couple names, date, location, cover photo |
| Our Story | How they met, proposal story, a few photos |
| Events & RSVP | Each event with date, time, location, dress code, RSVP. Visibility by guest group. |
| Registry | Links out to Zola, Amazon, etc. Not built in-house. |
| Travel & Hotels | Recommended stays, airport info, transport notes |
| FAQ | Dress code, parking, +1 policy, kids policy, etc. |

## Optional Sections (couple toggles on)

- Wedding Party (names + photos)
- Things To Do (local recs for destination weddings)

---

## The Key Feature: Event Visibility by Guest Group

Each event is assigned to one or more guest groups. Guests only see events they're invited to. This solves the real pain of multi-day weddings where not every guest is invited to every event.

**Example:**
- Friday Welcome Dinner → VIP / Family only
- Saturday Ceremony + Reception → All Guests
- Sunday Brunch → Family only

---

## Data Model (Supabase)

### `weddings`
```
id, couple_names, date, location, template (luxury|classic),
slug, cover_photo_url, story_text, registry_links[], faq[], travel_info
```

### `events`
```
id, wedding_id, name, date, time, location, dress_code,
description, guest_group_ids[]
```

### `guest_groups`
```
id, wedding_id, name (e.g. "All Guests", "VIP", "Family")
```

### `guests`
```
id, wedding_id, name, email, group_ids[]
```

### `rsvps`
```
id, guest_id, event_id, status (yes|no|maybe), meal_choice, note
```

---

## Couple Flow

1. Sign up → pick template (Luxury or Classic)
2. Fill in site details: names, date, location, story, photos, registry links, travel info, FAQ
3. Create events → assign each to guest groups
4. Import guest list (CSV or manual) → assign guests to groups
5. Publish → share link (`yournames.wedsite.com`)

---

## Guest Flow

1. Guest receives link from couple
2. Opens beautiful wedding site
3. Sees only the events they're invited to (based on group)
4. RSVPs per event via magic link (no account required)
5. Views travel info, FAQ, registry

---

## Tech Stack

- **Next.js + Tailwind** — dynamic routes: `/[slug]` renders wedding site, `/[slug]/rsvp` for RSVP flow, `/dashboard` for couple admin
- **Supabase** — auth for couples, row-level security for guest data, storage for photos
- **Vercel** — deployment (same as existing projects)

---

## Couple Admin Dashboard

- Site editor (fill in fields, toggle sections)
- Event manager (create/edit events, assign guest groups)
- Guest list manager (import CSV, assign groups, view RSVP status)
- Live preview of site

---

## Explicitly Out of Scope (v1)

- Guest coordination / hub board
- Custom domains
- SMS reminders
- Photo sharing / guest uploads
- Seating charts
- Vendor marketplace
- Drag-and-drop editor
- Mobile app
- Multiple template switching after setup

---

## Phase 2 (after couples are on the platform)

**Private Guest Coordination Board** — rides, hotel sharing, meetup threads, couple announcements. This is the moat. Only built once the website builder has real couples and real guests.

---

## Success Criteria for MVP

- 3–5 real couples using it for their actual wedding
- Guests successfully RSVP through the platform
- No couple embarrassed to send the link to their guests
- At least one couple says "I'd pay for this"
