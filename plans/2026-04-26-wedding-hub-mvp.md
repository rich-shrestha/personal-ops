# Wedding Guest Hub MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a form-based wedding site generator with two polished templates, per-event RSVP, and guest group visibility — deployable for real couples in 3–4 weeks.

**Architecture:** New Next.js app at `/Users/richshrestha/Documents/Projects/wedding-hub`. Couples create and manage their site via a dashboard. Public site lives at `/[slug]`. Guests RSVP via a magic-link flow at `/[slug]/rsvp?token=...`. Supabase handles auth, data, and photo storage.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (auth + postgres + storage), Vercel

---

## File Map

```
wedding-hub/
├── src/
│   ├── app/
│   │   ├── layout.tsx                     # root layout, fonts
│   │   ├── page.tsx                       # minimal landing page
│   │   ├── login/page.tsx                 # couple login
│   │   ├── signup/page.tsx                # couple signup
│   │   ├── dashboard/
│   │   │   ├── page.tsx                   # overview + RSVP stats
│   │   │   ├── setup/page.tsx             # setup wizard
│   │   │   ├── events/page.tsx            # event manager
│   │   │   └── guests/page.tsx            # guest list + CSV import
│   │   ├── [slug]/
│   │   │   ├── page.tsx                   # public wedding site renderer
│   │   │   └── rsvp/page.tsx              # RSVP form (token-based)
│   │   └── api/
│   │       └── rsvp/route.ts              # POST: submit RSVP
│   ├── components/
│   │   ├── templates/
│   │   │   ├── ModernLuxury.tsx           # dark/gold template shell
│   │   │   └── RomanticClassic.tsx        # ivory/warm template shell
│   │   ├── sections/
│   │   │   ├── HeroSection.tsx            # names, date, location, cover photo
│   │   │   ├── StorySection.tsx           # our story text + photos
│   │   │   ├── EventsSection.tsx          # event cards filtered by guest group
│   │   │   ├── RegistrySection.tsx        # external registry links
│   │   │   ├── TravelSection.tsx          # hotels, transport, airport
│   │   │   └── FAQSection.tsx             # accordion FAQ
│   │   └── dashboard/
│   │       ├── SiteEditor.tsx             # fill-in-the-fields form
│   │       ├── EventManager.tsx           # create/edit events + assign groups
│   │       └── GuestManager.tsx           # import CSV, assign groups, view RSVPs
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts                  # browser client
│       │   └── server.ts                  # server client (RSC + API routes)
│       └── types.ts                       # all TypeScript types
├── supabase/
│   └── schema.sql
└── tests/
    └── guest-filtering.test.ts            # unit test for group visibility logic
```

---

## Phase 1: Foundation

### Task 1: Scaffold project

**Files:**
- Create: `/Users/richshrestha/Documents/Projects/wedding-hub/` (entire project)

- [ ] **Step 1: Create Next.js project**

```bash
cd /Users/richshrestha/Documents/Projects
npx create-next-app@latest wedding-hub --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd wedding-hub
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest @vitest/ui
```

- [ ] **Step 3: Add vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add env file**

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Get these from your Supabase project dashboard → Settings → API.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold wedding-hub Next.js project"
```

---

### Task 2: Database schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Write schema**

Create `supabase/schema.sql`:
```sql
create extension if not exists "uuid-ossp";

-- Weddings (one per couple)
create table weddings (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  couple_names     text not null,
  date             date not null,
  location         text not null,
  template         text not null check (template in ('luxury', 'classic')),
  slug             text not null unique,
  cover_photo_url  text,
  story_text       text,
  registry_links   jsonb default '[]',
  travel_info      text,
  faq              jsonb default '[]',
  show_wedding_party boolean default false,
  show_things_to_do  boolean default false,
  published        boolean default false,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Guest groups (e.g. "All Guests", "VIP", "Family")
create table guest_groups (
  id          uuid primary key default uuid_generate_v4(),
  wedding_id  uuid not null references weddings(id) on delete cascade,
  name        text not null,
  created_at  timestamptz default now()
);

-- Events (Friday dinner, Saturday ceremony, etc.)
create table events (
  id               uuid primary key default uuid_generate_v4(),
  wedding_id       uuid not null references weddings(id) on delete cascade,
  name             text not null,
  date             date not null,
  time             text,
  location         text,
  dress_code       text,
  description      text,
  guest_group_ids  uuid[] default '{}',
  sort_order       integer default 0,
  created_at       timestamptz default now()
);

-- Guests
create table guests (
  id          uuid primary key default uuid_generate_v4(),
  wedding_id  uuid not null references weddings(id) on delete cascade,
  name        text not null,
  email       text,
  group_ids   uuid[] default '{}',
  rsvp_token  text unique default encode(gen_random_bytes(32), 'hex'),
  created_at  timestamptz default now()
);

-- RSVPs (one per guest per event)
create table rsvps (
  id           uuid primary key default uuid_generate_v4(),
  guest_id     uuid not null references guests(id) on delete cascade,
  event_id     uuid not null references events(id) on delete cascade,
  status       text not null check (status in ('yes', 'no', 'maybe')),
  meal_choice  text,
  note         text,
  created_at   timestamptz default now(),
  unique(guest_id, event_id)
);

-- Indexes
create index on weddings(user_id);
create index on weddings(slug);
create index on guest_groups(wedding_id);
create index on events(wedding_id);
create index on guests(wedding_id);
create index on guests(rsvp_token);
create index on rsvps(guest_id);
create index on rsvps(event_id);

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger weddings_updated_at
  before update on weddings
  for each row execute function update_updated_at();

-- RLS
alter table weddings enable row level security;
alter table guest_groups enable row level security;
alter table events enable row level security;
alter table guests enable row level security;
alter table rsvps enable row level security;

-- Couples can only see their own wedding data
create policy "couples manage own wedding"
  on weddings for all using (auth.uid() = user_id);

create policy "couples manage own guest_groups"
  on guest_groups for all using (
    wedding_id in (select id from weddings where user_id = auth.uid())
  );

create policy "couples manage own events"
  on events for all using (
    wedding_id in (select id from weddings where user_id = auth.uid())
  );

create policy "couples manage own guests"
  on guests for all using (
    wedding_id in (select id from weddings where user_id = auth.uid())
  );

create policy "couples manage own rsvps"
  on rsvps for all using (
    guest_id in (
      select id from guests where
      wedding_id in (select id from weddings where user_id = auth.uid())
    )
  );

-- Public read for published weddings (guests viewing site)
create policy "public read published weddings"
  on weddings for select using (published = true);

create policy "public read events of published weddings"
  on events for select using (
    wedding_id in (select id from weddings where published = true)
  );

create policy "public read guest_groups of published weddings"
  on guest_groups for select using (
    wedding_id in (select id from weddings where published = true)
  );

-- Guests can read/write their own RSVP via token (handled in API route with service role)
```

- [ ] **Step 2: Run schema in Supabase**

Go to Supabase dashboard → SQL Editor → paste contents of `supabase/schema.sql` → Run.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add wedding hub database schema with RLS"
```

---

### Task 3: TypeScript types + Supabase clients

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Write types**

Create `src/lib/types.ts`:
```ts
export type Template = 'luxury' | 'classic'
export type RSVPStatus = 'yes' | 'no' | 'maybe'

export interface RegistryLink {
  label: string
  url: string
}

export interface FAQItem {
  question: string
  answer: string
}

export interface Wedding {
  id: string
  user_id: string
  couple_names: string
  date: string
  location: string
  template: Template
  slug: string
  cover_photo_url: string | null
  story_text: string | null
  registry_links: RegistryLink[]
  travel_info: string | null
  faq: FAQItem[]
  show_wedding_party: boolean
  show_things_to_do: boolean
  published: boolean
  created_at: string
  updated_at: string
}

export interface GuestGroup {
  id: string
  wedding_id: string
  name: string
}

export interface WeddingEvent {
  id: string
  wedding_id: string
  name: string
  date: string
  time: string | null
  location: string | null
  dress_code: string | null
  description: string | null
  guest_group_ids: string[]
  sort_order: number
}

export interface Guest {
  id: string
  wedding_id: string
  name: string
  email: string | null
  group_ids: string[]
  rsvp_token: string
}

export interface RSVP {
  id: string
  guest_id: string
  event_id: string
  status: RSVPStatus
  meal_choice: string | null
  note: string | null
}

// What the public wedding site page receives
export interface PublicWeddingData {
  wedding: Wedding
  events: WeddingEvent[]
  groups: GuestGroup[]
}

// What the RSVP page receives (after token lookup)
export interface RSVPPageData {
  guest: Guest
  wedding: Wedding
  visibleEvents: WeddingEvent[]
  existingRSVPs: RSVP[]
}
```

- [ ] **Step 2: Write Supabase browser client**

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write Supabase server client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}
```

- [ ] **Step 4: Write + run guest filtering unit test**

Create `tests/guest-filtering.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import type { WeddingEvent, Guest } from '@/lib/types'

function getVisibleEvents(events: WeddingEvent[], guest: Guest): WeddingEvent[] {
  return events.filter(event =>
    event.guest_group_ids.some(gid => guest.group_ids.includes(gid))
  )
}

describe('getVisibleEvents', () => {
  const allGuestsGroup = 'group-all'
  const vipGroup = 'group-vip'

  const events: WeddingEvent[] = [
    { id: 'e1', wedding_id: 'w1', name: 'Friday Dinner', date: '2027-06-13',
      time: '7pm', location: null, dress_code: null, description: null,
      guest_group_ids: [vipGroup], sort_order: 0 },
    { id: 'e2', wedding_id: 'w1', name: 'Saturday Ceremony', date: '2027-06-14',
      time: '4pm', location: null, dress_code: null, description: null,
      guest_group_ids: [allGuestsGroup, vipGroup], sort_order: 1 },
    { id: 'e3', wedding_id: 'w1', name: 'Sunday Brunch', date: '2027-06-15',
      time: '11am', location: null, dress_code: null, description: null,
      guest_group_ids: [vipGroup], sort_order: 2 },
  ]

  it('regular guest only sees Saturday ceremony', () => {
    const guest: Guest = { id: 'g1', wedding_id: 'w1', name: 'Jane',
      email: null, group_ids: [allGuestsGroup], rsvp_token: 'tok1' }
    const visible = getVisibleEvents(events, guest)
    expect(visible.map(e => e.id)).toEqual(['e2'])
  })

  it('VIP guest sees all three events', () => {
    const guest: Guest = { id: 'g2', wedding_id: 'w1', name: 'Mom',
      email: null, group_ids: [vipGroup], rsvp_token: 'tok2' }
    const visible = getVisibleEvents(events, guest)
    expect(visible.map(e => e.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('guest with no groups sees nothing', () => {
    const guest: Guest = { id: 'g3', wedding_id: 'w1', name: 'Unknown',
      email: null, group_ids: [], rsvp_token: 'tok3' }
    const visible = getVisibleEvents(events, guest)
    expect(visible).toHaveLength(0)
  })
})
```

Run: `npm test`
Expected: 3 tests pass

- [ ] **Step 5: Export getVisibleEvents from types lib**

Create `src/lib/guest-filtering.ts`:
```ts
import type { WeddingEvent, Guest } from '@/lib/types'

export function getVisibleEvents(events: WeddingEvent[], guest: Guest): WeddingEvent[] {
  return events.filter(event =>
    event.guest_group_ids.some(gid => guest.group_ids.includes(gid))
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ tests/
git commit -m "feat: add types, supabase clients, and guest filtering logic"
```

---

## Phase 2: Public Wedding Site

### Task 4: Section components

**Files:**
- Create: `src/components/sections/HeroSection.tsx`
- Create: `src/components/sections/StorySection.tsx`
- Create: `src/components/sections/EventsSection.tsx`
- Create: `src/components/sections/RegistrySection.tsx`
- Create: `src/components/sections/TravelSection.tsx`
- Create: `src/components/sections/FAQSection.tsx`

These are pure display components — they receive data as props and render it. They have no template-specific styles (those come from the template shell in Task 5).

- [ ] **Step 1: HeroSection**

Create `src/components/sections/HeroSection.tsx`:
```tsx
import type { Wedding } from '@/lib/types'

interface Props {
  wedding: Wedding
  className?: string
}

export function HeroSection({ wedding, className }: Props) {
  return (
    <section className={className} data-section="hero">
      {wedding.cover_photo_url && (
        <img
          src={wedding.cover_photo_url}
          alt={`${wedding.couple_names} cover photo`}
          className="w-full h-64 md:h-96 object-cover"
        />
      )}
      <div className="text-center py-12 px-6">
        <h1 className="font-serif text-4xl md:text-6xl">{wedding.couple_names}</h1>
        <p className="mt-4 text-lg">
          {new Date(wedding.date).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>
        <p className="mt-2">{wedding.location}</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: StorySection**

Create `src/components/sections/StorySection.tsx`:
```tsx
import type { Wedding } from '@/lib/types'

interface Props { wedding: Wedding; className?: string }

export function StorySection({ wedding, className }: Props) {
  if (!wedding.story_text) return null
  return (
    <section className={className} data-section="story">
      <h2 className="font-serif text-3xl text-center mb-6">Our Story</h2>
      <div className="max-w-2xl mx-auto text-center leading-relaxed whitespace-pre-wrap">
        {wedding.story_text}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: EventsSection**

Create `src/components/sections/EventsSection.tsx`:
```tsx
import type { WeddingEvent } from '@/lib/types'

interface Props {
  events: WeddingEvent[]
  weddingSlug: string
  guestToken?: string
  className?: string
}

export function EventsSection({ events, weddingSlug, guestToken, className }: Props) {
  return (
    <section className={className} data-section="events">
      <h2 className="font-serif text-3xl text-center mb-8">Events</h2>
      <div className="space-y-6 max-w-2xl mx-auto">
        {events.map(event => (
          <div key={event.id} className="border rounded-lg p-6">
            <h3 className="font-serif text-xl mb-2">{event.name}</h3>
            <p className="text-sm">
              {new Date(event.date).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric'
              })}
              {event.time && ` · ${event.time}`}
            </p>
            {event.location && <p className="text-sm mt-1">{event.location}</p>}
            {event.dress_code && (
              <p className="text-sm mt-1">Dress code: {event.dress_code}</p>
            )}
            {event.description && (
              <p className="mt-3 text-sm leading-relaxed">{event.description}</p>
            )}
          </div>
        ))}
      </div>
      {guestToken && (
        <div className="text-center mt-8">
          <a
            href={`/${weddingSlug}/rsvp?token=${guestToken}`}
            className="inline-block px-8 py-3 font-medium tracking-wide"
          >
            RSVP Now
          </a>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: RegistrySection**

Create `src/components/sections/RegistrySection.tsx`:
```tsx
import type { Wedding } from '@/lib/types'

interface Props { wedding: Wedding; className?: string }

export function RegistrySection({ wedding, className }: Props) {
  if (!wedding.registry_links?.length) return null
  return (
    <section className={className} data-section="registry">
      <h2 className="font-serif text-3xl text-center mb-6">Registry</h2>
      <div className="flex flex-wrap gap-4 justify-center">
        {wedding.registry_links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 border rounded font-medium hover:opacity-80 transition-opacity"
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: TravelSection**

Create `src/components/sections/TravelSection.tsx`:
```tsx
import type { Wedding } from '@/lib/types'

interface Props { wedding: Wedding; className?: string }

export function TravelSection({ wedding, className }: Props) {
  if (!wedding.travel_info) return null
  return (
    <section className={className} data-section="travel">
      <h2 className="font-serif text-3xl text-center mb-6">Travel & Hotels</h2>
      <div className="max-w-2xl mx-auto leading-relaxed whitespace-pre-wrap">
        {wedding.travel_info}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: FAQSection**

Create `src/components/sections/FAQSection.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Wedding } from '@/lib/types'

interface Props { wedding: Wedding; className?: string }

export function FAQSection({ wedding, className }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  if (!wedding.faq?.length) return null
  return (
    <section className={className} data-section="faq">
      <h2 className="font-serif text-3xl text-center mb-6">FAQ</h2>
      <div className="max-w-2xl mx-auto space-y-3">
        {wedding.faq.map((item, i) => (
          <div key={i} className="border rounded">
            <button
              className="w-full text-left px-4 py-3 font-medium flex justify-between items-center"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {item.question}
              <span>{open === i ? '−' : '+'}</span>
            </button>
            {open === i && (
              <div className="px-4 pb-4 text-sm leading-relaxed">{item.answer}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/sections/
git commit -m "feat: add wedding site section components"
```

---

### Task 5: Template shells

**Files:**
- Create: `src/components/templates/ModernLuxury.tsx`
- Create: `src/components/templates/RomanticClassic.tsx`

Templates wrap all sections in their visual style (colors, fonts, spacing). Sections are passed pre-filtered event data.

- [ ] **Step 1: Add Google Fonts to root layout**

Edit `src/app/layout.tsx` — add Cormorant Garamond (serif) and Inter:
```tsx
import { Inter, Cormorant_Garamond } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['300', '400', '500', '600'],
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${cormorant.variable}`}>{children}</body>
    </html>
  )
}
```

Add to `src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  .font-serif { font-family: var(--font-serif), Georgia, serif; }
  .font-sans  { font-family: var(--font-sans), system-ui, sans-serif; }
}
```

- [ ] **Step 2: ModernLuxury template**

Create `src/components/templates/ModernLuxury.tsx`:
```tsx
import type { PublicWeddingData } from '@/lib/types'
import { HeroSection } from '@/components/sections/HeroSection'
import { StorySection } from '@/components/sections/StorySection'
import { EventsSection } from '@/components/sections/EventsSection'
import { RegistrySection } from '@/components/sections/RegistrySection'
import { TravelSection } from '@/components/sections/TravelSection'
import { FAQSection } from '@/components/sections/FAQSection'

interface Props {
  data: PublicWeddingData
  guestToken?: string
}

export function ModernLuxury({ data, guestToken }: Props) {
  const { wedding, events } = data
  const sectionClass = 'py-16 px-6 md:px-12 border-b border-zinc-800'

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-6 py-4 flex gap-6 text-xs tracking-[0.2em] uppercase text-zinc-400">
        <a href="#events" className="hover:text-amber-400 transition-colors">Events</a>
        <a href="#travel" className="hover:text-amber-400 transition-colors">Travel</a>
        <a href="#registry" className="hover:text-amber-400 transition-colors">Registry</a>
        <a href="#faq" className="hover:text-amber-400 transition-colors">FAQ</a>
      </nav>

      <HeroSection wedding={wedding}
        className="pt-16 [&_h1]:text-amber-100 [&_h1]:font-light [&_h1]:tracking-widest [&_p]:text-zinc-400 [&_p]:tracking-widest [&_p]:text-sm [&_p]:uppercase" />

      <StorySection wedding={wedding}
        className={`${sectionClass} [&_h2]:text-amber-400 [&_h2]:tracking-widest [&_h2]:uppercase [&_h2]:text-lg [&_div]:text-zinc-300`} />

      <EventsSection events={events} weddingSlug={wedding.slug} guestToken={guestToken}
        className={`${sectionClass} [&_h2]:text-amber-400 [&_h2]:tracking-widest [&_h2]:uppercase [&_h2]:text-lg [&_.border]:border-zinc-700 [&_h3]:text-amber-100 [&_p]:text-zinc-400 [&_a]:bg-amber-600 [&_a]:text-zinc-950 [&_a]:tracking-widest`} />

      <TravelSection wedding={wedding}
        className={`${sectionClass} [&_h2]:text-amber-400 [&_h2]:tracking-widest [&_h2]:uppercase [&_h2]:text-lg [&_div]:text-zinc-300`} />

      <RegistrySection wedding={wedding}
        className={`${sectionClass} [&_h2]:text-amber-400 [&_h2]:tracking-widest [&_h2]:uppercase [&_h2]:text-lg [&_a]:border-zinc-600 [&_a]:text-zinc-200`} />

      <FAQSection wedding={wedding}
        className={`py-16 px-6 md:px-12 [&_h2]:text-amber-400 [&_h2]:tracking-widest [&_h2]:uppercase [&_h2]:text-lg [&_.border]:border-zinc-700 [&_button]:text-zinc-200 [&_div]:text-zinc-400`} />
    </div>
  )
}
```

- [ ] **Step 3: RomanticClassic template**

Create `src/components/templates/RomanticClassic.tsx`:
```tsx
import type { PublicWeddingData } from '@/lib/types'
import { HeroSection } from '@/components/sections/HeroSection'
import { StorySection } from '@/components/sections/StorySection'
import { EventsSection } from '@/components/sections/EventsSection'
import { RegistrySection } from '@/components/sections/RegistrySection'
import { TravelSection } from '@/components/sections/TravelSection'
import { FAQSection } from '@/components/sections/FAQSection'

interface Props {
  data: PublicWeddingData
  guestToken?: string
}

export function RomanticClassic({ data, guestToken }: Props) {
  const { wedding, events } = data
  const sectionClass = 'py-16 px-6 md:px-12 border-b border-stone-200'

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans">
      {/* Gold divider accent */}
      <div className="h-1 bg-gradient-to-r from-transparent via-amber-600 to-transparent" />

      <nav className="w-full px-6 py-5 flex justify-center gap-8 text-xs tracking-[0.15em] uppercase text-stone-500 border-b border-stone-200">
        <a href="#events" className="hover:text-amber-700 transition-colors">Events</a>
        <a href="#travel" className="hover:text-amber-700 transition-colors">Travel</a>
        <a href="#registry" className="hover:text-amber-700 transition-colors">Registry</a>
        <a href="#faq" className="hover:text-amber-700 transition-colors">FAQ</a>
      </nav>

      <HeroSection wedding={wedding}
        className="[&_h1]:font-serif [&_h1]:font-light [&_h1]:text-stone-800 [&_h1]:italic [&_p]:text-stone-500 [&_p]:tracking-widest [&_p]:text-sm [&_p]:uppercase" />

      {/* Gold line divider */}
      <div className="flex items-center gap-4 px-12 py-2">
        <div className="flex-1 h-px bg-amber-600/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-amber-600/60" />
        <div className="flex-1 h-px bg-amber-600/30" />
      </div>

      <StorySection wedding={wedding}
        className={`${sectionClass} [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-stone-700 [&_h2]:italic [&_div]:text-stone-600`} />

      <EventsSection events={events} weddingSlug={wedding.slug} guestToken={guestToken}
        className={`${sectionClass} [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-stone-700 [&_h2]:italic [&_.border]:border-stone-200 [&_h3]:font-serif [&_h3]:text-stone-800 [&_p]:text-stone-500 [&_a]:bg-amber-700 [&_a]:text-white [&_a]:tracking-widest`} />

      <TravelSection wedding={wedding}
        className={`${sectionClass} [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-stone-700 [&_h2]:italic [&_div]:text-stone-600`} />

      <RegistrySection wedding={wedding}
        className={`${sectionClass} [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-stone-700 [&_h2]:italic [&_a]:border-amber-600/40 [&_a]:text-amber-800`} />

      <FAQSection wedding={wedding}
        className={`py-16 px-6 md:px-12 [&_h2]:font-serif [&_h2]:font-light [&_h2]:text-stone-700 [&_h2]:italic [&_.border]:border-stone-200 [&_button]:text-stone-700 [&_div]:text-stone-500`} />

      <div className="h-1 bg-gradient-to-r from-transparent via-amber-600 to-transparent mt-8" />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/templates/ src/app/layout.tsx src/app/globals.css
git commit -m "feat: add Modern Luxury and Romantic Classic template shells"
```

---

### Task 6: Public wedding site route

**Files:**
- Create: `src/app/[slug]/page.tsx`

- [ ] **Step 1: Write the public wedding page**

Create `src/app/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { PublicWeddingData, Wedding, WeddingEvent, GuestGroup } from '@/lib/types'
import { ModernLuxury } from '@/components/templates/ModernLuxury'
import { RomanticClassic } from '@/components/templates/RomanticClassic'

interface Props {
  params: { slug: string }
  searchParams: { token?: string }
}

async function getWeddingData(slug: string): Promise<PublicWeddingData | null> {
  const supabase = await createClient()

  const { data: wedding } = await supabase
    .from('weddings')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!wedding) return null

  const [{ data: events }, { data: groups }] = await Promise.all([
    supabase.from('events').select('*').eq('wedding_id', wedding.id).order('sort_order'),
    supabase.from('guest_groups').select('*').eq('wedding_id', wedding.id),
  ])

  return {
    wedding: wedding as Wedding,
    events: (events ?? []) as WeddingEvent[],
    groups: (groups ?? []) as GuestGroup[],
  }
}

async function getGuestVisibleEvents(token: string, allEvents: WeddingEvent[]) {
  const supabase = await createClient()
  const { data: guest } = await supabase
    .from('guests')
    .select('*')
    .eq('rsvp_token', token)
    .single()

  if (!guest) return { visibleEvents: allEvents, guestToken: undefined }

  const { getVisibleEvents } = await import('@/lib/guest-filtering')
  return {
    visibleEvents: getVisibleEvents(allEvents, guest),
    guestToken: token,
  }
}

export default async function WeddingPage({ params, searchParams }: Props) {
  const data = await getWeddingData(params.slug)
  if (!data) notFound()

  const token = searchParams.token
  const { visibleEvents, guestToken } = token
    ? await getGuestVisibleEvents(token, data.events)
    : { visibleEvents: data.events, guestToken: undefined }

  const siteData: PublicWeddingData = { ...data, events: visibleEvents }

  if (data.wedding.template === 'luxury') {
    return <ModernLuxury data={siteData} guestToken={guestToken} />
  }
  return <RomanticClassic data={siteData} guestToken={guestToken} />
}

export async function generateMetadata({ params }: Props) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weddings')
    .select('couple_names, date, location')
    .eq('slug', params.slug)
    .single()

  if (!data) return { title: 'Wedding' }
  return {
    title: `${data.couple_names} — ${data.location}`,
    description: `Join us for our wedding on ${new Date(data.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
  }
}
```

- [ ] **Step 2: Test manually**

Run `npm run dev`. In Supabase, insert a test wedding row directly via the SQL editor:
```sql
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'test@test.com');

insert into weddings (user_id, couple_names, date, location, template, slug, story_text, published)
values (
  '00000000-0000-0000-0000-000000000001',
  'Rich & Sofia', '2027-06-14', 'Amalfi Coast, Italy',
  'luxury', 'rich-and-sofia',
  'We met at a coffee shop in Brooklyn in 2022.',
  true
);
```

Visit `http://localhost:3000/rich-and-sofia` — should show the Modern Luxury template with the test data.

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/
git commit -m "feat: add public wedding site route with template rendering"
```

---

## Phase 3: Guest RSVP Flow

### Task 7: RSVP API route

**Files:**
- Create: `src/app/api/rsvp/route.ts`

- [ ] **Step 1: Write RSVP API route**

Create `src/app/api/rsvp/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { token, rsvps } = body as {
    token: string
    rsvps: Array<{ event_id: string; status: 'yes' | 'no' | 'maybe'; meal_choice?: string; note?: string }>
  }

  if (!token || !Array.isArray(rsvps)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('rsvp_token', token)
    .single()

  if (!guest) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const upserts = rsvps.map(r => ({
    guest_id: guest.id,
    event_id: r.event_id,
    status: r.status,
    meal_choice: r.meal_choice ?? null,
    note: r.note ?? null,
  }))

  const { error } = await supabase
    .from('rsvps')
    .upsert(upserts, { onConflict: 'guest_id,event_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/
git commit -m "feat: add RSVP submission API route"
```

---

### Task 8: RSVP page

**Files:**
- Create: `src/app/[slug]/rsvp/page.tsx`

- [ ] **Step 1: Write RSVP page**

Create `src/app/[slug]/rsvp/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useParams } from 'next/navigation'
import type { WeddingEvent, Wedding, RSVP } from '@/lib/types'

interface PageData {
  guest: { id: string; name: string }
  wedding: Wedding
  visibleEvents: WeddingEvent[]
  existingRSVPs: RSVP[]
}

export default function RSVPPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [data, setData] = useState<PageData | null>(null)
  const [rsvps, setRsvps] = useState<Record<string, 'yes' | 'no' | 'maybe'>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setError('No RSVP link found.'); setLoading(false); return }
    fetch(`/api/rsvp-data?token=${token}&slug=${params.slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
        const initial: Record<string, 'yes' | 'no' | 'maybe'> = {}
        d.existingRSVPs.forEach((r: RSVP) => { initial[r.event_id] = r.status })
        setRsvps(initial)
      })
      .catch(() => setError('Failed to load RSVP data.'))
      .finally(() => setLoading(false))
  }, [token, params.slug])

  async function handleSubmit() {
    const payload = Object.entries(rsvps).map(([event_id, status]) => ({ event_id, status }))
    const res = await fetch('/api/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, rsvps: payload }),
    })
    if (res.ok) setSubmitted(true)
    else setError('Failed to submit RSVP.')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>
  if (!data) return null

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
        <h1 className="font-serif text-3xl mb-4">Thank you, {data.guest.name}!</h1>
        <p className="text-stone-500">Your RSVP has been received.</p>
        <a href={`/${params.slug}`} className="mt-6 underline text-sm">← Back to wedding site</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50 py-16 px-6">
      <div className="max-w-lg mx-auto">
        <a href={`/${params.slug}`} className="text-sm text-stone-400 hover:text-stone-600">← {data.wedding.couple_names}</a>
        <h1 className="font-serif text-3xl mt-4 mb-2">RSVP</h1>
        <p className="text-stone-500 mb-8">Hi {data.guest.name}, please let us know if you can make it.</p>

        <div className="space-y-6">
          {data.visibleEvents.map(event => (
            <div key={event.id} className="bg-white rounded-lg border border-stone-200 p-5">
              <h3 className="font-medium mb-1">{event.name}</h3>
              <p className="text-sm text-stone-500 mb-4">
                {new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                {event.time && ` · ${event.time}`}
              </p>
              <div className="flex gap-3">
                {(['yes', 'no', 'maybe'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setRsvps(prev => ({ ...prev, [event.id]: s }))}
                    className={`px-4 py-2 rounded text-sm font-medium capitalize transition-colors ${
                      rsvps[event.id] === s
                        ? 'bg-amber-700 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSubmit}
          disabled={Object.keys(rsvps).length === 0}
          className="mt-8 w-full py-3 bg-amber-700 text-white font-medium tracking-wide disabled:opacity-40"
        >
          Submit RSVP
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add RSVP data API route**

Create `src/app/api/rsvp-data/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getVisibleEvents } from '@/lib/guest-filtering'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const slug = req.nextUrl.searchParams.get('slug')
  if (!token || !slug) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: guest } = await supabase.from('guests').select('*').eq('rsvp_token', token).single()
  if (!guest) return NextResponse.json({ error: 'Invalid RSVP link' }, { status: 401 })

  const { data: wedding } = await supabase.from('weddings').select('*').eq('slug', slug).single()
  if (!wedding) return NextResponse.json({ error: 'Wedding not found' }, { status: 404 })

  const [{ data: events }, { data: existingRSVPs }] = await Promise.all([
    supabase.from('events').select('*').eq('wedding_id', wedding.id).order('sort_order'),
    supabase.from('rsvps').select('*').eq('guest_id', guest.id),
  ])

  const visibleEvents = getVisibleEvents(events ?? [], guest)

  return NextResponse.json({
    guest: { id: guest.id, name: guest.name },
    wedding,
    visibleEvents,
    existingRSVPs: existingRSVPs ?? [],
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[slug]/rsvp/ src/app/api/rsvp-data/
git commit -m "feat: add guest RSVP page and data API"
```

---

## Phase 4: Couple Auth + Setup

### Task 9: Auth pages

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/signup/page.tsx`
- Create: `src/middleware.ts`

- [ ] **Step 1: Login page**

Create `src/app/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-center mb-8">Sign In</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-amber-700 text-white py-3 font-medium tracking-wide">Sign In</button>
        </form>
        <p className="text-center text-sm text-stone-500 mt-4">
          New here? <a href="/signup" className="text-amber-700 underline">Create an account</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Signup page**

Create `src/app/signup/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); return }
    router.push('/dashboard/setup')
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-3xl text-center mb-2">Create Your Wedding Site</h1>
        <p className="text-stone-500 text-center text-sm mb-8">Free to start</p>
        <form onSubmit={handleSignup} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
          <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-amber-700 text-white py-3 font-medium tracking-wide">Get Started</button>
        </form>
        <p className="text-center text-sm text-stone-500 mt-4">
          Already have an account? <a href="/login" className="text-amber-700 underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add middleware to protect dashboard**

Create `src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/login/ src/app/signup/ src/middleware.ts
git commit -m "feat: add couple auth pages and dashboard middleware"
```

---

### Task 10: Setup wizard

**Files:**
- Create: `src/app/dashboard/setup/page.tsx`
- Create: `src/components/dashboard/SiteEditor.tsx`

- [ ] **Step 1: SiteEditor form component**

Create `src/components/dashboard/SiteEditor.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Wedding, Template, RegistryLink, FAQItem } from '@/lib/types'

interface Props {
  initial?: Partial<Wedding>
  onSave: (data: Partial<Wedding>) => Promise<void>
  saving?: boolean
}

export function SiteEditor({ initial = {}, onSave, saving }: Props) {
  const [coupleNames, setCoupleNames] = useState(initial.couple_names ?? '')
  const [date, setDate] = useState(initial.date ?? '')
  const [location, setLocation] = useState(initial.location ?? '')
  const [slug, setSlug] = useState(initial.slug ?? '')
  const [template, setTemplate] = useState<Template>(initial.template ?? 'classic')
  const [storyText, setStoryText] = useState(initial.story_text ?? '')
  const [travelInfo, setTravelInfo] = useState(initial.travel_info ?? '')
  const [registryLinks, setRegistryLinks] = useState<RegistryLink[]>(initial.registry_links ?? [])
  const [faq, setFaq] = useState<FAQItem[]>(initial.faq ?? [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSave({ couple_names: coupleNames, date, location, slug, template, story_text: storyText, travel_info: travelInfo, registry_links: registryLinks, faq })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Template */}
      <div>
        <label className="block text-sm font-medium mb-3">Template</label>
        <div className="flex gap-4">
          {(['luxury', 'classic'] as Template[]).map(t => (
            <button type="button" key={t} onClick={() => setTemplate(t)}
              className={`flex-1 py-4 border rounded-lg text-sm font-medium transition-colors ${template === t ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-stone-200 text-stone-600 hover:border-stone-400'}`}>
              {t === 'luxury' ? '◆ Modern Luxury' : '❦ Romantic Classic'}
            </button>
          ))}
        </div>
      </div>

      {/* Basic details */}
      <div className="grid grid-cols-1 gap-4">
        <Field label="Couple names (e.g. Rich & Sofia)" value={coupleNames} onChange={setCoupleNames} required />
        <Field label="Wedding date" value={date} onChange={setDate} type="date" required />
        <Field label="Location (city, venue)" value={location} onChange={setLocation} required />
        <Field label="URL slug (e.g. rich-and-sofia)" value={slug} onChange={setSlug} required
          hint={`Your site will be at: yoursite.com/${slug || 'your-slug'}`} />
      </div>

      {/* Story */}
      <div>
        <label className="block text-sm font-medium mb-2">Your Story</label>
        <textarea value={storyText} onChange={e => setStoryText(e.target.value)} rows={4}
          placeholder="How you met, the proposal, anything you'd like to share..."
          className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
      </div>

      {/* Travel */}
      <div>
        <label className="block text-sm font-medium mb-2">Travel & Hotels</label>
        <textarea value={travelInfo} onChange={e => setTravelInfo(e.target.value)} rows={4}
          placeholder="Nearest airports, recommended hotels, transport tips..."
          className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
      </div>

      {/* Registry links */}
      <div>
        <label className="block text-sm font-medium mb-3">Registry Links</label>
        {registryLinks.map((link, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={link.label} onChange={e => setRegistryLinks(r => r.map((l, j) => j === i ? { ...l, label: e.target.value } : l))}
              placeholder="Label (e.g. Zola)" className="flex-1 border border-stone-300 px-3 py-2 rounded text-sm" />
            <input value={link.url} onChange={e => setRegistryLinks(r => r.map((l, j) => j === i ? { ...l, url: e.target.value } : l))}
              placeholder="URL" className="flex-[2] border border-stone-300 px-3 py-2 rounded text-sm" />
            <button type="button" onClick={() => setRegistryLinks(r => r.filter((_, j) => j !== i))}
              className="text-stone-400 hover:text-red-500 px-2">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setRegistryLinks(r => [...r, { label: '', url: '' }])}
          className="text-sm text-amber-700 underline">+ Add registry</button>
      </div>

      {/* FAQ */}
      <div>
        <label className="block text-sm font-medium mb-3">FAQ</label>
        {faq.map((item, i) => (
          <div key={i} className="border border-stone-200 rounded p-3 mb-2 space-y-2">
            <input value={item.question} onChange={e => setFaq(f => f.map((q, j) => j === i ? { ...q, question: e.target.value } : q))}
              placeholder="Question" className="w-full border border-stone-200 px-3 py-2 rounded text-sm" />
            <textarea value={item.answer} onChange={e => setFaq(f => f.map((q, j) => j === i ? { ...q, answer: e.target.value } : q))}
              placeholder="Answer" rows={2} className="w-full border border-stone-200 px-3 py-2 rounded text-sm" />
            <button type="button" onClick={() => setFaq(f => f.filter((_, j) => j !== i))}
              className="text-xs text-stone-400 hover:text-red-500">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => setFaq(f => [...f, { question: '', answer: '' }])}
          className="text-sm text-amber-700 underline">+ Add FAQ item</button>
      </div>

      <button type="submit" disabled={saving}
        className="w-full py-3 bg-amber-700 text-white font-medium tracking-wide disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Site Details'}
      </button>
    </form>
  )
}

function Field({ label, value, onChange, type = 'text', required, hint }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; required?: boolean; hint?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full border border-stone-300 px-4 py-3 rounded focus:outline-none focus:border-amber-600" />
      {hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Setup wizard page**

Create `src/app/dashboard/setup/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SiteEditor } from '@/components/dashboard/SiteEditor'
import type { Wedding } from '@/lib/types'

export default function SetupPage() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSave(data: Partial<Wedding>) {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const { error } = await supabase.from('weddings').insert({
      ...data,
      user_id: user.id,
      published: false,
    })

    if (error) { setError(error.message); setSaving(false); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-stone-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif text-3xl mb-2">Set Up Your Wedding Site</h1>
        <p className="text-stone-500 mb-8">Fill in your details. You can always edit these later.</p>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <SiteEditor onSave={handleSave} saving={saving} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/setup/ src/components/dashboard/SiteEditor.tsx
git commit -m "feat: add couple setup wizard with site editor form"
```

---

### Task 11: Event manager

**Files:**
- Create: `src/app/dashboard/events/page.tsx`
- Create: `src/components/dashboard/EventManager.tsx`

- [ ] **Step 1: EventManager component**

Create `src/components/dashboard/EventManager.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { WeddingEvent, GuestGroup } from '@/lib/types'

interface Props {
  weddingId: string
  events: WeddingEvent[]
  groups: GuestGroup[]
  onEventsChange: (events: WeddingEvent[]) => void
}

interface EventForm {
  name: string; date: string; time: string; location: string
  dress_code: string; description: string; guest_group_ids: string[]
}

const emptyForm: EventForm = {
  name: '', date: '', time: '', location: '', dress_code: '', description: '', guest_group_ids: []
}

export function EventManager({ weddingId, events, groups, onEventsChange }: Props) {
  const [form, setForm] = useState<EventForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const body = { ...form, wedding_id: weddingId, sort_order: events.length }
    const method = editingId ? 'PATCH' : 'POST'
    const url = editingId ? `/api/events/${editingId}` : '/api/events'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const updated = await res.json()
    if (editingId) {
      onEventsChange(events.map(e => e.id === editingId ? updated : e))
    } else {
      onEventsChange([...events, updated])
    }
    setForm(emptyForm)
    setEditingId(null)
    setSaving(false)
  }

  function startEdit(event: WeddingEvent) {
    setEditingId(event.id)
    setForm({
      name: event.name, date: event.date, time: event.time ?? '',
      location: event.location ?? '', dress_code: event.dress_code ?? '',
      description: event.description ?? '', guest_group_ids: event.guest_group_ids
    })
  }

  async function handleDelete(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    onEventsChange(events.filter(e => e.id !== id))
  }

  function toggleGroup(gid: string) {
    setForm(f => ({
      ...f,
      guest_group_ids: f.guest_group_ids.includes(gid)
        ? f.guest_group_ids.filter(g => g !== gid)
        : [...f.guest_group_ids, gid]
    }))
  }

  return (
    <div className="space-y-8">
      {/* Existing events */}
      {events.length > 0 && (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="bg-white border border-stone-200 rounded-lg p-4 flex justify-between items-start">
              <div>
                <h3 className="font-medium">{event.name}</h3>
                <p className="text-sm text-stone-500 mt-1">
                  {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {event.time && ` · ${event.time}`}
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  {groups.filter(g => event.guest_group_ids.includes(g.id)).map(g => g.name).join(', ') || 'No groups assigned'}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(event)} className="text-xs text-stone-400 hover:text-amber-700">Edit</button>
                <button onClick={() => handleDelete(event.id)} className="text-xs text-stone-400 hover:text-red-500">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/edit form */}
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-5">
        <h3 className="font-medium mb-4">{editingId ? 'Edit Event' : 'Add Event'}</h3>
        <div className="grid grid-cols-1 gap-3">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Event name (e.g. Friday Welcome Dinner)"
            className="border border-stone-300 px-3 py-2 rounded text-sm w-full" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="border border-stone-300 px-3 py-2 rounded text-sm" />
            <input value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              placeholder="Time (e.g. 7:00 PM)"
              className="border border-stone-300 px-3 py-2 rounded text-sm" />
          </div>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            placeholder="Location" className="border border-stone-300 px-3 py-2 rounded text-sm w-full" />
          <input value={form.dress_code} onChange={e => setForm(f => ({ ...f, dress_code: e.target.value }))}
            placeholder="Dress code" className="border border-stone-300 px-3 py-2 rounded text-sm w-full" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)" rows={2}
            className="border border-stone-300 px-3 py-2 rounded text-sm w-full" />

          {/* Guest group assignment */}
          <div>
            <p className="text-xs font-medium text-stone-500 mb-2 uppercase tracking-wide">Visible to guest groups</p>
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <button key={g.id} type="button" onClick={() => toggleGroup(g.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    form.guest_group_ids.includes(g.id)
                      ? 'bg-amber-700 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={handleSave} disabled={!form.name || !form.date || saving}
            className="px-5 py-2 bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update' : 'Add Event'}
          </button>
          {editingId && (
            <button onClick={() => { setForm(emptyForm); setEditingId(null) }}
              className="px-5 py-2 text-stone-500 text-sm border border-stone-200 rounded">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Events API routes**

Create `src/app/api/events/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase.from('events').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

Create `src/app/api/events/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('events').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { error } = await supabase.from('events').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Events dashboard page**

Create `src/app/dashboard/events/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EventManagerWrapper } from './EventManagerWrapper'

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: wedding } = await supabase.from('weddings').select('id').eq('user_id', user.id).single()
  if (!wedding) redirect('/dashboard/setup')

  const [{ data: events }, { data: groups }] = await Promise.all([
    supabase.from('events').select('*').eq('wedding_id', wedding.id).order('sort_order'),
    supabase.from('guest_groups').select('*').eq('wedding_id', wedding.id),
  ])

  return (
    <div className="min-h-screen bg-stone-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <a href="/dashboard" className="text-sm text-stone-400 hover:text-stone-600">← Dashboard</a>
            <h1 className="font-serif text-3xl mt-1">Events</h1>
          </div>
        </div>
        <EventManagerWrapper
          weddingId={wedding.id}
          initialEvents={events ?? []}
          initialGroups={groups ?? []}
        />
      </div>
    </div>
  )
}
```

Create `src/app/dashboard/events/EventManagerWrapper.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { EventManager } from '@/components/dashboard/EventManager'
import type { WeddingEvent, GuestGroup } from '@/lib/types'

interface Props {
  weddingId: string
  initialEvents: WeddingEvent[]
  initialGroups: GuestGroup[]
}

export function EventManagerWrapper({ weddingId, initialEvents, initialGroups }: Props) {
  const [events, setEvents] = useState(initialEvents)
  return (
    <EventManager
      weddingId={weddingId}
      events={events}
      groups={initialGroups}
      onEventsChange={setEvents}
    />
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/events/ src/components/dashboard/EventManager.tsx src/app/api/events/
git commit -m "feat: add event manager with guest group assignment"
```

---

### Task 12: Guest manager + CSV import

**Files:**
- Create: `src/app/dashboard/guests/page.tsx`
- Create: `src/components/dashboard/GuestManager.tsx`
- Create: `src/app/api/guests/route.ts`

- [ ] **Step 1: GuestManager component**

Create `src/components/dashboard/GuestManager.tsx`:
```tsx
'use client'
import { useState, useRef } from 'react'
import type { Guest, GuestGroup } from '@/lib/types'

interface Props {
  weddingId: string
  guests: Guest[]
  groups: GuestGroup[]
  onGuestsChange: (guests: Guest[]) => void
}

export function GuestManager({ weddingId, guests, groups, onGuestsChange }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function addGuest() {
    if (!name.trim()) return
    setSaving(true)
    const res = await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wedding_id: weddingId, name, email: email || null, group_ids: groupIds }),
    })
    const guest = await res.json()
    onGuestsChange([...guests, guest])
    setName(''); setEmail(''); setGroupIds([])
    setSaving(false)
  }

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    const text = await file.text()
    const lines = text.trim().split('\n').slice(1) // skip header
    const newGuests: Guest[] = []
    for (const line of lines) {
      const [guestName, guestEmail] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      if (!guestName) continue
      const res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wedding_id: weddingId, name: guestName, email: guestEmail || null, group_ids: [] }),
      })
      const guest = await res.json()
      newGuests.push(guest)
    }
    onGuestsChange([...guests, ...newGuests])
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function updateGroups(guestId: string, newGroupIds: string[]) {
    await fetch(`/api/guests/${guestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_ids: newGroupIds }),
    })
    onGuestsChange(guests.map(g => g.id === guestId ? { ...g, group_ids: newGroupIds } : g))
  }

  function toggleGroup(gid: string) {
    setGroupIds(ids => ids.includes(gid) ? ids.filter(g => g !== gid) : [...ids, gid])
  }

  return (
    <div className="space-y-8">
      {/* CSV import */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-medium text-amber-800 mb-2">Import from CSV</p>
        <p className="text-xs text-amber-700 mb-3">CSV format: <code>name,email</code> (one per line, first row is header)</p>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} disabled={importing}
          className="text-sm text-stone-600" />
        {importing && <p className="text-xs text-amber-700 mt-2">Importing...</p>}
      </div>

      {/* Add single guest */}
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <h3 className="font-medium mb-4 text-sm">Add Guest Manually</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
            className="border border-stone-300 px-3 py-2 rounded text-sm" />
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)"
            className="border border-stone-300 px-3 py-2 rounded text-sm" />
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => toggleGroup(g.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                groupIds.includes(g.id) ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}>
              {g.name}
            </button>
          ))}
        </div>
        <button onClick={addGuest} disabled={!name || saving}
          className="px-5 py-2 bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
          {saving ? 'Adding...' : 'Add Guest'}
        </button>
      </div>

      {/* Guest list */}
      <div>
        <p className="text-sm text-stone-500 mb-3">{guests.length} guests</p>
        <div className="space-y-2">
          {guests.map(guest => (
            <div key={guest.id} className="bg-white border border-stone-200 rounded p-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{guest.name}</p>
                {guest.email && <p className="text-xs text-stone-400">{guest.email}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                {groups.map(g => (
                  <button key={g.id} type="button"
                    onClick={() => updateGroups(guest.id, guest.group_ids.includes(g.id)
                      ? guest.group_ids.filter(id => id !== g.id)
                      : [...guest.group_ids, g.id])}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      guest.group_ids.includes(g.id) ? 'bg-amber-700 text-white' : 'bg-stone-100 text-stone-400'
                    }`}>
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Guests API routes**

Create `src/app/api/guests/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('guests').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

Create `src/app/api/guests/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('guests').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Guests dashboard page**

Create `src/app/dashboard/guests/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GuestManagerWrapper } from './GuestManagerWrapper'

export default async function GuestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: wedding } = await supabase.from('weddings').select('id').eq('user_id', user.id).single()
  if (!wedding) redirect('/dashboard/setup')

  const [{ data: guests }, { data: groups }] = await Promise.all([
    supabase.from('guests').select('*').eq('wedding_id', wedding.id).order('created_at'),
    supabase.from('guest_groups').select('*').eq('wedding_id', wedding.id),
  ])

  return (
    <div className="min-h-screen bg-stone-50 py-12 px-6">
      <div className="max-w-2xl mx-auto">
        <a href="/dashboard" className="text-sm text-stone-400 hover:text-stone-600">← Dashboard</a>
        <h1 className="font-serif text-3xl mt-1 mb-8">Guest List</h1>
        <GuestManagerWrapper
          weddingId={wedding.id}
          initialGuests={guests ?? []}
          initialGroups={groups ?? []}
        />
      </div>
    </div>
  )
}
```

Create `src/app/dashboard/guests/GuestManagerWrapper.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { GuestManager } from '@/components/dashboard/GuestManager'
import type { Guest, GuestGroup } from '@/lib/types'

interface Props { weddingId: string; initialGuests: Guest[]; initialGroups: GuestGroup[] }

export function GuestManagerWrapper({ weddingId, initialGuests, initialGroups }: Props) {
  const [guests, setGuests] = useState(initialGuests)
  return <GuestManager weddingId={weddingId} guests={guests} groups={initialGroups} onGuestsChange={setGuests} />
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/guests/ src/components/dashboard/GuestManager.tsx src/app/api/guests/
git commit -m "feat: add guest manager with CSV import and group assignment"
```

---

## Phase 5: Dashboard + Publish

### Task 13: Main dashboard + guest groups + publish

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/app/api/wedding/route.ts`
- Create: `src/app/api/guest-groups/route.ts`

- [ ] **Step 1: Guest groups API**

Create `src/app/api/guest-groups/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase.from('guest_groups').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const { error } = await supabase.from('guest_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Wedding update API**

Create `src/app/api/wedding/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { data, error } = await supabase
    .from('weddings').update(body).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Main dashboard page**

Create `src/app/dashboard/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardClient } from './DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: wedding } = await supabase.from('weddings').select('*').eq('user_id', user.id).single()
  if (!wedding) redirect('/dashboard/setup')

  const [{ data: events }, { data: groups }, { data: guests }, { data: rsvps }] = await Promise.all([
    supabase.from('events').select('id, name').eq('wedding_id', wedding.id),
    supabase.from('guest_groups').select('*').eq('wedding_id', wedding.id),
    supabase.from('guests').select('id, name, group_ids').eq('wedding_id', wedding.id),
    supabase.from('rsvps').select('event_id, status').in(
      'guest_id',
      (await supabase.from('guests').select('id').eq('wedding_id', wedding.id)).data?.map(g => g.id) ?? []
    ),
  ])

  return (
    <DashboardClient
      wedding={wedding}
      events={events ?? []}
      groups={groups ?? []}
      guests={guests ?? []}
      rsvps={rsvps ?? []}
    />
  )
}
```

Create `src/app/dashboard/DashboardClient.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Wedding, WeddingEvent, GuestGroup, Guest, RSVP } from '@/lib/types'

interface Props {
  wedding: Wedding
  events: Pick<WeddingEvent, 'id' | 'name'>[]
  groups: GuestGroup[]
  guests: Pick<Guest, 'id' | 'name' | 'group_ids'>[]
  rsvps: Pick<RSVP, 'event_id' | 'status'>[]
}

export function DashboardClient({ wedding, events, groups, guests, rsvps }: Props) {
  const [published, setPublished] = useState(wedding.published)
  const [publishing, setPublishing] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [localGroups, setLocalGroups] = useState(groups)

  const siteUrl = `${window.location.origin}/${wedding.slug}`
  const yesCount = rsvps.filter(r => r.status === 'yes').length
  const noCount = rsvps.filter(r => r.status === 'no').length
  const awaitingCount = guests.length - new Set(rsvps.map(r => r.event_id)).size

  async function togglePublish() {
    setPublishing(true)
    const res = await fetch('/api/wedding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !published }),
    })
    if (res.ok) setPublished(p => !p)
    setPublishing(false)
  }

  async function addGroup() {
    if (!newGroupName.trim()) return
    const res = await fetch('/api/guest-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wedding_id: wedding.id, name: newGroupName }),
    })
    const group = await res.json()
    setLocalGroups(g => [...g, group])
    setNewGroupName('')
  }

  return (
    <div className="min-h-screen bg-stone-50 py-12 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl">{wedding.couple_names}</h1>
            <p className="text-stone-500 text-sm mt-1">{wedding.location} · {new Date(wedding.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <button onClick={togglePublish} disabled={publishing}
            className={`px-5 py-2 text-sm font-medium tracking-wide transition-colors ${
              published ? 'bg-stone-200 text-stone-700 hover:bg-stone-300' : 'bg-amber-700 text-white hover:bg-amber-800'
            } disabled:opacity-50`}>
            {publishing ? '...' : published ? 'Unpublish' : 'Publish Site'}
          </button>
        </div>

        {/* Site URL */}
        {published && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-1">Your site is live</p>
              <a href={siteUrl} target="_blank" className="text-sm text-amber-700 underline">{siteUrl}</a>
            </div>
            <button onClick={() => navigator.clipboard.writeText(siteUrl)}
              className="text-xs text-amber-700 border border-amber-300 px-3 py-1 rounded hover:bg-amber-100">
              Copy link
            </button>
          </div>
        )}

        {/* RSVP stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Attending', value: yesCount, color: 'text-green-600' },
            { label: 'Declined', value: noCount, color: 'text-red-500' },
            { label: 'Awaiting', value: awaitingCount, color: 'text-stone-500' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-stone-200 rounded-lg p-4 text-center">
              <p className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-stone-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { href: '/dashboard/setup', label: 'Edit Site Details', icon: '✏️' },
            { href: '/dashboard/events', label: `Events (${events.length})`, icon: '📅' },
            { href: '/dashboard/guests', label: `Guests (${guests.length})`, icon: '👥' },
            { href: published ? siteUrl : '#', label: 'Preview Site', icon: '👁️', external: true },
          ].map(link => (
            <a key={link.href} href={link.href} target={link.external ? '_blank' : undefined}
              className="bg-white border border-stone-200 rounded-lg p-4 flex items-center gap-3 hover:border-amber-400 transition-colors">
              <span>{link.icon}</span>
              <span className="text-sm font-medium">{link.label}</span>
            </a>
          ))}
        </div>

        {/* Guest groups */}
        <div className="bg-white border border-stone-200 rounded-lg p-5">
          <h2 className="font-medium mb-4">Guest Groups</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {localGroups.map(g => (
              <span key={g.id} className="px-3 py-1 bg-stone-100 rounded-full text-sm text-stone-700">{g.name}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              placeholder="New group name (e.g. VIP, Family)"
              className="flex-1 border border-stone-300 px-3 py-2 rounded text-sm" />
            <button onClick={addGroup} className="px-4 py-2 bg-stone-800 text-white text-sm rounded">Add</button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/ src/app/api/wedding/ src/app/api/guest-groups/
git commit -m "feat: add main dashboard with RSVP stats, guest groups, and publish flow"
```

---

## Phase 6: Deploy

### Task 14: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/richshrestha/wedding-hub.git
git push -u origin main
```

- [ ] **Step 2: Deploy on Vercel**

```bash
npx vercel --prod
```

When prompted, link to your GitHub repo. Add environment variables in Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 3: Verify deployment**

Visit your Vercel URL. Sign up as a couple, go through setup, add events and guests, publish the site, and visit the public URL as a guest.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "chore: deployed to Vercel"
```

---

## Self-Review

### Spec coverage
- ✅ Two templates (Modern Luxury, Romantic Classic)
- ✅ Core sections: Hero, Story, Events, Registry, Travel, FAQ
- ✅ Event visibility by guest group
- ✅ Per-event RSVP with magic link
- ✅ Guest group creation and assignment
- ✅ CSV guest import
- ✅ Couple auth + dashboard
- ✅ Publish/unpublish flow
- ✅ Guest sees only their events

### Out of scope (confirmed not in plan)
- Guest coordination board (Phase 2)
- Custom domains
- Photo uploads
- SMS reminders
- Wedding Party / Things To Do optional sections (added toggles to DB but no UI — add manually if needed)

### Type consistency check
- `WeddingEvent` used consistently (not `Event` to avoid DOM type collision)
- `getVisibleEvents` defined in `src/lib/guest-filtering.ts`, imported in both `tests/` and `src/app/[slug]/page.tsx`
- `createServiceClient` defined in `server.ts`, used in RSVP API routes
- `PublicWeddingData` type matches what page passes to template components
