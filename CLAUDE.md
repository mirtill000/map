# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Pepite per Tutti" (Milano Pepite) — a static, no-build, vanilla-JS Progressive Web App that shows a curated map of hidden gems ("pepite"), events ("eventi"), itineraries, and editorial stories ("storie") in Milan, on top of Leaflet. Italian is the primary language, with an English translation layer (`i18n` object in `app.js`). There is no frontend framework, no bundler, and no package.json — the app is six flat files served as-is.

## Files

- `index.html` — single-page shell: sidebar (tabs Pepite / Itinerari / Eventi / Diario), center Leaflet map, right-hand detail panel, plus overlays (mood matcher, story viewer, GA consent banner).
- `app.js` (~4300 lines) — all application logic, in one file, organized by `// ── Section ──` comment dividers (search for these to navigate).
- `styles.css` (~3000 lines) — all styling, also organized by comment dividers.
- `data.json` — the "pepite" (places) dataset, an array of place objects (id, nome, categoria/categoria_en, quartiere, descrizione/descrizione_en, indirizzo, orari, prezzo, lat/lng, immagine, credit_immagine, fonti, salvato).
- `eventi.json` — the events dataset (id, giorno/mese, titolo/titolo_en, descrizione*, badge, tag/tag_en, quartiere, luogo, orario, prezzo, lat/lng, url, category).
- `sw.js` — the service worker (offline caching, PWA install, push-style notification handling).

Referenced by `index.html`/`app.js` but **not present in this repo**: `manifest.json`, `storie.json`, `icons/`, and the `img/` assets — these exist on the deployed host (`ilariavita.com/map/`) but aren't checked in here. Don't assume they exist locally; features that depend on them (e.g. "Diario" stories) will fail gracefully client-side (see `_storieLoadFailed` in `app.js`) but you can't test them without adding those files.

External dependencies are loaded from CDNs directly in `index.html` (Leaflet 1.9.4, Leaflet.markercluster 1.5.3) with SRI hashes — there is no npm install step.

## Running / developing

There is no build, lint, or test tooling in this repo (no package.json, no test runner). To work on the app:

- Serve the directory with any static file server from the repo root, e.g. `python3 -m http.server 8000`, then open `http://localhost:8000/`.
- The service worker (`sw.js`) hardcodes `/beta/` as its scope prefix for cached asset paths (`ASSETS` array) — if you serve from a different path/port, cache-first behavior for the app shell won't match. When testing SW/offline behavior specifically, either serve under a `/beta/` path or adjust `ASSETS` temporarily (don't commit that adjustment unless the deploy path is actually changing).
- Cache-busting: `styles.css` and `app.js` are referenced from `index.html` with `?v=N` query strings (currently `styles.css?v=20`, `app.js?v=88`). **Bump these version numbers whenever you change `styles.css` or `app.js`**, or returning visitors' service-worker/browser caches will keep serving stale code.
- No automated tests exist. Verify changes manually in a browser (desktop + mobile viewport — the layout has distinct mobile behavior for the sidebar/detail panel).

## Architecture

### Data flow
`app.js` fetches `data.json` and `eventi.json` at runtime (`loadPepiteData()`, `loadEventiData()`) into the module-level arrays `pepite` and `eventi`. Pepite data loads eagerly on init; eventi data preloads in the background so the Eventi tab is instant when opened. `storie.json` loads lazily only when the Diario tab is first opened (`loadStorieData()`). All app state (current filter, language, saved/favourite IDs, map mode, etc.) lives in module-level `let`/`const` bindings at the top of `app.js` — there is no state management library or centralized store.

### Rendering model
This is a hand-rolled, imperative DOM app: functions query/mutate `document.getElementById(...)` directly and re-render list sections wholesale (`renderPepiteList`, `renderEventi`, `renderItinerari`, `renderStorie`, `renderMarkers`, `renderEventiMarkers`). Event listeners for lists are attached once via delegation on a container (`setupPepiteList`, `setupEventiList`) rather than re-bound per item, since lists re-render frequently.

### Three synced views of the same data
Pepite/Eventi have three coordinated representations that must stay in sync on every filter/search change: the sidebar list, the Leaflet markers/clusters on the map (`markerCluster`, `eventiMarkersLayer`), and the right-hand detail panel (`openDetail`, `openEventDetail`, `openQuartiereDetail`). Marker rebuilds are debounced (`scheduleMarkers`, `_evMarkerTimer`) and short-circuited via a cache key (`_lastMarkersKey`) to avoid redundant Leaflet churn.

### Cross-linking pepite ↔ eventi
`findEventsForPepita()` / `findPepitaForEvent()` fuzzy-match places to events by quartiere + significant words in the name (`_sigWords`), powering the "linked events" block shown in a pepita's detail panel and vice versa. This is a heuristic, not a stored foreign key — if a data entry's `nome`/`titolo`/`quartiere` wording changes, the link can silently break.

### Filtering
`getFiltered()` (pepite) and `getFilteredEventi()` (eventi) are the single source of truth for "what's currently shown," combining: active category filter, search text, "Near Me" geolocation radius, "Aperto ora" (open-now) computed from `orari` strings (`isOpenNow`/`_computeOpenNow`, which parses Italian day-range/time-range text), event date filters (oggi/weekend), and quartiere map-bounds filtering. Any change to filtering logic should go through these functions, not be duplicated at call sites.

### Mood Matcher
A separate self-contained wizard (`setupMoodMatcher`/`renderMoodStep`/`renderMoodResult`) that scores pepite against user answers using weight tables (`moodWeights`, `atmosferaWeights`, `tempoCount`, `moodStartHour`, `moodGap`) to build a personalized mini-itinerary, then plots it on the map via `showMoodResultOnMap`.

### Story viewer
`storie.json`-backed, Instagram-style full-screen story overlay (`openStoria`/`renderSlide`/`buildStoryProgress`) with per-slide progress bars and optional persistent tag chips linking back to eventi/pepite.

### Internationalization
`i18n[currentLang]` (`it`/`en`) holds all UI copy; `t(key, ...args)` looks it up with placeholder substitution. Data-level bilingual fields follow a `campo` / `campo_en` naming convention (e.g. `descrizione`/`descrizione_en`) — when adding a new data field that has UI-facing text, add both variants and read via helpers like `getDesc()`/`getCat()` rather than branching on `currentLang` ad hoc.

### Persistence
Nearly everything persistent uses `localStorage` (filter state, language, saved/favourite pepite and eventi IDs, notification-dedup keys, GA/install-banner consent), always through `safeLocalStorageJson`/`safeLocalStorageSet` (or inline try/catch) since Safari/private-mode can throw. Saved pepite images are also mirrored into a dedicated Cache Storage bucket (`syncSavedImagesToSW` → SW `SAVED_IMAGES_CACHE`) so favourites remain viewable offline.

### Service worker caching strategy (`sw.js`)
Three distinct strategies coexist: cache-first for the static app shell (`ASSETS`), stale-while-revalidate for `eventi.json` (diffs old vs. new body text and `postMessage`s `EVENTI_UPDATED` to open clients only if content actually changed) and for `storie.json` (silent revalidation, no client notification), and network-first-with-fallback for everything else (images etc.), with a saved-images cache checked first. When editing fetch behavior, preserve this three-way split rather than collapsing it.

### Deep links & notifications
`handleDeepLink()` reacts to URL hash changes (e.g. `#evento-<id>`) to open a specific event/pepita detail directly, used both for sharing and for the SW's `notificationclick` handler re-opening the app. `scheduleEventNotifications()` sets client-side timers to notify users the day before a saved event.
