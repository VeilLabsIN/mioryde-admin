# Mioryde — Admin Panel

Internal operations panel. **Next.js + TypeScript**, talking to
[`mioryde-api`](https://github.com/VeilLabsIN/mioryde-api).

Replaces the purchased PHP panel, archived as
[`mioryde-legacy-admin`](https://github.com/VeilLabsIN/mioryde-legacy-admin).

> The old panel was **not Laravel** — it was procedural PHP whose pages queried
> MySQL directly with string-concatenated SQL (`' OR '1'='1` was a valid admin
> password). This panel has **no database access at all**: it is a client of the
> API, exactly like the mobile apps.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000 by default
```

`NEXT_PUBLIC_API_URL` must include the `/v1` prefix. The API must allow this
origin in its `CORS_ORIGINS`.

Create the first staff account from the API repo:

```bash
npm run admin:create -- --email you@mioryde.com --name "Your Name" --role owner
```

## Themes

Three, switchable in the sidebar, remembered per browser.

| | |
| --- | --- |
| **Midnight** | Pitch black `#000`. The default, matching mioryde.com |
| **Daylight** | Light |
| **System** | Follows the OS light/dark preference, and adopts the OS accent colour where the browser exposes it |

**On the system accent — a real browser limitation.** Reading the Windows
accent colour needs the CSS `AccentColor` system keyword. Firefox and Safari
16.4+ resolve it; **Chromium does not**, and there is no JavaScript API for it
either. So in Chrome and Edge the System theme still follows OS light/dark, but
the accent stays Mioryde amber. The switcher says which of the two happened
rather than leaving the user wondering why their accent did nothing.

Theme is applied by a small blocking script in `<head>` before first paint —
without it, a midnight user gets a white flash on every load while React
hydrates.

## Performance

Every animation is `transform` or `opacity` only, so it runs on the compositor
and never triggers layout or paint:

- The **sidebar indicator** is one element that slides via `translate3d`, rather
  than each nav item toggling its own background.
- The **theme switcher marker** works the same way.
- **Collapse** animates width on the rail, with labels fading rather than
  unmounting — unmounting them would reflow mid-animation.
- List entrance stagger is **capped at 8 items**, so a 500-row table does not
  schedule 500 delayed animations.
- `prefers-reduced-motion` disables all of it.

## Gotchas worth knowing

**Fonts must be `@theme inline`, not `@theme`.** next/font defines
`--font-poppins` on `<body>`, not `:root`. Plain `@theme` resolves at `:root`
where it does not exist yet, so every font silently falls back to the system
stack. And because `inline` emits no `--font-sans` property, base-layer CSS must
reference `var(--font-poppins)` directly. Both bugs were live until caught by
reading computed styles in a browser.

## Structure

```
src/
├── app/
│   ├── layout.tsx        fonts + theme boot script
│   ├── login/            staff sign-in
│   └── (panel)/          authenticated shell — sidebar, header
│       ├── page.tsx      overview dashboard
│       └── orders/       deliveries table
├── components/           Sidebar, ThemeProvider, ThemeSwitcher, ui
└── lib/
    ├── api.ts            fetch client, token storage, single-flight refresh
    └── theme.ts          theme tokens, OS accent detection
```

The auth guard in `(panel)/layout.tsx` is client-side, which is correct here:
it protects the *view*, while the API independently rejects every request
without a valid admin token. Bypassing it yields a page that can load nothing.

## Not built yet

Customers, Partners, Rate cards and Zones are in the nav but have no pages —
the API endpoints for them land first. Order detail, rider approval and refunds
follow.
