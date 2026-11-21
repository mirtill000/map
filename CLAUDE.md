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
- Cache-busting: `styles.css` and `app.js` are referenced from `index.html` with `?v=N` query strings (currently `styles.css?v=31`, `app.js?v=98`). **Bump these version numbers whenever you change `styles.css` or `app.js`**, or returning visitors' service-worker/browser caches will keep serving stale code.
- No automated tests exist. Verify changes manually in a browser (desktop + mobile viewport — the layout has distinct mobile behavior for the sidebar/detail panel).

## Architecture

### Data flow
`app.js` fetches `data.json` and `eventi.json` at runtime (`loadPepiteData()`, `loadEventiData()`) into the module-level arrays `pepite` and `eventi`. Pepite data loads eagerly on init; eventi data preloads in the background so the Eventi tab is instant when opened. `storie.json` loads lazily only when the Diario tab is first opened (`loadStorieData()`). All app state (current filter, language, saved/favourite IDs, map mode, etc.) lives in module-level `let`/`const` bindings at the top of `app.js` — there is no state management library or centralized store.

### Rendering model
This is a hand-rolled, imperative DOM app: functions query/mutate `document.getElementById(...)` directly and re-render list sections wholesale (`renderPepiteList`, `renderEventi`, `renderItinerari`, `renderStorie`, `renderMarkers`, `renderEventiMarkers`). Event listeners for lists are attached once via delegation on a container (`setupPepiteList`, `setupEventiList`) rather than re-bound per item, since lists re-render frequently. Clickable card templates (`pepita-item`, `evento-card`, `itinerario-stop`, `med-story`) carry `role="button" tabindex="0"`, and each container's delegated listener has a matching `keydown` handler for Enter/Space alongside the `click` one — when adding a new clickable card, follow this pair rather than a click-only handler.

### Three synced views of the same data
Pepite/Eventi have three coordinated representations that must stay in sync on every filter/search change: the sidebar list, the Leaflet markers/clusters on the map (`markerCluster`, `eventiMarkersLayer`), and the right-hand detail panel (`openDetail`, `openEventDetail`, `openQuartierePage`). Marker rebuilds are debounced (`scheduleMarkers`, `_evMarkerTimer`) and short-circuited via a cache key (`_lastMarkersKey`) to avoid redundant Leaflet churn.

### Mobile bottom sheet (`.sidebar` below 768px)
On mobile the `.sidebar` is not an off-canvas panel that slides in from the side — it's a bottom sheet anchored to the map with three drag/tap snap heights (`peek`/`editorial`/`list`, defined in `SHEET_SNAPS`), driven by `setupMobileSheetDrag()` via `snapSheetTo()`. The map is always at least partially visible behind it, even at the `list` height. `closeSidebar()` now means "collapse to peek" rather than "hide the panel," and `#mobileMenuBtn` expands to `list` rather than toggling an `.open` class — the CSS `.sidebar.open` rule is a vestigial no-op kept only because a long-dead `setupMobileViewToggle()` function still (harmlessly, since its own target element doesn't exist) references it. The Pepite tab additionally shows a `#mobileEditorialPreview` block (`renderMobileEditorialPreview()`) — a clickable Pepita-del-giorno strip (`#medDaily`, thumbnail + name, opens `openDetail(getDailyPepita())`; shown at every width, it replaced the old floating daily card on the desktop map), plus, on mobile only, a Diario preview of landscape cover-photo cards (hidden if no `storie.json` content is loaded) and a permanent "La mia giornata" CTA — positioned so the sheet's default `editorial` height reveals it before the raw category/list content. On mobile the sheet's `.sidebar-header` is a slim right-aligned row (language + close only): the brand and global search already live in `.mobile-topbar`. The category filters (`#catNav`, and `#eventiFilters`) are a single horizontally scrolling row with a right-edge fade at every width, not a wrapped block. Any sheet height change calls `map.invalidateSize()` (see the map-resize note below) since the visible map area changes with it. The tab row (`.app-tabbar`, Pepite/Itinerari/Eventi/Diario) lives in-flow inside `.sidebar` right after `.sidebar-header`, at every viewport width — a horizontal row of plain text tabs, same on mobile and desktop.

### Cross-linking pepite ↔ eventi
`findEventsForPepita()` / `findPepitaForEvent()` fuzzy-match places to events by quartiere + significant words in the name (`_sigWords`), powering the "linked events" block shown in a pepita's detail panel and vice versa. This is a heuristic, not a stored foreign key — if a data entry's `nome`/`titolo`/`quartiere` wording changes, the link can silently break.

### Detail panel modes
`#detailPanel` is shared by three modes — pepita (`openDetail`, panel class `.pepita-mode`), evento (`openEventDetail`) and quartiere (`openQuartierePage`, class `.quartiere-mode`). Each starts with `resetDetailSections(mode)`, which hides every section only one mode fills (facts pills, hours table, quartiere list, address, linked events, fonti, Maps button) so nothing leaks from the previous content; a new mode-specific section must be added to that list. The `.detail-actions` row sits right under the title block (sticky at the bottom of the sheet on mobile, for pepita/quartiere) and `setDetailPrimaryAction(btn)` picks the one filled `.btn-main` button, which CSS moves first: directions for a pepita, share for an event, "Mostra sulla mappa" for a quartiere. Button handlers are assigned with `.onclick` per mode — don't also `addEventListener` them, or they fire twice.

A pepita shows, under its name, a live status pill (`getOpenStatus()`: "Aperto · chiude alle 23:00" / "Chiuso · apre domani alle 12:00") and a quartiere pill that opens `openQuartierePage(nome)`, plus a weekly hours table (`renderDetailHours`). The quartiere page is generated entirely from `data.json` (count, top categories, a summary sentence, every pepita in it); its map fit (`_quartiereBounds`) ignores points more than 1.5 km from the median, so one mis-placed coordinate doesn't zoom out to the whole city, and pads for the panel's width on desktop. `openDetail` flies to zoom 16 (falling back to `zoomToShowLayer` when the marker is still clustered); both cluster groups use `maxClusterRadius: 70` with 34px salmon (`#fd7e75`) bubbles.

### Opening hours
`parseOrariWeek(orari)` is the one parser of the Italian `orari` strings, shared by "Aperto ora" (`isOpenNow`/`_computeOpenNow`), the status pill and the hours table, so they always agree. It returns `{1..7: [[open, close], …]}` (Lun=1) or `null` when nothing is recognisable (then the raw text is shown and the place never counts as open). Rules: segments split on ", " (a bare comma joins a day list, "Ven,Sab"); a time-only segment inherits the previous day group; a later day group *replaces* earlier slots for the days it names ("Lun-Dom 18:00–01:00, Ven,Sab 18:00–02:00"); "Chiuso X" wins regardless of position; an overnight slot belongs to the day it starts (`_openSlotAt` checks yesterday's overnight slots for the early hours); "Aperto 24 ore su 24" becomes a `00:00–24:00` slot (`_isAllDaySlot`, shown as "Aperto 24 ore"); a trailing note in brackets ("07:00-11:00 (Colazione)") is kept as the slot's third element and shown in the table. Every entry in `data.json` currently parses — if a new one doesn't, the detail falls back to the raw text.

### Filtering
`getFiltered()` (pepite) and `getFilteredEventi()` (eventi) are the single source of truth for "what's currently shown," combining: active category filter, search text, "Near Me" geolocation radius, "Aperto ora" (open-now) computed from `orari` strings (`isOpenNow`/`_computeOpenNow`, see Opening hours above), event date filters (oggi/weekend), and quartiere map-bounds filtering. Any change to filtering logic should go through these functions, not be duplicated at call sites.

### Empty states, "Cerca ovunque", no upcoming events
When the Pepite or Eventi tab search finds nothing, the empty state offers `_searchEverywhereBtn(query)`, which opens the global search pre-filled (`openGlobalSearch(prefill)`) and shows how many results it will find — counted with `_globalSearchMatches()`, the same matcher the overlay renders from, so the two can't disagree. When every event in `eventi.json` is past, `renderEventi()` shows `_noUpcomingEventsHTML()` (when the last one ended + a link back to the Pepite tab) instead of the generic "remove filters" state, whatever filters are active.

### Suggerisci una pepita
No backend: `openSuggestPepita()` renders a form in `#suggestOverlay` (reusing the global-search overlay/panel shell) and on submit opens a `mailto:` to `SUGGEST_EMAIL` with the suggestion pre-written (labels always in Italian, for the curator), then shows a thank-you step with a copy-the-text fallback. **`SUGGEST_EMAIL` is empty in the repo, and while it is the whole feature is hidden** — the `#suggestPepitaCta` card under the Pepite list and the "Suggeriscila" buttons in the Pepite / global-search no-results states. The overlay traps Tab focus (`_trapFocus`), closes on Escape and returns focus to its opener.

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

### Map tiles (CARTO)
`initMap()` uses CARTO's Positron raster basemap at `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key={apiKey}`, where Leaflet fills `{apiKey}` from the `apiKey` tileLayer option (`CARTO_API_KEY`, just above `initMap()` in `app.js`). Since Sept 2026 CARTO requires that key on every tile request, and the parameter must be `key` — without it, or with any other name (e.g. `api_key`), tiles come back as an "API KEY REQUIRED" watermark image with HTTP 200, so nothing errors in the console. The key is restricted by domain in the CARTO dashboard: requests whose Referer isn't an allowed domain (including `localhost`) get a 403, so local testing needs the Referer rewritten to the deployed domain. CARTO also requires the attribution "© OpenStreetMap contributors, © CARTO" to stay visible.

### Search normalization
`normalizeSearch()` (NFD-decompose + strip diacritics + lowercase) is the shared helper behind every text search — `getFiltered()`, the eventi search filter, and `_gsMatch()` (global search) all run both the query and the candidate fields through it, so an accent-less query like "citta" matches "città". Route any new search/filter matching through this helper rather than a bare `.toLowerCase().includes(...)`.
