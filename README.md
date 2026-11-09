# GuardLog – digital vehicle logbook for security gates

Installable PWA (React + Vite + Tailwind v4 + Supabase). Guards scan or type a plate; the app decides
**Entering** vs **Exiting**, works with no signal, and syncs when the connection returns.

## 1. Run it locally

```bash
npm install
cp .env.example .env        # then fill in the two Supabase values (step 2)
npm run dev                 # http://localhost:5173
```

## 2. Set up Supabase (5 minutes)

1. Create a project at https://supabase.com.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, **Run**.
   This creates `profiles`, `units`, `residents`, `logs`, row-level security, realtime, and sample destinations.
3. **Authentication → Users → Add user** (tick *Auto confirm*) for yourself and for each guard.
   Also **Authentication → Providers → Email**: disable public sign-ups so only users you add can log in.
4. Make yourself admin (SQL Editor):
   ```sql
   update public.profiles set role = 'admin'
    where id = (select id from auth.users where email = 'you@example.com');
   ```
5. **Project Settings → API**: copy *Project URL* and *anon public key* into `.env`.

Guards see only the Gate screens. Admins also get the **Dashboard** (logs, registered plates, destinations).

## 3. Build and test the PWA

The service worker is generated at build time, so test installability on a **production build**:

```bash
npm run build
npm run preview             # http://localhost:4173
```

In Chrome: DevTools → **Application** → *Manifest* (check icons, "Installable") and *Service Workers*.
Then the install icon appears in the address bar.

**Test offline logging**
1. Open the app, sign in, wait for "Synced" in the top bar (this caches destinations and plates).
2. DevTools → Network → **Offline**. Reload: the app still opens.
3. Log an entry and an exit. The bar shows "Offline · N saved on device".
4. Go back online: the count drops to zero and the entries appear in Supabase (`logs` table) and in the admin dashboard.

**Test on a phone** (camera + install need HTTPS except on localhost)
- Easiest: deploy `dist/` to Netlify / Vercel / Cloudflare Pages (any static host; SPA fallback to `index.html`).
- Or tunnel your dev server: `npx localtunnel --port 4173` / `cloudflared tunnel --url http://localhost:4173`.
- Android Chrome: menu → *Install app*. iOS Safari: Share → *Add to Home Screen*.

## 4. How offline works

| Piece | Where |
|---|---|
| App shell precached (JS, CSS, fonts, icons) | service worker from `vite-plugin-pwa` (`vite.config.ts`) |
| Destinations, registered plates, vehicles inside | IndexedDB cache (`src/lib/db.ts`) |
| Entries/exits made offline | IndexedDB **outbox**, flushed in order on reconnect (`src/context/DataContext.tsx`) |
| Duplicate protection | IDs are generated on the device; a unique index allows one open visit per plate |
| Live updates across gates | Supabase Realtime on `logs`, `residents`, `units` |

Known MVP limits: two gates logging the same plate while both are offline resolves to the first one
to sync (the second is treated as a duplicate). Admin screens need a connection. Entries Supabase
rejects permanently (e.g. permissions) are parked and shown as "could not sync" instead of blocking the queue.

## 5. Offline OCR

Plate scanning uses `tesseract.js`, loaded only when first used. By default its engine and English data
download from a CDN on first scan and are cached by the service worker afterwards. **Manual typing always
works offline.** To make scanning work offline from day one, self-host the files:

```
public/tesseract/worker.min.js        ← node_modules/tesseract.js/dist/worker.min.js
public/tesseract/core/*               ← node_modules/tesseract.js-core/*.js and *.wasm
public/tesseract/lang/eng.traineddata.gz   ← download from tessdata (e.g. https://github.com/naptha/tessdata)
```
then set `VITE_OCR_ASSET_BASE=/tesseract` in `.env` and rebuild.

Tips for accuracy: hold the phone level, fill the frame with the plate, avoid glare. Always
glance at the plate field before confirming; the guard can correct it in place, and alternates appear as chips.

## 6. Project layout

```
src/
  App.tsx, main.tsx, index.css
  context/AuthContext.tsx      login + cached role (works offline)
  context/DataContext.tsx      offline cache, outbox, sync, realtime
  lib/                         plate parsing, OCR, CSV, IndexedDB, Supabase client
  components/guard/            PlateCapture, EntryPanel, ExitPanel, ActiveFeed, GuardView
  components/admin/            LogsTable, ResidentsManager, UnitsManager, AdminView
supabase/schema.sql
vite.config.ts                 PWA manifest + service worker config
```

## 7. Before going live

- Keep the anon key public; never put the `service_role` key in the app.
- Disable email sign-ups (step 3) and use strong guard passwords.
- Run `npm run build` in CI and host `dist/` over HTTPS.
- Add database backups (Supabase Pro) if logs are legally required records.
