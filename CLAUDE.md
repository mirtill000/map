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
- Cache-busting: `styles.css` and `app.js` are referenced from `index.html` with `?v=N` query strings (currently `styles.css?v=27`, `app.js?v=93`). **Bump these version numbers whenever you change `styles.css` or `app.js`**, or returning visitors' service-worker/browser caches will keep serving stale code.
- No automated tests exist. Verify changes manually in a browser (desktop + mobile viewport — the layout has distinct mobile behavior for the sidebar/detail panel).

## Architecture

### Data flow
`app.js` fetches `data.json` and `eventi.json` at runtime (`loadPepiteData()`, `loadEventiData()`) into the module-level arrays `pepite` and `eventi`. Pepite data loads eagerly on init; eventi data preloads in the background so the Eventi tab is instant when opened. `storie.json` loads lazily only when the Diario tab is first opened (`loadStorieData()`). All app state (current filter, language, saved/favourite IDs, map mode, etc.) lives in module-level `let`/`const` bindings at the top of `app.js` — there is no state management library or centralized store.

### Rendering model
This is a hand-rolled, imperative DOM app: functions query/mutate `document.getElementById(...)` directly and re-render list sections wholesale (`renderPepiteList`, `renderEventi`, `renderItinerari`, `renderStorie`, `renderMarkers`, `renderEventiMarkers`). Event listeners for lists are attached once via delegation on a container (`setupPepiteList`, `setupEventiList`) rather than re-bound per item, since lists re-render frequently. Clickable card templates (`pepita-item`, `evento-card`, `itinerario-stop`, `med-story`) carry `role="button" tabindex="0"`, and each container's delegated listener has a matching `keydown` handler for Enter/Space alongside the `click` one — when adding a new clickable card, follow this pair rather than a click-only handler.

### Three synced views of the same data
Pepite/Eventi have three coordinated representations that must stay in sync on every filter/search change: the sidebar list, the Leaflet markers/clusters on the map (`markerCluster`, `eventiMarkersLayer`), and the right-hand detail panel (`openDetail`, `openEventDetail`, `openQuartiereDetail`). Marker rebuilds are debounced (`scheduleMarkers`, `_evMarkerTimer`) and short-circuited via a cache key (`_lastMarkersKey`) to avoid redundant Leaflet churn.

### Mobile bottom sheet (`.sidebar` below 768px)
On mobile the `.sidebar` is not an off-canvas panel that slides in from the side — it's a bottom sheet anchored to the map with three drag/tap snap heights (`peek`/`editorial`/`list`, defined in `SHEET_SNAPS`), driven by `setupMobileSheetDrag()` via `snapSheetTo()`. The map is always at least partially visible behind it, even at the `list` height. `closeSidebar()` now means "collapse to peek" rather than "hide the panel," and `#mobileMenuBtn` expands to `list` rather than toggling an `.open` class — the CSS `.sidebar.open` rule is a vestigial no-op kept only because a long-dead `setupMobileViewToggle()` function still (harmlessly, since its own target element doesn't exist) references it. The Pepite tab additionally shows a mobile-only `#mobileEditorialPreview` block (`renderMobileEditorialPreview()`) — a Pepita-del-giorno teaser, a Diario preview (hidden if no `storie.json` content is loaded), and a permanent "La mia giornata" CTA — positioned so the sheet's default `editorial` height reveals it before the raw category/list content. Any sheet height change calls `map.invalidateSize()` (see the map-resize note below) since the visible map area changes with it.

### Native tab bar (`#appTabbar`)
The four sections (Pepite/Itinerari/Eventi/Diario) live in one `.app-tabbar` nav, a sibling of `.sidebar` and `.map-area` in `.app-wrapper` — not nested inside the sheet. `setupSidebarTabs()` targets `.sidebar-tab` by class alone, so it works unchanged regardless of where in the DOM these buttons live. Above 768px it renders as a vertical icon rail (left of the sidebar column, mirroring Slack/Notion-style desktop nav); at ≤768px it becomes a `position:fixed` bar pinned to the viewport bottom with a higher z-index than the sheet, so the tabs stay reachable no matter how the sheet is dragged — unlike the old design where the tab row lived inside the sheet's scrollable content. Because the bar is fixed on mobile, the sheet's CSS `bottom` offset and its `editorial`/`list` height fractions are computed against `100vh - tabbar height` rather than the full viewport — `_tabBarHeightPx()` measures the real rendered height (icons + label + safe-area padding) and `_syncTabBarHeightVar()` writes it into the `--tabbar-h` custom property the sheet's CSS reads; both run on `setupMobileSheetDrag()` init and on `resize`. Tapping a tab while the sheet is at `peek` auto-expands it to `editorial` (see `setupSidebarTabs()`) since otherwise the switch would happen invisibly behind a barely-open sheet. `applyLanguage()` must set `.tab-label` text specifically (not the button's whole `textContent`) — the button also holds a `.tab-ic` emoji span.

### Cross-linking pepite ↔ eventi
`findEventsForPepita()` / `findPepitaForEvent()` fuzzy-match places to events by quartiere + significant words in the name (`_sigWords`), powering the "linked events" block shown in a pepita's detail panel and vice versa. This is a heuristic, not a stored foreign key — if a data entry's `nome`/`titolo`/`quartiere` wording changes, the link can silently break.

### Filtering
`getFiltered()` (pepite) and `getFilteredEventi()` (eventi) are the single source of truth for "what's currently shown," combining: active category filter, search text, "Near Me" geolocation radius, "Aperto ora" (open-now) computed from `orari` strings (`isOpenNow`/`_computeOpenNow`, which parses Italian day-range/time-range text), event date filters (oggi/weekend), and quartiere map-bounds filtering. Any change to filtering logic should go through these functions, not be duplicated at call sites.

### Mood Matcher
A separate self-contained wizard (`setupMoodMatcher`/`renderMoodStep`/`renderMoodResult`) that scores pepite against user answers using weight tables (`moodWeights`, `atmosferaWeights`, `tempoCount`, `moodStartHour`, `moodGap`) to build a personalized mini-itinerary, then plots it on the map via `showMoodResultOnMap`. It's opened both from the small `#btnSurprise` map-control icon and from the more prominent `#moodMatcherBtn` CTA card under the Pepite tab's price filter (both wired in `setupMoodMatcher()` — keep the `#moodMatcherBtn` element in `index.html` in sync with the listener, since a mismatch silently no-ops).

### My Day Plan (`itinerariData` vs. personal plans)
The curated Itinerari tab (`itinerariData`) is static editorial content, identical for every visitor. "La mia giornata" (`getMyDayItems()`/`renderMyDayList()`/`openMyDay()`) is the personalized counterpart, built from the user's own saved pepite+eventi (`myday_order` in `localStorage`, keyed `"p<id>"`/`"e<id>"`). The `#myDayBtn` CTA card at the top of the Itinerari tab bridges the two: `updateMyDayBtnPreview()` keeps its subtitle live (showing the first few saved stop names and a `.has-plan` style once there's at least one) instead of always showing the same generic prompt — call it after any save/unsave (already wired into `toggleSave()`/`toggleEventSave()`) and after `renderItinerari()`/language changes.

Plans are shareable as an actual deep link, not just text: `shareMyDay()` encodes the ordered `key` list into `#giornata=p12,e5,...`. `handleDeepLink()` resolves those keys back into real pepite/eventi objects and opens `openMyDay(items)` with `_myDaySharedItems` set, which renders the plan read-only (no reorder/remove controls) with a "Salva nei preferiti" banner (`#myDaySharedBanner`) — `saveSharedMyDay()` adopts it into the viewer's own favourites and clears shared mode. `_currentMyDayItems()` is the one place that picks between a shared plan and the normal favourites-driven one; route any new My Day action through it rather than calling `getMyDayItems()` directly.

### Story viewer
`storie.json`-backed, Instagram-style full-screen story overlay (`openStoria`/`renderSlide`/`buildStoryProgress`) with per-slide progress bars and optional persistent tag chips linking back to eventi/pepite.

### Internationalization
`i18n[currentLang]` (`it`/`en`) holds all UI copy; `t(key, ...args)` looks it up with placeholder substitution. Data-level bilingual fields follow a `campo` / `campo_en` naming convention (e.g. `descrizione`/`descrizione_en`) — when adding a new data field that has UI-facing text, add both variants and read via helpers like `getDesc()`/`getCat()` rather than branching on `currentLang` ad hoc.

### Persistence
Nearly everything persistent uses `localStorage` (filter state, language, saved/favourite pepite and eventi IDs, notification-dedup keys, GA/install-banner consent), always through `safeLocalStorageJson`/`safeLocalStorageSet` (or inline try/catch) since Safari/private-mode can throw. Saved pepite images are also mirrored into a dedicated Cache Storage bucket (`syncSavedImagesToSW` → SW `SAVED_IMAGES_CACHE`) so favourites remain viewable offline.

### Service worker caching strategy (`sw.js`)
Three distinct strategies coexist: network-first-with-offline-fallback for the static app shell (`ASSETS`) — deliberately *not* cache-first, since `app.js`/`styles.css` are requested with a cache-busting `?v=N` query string that a strict cache-first match (exact URL match) would never hit, so it falls back to `caches.match(..., { ignoreSearch: true })` only when the network fetch actually fails, stale-while-revalidate for `eventi.json` (diffs old vs. new body text and `postMessage`s `EVENTI_UPDATED` to open clients only if content actually changed) and for `storie.json` (silent revalidation, no client notification), and network-first-with-fallback for everything else (images etc.), with a saved-images cache checked first. When editing fetch behavior, preserve this three-way split rather than collapsing it.

### Deep links & notifications
`handleDeepLink()` reacts to URL hash changes (e.g. `#evento-<id>`, `#pepita-<id>`, `#giornata=<keys>` — see My Day Plan above) to open a specific event/pepita detail or shared plan directly, used both for sharing and for the SW's `notificationclick` handler re-opening the app. `scheduleEventNotifications()` sets client-side timers to notify users the day before a saved event.

### Search normalization
`normalizeSearch()` (NFD-decompose + strip diacritics + lowercase) is the shared helper behind every text search — `getFiltered()`, the eventi search filter, and `_gsMatch()` (global search) all run both the query and the candidate fields through it, so an accent-less query like "citta" matches "città". Route any new search/filter matching through this helper rather than a bare `.toLowerCase().includes(...)`.
