/* ========================================
   Milano Pepite — 3-Column Layout App
   ======================================== */

let pepite = [];
let eventi = [];
let currentFilter = (() => { try { return localStorage.getItem('pepite_filter') || 'all'; } catch { return 'all'; } })();
let currentDetail = null;
let map = null;
let markers = [];
let activeMarker = null;
let markerCluster = null;
let _lastMarkersKey = null; // cache key to avoid redundant renderMarkers() calls
let itinerarioLayer = null; // polyline + numbered markers for active itinerary
let currentQuartiereFilter = null;
// O(1) saved-ID lookups (populated on data load, kept in sync with localStorage)
let savedIds = new Set();
let savedEventiIds = new Set();
// "Near me" state
let nearMeActive = false;
let userLocation = null;       // { lat, lng }
let userLocationMarker = null; // Leaflet circleMarker
let currentLang = (() => { try { return localStorage.getItem('pepite_lang') || 'it'; } catch { return 'it'; } })();
let pepiteLoaded = false;
let eventiLoaded = false;
let currentMapMode = 'pepite'; // 'pepite' | 'eventi'
let eventiMarkersLayer = null;
let _evActiveLayer    = null; // non-clustered layer for the currently active event marker

// Approximate centroid coords for each Milan quartiere (used for event markers)
const quartiereCoords = {
  'Brera':          [45.4744, 9.1858],
  'Navigli':        [45.4484, 9.1768],
  'Porta Venezia':  [45.4728, 9.2063],
  'Porta Romana':   [45.4542, 9.2013],
  '5 Vie':          [45.4626, 9.1886],
  'Isola':          [45.4896, 9.1880],
  'Ticinese':       [45.4564, 9.1802],
  'Tortona':        [45.4584, 9.1625],
  'Magenta':        [45.4658, 9.1672],
  'Palestro':       [45.4724, 9.2013],
  'Dateo':          [45.4656, 9.2183],
  "Sant'Agostino":  [45.4608, 9.1726],
  'Sarpi':          [45.4824, 9.1706],
  'Lodi':           [45.4458, 9.2201],
  'Garibaldi':      [45.4866, 9.1875],
  'NoLo':           [45.4873, 9.2251],
  'Duomo':          [45.4641, 9.1919],
  'Dergano':        [45.5036, 9.1862],
  'Portello':       [45.4806, 9.1546],
  'Rho':            [45.5305, 9.0401],
  'Niguarda':       [45.5058, 9.1953],
  'Centrale':       [45.4857, 9.2085]
};
let currentEventFilter    = (() => { try { return localStorage.getItem('eventi_filter') || 'all'; } catch { return 'all'; } })();
let currentDateFilter     = (() => { try { return localStorage.getItem('eventi_date_filter') || null; } catch { return null; } })();  // null | 'oggi' | 'weekend'
let mapBoundsFilterActive = false;
let currentEventDetail    = null;
let _evMarkerTimer;       // debounce handle for renderEventiMarkers inside renderEventi()
const EVENTI_PAGE_SIZE = 20;
let _evWindowStart  = 0;
let _evAllItems     = [];  // full filtered+grouped list for current render cycle
let _evScrollSetup  = false; // scroll listener added once per session
const _notifTimers  = new Map(); // eventId → setTimeout handle for tomorrow-notifications
let   _imgObserver  = null;      // IntersectionObserver for pepite card images
let   _markerTimer  = null;      // debounce handle for renderMarkers
let   filterOpenNow = (() => { try { return localStorage.getItem('pepite_open_now') === 'true'; } catch { return false; } })();  // "Aperto ora" filter pill state

const categoryEmoji = {
  'Ristoranti Romantici': '🕯️',
  'Caffè & Bistrot': '☕',
  'Oasi Segrete': '🌿',
  'Aperitivi': '🍸',
  'Botteghe': '🎨',
  'Cascine': '🏡',
  'Hamburger': '🍔',
  'Cena tra Amici': '👫',
  'Brunch & Colazioni': '🥐',
  'Merende': '🍦'
};

// ── i18n Translations ──
const i18n = {
  it: {
    appTitle: 'Pepite',
    appSubtitle: "Milano d'autore",
    searchPlaceholder: 'Nome, zona, categoria...',
    globalSearchPlaceholder: 'Cerca pepite, eventi, itinerari, storie...',
    catLabel: 'Categorie',
    catAll: 'Tutte le Pepite',
    catRomantici: 'Romantici',
    catCaffe: 'Caffè & Bistrot',
    catOasi: 'Oasi Segrete',
    catCascine: 'Cascine',
    catAperitivi: 'Aperitivi',
    catBotteghe: 'Botteghe',
    catHamburger: 'Hamburger',
    catCena: 'Cena tra Amici',
    catBrunch: 'Brunch & Colazioni',
    catMerende: 'Merende',
    catFav: 'Preferiti',
    tabPepite: 'Pepite',
    tabItinerari: 'Itinerari',
    tabEventi: 'Eventi',
    listAll: 'Tutte le Pepite',
    results: (n) => `${n} risultat${n === 1 ? 'o' : 'i'}`,
    emptyTitle: 'Nessuna pepita trovata',
    emptyText: "Prova con un'altra ricerca o categoria",
    orari: 'Orari',
    share: 'Condividi',
    directions: 'Indicazioni',
    save: 'Salva',
    unsave: 'Rimuovi dai salvati',
    quartieriTitle: 'I Quartieri di Milano',
    quartieriDesc: 'Ogni rione ha la sua anima. Scopri le pepite nascoste in ogni angolo della città.',
    itinerariTitle: '10 Itinerari',
    itinerariDesc: 'Itinerari curati per vivere il meglio della città, pepita dopo pepita.',
    itinerariShare: 'Condividi',
    itinerariShareText: (title, sub, tappe) => `🗺️ ${title} — ${sub}\n📍 ${tappe}\n\nScopri le pepite di Milano →`,
    myDayBtnTitle: 'La mia giornata',
    myDayBtnSub: 'Crea un itinerario dai tuoi preferiti',
    myDayBtnPreview: (n, names) => `${n} tapp${n === 1 ? 'a salvata' : 'e salvate'}: ${names}`,
    myDayTitle: 'La mia giornata',
    myDaySub: 'Ordina le tue tappe preferite e portale con te.',
    myDaySharedBanner: 'Piano condiviso con te — salvalo per modificarlo e ritrovarlo tra i tuoi preferiti.',
    myDaySharedSave: 'Salva nei preferiti',
    myDayShowMap: 'Mostra sulla mappa',
    myDayShare: 'Condividi',
    myDayEmptyTitle: 'Ancora nessuna tappa salvata',
    myDayEmptyText: 'Salva pepite ed eventi con il cuore ♥ per aggiungerli qui e comporre il tuo itinerario.',
    myDayShareText: (tappe) => `🗺️ La mia giornata a Milano\n📍 ${tappe}\n\nScopri le pepite di Milano →`,
    myDayHint: 'Componi un itinerario con i tuoi preferiti → La mia giornata',
    moodMatcherHint: 'Non sai da dove iniziare? Rispondi a 3 domande → Trova la tua pepita',
    eventiTitle: 'Eventi del Mese',
    eventiDesc: () => `${getEventiPeriod('it')} — gli appuntamenti imperdibili a Milano.`,
    eventiSearchPlaceholder: 'Cerca eventi...',
    eventiAll: 'Tutti gli Eventi',
    eventiFilterAll: 'Tutti',
    eventiResults: (n) => `${n} event${n === 1 ? 'o' : 'i'}`,
    eventiEmptyTitle: 'Nessun evento trovato',
    eventiEmptyText: 'Prova con un\'altra ricerca o categoria',
    eventiWhen: 'Quando',
    eventiWhere: 'Dove',
    eventiPrice: 'Costo',
    eventiMaps: 'Apri in Maps',
    eventiShare: 'Condividi Evento',
    eventiSource: 'Sito Ufficiale',
    eventiCalendar: 'Salva in Calendario',
    eventiSaved: 'Eventi Salvati',
    eventiFilterFav: '❤️ Preferiti',
    pepiteCount: (n) => `${n} pepite`,
    storieTab: 'Diario',
    storieTitle: 'Milano Design Week 2026',
    storieDesc: 'Racconti e scatti dalla Milano Design Week 2026.',
    dailyCardLabel: 'Pepita del Giorno',
    dailyAbbina: 'Abbina con',
    openNow: 'Aperto ora',
    closedNow: 'Chiuso',
    nearMe: 'Vicino a me',
    nearMeActive: 'Vicino a me ✓',
    nearMeYouAreHere: 'Sei qui',
    nearMeError: 'Impossibile ottenere la posizione.',
    nearMeUnsupported: 'Geolocalizzazione non supportata.',
    nearMeEventiBadge: 'Ordinati per vicinanza',
    linkedEventsLabel: '🗓 In programma qui',
    linkedPepitaLabel: '✨ Pepita correlata',
    install: 'Installa Milano Pepite sulla Home',
    installBtn: 'Installa',
    installManual: 'Usa il menu del browser → "Aggiungi a Home" per installare',
    installDismiss: 'OK',
    shareText: (nome, desc) => `Ho scoperto una Pepita a Milano: ${nome} — ${desc}`,
    // Onboarding (first-launch mini tour)
    onbNext: 'Avanti',
    onbStart: 'Iniziamo',
    onbSkip: 'Salta',
    onbTitle1: 'Benvenuto in Pepite per Tutti',
    onbText1: 'La mappa delle gemme nascoste di Milano: locali, eventi, itinerari e storie scelti per te.',
    onbTitle2: 'Pepite',
    onbText2: 'Scopri locali autentici, filtra per categoria o quartiere, e salva i tuoi preferiti con il cuore ♥.',
    onbTitle3: 'Itinerari & La mia giornata',
    onbText3: 'Segui uno dei nostri percorsi curati o crea il tuo itinerario personale a partire dai luoghi ed eventi che hai salvato.',
    onbTitle4: 'Eventi, Diario e ricerca ovunque',
    onbText4: 'Scopri cosa succede in città e le storie editoriali del Diario. Usa la lente 🔍 in alto per cercare tutto insieme, in ogni momento.',
    // Itinerari
    it1Title: 'La Milano Segreta', it1Sub: 'Cortili, botteghe e sapori nascosti',
    it2Title: 'Design & Gusto', it2Sub: 'Arte contemporanea, vintage e cocktail',
    it3Title: 'Navigli & Oasi Verdi', it3Sub: 'Canali, giardini segreti e dolcezza',
    // Quartieri descriptions
    qBrera: 'Il cuore artistico e bohémien. Gallerie, botteghe vintage e bistrot nascosti.',
    qNavigli: 'Canali, aperitivi e atmosfera vibrante. La Milano più romantica al tramonto.',
    qPortaVenezia: 'Multiculturale e vivace. Liberty, brunch e la Milano più inclusiva.',
    qPortaRomana: "Eleganza discreta e trattorie d'autore. Il cuore residenziale che sorprende.",
    q5Vie: 'Il quartiere più antico. Botteghe artigiane e cortili segreti.',
    qIsola: 'Il quartiere rinato. Street art, locali cool e il Bosco Verticale.',
    qTicinese: 'Colonne, basiliche e cocktail bar nascosti. Storia e movida.',
    qTortona: 'Ex zone industriali trasformate. Design, fotografia e spazi creativi.',
    qMagenta: "L'Ultima Cena, la Vigna di Leonardo e l'eleganza milanese classica.",
    qPalestro: 'Giardini, ville déco e musei. La pausa verde nel centro.',
    qDateo: "Il quartiere dei caffè specialty. Tranquillo e a misura d'uomo.",
    qSantAgostino: 'Brunch, atmosfere nordiche e la Milano slow.',
    qSarpi: "La Chinatown più elegante d'Europa. Contaminazioni e sapori unici.",
    qLodi: "Fondazione Prada e nuovi spazi culturali. La frontiera dell'arte.",
    qGaribaldi: 'Skyline moderno, Corso Como e la Milano contemporanea.',
    qNoLo: 'North of Loreto. Il quartiere emergente della creatività.',
    // Itinerari stops descriptions
    s1_1: 'Colazione con i migliori lievitati della città',
    s1_2: "Passeggiata nel giardino segreto dell'Accademia",
    s1_3: 'Pranzo casalingo nella vecchia Brera',
    s1_4: 'Shopping nel regno del colore di Uberto',
    s1_5: 'Ceramiche dipinte a mano in un cortile segreto',
    s1_6: "Aperitivo nell'enoteca sotterranea di Brera",
    s1_7: 'Cena romantica tra fiori e musica',
    s2_1: 'Boulangerie francese: il profumo del burro in via Melzo',
    s2_2: "Capolavoro déco e tuffo negli anni '30",
    s2_3: 'Osteria moderna: tradizione rivisitata con garbo',
    s2_4: "Galleria design iconica in un'ex fabbrica",
    s2_5: 'Il miglior vintage di lusso selezionato',
    s2_6: 'Dove è nato il Negroni Sbagliato',
    s2_7: 'Cucina essenziale affacciata sul Naviglio',
    s3_1: "Brunch scandinavo che abbraccia l'anima",
    s3_2: 'Il giardino segreto di Da Vinci',
    s3_3: 'Aperitivo nel cortile industriale vintage',
    s3_4: 'Arte contemporanea e il Bar Luce di Wes Anderson',
    s3_5: 'Il mondo poetico di Marras in un giardino incantato',
    s3_6: 'Cocktail retrò lungo il Naviglio',
    s3_7: "Cena in un cortile che sembra un'oasi esotica",
    // Itinerario 4 — Milano Golosa
    it4Title: 'Milano Golosa', it4Sub: 'Hamburger gourmet e sapori di strada',
    s4_1: 'Il panino di culto del quartiere Isola',
    s4_2: 'Smash burger creativi in zona Navigli',
    s4_3: 'La macina artigianale di Porta Romana',
    s4_4: 'Dolci e gelato nel cuore della città',
    s4_5: 'Brunch americano con vista sui Navigli',
    // Itinerario 5 — Cascine di Milano
    it5Title: 'Cascine di Milano', it5Sub: 'La campagna che resiste dentro la città',
    s5_1: 'L\'iconica cascina riqualificata del quartiere',
    s5_2: 'L\'ultima cascina medievale di Milano',
    s5_3: 'Oasi agricola nel profondo sud della città',
    s5_4: 'Centro sociale e culturale a Sempione',
    s5_5: 'Cascina rurale lungo il Naviglio',
    // Itinerario 6 — Aperitivo Trail
    it6Title: 'Aperitivo Trail', it6Sub: 'I migliori cocktail e aperitivi della città',
    s6_1: 'Dove è nato il Negroni Sbagliato',
    s6_2: 'Speakeasy nascosto dietro una porta segreta',
    s6_3: 'Enoteca e cicchetti nel cuore dei Navigli',
    s6_4: 'Cocktail d\'autore sulla terrazza più esclusiva',
    s6_5: 'Vini naturali e atmosfera bohémien a Sarpi',
    s6_6: 'Birra artigianale nel cortile hipster dell\'Isola',
    // Itinerario 7 — Brunch & Dolcezza
    it7Title: 'Brunch & Dolcezza', it7Sub: 'Colazioni, merende e pasticcerie storiche',
    s7_1: 'Cornetti caldi e caffè specialty a Porta Venezia',
    s7_2: 'Brunch scandinavo che abbraccia l\'anima',
    s7_3: 'Pasticceria storica sotto i portici',
    s7_4: 'Gelato artigianale con ingredienti a km zero',
    s7_5: 'Bakery internazionale e pancakes',
    s7_6: 'Il gelato più sorprendente della città',
    // Itinerario 8 — Milano Romantica
    it8Title: 'Milano Romantica', it8Sub: 'Cene a lume di candela e angoli incantati',
    s8_1: 'Caffè fra i fiori più bello di Milano',
    s8_2: 'Giardino segreto per una passeggiata a due',
    s8_3: 'Pranzo intimo nella trattoria più amata',
    s8_4: 'Terme e relax nel cuore di Porta Romana',
    s8_5: 'Aperitivo esclusivo nel giardino del Bulgari',
    s8_6: 'Cena romantica tra fiori e musica',
    // Itinerario 9 — Arte & Cultura
    it9Title: 'Arte & Cultura', it9Sub: 'Musei, fondazioni e spazi creativi',
    s9_1: 'Capolavoro déco e atmosfere anni Trenta',
    s9_2: 'La vigna segreta di Leonardo da Vinci',
    s9_3: 'Arte contemporanea e il Bar Luce di Wes Anderson',
    s9_4: 'Design e architettura alla Triennale',
    s9_5: 'Il mondo poetico di Marras tra moda e natura',
    s9_6: 'Galleria di design vintage e pezzi unici',
    // Itinerario 10 — Milano Alternativa
    it10Title: 'Milano Alternativa', it10Sub: 'Locali eccentrici e quartieri emergenti',
    s10_1: 'Tipografia trasformata in bistrot a NoLo',
    s10_2: 'Caffè giapponese e design contemporaneo',
    s10_3: 'Moto, caffè e stile californiano all\'Isola',
    s10_4: 'Balera e musica dal vivo nella vecchia fabbrica',
    s10_5: 'Shopping vintage nel concept store di Brera',
    s10_6: 'Cena greca autentica nel cuore nascosto di Porta Romana'
  },
  en: {
    appTitle: 'Pepite',
    appSubtitle: "Milan's hidden gems",
    searchPlaceholder: 'Name, area, category...',
    globalSearchPlaceholder: 'Search gems, events, itineraries, stories...',
    catLabel: 'Categories',
    catAll: 'All Gems',
    catRomantici: 'Romantic',
    catCaffe: 'Cafés & Bistros',
    catOasi: 'Secret Oases',
    catCascine: 'Farmsteads',
    catAperitivi: 'Aperitivos',
    catBotteghe: 'Boutiques',
    catHamburger: 'Burgers',
    catCena: 'Dinner with Friends',
    catBrunch: 'Brunch & Breakfast',
    catMerende: 'Snacks & Treats',
    catFav: 'Favourites',
    tabPepite: 'Gems',
    tabItinerari: 'Itineraries',
    tabEventi: 'Events',
    listAll: 'All Gems',
    results: (n) => `${n} result${n === 1 ? '' : 's'}`,
    emptyTitle: 'No gems found',
    emptyText: 'Try a different search or category',
    orari: 'Hours',
    share: 'Share',
    directions: 'Directions',
    save: 'Save',
    unsave: 'Remove from saved',
    quartieriTitle: "Milan's Neighborhoods",
    quartieriDesc: 'Every district has its own soul. Discover the hidden gems in every corner of the city.',
    itinerariTitle: '10 Itineraries',
    itinerariDesc: 'Curated itineraries to experience the best of the city, gem after gem.',
    itinerariShare: 'Share',
    itinerariShareText: (title, sub, tappe) => `🗺️ ${title} — ${sub}\n📍 ${tappe}\n\nDiscover Milan's hidden gems →`,
    myDayBtnTitle: 'My Day Plan',
    myDayBtnSub: 'Build an itinerary from your favourites',
    myDayBtnPreview: (n, names) => `${n} saved stop${n === 1 ? '' : 's'}: ${names}`,
    myDayTitle: 'My Day Plan',
    myDaySub: 'Reorder your favourite stops and take them with you.',
    myDaySharedBanner: 'A plan shared with you — save it to edit it and find it again in your favourites.',
    myDaySharedSave: 'Save to favourites',
    myDayShowMap: 'Show on map',
    myDayShare: 'Share',
    myDayEmptyTitle: 'No stops saved yet',
    myDayEmptyText: 'Save gems and events with the heart ♥ to add them here and build your itinerary.',
    myDayShareText: (tappe) => `🗺️ My Day in Milan\n📍 ${tappe}\n\nDiscover Milan's hidden gems →`,
    myDayHint: 'Build a plan from your favourites → My Day Plan',
    moodMatcherHint: 'Not sure where to start? Answer 3 questions → Find your gem',
    eventiTitle: 'Monthly Events',
    eventiDesc: () => `${getEventiPeriod('en')} — unmissable events in Milan.`,
    eventiSearchPlaceholder: 'Search events...',
    eventiAll: 'All Events',
    eventiFilterAll: 'All',
    eventiResults: (n) => `${n} event${n === 1 ? '' : 's'}`,
    eventiEmptyTitle: 'No events found',
    eventiEmptyText: 'Try a different search or category',
    eventiWhen: 'When',
    eventiWhere: 'Where',
    eventiPrice: 'Cost',
    eventiMaps: 'Open in Maps',
    eventiShare: 'Share Event',
    eventiSource: 'Official Website',
    eventiCalendar: 'Save to Calendar',
    eventiSaved: 'Saved Events',
    eventiFilterFav: '❤️ Favourites',
    pepiteCount: (n) => `${n} gems`,
    storieTab: 'Diary',
    storieTitle: 'Milan Design Week 2026',
    storieDesc: 'Stories and snapshots from Milan Design Week 2026.',
    dailyCardLabel: "Today's Gem",
    dailyAbbina: 'Pair with',
    openNow: 'Open now',
    closedNow: 'Closed',
    nearMe: 'Near me',
    nearMeActive: 'Near me ✓',
    nearMeYouAreHere: 'You are here',
    nearMeError: 'Could not get your location.',
    nearMeUnsupported: 'Geolocation not supported.',
    nearMeEventiBadge: 'Sorted by distance',
    linkedEventsLabel: '🗓 Happening here',
    linkedPepitaLabel: '✨ Related Gem',
    install: 'Install Milano Pepite on Home Screen',
    installBtn: 'Install',
    installManual: 'Use browser menu → "Add to Home Screen" to install',
    installDismiss: 'OK',
    shareText: (nome, desc) => `I discovered a hidden gem in Milan: ${nome} — ${desc}`,
    // Onboarding (first-launch mini tour)
    onbNext: 'Next',
    onbStart: "Let's go",
    onbSkip: 'Skip',
    onbTitle1: 'Welcome to Pepite per Tutti',
    onbText1: "Milan's hidden-gem map: venues, events, itineraries and stories picked just for you.",
    onbTitle2: 'Gems',
    onbText2: 'Discover authentic venues, filter by category or neighborhood, and save your favourites with the heart ♥.',
    onbTitle3: 'Itineraries & My Day Plan',
    onbText3: 'Follow one of our curated routes, or build your own day plan from the places and events you saved.',
    onbTitle4: 'Events, Diary and search everywhere',
    onbText4: "See what's on in the city and read the Diary's editorial stories. Use the 🔍 icon up top to search everything at once, anytime.",
    it1Title: 'Secret Milan', it1Sub: 'Courtyards, workshops & hidden flavors',
    it2Title: 'Design & Taste', it2Sub: 'Contemporary art, vintage & cocktails',
    it3Title: 'Navigli & Green Oases', it3Sub: 'Canals, secret gardens & sweetness',
    qBrera: 'The artistic and bohemian heart. Galleries, vintage shops, and hidden bistros.',
    qNavigli: 'Canals, aperitivos, and vibrant atmosphere. Milan at its most romantic at sunset.',
    qPortaVenezia: 'Multicultural and lively. Liberty, brunch, and Milan at its most inclusive.',
    qPortaRomana: 'Discreet elegance and signature trattorias. The residential heart that surprises.',
    q5Vie: 'The oldest neighborhood. Artisan workshops and secret courtyards.',
    qIsola: 'The reborn neighborhood. Street art, cool bars, and the Vertical Forest.',
    qTicinese: 'Columns, basilicas, and hidden cocktail bars. History and nightlife.',
    qTortona: 'Transformed industrial zones. Design, photography, and creative spaces.',
    qMagenta: "The Last Supper, Leonardo's Vineyard, and classic Milanese elegance.",
    qPalestro: 'Gardens, Art Deco villas, and museums. A green pause in the center.',
    qDateo: 'The specialty coffee neighborhood. Quiet and human-scale.',
    qSantAgostino: 'Brunch, Nordic atmospheres, and slow Milan.',
    qSarpi: "Europe's most elegant Chinatown. Cross-cultural flavors.",
    qLodi: 'Fondazione Prada and new cultural spaces. The frontier of art.',
    qGaribaldi: 'Modern skyline, Corso Como, and contemporary Milan.',
    qNoLo: 'North of Loreto. The emerging creative neighborhood.',
    s1_1: "Breakfast with the city's best pastries",
    s1_2: 'A walk through the Academy\'s secret garden',
    s1_3: 'Home-style lunch in old Brera',
    s1_4: "Shopping in Uberto's kingdom of color",
    s1_5: 'Hand-painted ceramics in a secret courtyard',
    s1_6: "Aperitivo in Brera's underground wine cellar",
    s1_7: 'Romantic dinner among flowers and music',
    s2_1: 'French boulangerie: the scent of butter on Via Melzo',
    s2_2: "Art Deco masterpiece and a dive into the '30s",
    s2_3: 'Modern osteria: tradition revisited with grace',
    s2_4: 'Iconic design gallery in a former factory',
    s2_5: 'The finest luxury vintage, hand-selected',
    s2_6: 'Where the Negroni Sbagliato was born',
    s2_7: 'Essential cuisine overlooking the canal',
    s3_1: 'Soul-warming Scandinavian brunch',
    s3_2: "Da Vinci's secret garden",
    s3_3: 'Aperitivo in a vintage industrial courtyard',
    s3_4: "Contemporary art and Wes Anderson's Bar Luce",
    s3_5: "Marras's poetic world in an enchanted garden",
    s3_6: 'Retro cocktails along the canal',
    s3_7: 'Dinner in a courtyard that feels like an exotic oasis',
    it4Title: 'Foodie Milan', it4Sub: 'Gourmet burgers and street food flavors',
    s4_1: 'The cult burger joint of the Isola district',
    s4_2: 'Creative smash burgers in the Navigli area',
    s4_3: 'Artisan patties in Porta Romana',
    s4_4: 'Sweets and gelato in the heart of the city',
    s4_5: 'American-style brunch overlooking the canals',
    it5Title: "Milan's Farmsteads", it5Sub: 'The countryside that survives within the city',
    s5_1: 'The iconic renovated farmstead of the neighborhood',
    s5_2: "Milan's last medieval farmstead",
    s5_3: 'Agricultural oasis in the deep south of the city',
    s5_4: 'Social and cultural hub near Sempione',
    s5_5: 'Rural farmstead along the canal',
    it6Title: 'Aperitivo Trail', it6Sub: "The city's best cocktails and aperitivos",
    s6_1: 'Where the Negroni Sbagliato was born',
    s6_2: 'Hidden speakeasy behind a secret door',
    s6_3: 'Wine bar and cicchetti in the heart of Navigli',
    s6_4: "Signature cocktails on the city's most exclusive terrace",
    s6_5: 'Natural wines and bohemian vibes in Sarpi',
    s6_6: 'Craft beer in the hipster courtyard of Isola',
    it7Title: 'Brunch & Sweetness', it7Sub: 'Breakfasts, snacks, and historic pastry shops',
    s7_1: 'Warm croissants and specialty coffee in Porta Venezia',
    s7_2: 'Soul-warming Scandinavian brunch',
    s7_3: 'Historic pastry shop under the arcades',
    s7_4: 'Artisan gelato with zero-mile ingredients',
    s7_5: 'International bakery and pancakes',
    s7_6: "The city's most surprising gelato",
    it8Title: 'Romantic Milan', it8Sub: 'Candlelit dinners and enchanted corners',
    s8_1: "Milan's most beautiful flower café",
    s8_2: 'Secret garden for a walk for two',
    s8_3: "Intimate lunch at the city's most beloved trattoria",
    s8_4: 'Spa and relaxation in the heart of Porta Romana',
    s8_5: "Exclusive aperitivo in the Bulgari's garden",
    s8_6: 'Romantic dinner among flowers and music',
    it9Title: 'Art & Culture', it9Sub: 'Museums, foundations, and creative spaces',
    s9_1: "Art Deco masterpiece and 1930s atmospheres",
    s9_2: "Leonardo da Vinci's secret vineyard",
    s9_3: "Contemporary art and Wes Anderson's Bar Luce",
    s9_4: 'Design and architecture at the Triennale',
    s9_5: "Marras's poetic world between fashion and nature",
    s9_6: 'Vintage design gallery and unique pieces',
    it10Title: 'Alternative Milan', it10Sub: 'Eccentric spots and emerging neighborhoods',
    s10_1: 'Print shop turned bistro in NoLo',
    s10_2: 'Japanese café and contemporary design',
    s10_3: 'Motorcycles, coffee, and California style in Isola',
    s10_4: 'Dance hall and live music in the old factory',
    s10_5: "Vintage shopping in Brera's concept store",
    s10_6: 'Authentic Greek dinner in the hidden heart of Porta Romana'
  }
};

function t(key, ...args) {
  const val = i18n[currentLang][key];
  return typeof val === 'function' ? val(...args) : (val || i18n.it[key] || key);
}

// ── Dynamic events period label ──
function getEventiPeriod(lang) {
  const fullNames = {
    it: { GEN:'Gennaio', FEB:'Febbraio', MAR:'Marzo', APR:'Aprile', MAG:'Maggio', GIU:'Giugno',
          LUG:'Luglio', AGO:'Agosto', SET:'Settembre', OTT:'Ottobre', NOV:'Novembre', DIC:'Dicembre' },
    en: { GEN:'January', FEB:'February', MAR:'March', APR:'April', MAG:'May', GIU:'June',
          LUG:'July', AGO:'August', SET:'September', OTT:'October', NOV:'November', DIC:'December' }
  };
  const names = fullNames[lang] || fullNames.it;
  if (eventi.length > 0) {
    // Collect unique months preserving order
    const seen = new Set();
    const months = eventi.map(e => e.mese).filter(m => m && !seen.has(m) && seen.add(m));
    // Infer year: look for a year field or default to current year
    const year = eventi[0].anno || new Date().getFullYear();
    if (months.length === 1) return `${names[months[0]] || months[0]} ${year}`;
    return `${names[months[0]] || months[0]} – ${names[months[months.length - 1]] || months[months.length - 1]} ${year}`;
  }
  // Fallback: current month/year
  const now = new Date();
  const fallback = {
    it: ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'],
    en: ['January','February','March','April','May','June','July','August','September','October','November','December']
  };
  return `${(fallback[lang] || fallback.it)[now.getMonth()]} ${now.getFullYear()}`;
}

// ── Splash Screen ──
function dismissSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => splash.classList.add('hidden'), 400);
}

// ── Onboarding (first-launch mini tour) ──
const onboardingSlides = [
  { emoji: '✨',  titleKey: 'onbTitle1', textKey: 'onbText1' },
  { emoji: '🕯️', titleKey: 'onbTitle2', textKey: 'onbText2' },
  { emoji: '🗺️', titleKey: 'onbTitle3', textKey: 'onbText3' },
  { emoji: '🔍',  titleKey: 'onbTitle4', textKey: 'onbText4' }
];
let onboardingIdx = 0;
let _onboardingPending = false; // true once the first-launch tour is scheduled/showing

/** True if this browser shows any sign of prior use — keys that only ever get
 *  written in response to a real user action, never on page load. Used so the
 *  "welcome" tour isn't shown to people who already used the app before it existed. */
function _isReturningUser() {
  try {
    return !!(
      localStorage.getItem('ga_consent') ||
      localStorage.getItem('pepite_saved') ||
      localStorage.getItem('eventi_saved') ||
      localStorage.getItem('pepite_filter') ||
      localStorage.getItem('pepite_lang')
    );
  } catch { return false; }
}

function setupOnboarding() {
  document.getElementById('onboardingNext')?.addEventListener('click', () => {
    if (onboardingIdx < onboardingSlides.length - 1) {
      onboardingIdx++;
      renderOnboardingSlide();
    } else {
      closeOnboarding();
    }
  });
  document.getElementById('onboardingBack')?.addEventListener('click', () => {
    if (onboardingIdx > 0) { onboardingIdx--; renderOnboardingSlide(); }
  });
  document.getElementById('onboardingSkip')?.addEventListener('click', closeOnboarding);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('onboardingOverlay')?.style.display !== 'none') closeOnboarding();
  });

  let seen = false;
  try { seen = localStorage.getItem('pepite_onboarding_seen') === '1'; } catch { seen = false; }

  if (!seen && _isReturningUser()) {
    // Pre-existing users predate this feature — treat them as already onboarded, not first-timers
    seen = true;
    safeLocalStorageSet('pepite_onboarding_seen', '1');
  }

  if (!seen) {
    _onboardingPending = true;
    // Show right after the splash fades out
    setTimeout(openOnboarding, 1500);
  }
}

function openOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  onboardingIdx = 0;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderOnboardingSlide();
}

function closeOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  safeLocalStorageSet('pepite_onboarding_seen', '1');
  _onboardingPending = false;
  // The GA consent banner deferred itself while the tour was up — trigger it now, sequenced.
  maybeShowGaBanner(500);
}

function renderOnboardingSlide() {
  const slide = onboardingSlides[onboardingIdx];
  const el = document.getElementById('onboardingSlide');
  if (!el) return;
  el.innerHTML = `
    <span class="onboarding-emoji">${slide.emoji}</span>
    <h3>${escapeHtml(t(slide.titleKey))}</h3>
    <p>${escapeHtml(t(slide.textKey))}</p>
  `;
  const dots = document.getElementById('onboardingDots');
  if (dots) {
    dots.innerHTML = onboardingSlides.map((_, i) =>
      `<span class="onboarding-dot${i === onboardingIdx ? ' active' : ''}"></span>`
    ).join('');
  }
  const backBtn = document.getElementById('onboardingBack');
  if (backBtn) backBtn.style.display = onboardingIdx === 0 ? 'none' : '';
  const nextBtn = document.getElementById('onboardingNext');
  if (nextBtn) nextBtn.textContent = onboardingIdx === onboardingSlides.length - 1 ? t('onbStart') : t('onbNext');
  const skipBtn = document.getElementById('onboardingSkip');
  if (skipBtn) skipBtn.textContent = t('onbSkip');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(dismissSplash, 1000); // single timeout: fade starts at 1 s, hidden at 1.4 s

  // Static UI — no data needed
  applyLanguage();
  initMap();
  setupSidebar();
  setupSidebarTabs();   // includes lazy-load triggers
  setupSearch();
  setupFilters();
  setupPepiteList();
  setupEventiList();
  setupNearMe();
  setupPepiteScrollTop();
  setupDetail();
  setupMapControls();
  setupInstallBanner();
  setupLangToggle();
  setupEventiSearch();
  setupMoodMatcher();
  setupStoryViewer();
  setupGlobalSearch();
  setupMyDayPlan();
  setupOnboarding();

  // Pepite tab is active by default — load pepite data and set map mode
  currentMapMode = 'pepite';
  await loadPepiteData();
  // Pre-load eventi in background so the tab is instant when switched
  loadEventiData();
  // On mobile, also preload storie in the background so the bottom sheet's editorial
  // preview can show a Diario teaser without requiring the user to open that tab first
  if (_isMobileSheet()) loadStorieData();

  handleDeepLink();
  window.addEventListener('hashchange', handleDeepLink);

  // Back button closes the detail panel instead of navigating away from the app
  window.addEventListener('popstate', () => {
    if (currentDetail || currentEventDetail || currentQuartiereFilter) {
      closeDetail(true);
    }
  });

  setupOfflineIndicator();
  setupAnalyticsConsent();
});

// ── Google Analytics GDPR consent ──
function setupAnalyticsConsent() {
  const consent = localStorage.getItem('ga_consent');
  if (consent === 'yes') { window._initGA?.(); return; }
  if (consent === 'no') return;

  // No stored preference — wire up the banner, but let maybeShowGaBanner() decide *when* to reveal it
  const banner = document.getElementById('gaConsentBanner');
  if (!banner) return;

  document.getElementById('gaBtnAccept')?.addEventListener('click', () => {
    localStorage.setItem('ga_consent', 'yes');
    banner.style.display = 'none';
    window._initGA?.();
  });

  document.getElementById('gaBtnDecline')?.addEventListener('click', () => {
    localStorage.setItem('ga_consent', 'no');
    banner.style.display = 'none';
  });

  // Don't compete with the first-launch onboarding tour for attention — if it's about to show,
  // closeOnboarding() will call maybeShowGaBanner() once the user is done with it instead.
  if (!_onboardingPending) {
    maybeShowGaBanner(1200);
  }
}

/** Reveal the GA consent banner after `delay` ms, unless consent is already decided or it's already showing. */
function maybeShowGaBanner(delay = 0) {
  const consent = localStorage.getItem('ga_consent');
  if (consent === 'yes' || consent === 'no') return;
  const banner = document.getElementById('gaConsentBanner');
  if (!banner || banner.style.display === '') return; // already visible
  setTimeout(() => { banner.style.display = ''; }, delay);
}

// ── HTML escaping ──
const _ESCAPE_HTML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape a value for safe interpolation into innerHTML (text content or quoted attribute). */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => _ESCAPE_HTML_MAP[ch]);
}

/** Lowercases and strips diacritics (città -> citta) so search matches regardless of accents. */
function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ── JSON helpers ──
function parseJsonRobust(text) {
  try {
    const stripped = text.replace(/^```[a-z]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return parsed;
    const firstVal = Object.values(parsed)[0];
    if (Array.isArray(firstVal)) return firstVal;
    return parsed;
  } catch (e) {
    console.error('parseJsonRobust: invalid JSON', e);
    throw e; // re-throw so callers' catch blocks can display the error
  }
}

/** Safely read + JSON-parse a localStorage key; returns `fallback` on any error. */
function safeLocalStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn(`localStorage read error for "${key}":`, e);
    return fallback;
  }
}

/** Safely write a value to localStorage; silently swallows quota/security errors. */
function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn(`localStorage write error for "${key}":`, e);
  }
}

// ── Lazy loaders ──

function showPepiteListSkeleton() {
  const list = document.getElementById('pepiteList');
  if (!list || pepiteLoaded) return;
  list.innerHTML = Array.from({ length: 7 }, () => `
    <div class="pepita-item skeleton-item" aria-hidden="true">
      <div class="skeleton skeleton-img"></div>
      <div class="pepita-item-info">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-sub"></div>
      </div>
    </div>`).join('');
}

function showEventiListSkeleton() {
  const list = document.getElementById('eventiList');
  if (!list || eventiLoaded) return;
  list.innerHTML = Array.from({ length: 5 }, () => `
    <div class="evento-card skeleton-item" aria-hidden="true" style="pointer-events:none">
      <div class="skeleton" style="width:36px;height:52px;border-radius:2px;flex-shrink:0"></div>
      <div class="evento-info" style="flex:1;min-width:0">
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-sub" style="margin-top:6px;width:60%"></div>
        <div class="skeleton skeleton-sub" style="margin-top:6px;width:40%"></div>
      </div>
    </div>`).join('');
}

async function loadPepiteData() {
  if (pepiteLoaded) return;
  showPepiteListSkeleton();
  try {
    const res = await fetch('data.json');
    pepite = parseJsonRobust(await res.text());
    savedIds = new Set(safeLocalStorageJson('pepite_saved', []));
    pepite.forEach(p => { if (savedIds.has(p.id)) p.salvato = true; });
    pepiteLoaded = true;
  } catch (e) {
    console.error('Errore caricamento pepite:', e);
    return;
  }
  updateCategoryCounts();
  renderPepiteList();
  renderMarkers();
  renderItinerari();
  renderDailyCard();
  renderMobileEditorialPreview();
  // If the Storie tab loaded before pepite, re-render now that cover images and tag lookups work
  if (storieLoaded) renderStorie();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(() => syncSavedImagesToSW());
  }
}

async function loadEventiData() {
  if (eventiLoaded) return;

  // Show skeleton while fetching
  showEventiListSkeleton();

  try {
    const res = await fetch('eventi.json');
    eventi = parseJsonRobust(await res.text());
    savedEventiIds = new Set(safeLocalStorageJson('eventi_saved', []));
    eventi.forEach(e => { if (savedEventiIds.has(e.id)) e.salvato = true; });
    eventiLoaded = true;
  } catch (e) {
    console.error('Errore caricamento eventi:', e);
    const evList = document.getElementById('eventiList');
    if (evList) evList.innerHTML = '<div class="tab-loading">⚠️ Errore di caricamento.</div>';
    return;
  }

  buildEventiDateFilters(); buildEventiFilters();
  renderEventi();
  updateMyDayBtnPreview();
}

// ── Mobile View Toggle (Lista / Mappa) ──
function setupMobileViewToggle() {
  const toggle = document.getElementById('mobileViewToggle');
  if (!toggle) return;
  toggle.querySelectorAll('.mvt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggle.querySelectorAll('.mvt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      if (view === 'list') {
        document.body.classList.add('mobile-list-view');
        // Open sidebar in list view if not already open
        document.getElementById('sidebar').classList.add('open');
      } else {
        document.body.classList.remove('mobile-list-view');
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
  // Closing sidebar via X resets to map view
  document.getElementById('sidebarClose')?.addEventListener('click', () => {
    toggle.querySelectorAll('.mvt-btn').forEach(b => b.classList.remove('active'));
    toggle.querySelector('[data-view="map"]').classList.add('active');
    document.body.classList.remove('mobile-list-view');
  });
  // Backdrop click also resets
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    toggle.querySelectorAll('.mvt-btn').forEach(b => b.classList.remove('active'));
    toggle.querySelector('[data-view="map"]').classList.add('active');
    document.body.classList.remove('mobile-list-view');
  });
}

// ── Language Toggle ──
function setupLangToggle() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.dataset.lang === currentLang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.lang;
      localStorage.setItem('pepite_lang', currentLang);
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyLanguage();
      if (pepiteLoaded) {
        updateCategoryCounts();
        renderPepiteList();
        renderItinerari();
        renderMobileEditorialPreview();
      }
      if (eventiLoaded) {
        buildEventiDateFilters(); buildEventiFilters();
        renderEventi();
      }
      if (storieLoaded) renderStorie();
      if (currentDetail) openDetail(currentDetail);
      if (currentEventDetail) openEventDetail(currentEventDetail);
      if (document.getElementById('onboardingOverlay')?.style.display !== 'none') renderOnboardingSlide();
    });
  });
}

function applyLanguage() {
  // Brand
  document.getElementById('brandSubtitle').textContent = t('appSubtitle');
  // Search
  document.getElementById('searchInput').placeholder = t('searchPlaceholder');
  const gsInput = document.getElementById('globalSearchInput');
  if (gsInput) gsInput.placeholder = t('globalSearchPlaceholder');
  // Tabs (set the label span, not the whole button — it also holds the .tab-ic icon)
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    const key = 'tab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    const label = tab.querySelector('.tab-label');
    if (label) label.textContent = t(key);
  });
  // Category label
  const catLabel = document.querySelector('.sidebar-categories .section-label');
  if (catLabel) catLabel.textContent = t('catLabel');
  // Category names
  const catTexts = {
    'all': 'catAll', 'Ristoranti Romantici': 'catRomantici',
    'Caffè & Bistrot': 'catCaffe', 'Oasi Segrete': 'catOasi',
    'Cascine': 'catCascine', 'Aperitivi': 'catAperitivi',
    'Botteghe': 'catBotteghe', 'Hamburger': 'catHamburger',
    'Cena tra Amici': 'catCena', 'Brunch & Colazioni': 'catBrunch',
    'Merende': 'catMerende', 'fav': 'catFav'
  };
  document.querySelectorAll('.cat-item').forEach(item => {
    const key = catTexts[item.dataset.cat];
    if (key) item.querySelector('.cat-text').textContent = t(key);
  });
  // Mood Matcher discoverability hint
  const moodMatcherHintText = document.getElementById('moodMatcherHintText');
  if (moodMatcherHintText) moodMatcherHintText.textContent = t('moodMatcherHint');
  // Tab intros
  const iIntro = document.querySelector('#tabItinerari .tab-intro');
  if (iIntro) { iIntro.querySelector('h3').textContent = t('itinerariTitle'); iIntro.querySelector('p').textContent = t('itinerariDesc'); }
  // My Day Plan
  const myDayBtnTitle = document.getElementById('myDayBtnTitle');
  if (myDayBtnTitle) myDayBtnTitle.textContent = t('myDayBtnTitle');
  updateMyDayBtnPreview(); // re-renders myDayBtnSub — either the generic prompt or the live plan preview
  const myDayTitleEl = document.getElementById('myDayTitle');
  if (myDayTitleEl) myDayTitleEl.textContent = t('myDayTitle');
  const myDaySubEl = document.getElementById('myDaySub');
  if (myDaySubEl) myDaySubEl.textContent = t('myDaySub');
  const myDayShowMapLabel = document.getElementById('myDayShowMapLabel');
  if (myDayShowMapLabel) myDayShowMapLabel.textContent = t('myDayShowMap');
  const myDayShareLabel = document.getElementById('myDayShareLabel');
  if (myDayShareLabel) myDayShareLabel.textContent = t('myDayShare');
  const pepiteMyDayHintText = document.getElementById('pepiteMyDayHintText');
  if (pepiteMyDayHintText) pepiteMyDayHintText.textContent = t('myDayHint');
  const eventiMyDayHintText = document.getElementById('eventiMyDayHintText');
  if (eventiMyDayHintText) eventiMyDayHintText.textContent = t('myDayHint');
  const tabBtnStorie = document.getElementById('tabBtnStorie')?.querySelector('.tab-label');
  if (tabBtnStorie) tabBtnStorie.textContent = t('storieTab');
  const storieTabTitle = document.getElementById('storieTabTitle');
  if (storieTabTitle) storieTabTitle.textContent = t('storieTitle');
  const storieTabDesc = document.getElementById('storieTabDesc');
  if (storieTabDesc) storieTabDesc.textContent = t('storieDesc');

  // "Aperto ora" pill label
  const openNowPillLbl = document.getElementById('openNowPillLabel');
  if (openNowPillLbl) openNowPillLbl.textContent = t('openNow');
  // Near me button
  const nearMeLbl = document.getElementById('nearMeBtnLabel');
  if (nearMeLbl) nearMeLbl.textContent = t(nearMeActive ? 'nearMeActive' : 'nearMe');
  // Events search & filters
  const evSearch = document.getElementById('eventiSearchInput');
  if (evSearch) evSearch.placeholder = t('eventiSearchPlaceholder');
  const evFilterAll = document.querySelector('.eventi-filter-btn[data-badge="all"]');
  if (evFilterAll) evFilterAll.textContent = t('eventiFilterAll');
  // Install banner
  const installSpan = document.querySelector('#installBanner span');
  if (installSpan) installSpan.textContent = t('install');
  const installBtn = document.getElementById('installBtn');
  if (installBtn) installBtn.textContent = t('installBtn');
  // Detail panel buttons
  const shareBtn = document.getElementById('detailShareBtn');
  if (shareBtn) { const svgShare = shareBtn.querySelector('svg'); shareBtn.textContent = ''; if (svgShare) shareBtn.appendChild(svgShare); shareBtn.append(' ' + t('share')); }
  const dirBtn = document.getElementById('detailDirectionsBtn');
  if (dirBtn) { const svgDir = dirBtn.querySelector('svg'); dirBtn.textContent = ''; if (svgDir) dirBtn.appendChild(svgDir); dirBtn.append(' ' + t('directions')); }
}

// ── Distance helpers ──
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
function formatDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Helper: get localized description
function getDesc(p) { return currentLang === 'en' ? (p.descrizione_en || p.descrizione) : p.descrizione; }
function getCat(p) { return currentLang === 'en' ? (p.categoria_en || p.categoria) : p.categoria; }

// ── Fonti (source links) helpers ──────────────────────────────
// Thin SVG icons (Lucide-style, stroke=2, 24×24 viewBox)
const _FONTE_ICONS = {
  web: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
  tripadvisor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>`,
};

/** Classify a URL into { type, label } for icon rendering.
 *  Returns null if the URL is unparseable. */
function _classifyFonte(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (h === 'instagram.com'  || h.endsWith('.instagram.com'))  return { type: 'instagram',   label: 'Instagram'   };
    if (h === 'facebook.com'   || h.endsWith('.facebook.com'))   return { type: 'facebook',    label: 'Facebook'    };
    if (h.startsWith('tripadvisor.'))                            return { type: 'tripadvisor', label: 'TripAdvisor' };
    return { type: 'web', label: currentLang === 'en' ? 'Website' : 'Sito web' };
  } catch { return null; }
}

/** Render fonti chips into #detailFonti; hides the container if no sources. */
function renderFonti(fontiRaw) {
  const el = document.getElementById('detailFonti');
  if (!el) return;

  let urls = [];
  try { urls = JSON.parse(fontiRaw || '[]'); } catch { urls = []; }
  // Validate: keep only parseable, non-empty strings
  urls = urls.filter(u => { try { new URL(u); return true; } catch { return false; } });

  if (urls.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }

  el.innerHTML = urls.map(url => {
    const meta = _classifyFonte(url);
    if (!meta) return '';
    return `<a class="fonte-chip fonte-${meta.type}"
               href="${escapeHtml(url)}"
               target="_blank"
               rel="noopener noreferrer"
               aria-label="${meta.label}">
      ${_FONTE_ICONS[meta.type] || _FONTE_ICONS.web}
      <span>${meta.label}</span>
    </a>`;
  }).filter(Boolean).join('');

  el.style.display = '';
}

// ── Get Filtered Pepite ──
function getFiltered() {
  let list = [...pepite];

  // Category filter
  if (currentFilter === 'fav') {
    list = list.filter(p => p.salvato);
  } else if (currentFilter !== 'all') {
    list = list.filter(p => p.categoria === currentFilter);
  }

  // Search filter
  const query = normalizeSearch(document.getElementById('searchInput')?.value.trim());
  if (query && query.length >= 2) {
    list = list.filter(p =>
      normalizeSearch(p.nome).includes(query) ||
      normalizeSearch(p.quartiere).includes(query) ||
      normalizeSearch(p.categoria).includes(query)
    );
  }

  // "Aperto ora" filter
  if (filterOpenNow) {
    list = list.filter(p => isOpenNow(p) === true);
  }

  // Sort by distance when "Near me" is active
  if (nearMeActive && userLocation) {
    list.sort((a, b) => {
      const dA = (a.lat && a.lng) ? haversineKm(userLocation.lat, userLocation.lng, a.lat, a.lng) : Infinity;
      const dB = (b.lat && b.lng) ? haversineKm(userLocation.lat, userLocation.lng, b.lat, b.lng) : Infinity;
      return dA - dB;
    });
  }

  return list;
}

// ── Category Counts ── (single-pass reduce instead of 11 separate .filter() calls)
function updateCategoryCounts() {
  const counts = pepite.reduce((acc, p) => {
    acc[p.categoria] = (acc[p.categoria] || 0) + 1;
    if (p.salvato) acc._fav = (acc._fav || 0) + 1;
    return acc;
  }, {});
  document.getElementById('countAll').textContent       = pepite.length;
  document.getElementById('countRomantici').textContent = counts['Ristoranti Romantici'] || 0;
  document.getElementById('countCaffe').textContent     = counts['Caffè & Bistrot']       || 0;
  document.getElementById('countOasi').textContent      = counts['Oasi Segrete']          || 0;
  document.getElementById('countCascine').textContent   = counts['Cascine']               || 0;
  document.getElementById('countAperitivi').textContent = counts['Aperitivi']             || 0;
  document.getElementById('countBotteghe').textContent  = counts['Botteghe']              || 0;
  document.getElementById('countHamburger').textContent = counts['Hamburger']             || 0;
  document.getElementById('countCena').textContent      = counts['Cena tra Amici']        || 0;
  document.getElementById('countBrunch').textContent    = counts['Brunch & Colazioni']    || 0;
  document.getElementById('countMerende').textContent   = counts['Merende']               || 0;
  document.getElementById('countFav').textContent       = counts._fav || 0;
}

// ── Render Pepite List ──
function renderPepiteList() {
  const list = document.getElementById('pepiteList');
  const filtered = getFiltered();

  // Update header
  const titles = {
    'all': t('listAll'),
    'fav': t('catFav'),
    'Ristoranti Romantici': '🕯️ ' + t('catRomantici'),
    'Caffè & Bistrot': '☕ ' + t('catCaffe'),
    'Oasi Segrete': '🌿 ' + t('catOasi'),
    'Aperitivi': '🍸 ' + t('catAperitivi'),
    'Botteghe': '🎨 ' + t('catBotteghe'),
    'Cascine': '🏡 ' + t('catCascine'),
    'Hamburger': '🍔 ' + t('catHamburger'),
    'Cena tra Amici': '👫 ' + t('catCena'),
    'Brunch & Colazioni': '🥐 ' + t('catBrunch'),
    'Merende': '🍦 ' + t('catMerende')
  };
  document.getElementById('listTitle').textContent = titles[currentFilter] || 'Pepite';
  document.getElementById('listCount').textContent = t('results', filtered.length);

  // Point Preferiti visitors at the day-plan builder
  const pepiteMyDayHint = document.getElementById('pepiteMyDayHint');
  if (pepiteMyDayHint) pepiteMyDayHint.style.display = (currentFilter === 'fav' && filtered.length > 0) ? 'flex' : 'none';

  if (filtered.length === 0) {
    const query   = document.getElementById('searchInput')?.value.trim() || '';
    const queryEsc = escapeHtml(query);
    const isEn    = currentLang === 'en';
    const catLabel = currentFilter !== 'all'
      ? escapeHtml((titles[currentFilter] || currentFilter).replace(/^[^\w]+/, '').trim())
      : '';
    let msg, sub;
    if (query && catLabel) {
      msg = isEn ? `No "${catLabel}" for "${queryEsc}"` : `Nessuna ${catLabel} per "${queryEsc}"`;
      sub = isEn ? 'Try removing the search or changing category.' : 'Prova a rimuovere la ricerca o cambiare categoria.';
    } else if (query) {
      msg = isEn ? `No results for "${queryEsc}"` : `Nessun risultato per "${queryEsc}"`;
      sub = isEn ? 'Try a different search term.' : 'Prova con un termine diverso.';
    } else if (catLabel) {
      msg = isEn ? `No ${catLabel} found` : `Nessuna ${catLabel} trovata`;
      sub = isEn ? 'Try another category or remove filters.' : 'Prova un\'altra categoria o rimuovi i filtri.';
    } else {
      msg = t('emptyTitle'); sub = t('emptyText');
    }
    list.innerHTML = `
      <div class="pepite-list-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <h4>${msg}</h4>
        <p>${sub}</p>
        <button class="empty-reset-btn">${isEn ? 'Reset filters' : 'Rimuovi filtri'}</button>
      </div>`;
    list.querySelector('.empty-reset-btn').addEventListener('click', () => {
      currentFilter = 'all';
      filterOpenNow = false;
      safeLocalStorageSet('pepite_filter', 'all');
      safeLocalStorageSet('pepite_open_now', false);
      document.getElementById('openNowPill')?.classList.remove('active');
      document.getElementById('searchInput').value = '';
      document.querySelectorAll('.cat-item').forEach(i => i.classList.toggle('active', i.dataset.cat === 'all'));
      renderPepiteList();
      renderMarkers();
    });
    return;
  }

  list.innerHTML = filtered.map(p => {
    const isActive = currentDetail && currentDetail.id === p.id;
    const openState = isOpenNow(p);
    const openBadge = openState === true
      ? `<span class="open-badge">${t('openNow')}</span>`
      : '';
    const distBadge = (nearMeActive && userLocation && p.lat && p.lng)
      ? `<span class="dist-badge">📍 ${formatDist(haversineKm(userLocation.lat, userLocation.lng, p.lat, p.lng))}</span>`
      : '';
    return `
      <div class="pepita-item${isActive ? ' active' : ''}" data-id="${p.id}" role="button" tabindex="0" aria-label="${escapeHtml(p.nome)}">
        ${_pictureHtml(p.immagine, p.nome, 'pepita-item-img')}
        <div class="pepita-item-info">
          <h4>${escapeHtml(p.nome)}</h4>
          <span class="pepita-zone">${escapeHtml(p.quartiere)} · ${categoryEmoji[p.categoria] || '✨'} ${escapeHtml(getCat(p).split(' ')[0])}${openBadge}</span>
          ${distBadge}
        </div>
        <button class="pepita-save-btn${p.salvato ? ' saved' : ''}" data-id="${p.id}" title="${p.salvato ? t('unsave') : t('save')}">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="${p.salvato ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>`;
  }).join('');

  // Attach IntersectionObserver to lazy-load newly rendered images
  setupImgLazyLoad();
}

// ── Marker Icon Factory ──
/** Creates a Leaflet divIcon using the shared pepite style. */
function makeMarkerIcon(emoji, isActive) {
  return L.divIcon({
    className: 'pepite-marker',
    html: `<div style="
      background:${isActive ? '#C4A882' : '#FFF'};
      border:2px solid ${isActive ? '#1A1A1A' : '#E5E4E1'};
      border-radius:50%;
      width:${isActive ? '40px' : '34px'};
      height:${isActive ? '40px' : '34px'};
      display:flex;align-items:center;justify-content:center;
      font-size:${isActive ? '16px' : '14px'};
      box-shadow:0 2px 8px rgba(0,0,0,${isActive ? '0.25' : '0.12'});
      transition: all 0.3s ease;
    ">${emoji}</div>`,
    iconSize:   [isActive ? 40 : 34, isActive ? 40 : 34],
    iconAnchor: [isActive ? 20 : 17, isActive ? 20 : 17]
  });
}

/** Swap icons on only the two affected markers instead of rebuilding the entire cluster.
 *  Call with the new pepita to activate, or null to deactivate everything. */
function refreshActiveMarker(newPepita) {
  // Deactivate the previously highlighted marker
  if (activeMarker) {
    const oldP = pepite.find(x => x.id === activeMarker._pepitaId);
    if (oldP) activeMarker.setIcon(makeMarkerIcon(categoryEmoji[oldP.categoria] || '✨', false));
    activeMarker = null;
  }
  // Activate the new marker
  if (newPepita) {
    const m = markers.find(x => x._pepitaId === newPepita.id);
    if (m) {
      m.setIcon(makeMarkerIcon(categoryEmoji[newPepita.categoria] || '✨', true));
      activeMarker = m;
    }
  }
}

// ── Leaflet Map ──
function initMap() {
  map = L.map('map', { zoomControl: false }).setView([45.4642, 9.1900], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19
  }).addTo(map);

  renderMarkers();
  setupMapResizeHandling();
}

/**
 * Leaflet measures its container once at construction time and never re-checks on its own.
 * If the real size of #map changes afterward — window/split-view resize, orientation change,
 * a mobile browser's toolbar collapsing, web fonts swapping in — the tile grid stays stuck at
 * the old size, leaving the map rendered narrow with blank space next to it. Keep it in sync.
 */
function setupMapResizeHandling() {
  let resizeTimer = null;
  const scheduleInvalidate = (delay = 150) => {
    if (!map) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => map.invalidateSize(), delay);
  };

  window.addEventListener('resize', () => scheduleInvalidate());
  window.visualViewport?.addEventListener('resize', () => scheduleInvalidate());

  // Safety net for the first load: catch any layout settling that happens after
  // construction (splash screen removal, web font swap-in, iOS toolbar settling).
  document.fonts?.ready?.then(() => scheduleInvalidate(50));
  setTimeout(() => scheduleInvalidate(0), 1600); // just after the splash finishes hiding
}

function renderMarkers() {
  if (!map) return;

  // Map is currently showing event markers — don't rebuild pepite layer
  if (currentMapMode === 'eventi') return;

  // Skip rebuild if filter/search/quartiere/openNow and data haven't changed
  const _key = `${currentFilter}|${document.getElementById('searchInput')?.value.trim() ?? ''}|${currentQuartiereFilter ?? ''}|${pepite.length}|${filterOpenNow}`;
  if (markerCluster && _key === _lastMarkersKey) return;
  _lastMarkersKey = _key;

  // Remove old cluster group
  if (markerCluster) { map.removeLayer(markerCluster); markerCluster = null; }
  markers = [];
  activeMarker = null; // reset tracking on full rebuild

  let filtered = getFiltered();
  if (currentQuartiereFilter) {
    filtered = filtered.filter(p => p.quartiere === currentQuartiereFilter);
  }

  markerCluster = L.markerClusterGroup({
    maxClusterRadius: 48,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: 'pepite-cluster',
        html: `<div class="cluster-inner"><span>${count}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
    }
  });

  filtered.forEach(p => {
    if (!p.lat || !p.lng) return;
    const emoji = categoryEmoji[p.categoria] || '✨';
    const isActive = currentDetail && currentDetail.id === p.id;

    const icon = makeMarkerIcon(emoji, isActive);

    const marker = L.marker([p.lat, p.lng], { icon })
      .on('click', () => openDetail(p));

    marker.bindTooltip(escapeHtml(p.nome), {
      direction: 'top',
      offset: [0, -20],
      className: 'pepite-tooltip'
    });

    marker._pepitaId = p.id;
    if (isActive) activeMarker = marker; // track for refreshActiveMarker
    markers.push(marker);
    markerCluster.addLayer(marker);
  });

  map.addLayer(markerCluster);
}

// ── Sidebar Mobile Toggle / Bottom Sheet ──
// On mobile the sidebar is a bottom sheet anchored to the map (not an off-canvas
// panel): it has three drag/tap snap heights so the map is never fully hidden.
// "peek" is a fixed pixel height; "editorial"/"list" are ratios of viewport height
// so the sheet adapts to different phone sizes.
const SHEET_SNAPS = { peek: 200, editorial: 0.55, list: 0.84 };
let _sheetState = 'editorial';

function _isMobileSheet() {
  return window.innerWidth <= 768;
}

/** Height of the fixed bottom tab bar on mobile (0 on desktop, where it's an in-flow rail). */
function _tabBarHeightPx() {
  if (!_isMobileSheet()) return 0;
  return document.getElementById('appTabbar')?.getBoundingClientRect().height || 0;
}

/** Keeps --tabbar-h in sync so the sheet's CSS `bottom` offset always clears the tab bar. */
function _syncTabBarHeightVar() {
  document.documentElement.style.setProperty('--tabbar-h', _tabBarHeightPx() + 'px');
}

function _snapHeightPx(name) {
  const v = SHEET_SNAPS[name];
  if (v > 1) return v; // 'peek' is an absolute pixel height, independent of the tab bar
  const available = window.innerHeight - _tabBarHeightPx();
  return Math.round(available * v);
}

/** Snap the mobile sheet to one of its three heights (no-op on desktop). */
function snapSheetTo(name, animate = true) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || !_isMobileSheet()) return;
  _sheetState = name;
  if (!animate) sidebar.classList.add('dragging'); // reused as a "no transition" flag
  sidebar.style.height = _snapHeightPx(name) + 'px';
  if (!animate) {
    void sidebar.offsetHeight; // flush the height change before re-enabling transitions
    sidebar.classList.remove('dragging');
  }
  // The visible map area changes with the sheet height — Leaflet needs telling.
  if (map) setTimeout(() => map.invalidateSize(), 340);
}

function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');

  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => snapSheetTo('list'));
  document.getElementById('sidebarClose')?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);

  // Mobile search button opens the cross-domain global search directly — it's a
  // superset of the per-tab search and needs no extra tap through the hamburger menu.
  document.getElementById('mobileSearchBtn')?.addEventListener('click', openGlobalSearch);

  setupMobileSheetDrag(sidebar);
}

function setupMobileSheetDrag(sidebar) {
  const handle = document.getElementById('sheetHandleMobile');
  if (!sidebar || !handle) return;

  _syncTabBarHeightVar();
  let dragging = false, startY = 0, startH = 0;

  handle.addEventListener('touchstart', (e) => {
    if (!_isMobileSheet()) return;
    dragging = true;
    startY  = e.touches[0].clientY;
    startH  = sidebar.getBoundingClientRect().height;
    sidebar.classList.add('dragging');
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dy  = startY - e.touches[0].clientY; // dragging up → positive → taller sheet
    const min = _snapHeightPx('peek');
    const max = _snapHeightPx('list');
    sidebar.style.height = Math.min(max, Math.max(min, startH + dy)) + 'px';
  }, { passive: true });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    sidebar.classList.remove('dragging');
    const h = sidebar.getBoundingClientRect().height;
    let best = 'peek', bestD = Infinity;
    for (const name of Object.keys(SHEET_SNAPS)) {
      const d = Math.abs(h - _snapHeightPx(name));
      if (d < bestD) { bestD = d; best = name; }
    }
    snapSheetTo(best, true);
  }
  handle.addEventListener('touchend', endDrag, { passive: true });
  handle.addEventListener('touchcancel', endDrag, { passive: true });

  // Crossing the mobile/desktop breakpoint: drop the inline height on desktop so the
  // normal in-flow sidebar CSS takes back over; re-snap if returning to mobile width.
  window.addEventListener('resize', () => {
    _syncTabBarHeightVar();
    if (!_isMobileSheet()) {
      sidebar.style.height = '';
      sidebar.style.transition = '';
    } else if (!sidebar.style.height) {
      snapSheetTo(_sheetState, false);
    }
  });

  if (_isMobileSheet()) snapSheetTo('editorial', false);
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('active');
  snapSheetTo('peek');
}

// ── Event Map Markers ──

function clearEventiMarkers() {
  if (eventiMarkersLayer && map) {
    map.removeLayer(eventiMarkersLayer);
    eventiMarkersLayer = null;
  }
  if (_evActiveLayer && map) {
    map.removeLayer(_evActiveLayer);
    _evActiveLayer = null;
  }
}

// ── Debounced marker rebuild ──
// Use instead of bare renderMarkers() in programmatic/non-interactive paths
// (tab switches, itinerary close, deep links) to coalesce rapid calls.
function scheduleMarkers(delay = 150) {
  clearTimeout(_markerTimer);
  _markerTimer = setTimeout(renderMarkers, delay);
}

/** Render event markers at quartiere centroids.
 *  @param {number} [activeId]  – event id to highlight (active state) */
function renderEventiMarkers(activeId) {
  if (!map) return;
  // Never add event markers while the map is in pepite mode.
  // (The _evMarkerTimer debounce can fire after a tab switch — this guard stops it.)
  if (currentMapMode !== 'eventi') return;
  clearEventiMarkers();

  const filtered = getFilteredEventi();
  if (filtered.length === 0) return;

  eventiMarkersLayer = L.markerClusterGroup({
    maxClusterRadius: 48,
    showCoverageOnHover: false,
    iconCreateFunction: (cluster) => {
      const count = cluster.getChildCount();
      return L.divIcon({
        className: 'pepite-cluster',
        html: `<div class="cluster-inner"><span>${count}</span></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });
    }
  });
  const bounds = [];

  filtered.forEach(ev => {
    let pos;
    if (ev.lat && ev.lng) {
      // Precise event coordinates — use directly
      pos = [ev.lat, ev.lng];
    } else {
      // Fallback 1: quartiere centroid; Fallback 2: Milan city centre
      const MILAN_CENTER = [45.4641, 9.1919];
      const base = quartiereCoords[ev.quartiere] || MILAN_CENTER;
      const jLat = ((ev.id * 113 + 31) % 400 - 200) / 100000;
      const jLng = ((ev.id *  97 + 53) % 400 - 200) / 100000;
      pos = [base[0] + jLat, base[1] + jLng];
    }
    bounds.push(pos);

    const emoji    = eventBadgeEmoji[ev.badge] || '📌';
    const isActive = ev.id === activeId;
    const icon = L.divIcon({
      className: 'pepite-marker',
      html: `<div style="
        background:${isActive ? '#C4A882' : '#FFF'};
        border:2px solid ${isActive ? '#1A1A1A' : '#E5E4E1'};
        border-radius:50%;
        width:${isActive ? '40px' : '34px'};
        height:${isActive ? '40px' : '34px'};
        display:flex;align-items:center;justify-content:center;
        font-size:${isActive ? '16px' : '14px'};
        box-shadow:0 2px 8px rgba(0,0,0,${isActive ? '0.25' : '0.12'});
        transition: all 0.3s ease;
      ">${emoji}</div>`,
      iconSize: [isActive ? 40 : 34, isActive ? 40 : 34],
      iconAnchor: [isActive ? 20 : 17, isActive ? 20 : 17]
    });

    const marker = L.marker(pos, { icon });
    const isEn  = currentLang === 'en';
    const title = (isEn ? (ev.titolo_en || ev.titolo) : ev.titolo) || '';
    const dateLabel = (ev._dateDisplay || ev.giorno) + ' ' + ev.mese;
    marker.bindTooltip(`${escapeHtml(title)} · ${escapeHtml(dateLabel)}`,
      { direction: 'top', offset: [0, -22], className: 'pepite-tooltip' });
    marker.on('click', () => openEventDetail(ev));

    if (isActive) {
      // Active marker goes in a separate non-clustered layer so it's always visible
      if (!_evActiveLayer) _evActiveLayer = L.layerGroup();
      _evActiveLayer.addLayer(marker);
    } else {
      eventiMarkersLayer.addLayer(marker);
    }
  });

  map.addLayer(eventiMarkersLayer);
  if (_evActiveLayer) map.addLayer(_evActiveLayer); // rendered on top, never clustered

  // Fit bounds on first render (no active highlight)
  if (!activeId && bounds.length > 0) {
    map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 14 });
  }
}

// ── Eventi List — delegated click + infinite-scroll (set up once) ──
function setupEventiList() {
  const list = document.getElementById('eventiList');
  if (!list) return;
  list.addEventListener('click', e => {
    // Save button — stop propagation so card click doesn't fire
    const saveBtn = e.target.closest('.evento-save-btn');
    if (saveBtn) {
      e.stopPropagation();
      // Prefer the grouped item from _evAllItems (carries _days for multi-day sync)
      const id = +saveBtn.dataset.eid;
      const ev = _evAllItems.find(x => x.id === id) || eventi.find(x => x.id === id);
      if (ev) toggleEventSave(ev);
      return;
    }
    // Card click — prefer grouped event (has _days, _dateDisplay)
    const card = e.target.closest('.evento-card');
    if (!card) return;
    const id = +card.dataset.id;
    const ev = _evAllItems.find(x => x.id === id) || eventi.find(x => x.id === id);
    if (ev) openEventDetail(ev);
  });
  // Keyboard activation — the save button is a native <button> and already
  // fires 'click' on Enter/Space on its own; only the card div (role="button") needs this.
  list.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.evento-card');
    if (!card || e.target.closest('.evento-save-btn')) return;
    e.preventDefault();
    const id = +card.dataset.id;
    const ev = _evAllItems.find(x => x.id === id) || eventi.find(x => x.id === id);
    if (ev) openEventDetail(ev);
  });
}

// ── Pepite List — delegated click (set up once, survives re-renders) ──
function setupPepiteList() {
  const list = document.getElementById('pepiteList');
  if (!list) return;
  list.addEventListener('click', e => {
    // Save button — toggle without opening detail
    const saveBtn = e.target.closest('.pepita-save-btn');
    if (saveBtn) {
      e.stopPropagation();
      const p = pepite.find(x => x.id === +saveBtn.dataset.id);
      if (p) {
        toggleSave(p);
        // Update button visually without full re-render
        saveBtn.classList.toggle('saved', p.salvato);
        saveBtn.title = p.salvato ? t('unsave') : t('save');
        saveBtn.querySelector('svg').setAttribute('fill', p.salvato ? 'currentColor' : 'none');
      }
      return;
    }
    // Card click — open detail
    const item = e.target.closest('.pepita-item');
    if (!item) return;
    const p = pepite.find(x => x.id === +item.dataset.id);
    if (p) {
      openDetail(p); // flyTo + uncluster handled inside openDetail
      closeSidebar();
    }
  });
  // Keyboard activation — the save button is a native <button> and already
  // fires 'click' on Enter/Space on its own; only the card div (role="button") needs this.
  list.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.pepita-item');
    if (!item || e.target.closest('.pepita-save-btn')) return;
    e.preventDefault();
    const p = pepite.find(x => x.id === +item.dataset.id);
    if (p) {
      openDetail(p);
      closeSidebar();
    }
  });
}

// ── Lazy image loader ──
const _IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'%3E%3Crect width='4' height='3' fill='%23EDE0D4'/%3E%3C/svg%3E";

/**
 * Derive a WebP URL from a JPEG/PNG URL by swapping the extension.
 * Returns the same URL unchanged if it's a data-URI or already .webp.
 */
function _webpUrl(url) {
  if (!url || url.startsWith('data:')) return url;
  return url.replace(/\.(jpe?g|png)(\?.*)?$/i, '.webp$2');
}

/**
 * Build a <picture> element string that offers a WebP source with lazy loading
 * and falls back to the original JPEG/PNG <img>.
 *
 * @param {string}  src       – original image URL
 * @param {string}  alt       – img alt text
 * @param {string}  className – CSS class(es) for the <img>
 * @param {string}  [extra]   – extra attributes for the <img> tag (e.g. loading="lazy")
 */
function _pictureHtml(src, alt, className, extra = '') {
  const webp = _webpUrl(src);
  const hasFallback = webp !== src; // only add <source> if URL actually differs
  return `<picture>${
    hasFallback
      ? `<source type="image/webp" data-srcset="${escapeHtml(webp)}">`
      : ''
  }<img class="${className}" src="${_IMG_PLACEHOLDER}" data-src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" ${extra}></picture>`;
}

function setupImgLazyLoad() {
  if (!('IntersectionObserver' in window)) {
    // Fallback: swap data-src → src and data-srcset → srcset immediately
    document.querySelectorAll('.pepita-item-img[data-src]').forEach(img => {
      const src = img.dataset.src;
      if (src) { img.src = src; img.removeAttribute('data-src'); }
      const source = img.previousElementSibling;
      if (source?.tagName === 'SOURCE' && source.dataset.srcset) {
        source.srcset = source.dataset.srcset;
        source.removeAttribute('data-srcset');
      }
    });
    return;
  }
  if (_imgObserver) _imgObserver.disconnect();
  _imgObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      // Swap <source data-srcset> → srcset (WebP)
      const source = img.previousElementSibling;
      if (source?.tagName === 'SOURCE' && source.dataset.srcset) {
        source.srcset = source.dataset.srcset;
        source.removeAttribute('data-srcset');
      }
      // Swap <img data-src> → src (JPEG fallback)
      const src = img.dataset.src;
      if (src) { img.src = src; img.removeAttribute('data-src'); }
      _imgObserver.unobserve(img);
    });
  }, { rootMargin: '150px 0px' }); // preload 150px before entering viewport

  document.querySelectorAll('.pepita-item-img[data-src]').forEach(img => {
    _imgObserver.observe(img);
  });
}

// ── Search ──
function setupPepiteScrollTop() {
  const btn = document.getElementById('pepiteScrollTop');
  const scroller = document.querySelector('#tabPepite .tab-scroll');
  if (!btn || !scroller) return;

  // Show button only when scrolled down
  scroller.addEventListener('scroll', () => {
    btn.classList.toggle('visible', scroller.scrollTop > 120);
  }, { passive: true });

  btn.addEventListener('click', () => {
    navigator.vibrate?.(20);
    scroller.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

// ── Near Me ──
function setupNearMe() {
  const btn = document.getElementById('nearMeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    navigator.vibrate?.(30);
    if (nearMeActive) { clearNearMe(); return; }
    if (!navigator.geolocation) {
      showNearMeToast(t('nearMeUnsupported')); return;
    }
    btn.classList.add('loading');
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        btn.classList.remove('loading');
        btn.disabled = false;
        setNearMe(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        btn.classList.remove('loading');
        btn.disabled = false;
        showNearMeToast(t('nearMeError'));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function setNearMe(lat, lng) {
  userLocation = { lat, lng };
  nearMeActive = true;
  navigator.vibrate?.(40);

  // User dot on map
  if (userLocationMarker && map) map.removeLayer(userLocationMarker);
  if (map) {
    userLocationMarker = L.circleMarker([lat, lng], {
      radius: 9, color: '#fff', weight: 3,
      fillColor: '#3b82f6', fillOpacity: 1
    }).addTo(map);
    userLocationMarker.bindTooltip(t('nearMeYouAreHere'), {
      direction: 'top', offset: [0, -12], className: 'pepite-tooltip'
    });
    map.flyTo([lat, lng], 15, { duration: 1.2 });
  }

  const btn = document.getElementById('nearMeBtn');
  if (btn) { btn.classList.add('active'); }
  const lbl = document.getElementById('nearMeBtnLabel');
  if (lbl) lbl.textContent = t('nearMeActive');

  renderPepiteList();
  // Near Me also sorts/badges eventi by distance (falls back to quartiere centroid)
  if (eventiLoaded) renderEventi();
}

function clearNearMe() {
  nearMeActive = false;
  userLocation = null;
  if (userLocationMarker && map) { map.removeLayer(userLocationMarker); userLocationMarker = null; }

  const btn = document.getElementById('nearMeBtn');
  if (btn) btn.classList.remove('active');
  const lbl = document.getElementById('nearMeBtnLabel');
  if (lbl) lbl.textContent = t('nearMe');

  renderPepiteList();
  if (eventiLoaded) renderEventi();
}

function showNearMeToast(msg) {
  let toast = document.getElementById('nearMeToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nearMeToast';
    toast.className = 'near-me-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  let debounceTimer;

  const toggleClear = () => {
    clearBtn.classList.toggle('visible', input.value.length > 0);
  };

  input.addEventListener('input', () => {
    toggleClear();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderPepiteList();
      renderMarkers();
    }, 200);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    toggleClear();
    renderPepiteList();
    renderMarkers();
    input.focus();
  });
}

// ── Category Filters ──
function setupFilters() {
  // "Aperto ora" pill — restore persisted state
  const openNowPill = document.getElementById('openNowPill');
  if (openNowPill) {
    openNowPill.classList.toggle('active', filterOpenNow); // sync on load
    openNowPill.addEventListener('click', () => {
      navigator.vibrate?.(30);
      filterOpenNow = !filterOpenNow;
      openNowPill.classList.toggle('active', filterOpenNow);
      safeLocalStorageSet('pepite_open_now', filterOpenNow);
      _lastMarkersKey = null; // force marker rebuild
      renderPepiteList();
      renderMarkers();
    });
  }

  // Restore active category from persisted state
  document.querySelectorAll('.cat-item').forEach(i =>
    i.classList.toggle('active', i.dataset.cat === currentFilter));

  document.querySelectorAll('.cat-item').forEach(item => {
    item.addEventListener('click', () => {
      navigator.vibrate?.(40);
      document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentFilter = item.dataset.cat;
      safeLocalStorageSet('pepite_filter', currentFilter);
      renderPepiteList();
      renderMarkers();

      // Fit map to filtered bounds
      const filtered = getFiltered().filter(p => p.lat && p.lng);
      if (map && filtered.length > 0) {
        const bounds = L.latLngBounds(filtered.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds.pad(0.15), { duration: 0.8 });
      }
    });
  });
}

// ── Map Controls ──
function setupMapControls() {
  // Locate me
  document.getElementById('btnLocateMe')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnLocateMe');

    if (!('geolocation' in navigator)) {
      alert(currentLang === 'it'
        ? 'La geolocalizzazione non è supportata dal tuo browser.'
        : 'Geolocation is not supported by your browser.');
      return;
    }

    // Check if we're on a secure context (HTTPS) — required for geolocation on mobile
    if (window.isSecureContext === false) {
      alert(currentLang === 'it'
        ? 'La geolocalizzazione richiede una connessione sicura (HTTPS). Prova ad accedere tramite HTTPS.'
        : 'Geolocation requires a secure connection (HTTPS). Try accessing via HTTPS.');
      return;
    }

    // Check permissions if API available
    if (navigator.permissions) {
      try {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'denied') {
          alert(currentLang === 'it'
            ? 'L\'accesso alla posizione è stato bloccato. Abilita la geolocalizzazione nelle impostazioni del browser.'
            : 'Location access has been blocked. Enable geolocation in your browser settings.');
          return;
        }
      } catch (e) { /* permissions API not fully supported, continue */ }
    }

    // Visual feedback: pulsing state
    btn.classList.add('locating');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.classList.remove('locating');
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Remove previous user marker
        if (window._userLocationMarker) {
          map.removeLayer(window._userLocationMarker);
        }

        // Add user location marker
        const userIcon = L.divIcon({
          className: 'user-location-marker',
          html: '<div class="user-dot"><div class="user-dot-ping"></div></div>',
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        window._userLocationMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);

        map.flyTo([lat, lng], 15, { duration: 1 });
      },
      (err) => {
        btn.classList.remove('locating');
        console.warn('Geolocation error:', err.code, err.message);
        const msgs = {
          1: currentLang === 'it'
            ? 'Permesso di geolocalizzazione negato. Abilitalo nelle impostazioni del browser.'
            : 'Geolocation permission denied. Enable it in your browser settings.',
          2: currentLang === 'it'
            ? 'Impossibile determinare la posizione. Controlla il GPS e riprova.'
            : 'Unable to determine position. Check GPS and try again.',
          3: currentLang === 'it'
            ? 'Tempo scaduto per la geolocalizzazione. Riprova.'
            : 'Geolocation timed out. Please try again.'
        };
        alert(msgs[err.code] || (currentLang === 'it' ? 'Errore di geolocalizzazione.' : 'Geolocation error.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });

  // Mood Matcher (was "Surprise me")
  document.getElementById('btnSurprise')?.addEventListener('click', openMoodMatcher);

  // Reset view
  document.getElementById('btnResetView')?.addEventListener('click', () => {
    const filtered = getFiltered().filter(p => p.lat && p.lng);
    if (map && filtered.length > 0) {
      const bounds = L.latLngBounds(filtered.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds.pad(0.1));
    } else {
      map.setView([45.4642, 9.1900], 13);
    }
    closeDetail();
  });

  // Map ↔ List sync toggle
  const btnMapSync = document.getElementById('btnMapSync');
  if (btnMapSync && map) {
    map.on('moveend', () => {
      if (mapBoundsFilterActive && currentMapMode === 'eventi') renderEventi();
    });
    btnMapSync.addEventListener('click', () => {
      mapBoundsFilterActive = !mapBoundsFilterActive;
      btnMapSync.classList.toggle('active', mapBoundsFilterActive);
      if (currentMapMode === 'eventi') renderEventi();
    });
  }
}

// ── Detail Panel ──
function setupDetail() {
  document.getElementById('detailClose').addEventListener('click', closeDetail);

  // Save button handler is set via onclick in openDetail/openEventDetail
  // Do NOT use addEventListener here — it would double-fire with onclick

  // Share
  document.getElementById('detailShareBtn').addEventListener('click', async () => {
    if (!currentDetail) return;
    const shareData = {
      title: currentDetail.nome,
      text: t('shareText', currentDetail.nome, getDesc(currentDetail)),
      url: window.location.href
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) { /* cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text)}`);
    }
  });

  // Directions
  document.getElementById('detailDirectionsBtn').addEventListener('click', () => {
    if (!currentDetail || !currentDetail.lat) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentDetail.lat},${currentDetail.lng}`);
  });

  // Close with Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  setupDetailSwipe();
}

// ── Swipe-to-close for the detail bottom sheet (mobile) ──
// Handles both pepite and eventi panels (they share #detailPanel).
function setupDetailSwipe() {
  const panel = document.getElementById('detailPanel');
  let _y0 = 0, _t0 = 0, _lastY = 0, _dragging = false;

  const isMobile = () => window.innerWidth <= 768;

  // Remove inline style overrides — restore CSS-driven state
  function resetInline() {
    panel.style.transition = '';
    panel.style.transform  = '';
  }

  // ── touchstart: capture origin point ──
  panel.addEventListener('touchstart', e => {
    if (!isMobile()) return;
    if (panel.scrollTop > 2) return; // let the panel scroll normally when not at top
    _y0      = e.touches[0].clientY;
    _lastY   = _y0;
    _t0      = Date.now();
    _dragging = false;
    panel.style.transition = 'none'; // disable CSS transition during drag
  }, { passive: true });

  // ── touchmove: follow the finger ──
  panel.addEventListener('touchmove', e => {
    if (!isMobile()) return;
    if (panel.scrollTop > 2) { resetInline(); return; }

    const dy = e.touches[0].clientY - _y0;
    if (dy < 0) { resetInline(); return; } // swiping up → cancel drag, let content scroll

    _dragging = true;
    _lastY    = e.touches[0].clientY;

    // Dampening: 1:1 up to 100 px, then 40% — gives a natural "resistance" feel
    const t = dy < 100 ? dy : 100 + (dy - 100) * 0.4;
    panel.style.transform = `translateY(${t}px)`;
  }, { passive: true });

  // ── shared end/cancel handler ──
  function onRelease(cancelled) {
    if (!_dragging) { resetInline(); return; }
    _dragging = false;

    const dy       = _lastY - _y0;
    const velocity = dy / Math.max(1, Date.now() - _t0); // px/ms

    // Close threshold: fast flick OR dragged > 28 % of visible panel height
    const shouldClose = !cancelled && (velocity > 0.45 || dy > panel.offsetHeight * 0.28);

    // Re-enable transitions for the snap / close animation
    panel.style.transition = 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)';

    if (shouldClose) {
      // Fly off screen, then close cleanly
      panel.style.transform = 'translateY(110%)';
      panel.addEventListener('transitionend', function done(ev) {
        if (ev.propertyName !== 'transform') return;
        panel.removeEventListener('transitionend', done);
        resetInline();
        closeDetail();
      });
    } else {
      // Snap back to open position — CSS `.detail-panel.active { transform: translateY(0) }` takes over
      panel.style.transform = '';
      panel.addEventListener('transitionend', function done(ev) {
        if (ev.propertyName !== 'transform') return;
        panel.removeEventListener('transitionend', done);
        panel.style.transition = '';
      });
    }
  }

  panel.addEventListener('touchend',    () => onRelease(false), { passive: true });
  panel.addEventListener('touchcancel', () => onRelease(true),  { passive: true });
}

function openDetail(p) {
  const hadDetail = !!(currentDetail || currentEventDetail); // capture before reset
  resetQuartiereMode();
  currentDetail = p;
  currentEventDetail = null; // clear event detail
  const panel = document.getElementById('detailPanel');
  const emoji = categoryEmoji[p.categoria] || '✨';

  const _pepitaImgFallback = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23EDE0D4'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='64'%3E✨%3C/text%3E%3C/svg%3E`;
  const _pepitaDetailImg = document.getElementById('detailImage');
  const _detailWebp = document.getElementById('detailImageWebp');
  // Clear stale srcset from any previous detail before setting the new one
  if (_detailWebp) _detailWebp.removeAttribute('srcset');
  _pepitaDetailImg.onerror = function() {
    this.onerror = null;
    if (_detailWebp) _detailWebp.removeAttribute('srcset');
    this.src = _pepitaImgFallback;
  };
  _pepitaDetailImg.src = p.immagine || _pepitaImgFallback;
  _pepitaDetailImg.alt = p.nome;
  if (_detailWebp && p.immagine) { _detailWebp.srcset = _webpUrl(p.immagine); }
  const creditEl = document.getElementById('detailImgCredit');
  if (creditEl) { creditEl.textContent = p.credit_immagine || ''; creditEl.style.display = p.credit_immagine ? '' : 'none'; }
  document.getElementById('detailMeta').textContent = `${emoji} ${getCat(p)}`;
  document.getElementById('detailNome').textContent = p.nome;
  document.getElementById('detailQuartiere').textContent = `${p.quartiere}, Milano`;
  // Indirizzo navigabile
  const indirizzoEl = document.getElementById('detailIndirizzo');
  const indirizzoText = document.getElementById('detailIndirizzoText');
  if (indirizzoEl && indirizzoText && p.indirizzo) {
    indirizzoText.textContent = p.indirizzo;
    const mapsUrl = /iPhone|iPad|iPod|Mac/.test(navigator.userAgent)
      ? `https://maps.apple.com/?q=${encodeURIComponent(p.indirizzo + ', Milano')}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.indirizzo + ', Milano')}`;
    indirizzoEl.href = mapsUrl;
    indirizzoEl.style.display = '';
  } else if (indirizzoEl) { indirizzoEl.style.display = 'none'; }

  const orari = (currentLang === 'en' ? (p.orari_en || p.orari) : p.orari) || '';
  const orariEl = document.getElementById('detailOrari');
  const orariText = document.getElementById('detailOrariText');
  if (orariEl && orariText) {
    orariText.textContent = orari;
    orariEl.style.display = orari ? '' : 'none';
    // Open-now pill
    orariEl.querySelectorAll('.open-now-pill').forEach(el => el.remove());
    if (orari) {
      const openState = isOpenNow(p);
      if (openState === true) {
        orariEl.insertAdjacentHTML('beforeend',
          `<span class="open-now-pill open">${t('openNow')}</span>`);
      } else if (openState === false) {
        orariEl.insertAdjacentHTML('beforeend',
          `<span class="open-now-pill closed">${t('closedNow')}</span>`);
      }
    }
  }
  document.getElementById('detailPrezzo').textContent = '';
  document.getElementById('detailDescrizione').textContent = getDesc(p);

  // Set pepita deep link hash — pushState so back button closes the panel
  if (hadDetail) {
    history.replaceState({ type: 'pepita', id: p.id }, '', `#pepita-${p.id}`);
  } else {
    history.pushState({ type: 'pepita', id: p.id }, '', `#pepita-${p.id}`);
  }

  // Restore pepite-mode save button (bookmark)
  const saveBtn = document.getElementById('detailSaveBtn');
  saveBtn.style.display = '';
  saveBtn.onclick = () => { if (currentDetail) toggleSave(currentDetail); };

  // Hide Maps button for pepite (events only)
  const mapsBtn = document.getElementById('detailMapsBtn');
  if (mapsBtn) mapsBtn.style.display = 'none';

  // Restore directions button for pepite
  const dirBtn = document.getElementById('detailDirectionsBtn');
  dirBtn.style.display = '';
  dirBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> ${t('directions')}`;
  dirBtn.onclick = () => {
    if (!currentDetail || !currentDetail.lat) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${currentDetail.lat},${currentDetail.lng}`);
  };

  // Restore share button for pepite
  const shareBtn = document.getElementById('detailShareBtn');
  const svgShare = shareBtn.querySelector('svg');
  shareBtn.textContent = '';
  if (svgShare) shareBtn.appendChild(svgShare);
  shareBtn.append(' ' + t('share'));
  const pepitaUrl = `${window.location.origin}${window.location.pathname}#pepita-${p.id}`;
  shareBtn.onclick = async () => {
    if (!currentDetail) return;
    const shareData = {
      title: currentDetail.nome,
      text: t('shareText', currentDetail.nome, getDesc(currentDetail)),
      url: pepitaUrl
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) { /* cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + pepitaUrl)}`);
    }
  };

  // Clear event card highlights
  document.querySelectorAll('.evento-card').forEach(card => card.classList.remove('active'));

  // Linked events — grouped so multi-day events appear as a single pill
  const linkedEvSection = document.getElementById('detailLinkedEvents');
  const linkedEvList    = document.getElementById('linkedEventsList');
  const linkedEvLabel   = document.getElementById('linkedEventsLabel');
  if (linkedEvSection && linkedEvList) {
    const rawLinked = findEventsForPepita(p);
    // Sort by date then group (same logic as the main eventi list)
    const linkedEvs = rawLinked.length > 0
      ? groupEventi([...rawLinked].sort((a, b) => parseInt(a.giorno, 10) - parseInt(b.giorno, 10)))
      : [];

    if (linkedEvs.length > 0) {
      if (linkedEvLabel) linkedEvLabel.textContent = t('linkedEventsLabel');
      linkedEvList.innerHTML = linkedEvs.map(ev => {
        const title    = currentLang === 'en' ? (ev.titolo_en || ev.titolo) : ev.titolo;
        const dateLabel = (ev._dateDisplay || ev.giorno) + ' ' + ev.mese;
        const multiTag  = ev._days
          ? `<span class="linked-ev-multiday">${ev._days.length}g</span>`
          : '';
        return `<button class="linked-event-pill" data-ev-id="${ev.id}">
          <span class="linked-ev-emoji">${eventBadgeEmoji[ev.badge] || '📌'}</span>
          <span class="linked-ev-title">${escapeHtml(title)}</span>
          <span class="linked-ev-date">${escapeHtml(dateLabel)}</span>${multiTag}
        </button>`;
      }).join('');
      linkedEvSection.style.display = '';
      // Click handler closes over linkedEvs so it gets the grouped object (with _days)
      linkedEvList.querySelectorAll('.linked-event-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          const ev = linkedEvs.find(x => x.id === +btn.dataset.evId);
          if (ev) openEventDetail(ev);
        });
      });
    } else {
      linkedEvSection.style.display = 'none';
    }
  }

  // Social / website source chips
  renderFonti(p.fonti);

  updateSaveBtn();
  panel.scrollTop = 0;
  panel.classList.add('active');

  // Fly map to pepita — always, regardless of call site.
  // Zoom 17 ungroups most clusters (maxClusterRadius=48px covers ~43m at z17).
  // After the animation settles, fall back to zoomToShowLayer if the marker
  // is still inside a cluster (very dense areas, e.g. 5 Vie).
  if (map && p.lat && p.lng) {
    map.flyTo([p.lat, p.lng], 17, { duration: 0.8 });
    const _marker = markers.find(m => m._pepitaId === p.id);
    if (_marker && markerCluster) {
      map.once('moveend', () => {
        const vis = markerCluster.getVisibleParent?.(_marker);
        if (vis && vis !== _marker) markerCluster.zoomToShowLayer(_marker);
      });
    }
  }

  // Update only the two affected markers (no full cluster rebuild)
  refreshActiveMarker(p);

  // Highlight active item in list
  document.querySelectorAll('.pepita-item').forEach(item => {
    item.classList.toggle('active', +item.dataset.id === p.id);
  });

  // Scroll list item into view
  const activeItem = document.querySelector(`.pepita-item[data-id="${p.id}"]`);
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function resetQuartiereMode() {
  if (!currentQuartiereFilter) return;
  currentQuartiereFilter = null;
  const panel = document.getElementById('detailPanel');
  panel.classList.remove('quartiere-mode');
  document.getElementById('detailPicture').style.display = '';
  document.getElementById('detailSaveBtn').style.display = '';
  document.getElementById('quartiereEmojiHero').style.display = 'none';
  document.getElementById('quartiereCats').style.display = 'none';
  const badge = document.getElementById('mapQuartiereBadge');
  if (badge) badge.style.display = 'none';
}

function openQuartiereDetail(q) {
  currentQuartiereFilter = q.nome;
  currentDetail = null;
  currentEventDetail = null;

  const panel = document.getElementById('detailPanel');
  panel.scrollTop = 0;
  panel.classList.add('active', 'quartiere-mode');

  // Header: hide image, show emoji hero
  document.getElementById('detailPicture').style.display = 'none';
  document.getElementById('detailSaveBtn').style.display = 'none';
  document.getElementById('detailImgCredit').style.display = 'none';
  const hero = document.getElementById('quartiereEmojiHero');
  hero.style.display = 'flex';
  document.getElementById('quartiereEmojiLarge').textContent = q.emoji;

  // Body fields
  document.getElementById('detailMeta').textContent = '';
  document.getElementById('detailNome').textContent = q.nome;
  document.getElementById('detailQuartiere').textContent = 'Milano';

  // Indirizzo / orari hidden
  const indirizzoEl = document.getElementById('detailIndirizzo');
  if (indirizzoEl) indirizzoEl.style.display = 'none';
  const orariEl = document.getElementById('detailOrari');
  if (orariEl) orariEl.style.display = 'none';

  // Pepite count as badge
  const pepiteInQ = pepite.filter(p => p.quartiere === q.nome);
  const prezzoEl = document.getElementById('detailPrezzo');
  prezzoEl.innerHTML = `<span class="quartiere-count-badge">${pepiteInQ.length} ${currentLang === 'en' ? 'gems' : 'pepite'}</span>`;

  // Top categories
  const cats = {};
  pepiteInQ.forEach(p => { cats[p.categoria] = (cats[p.categoria] || 0) + 1; });
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const catsEl = document.getElementById('quartiereCats');
  catsEl.style.display = 'flex';
  catsEl.innerHTML = topCats.map(([cat, n]) =>
    `<span class="q-cat-tag">${categoryEmoji[cat] || '✨'} ${escapeHtml(cat)}</span>`
  ).join('');

  // Description
  document.getElementById('detailDescrizione').textContent = t(q.descKey);

  // Actions: "Filtra Pepite" replaces directions; hide share
  const shareBtn = document.getElementById('detailShareBtn');
  shareBtn.style.display = 'none';
  const dirBtn = document.getElementById('detailDirectionsBtn');
  dirBtn.style.display = '';
  dirBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> ${currentLang === 'en' ? 'See Pepite' : 'Vedi le Pepite'}`;
  dirBtn.onclick = () => {
    resetQuartiereMode();
    panel.classList.remove('active');
    // Switch to Pepite tab, filter by quartiere
    document.querySelectorAll('.sidebar-tab').forEach(tb => tb.classList.remove('active'));
    document.querySelectorAll('.sidebar-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.sidebar-tab[data-tab="pepite"]').classList.add('active');
    document.getElementById('tabPepite').classList.add('active');
    document.getElementById('searchInput').value = q.nome;
    currentFilter = 'all';
    document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'));
    document.querySelector('.cat-item[data-cat="all"]').classList.add('active');
    renderPepiteList();
    renderMarkers();
  };

  // Filter markers and zoom
  renderMarkers();
  const withCoords = pepiteInQ.filter(p => p.lat && p.lng);
  if (map && withCoords.length > 0) {
    map.fitBounds(L.latLngBounds(withCoords.map(p => [p.lat, p.lng])).pad(0.2));
  }

  // Show map filter badge
  const badge = document.getElementById('mapQuartiereBadge');
  if (badge) {
    badge.style.display = 'flex';
    document.getElementById('mapQuartiereBadgeName').textContent = `${q.emoji} ${q.nome}`;
    document.getElementById('mapQuartiereBadgeClear').onclick = () => {
      closeDetail();
    };
  }

  document.querySelectorAll('.pepita-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.evento-card').forEach(card => card.classList.remove('active'));
}

function closeDetail(fromPopstate = false) {
  resetQuartiereMode();
  document.getElementById('detailPanel').classList.remove('active');
  currentDetail = null;
  currentEventDetail = null;
  updateOGTags(null);
  refreshActiveMarker(null); // deactivate marker without full cluster rebuild
  document.querySelectorAll('.pepita-item').forEach(item => item.classList.remove('active'));
  document.querySelectorAll('.evento-card').forEach(card => card.classList.remove('active'));
  // Clear URL hash (skip when called from popstate — browser already reverted the URL)
  if (!fromPopstate && window.location.hash) history.replaceState(null, '', window.location.pathname);
  // Restore save button to heart icon & clear onclick
  const saveBtn = document.getElementById('detailSaveBtn');
  saveBtn.style.display = '';
  saveBtn.classList.remove('saved');
  saveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  saveBtn.onclick = null;
  // Restore directions button
  const dirBtn = document.getElementById('detailDirectionsBtn');
  dirBtn.style.display = '';
  dirBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> ${t('directions')}`;
  dirBtn.onclick = null;
  // Restore share button text
  const shareBtn = document.getElementById('detailShareBtn');
  const svgShare = shareBtn.querySelector('svg');
  shareBtn.textContent = '';
  if (svgShare) shareBtn.appendChild(svgShare);
  shareBtn.append(' ' + t('share'));
  shareBtn.onclick = null;
  // Hide address & orari
  const indirizzoEl = document.getElementById('detailIndirizzo');
  if (indirizzoEl) indirizzoEl.style.display = 'none';
  const orariEl = document.getElementById('detailOrari');
  if (orariEl) orariEl.style.display = 'none';
  // Restore description to text (not HTML)
  document.getElementById('detailDescrizione').textContent = '';
}

function syncSavedImagesToSW() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
  const urls = pepite
    .filter(p => p.salvato && p.immagine)
    .map(p => p.immagine);
  navigator.serviceWorker.controller.postMessage({ type: 'CACHE_SAVED_IMAGES', urls });
}

function toggleSave(p) {
  p.salvato = !p.salvato;
  if (p.salvato) savedIds.add(p.id); else savedIds.delete(p.id);
  safeLocalStorageSet('pepite_saved', JSON.stringify([...savedIds]));
  updateSaveBtn();
  updateCategoryCounts();
  if (currentFilter === 'fav') renderPepiteList();
  syncSavedImagesToSW();
  updateMyDayBtnPreview();
}

function updateSaveBtn() {
  const btn = document.getElementById('detailSaveBtn');
  if (currentDetail && currentDetail.salvato) {
    btn.classList.add('saved');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  } else {
    btn.classList.remove('saved');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }
}

// ── Install Banner (PWA) ──
let deferredPrompt;
function setupInstallBanner() {
  const banner = document.getElementById('installBanner');
  const btn = document.getElementById('installBtn');
  const bannerText = banner?.querySelector('span');
  if (!banner || !btn) return;

  // Skip if already installed as standalone PWA or dismissed before
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isStandalone || localStorage.getItem('pepite_install_dismissed')) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (bannerText) bannerText.textContent = t('install');
    btn.textContent = t('installBtn');
    banner.classList.add('show');
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        banner.classList.remove('show');
      }
      deferredPrompt = null;
    } else {
      // Manual install mode — just dismiss the banner
      banner.classList.remove('show');
      localStorage.setItem('pepite_install_dismissed', '1');
    }
  });

  // Close/dismiss button
  document.getElementById('installClose')?.addEventListener('click', () => {
    banner.classList.remove('show');
    localStorage.setItem('pepite_install_dismissed', '1');
  });

  // If beforeinstallprompt hasn't fired after 3s, show manual install hint
  setTimeout(() => {
    if (!deferredPrompt && !banner.classList.contains('show')) {
      if (bannerText) bannerText.textContent = t('installManual');
      btn.textContent = t('installDismiss');
      banner.classList.add('show');
    }
  }, 3000);
}

// ── Sidebar Tabs ──
function setupSidebarTabs() {
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      navigator.vibrate?.(20);
      const target = tab.dataset.tab;
      const prevTab = document.querySelector('.sidebar-tab.active')?.dataset.tab;
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.querySelector(`.sidebar-tab-content[data-tab="${target}"]`)?.classList.add('active');

      // The tab bar is fixed/always tappable now, even while the sheet is collapsed to
      // "peek" — expand it enough to actually reveal the tab that was just switched to.
      if (_isMobileSheet() && _sheetState === 'peek') snapSheetTo('editorial');

      // ── Itinerari map: restore cluster on leave ──
      // Note: cluster is NOT removed on enter — pepite markers stay visible as backdrop.
      // showItinerarioOnMap() removes the cluster only when a route is actually drawn.
      if (target !== 'itinerari' && prevTab === 'itinerari') {
        // Leaving itinerari: clear any active itinerary layer and restore pepite markers
        if (itinerarioLayer) {
          map.removeLayer(itinerarioLayer); itinerarioLayer = null;
          document.querySelectorAll('.itinerario-map-btn').forEach(b => b.classList.remove('active'));
        }
        if (currentMapMode !== 'eventi') scheduleMarkers(150);
      } else if (itinerarioLayer && target !== 'itinerari') {
        // Fallback: orphaned itinerary layer on non-itinerari tabs
        clearItinerarioLayer();
        document.querySelectorAll('.itinerario-map-btn').forEach(b => b.classList.remove('active'));
      }

      // ── Map mode switch ──────────────────────────────
      if (target === 'eventi' || target === 'storie') {
        // Both tabs share the eventi map
        currentMapMode = 'eventi';
        if (markerCluster && map) { map.removeLayer(markerCluster); markerCluster = null; }
        if (eventiLoaded) renderEventiMarkers();
        else loadEventiData(); // loadEventiData → renderEventi → renderEventiMarkers
      } else {
        // Restore pepite map if coming from eventi mode
        if (currentMapMode === 'eventi') {
          currentMapMode = 'pepite';
          clearTimeout(_evMarkerTimer); // cancel any in-flight eventi marker update
          clearEventiMarkers();
          scheduleMarkers(150);
        }
        // Lazy-load data for tabs that need it
        if (target === 'pepite') loadPepiteData();
      }

      // ── Storie data (independent of map mode) ──
      if (target === 'storie') {
        if (!pepiteLoaded) loadPepiteData();
        storieLoaded ? renderStorie() : loadStorieData();
      }
    });
  });
}

// ── Itinerari ──
// Module-level so it can be indexed by the global cross-domain search, not just rendered here.
const itinerariData = [
    {
      giorno: '1', titoloKey: 'it1Title', subKey: 'it1Sub',
      tappe: [
        { ora: '09:00', nome: 'Pavé', descKey: 's1_1', pepita: 'Pavé' },
        { ora: '10:30', nome: 'Orto Botanico di Brera', descKey: 's1_2', pepita: 'Orto Botanico' },
        { ora: '12:00', nome: 'Latteria San Marco', descKey: 's1_3', pepita: 'Latteria San Marco' },
        { ora: '14:30', nome: 'Wait and See', descKey: 's1_4', pepita: 'Wait and See' },
        { ora: '16:00', nome: 'Laboratorio Paravicini', descKey: 's1_5', pepita: 'Laboratorio Paravicini' },
        { ora: '18:30', nome: "N'Ombra de Vin", descKey: 's1_6', pepita: "N'Ombra de Vin" },
        { ora: '20:30', nome: 'Potafiori', descKey: 's1_7', pepita: 'Potafiori' }
      ]
    },
    {
      giorno: '2', titoloKey: 'it2Title', subKey: 'it2Sub',
      tappe: [
        { ora: '09:30', nome: 'Égalité', descKey: 's2_1', pepita: 'Égalité' },
        { ora: '11:00', nome: 'Villa Necchi Campiglio', descKey: 's2_2', pepita: 'Villa Necchi Campiglio' },
        { ora: '13:00', nome: 'Trippa', descKey: 's2_3', pepita: 'Trippa' },
        { ora: '15:00', nome: 'Rossana Orlandi', descKey: 's2_4', pepita: 'Rossana Orlandi' },
        { ora: '16:30', nome: 'Cavalli e Nastri', descKey: 's2_5', pepita: 'Cavalli e Nastri' },
        { ora: '18:00', nome: 'Bar Basso', descKey: 's2_6', pepita: 'Bar Basso' },
        { ora: '20:30', nome: 'Nebbia', descKey: 's2_7', pepita: 'Nebbia' }
      ]
    },
    {
      giorno: '3', titoloKey: 'it3Title', subKey: 'it3Sub',
      tappe: [
        { ora: '09:00', nome: 'Hygge', descKey: 's3_1', pepita: 'Hygge' },
        { ora: '11:00', nome: 'Vigna di Leonardo', descKey: 's3_2', pepita: 'Vigna di Leonardo' },
        { ora: '12:30', nome: 'Fonderie Milanesi', descKey: 's3_3', pepita: 'Fonderie Milanesi' },
        { ora: '14:00', nome: 'Fondazione Prada', descKey: 's3_4', pepita: 'Fondazione Prada' },
        { ora: '16:30', nome: 'NonostanteMarras', descKey: 's3_5', pepita: 'NonostanteMarras' },
        { ora: '18:00', nome: 'MAG Cafe', descKey: 's3_6', pepita: 'MAG Cafe' },
        { ora: '20:30', nome: 'Sixième Bistro', descKey: 's3_7', pepita: 'Sixième Bistro' }
      ]
    },
    {
      giorno: '4', titoloKey: 'it4Title', subKey: 'it4Sub',
      tappe: [
        { ora: '12:00', nome: 'Bomber', descKey: 's4_1', pepita: 'Bomber' },
        { ora: '14:00', nome: 'Tripstillery', descKey: 's4_2', pepita: 'Tripstillery' },
        { ora: '16:00', nome: 'Macinata', descKey: 's4_3', pepita: 'Macinata' },
        { ora: '17:30', nome: 'Cioccolat Italiani', descKey: 's4_4', pepita: 'Cioccolat Italiani' },
        { ora: '19:00', nome: 'California Bakery', descKey: 's4_5', pepita: 'California Bakery' }
      ]
    },
    {
      giorno: '5', titoloKey: 'it5Title', subKey: 'it5Sub',
      tappe: [
        { ora: '09:30', nome: 'Cascina Cuccagna', descKey: 's5_1', pepita: 'Cascina Cuccagna' },
        { ora: '11:30', nome: 'Cascina Linterno', descKey: 's5_2', pepita: 'Cascina Linterno' },
        { ora: '14:00', nome: 'Cascina Battivacco', descKey: 's5_3', pepita: 'Cascina Battivacco' },
        { ora: '16:00', nome: 'Cascina Torchiera', descKey: 's5_4', pepita: 'Cascina Torchiera' },
        { ora: '18:00', nome: 'Cascina Martesana', descKey: 's5_5', pepita: 'Cascina Martesana' }
      ]
    },
    {
      giorno: '6', titoloKey: 'it6Title', subKey: 'it6Sub',
      tappe: [
        { ora: '17:00', nome: 'Bar Basso', descKey: 's6_1', pepita: 'Bar Basso' },
        { ora: '18:30', nome: 'Backdoor 43', descKey: 's6_2', pepita: 'Backdoor 43' },
        { ora: '19:30', nome: 'MAG Cafe', descKey: 's6_3', pepita: 'MAG Cafe' },
        { ora: '20:30', nome: 'Nottingham Forest', descKey: 's6_4', pepita: 'Nottingham Forest' },
        { ora: '21:30', nome: 'Cantina Isola', descKey: 's6_5', pepita: 'Cantina Isola' },
        { ora: '22:30', nome: 'Deus Ex Machina', descKey: 's6_6', pepita: 'Deus Ex Machina' }
      ]
    },
    {
      giorno: '7', titoloKey: 'it7Title', subKey: 'it7Sub',
      tappe: [
        { ora: '08:30', nome: 'Orsonero Coffee', descKey: 's7_1', pepita: 'Orsonero' },
        { ora: '10:00', nome: 'Hygge', descKey: 's7_2', pepita: 'Hygge' },
        { ora: '12:00', nome: 'Marchesi 1824', descKey: 's7_3', pepita: 'Marchesi 1824' },
        { ora: '14:00', nome: 'Gelato Giusto', descKey: 's7_4', pepita: 'Gelato Giusto' },
        { ora: '15:30', nome: 'Breakfast Club Milano', descKey: 's7_5', pepita: 'Breakfast Club Milano' },
        { ora: '17:00', nome: 'Artico Gelateria', descKey: 's7_6', pepita: 'Artico Gelateria' }
      ]
    },
    {
      giorno: '8', titoloKey: 'it8Title', subKey: 'it8Sub',
      tappe: [
        { ora: '10:00', nome: 'Fioraio Bianchi Caffè', descKey: 's8_1', pepita: 'Fioraio Bianchi' },
        { ora: '11:30', nome: 'Giardino della Guastalla', descKey: 's8_2', pepita: 'Giardino della Guastalla' },
        { ora: '13:00', nome: 'Trippa', descKey: 's8_3', pepita: 'Trippa' },
        { ora: '15:00', nome: 'QC Terme Milano', descKey: 's8_4', pepita: 'QC Terme' },
        { ora: '18:30', nome: 'Bulgari Hotel Bar', descKey: 's8_5', pepita: 'Bulgari Hotel' },
        { ora: '20:30', nome: 'Potafiori', descKey: 's8_6', pepita: 'Potafiori' }
      ]
    },
    {
      giorno: '9', titoloKey: 'it9Title', subKey: 'it9Sub',
      tappe: [
        { ora: '10:00', nome: 'Villa Necchi Campiglio', descKey: 's9_1', pepita: 'Villa Necchi Campiglio' },
        { ora: '11:30', nome: 'Vigna di Leonardo', descKey: 's9_2', pepita: 'Vigna di Leonardo' },
        { ora: '14:00', nome: 'Fondazione Prada', descKey: 's9_3', pepita: 'Fondazione Prada' },
        { ora: '16:00', nome: 'Triennale Milano', descKey: 's9_4', pepita: 'Triennale Milano' },
        { ora: '17:30', nome: 'NonostanteMarras', descKey: 's9_5', pepita: 'NonostanteMarras' },
        { ora: '19:00', nome: 'Nilufar Gallery', descKey: 's9_6', pepita: 'Nilufar Gallery' }
      ]
    },
    {
      giorno: '10', titoloKey: 'it10Title', subKey: 'it10Sub',
      tappe: [
        { ora: '10:00', nome: 'Tipografia Alimentare', descKey: 's10_1', pepita: 'Tipografia Alimentare' },
        { ora: '12:00', nome: 'Tenoha', descKey: 's10_2', pepita: 'Tenoha' },
        { ora: '14:00', nome: 'Deus Ex Machina', descKey: 's10_3', pepita: 'Deus Ex Machina' },
        { ora: '16:30', nome: 'Spirit de Milan', descKey: 's10_4', pepita: 'Spirit de Milan' },
        { ora: '18:00', nome: 'Cavalli e Nastri', descKey: 's10_5', pepita: 'Cavalli e Nastri' },
        { ora: '20:30', nome: 'Vasiliki Kouzina', descKey: 's10_6', pepita: 'Vasiliki Kouzina' }
      ]
    }
  ];

/**
 * Resolve an itinerario stop's referenced name to an actual pepita, if one exists.
 * Several stops in the curated itinerari point to real, well-known Milan places
 * (landmarks, historic venues) that were never added to data.json — those legitimately
 * return null and are handled by falling back to a Maps search rather than a broken tap.
 */
function _resolvePepitaByName(name) {
  if (!name) return null;
  const norm = name.toLowerCase();
  return pepite.find(x => x.nome === name)
    ?? pepite.find(x => x.nome.toLowerCase() === norm)
    ?? pepite.find(x => norm.length >= 4 && (x.nome.toLowerCase().includes(norm) || norm.includes(x.nome.toLowerCase())))
    ?? null;
}

function renderItinerari() {
  const container = document.getElementById('itinerariList');

  container.innerHTML = itinerariData.map(it => `
    <div class="itinerario-card" data-giorno="${it.giorno}">
      <div class="itinerario-header">
        <div class="itinerario-day"><span>${it.giorno}</span></div>
        <div class="itinerario-info">
          <h4>${t(it.titoloKey)}</h4>
          <p>${t(it.subKey)}</p>
        </div>
      </div>
      <div class="itinerario-stops">
        ${it.tappe.map(tp => {
          const resolved = !!_resolvePepitaByName(tp.pepita);
          return `
          <div class="itinerario-stop${resolved ? '' : ' itinerario-stop--external'}" data-pepita="${escapeHtml(tp.pepita)}" data-nome="${escapeHtml(tp.nome)}" role="button" tabindex="0" aria-label="${escapeHtml(tp.nome)}">
            <span class="stop-time">${escapeHtml(tp.ora)}</span>
            <div class="stop-line"></div>
            <div class="stop-content">
              <h5>${escapeHtml(tp.nome)}${resolved ? '' : ' <svg class="stop-external-icon" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>'}</h5>
              <p>${t(tp.descKey)}</p>
            </div>
          </div>
        `;
        }).join('')}
      </div>
      <div class="itinerario-actions">
        <button class="itinerario-map-btn" data-giorno="${it.giorno}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
          ${currentLang === 'en' ? 'Show on map' : 'Mostra sulla mappa'}
        </button>
        <button class="itinerario-share-btn" data-giorno="${it.giorno}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          ${t('itinerariShare')}
        </button>
      </div>
    </div>
  `).join('');

  // Click on stop -> open pepita detail, or a Maps search for stops that reference a
  // real Milan place not (yet) in the pepite database (landmarks, historic venues, etc.)
  const activateItinerarioStop = (stop) => {
    const name = stop.dataset.pepita;
    if (!name) return;
    const p = _resolvePepitaByName(name);
    if (p) {
      openDetail(p); // flyTo + uncluster handled inside openDetail
      closeSidebar();
    } else {
      const query = `${stop.dataset.nome || name}, Milano`;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener');
    }
  };
  container.querySelectorAll('.itinerario-stop').forEach(stop => {
    stop.addEventListener('click', () => activateItinerarioStop(stop));
    stop.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      activateItinerarioStop(stop);
    });
  });

  // Click on "Condividi"
  container.querySelectorAll('.itinerario-share-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      navigator.vibrate?.(30);
      const giorno = btn.dataset.giorno;
      const it = itinerariData.find(x => x.giorno === giorno);
      if (!it) return;
      const title = t(it.titoloKey);
      const sub   = t(it.subKey);
      const tappe = it.tappe.map(tp => tp.nome).join(' → ');
      const appUrl = `${window.location.origin}${window.location.pathname}`;
      const text = t('itinerariShareText', title, sub, tappe);
      const shareData = { title, text, url: appUrl };
      if (navigator.share) {
        try { await navigator.share(shareData); } catch (_) { /* cancelled */ }
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + appUrl)}`);
      }
    });
  });

  // Click on "Mostra sulla mappa"
  container.querySelectorAll('.itinerario-map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const giorno = btn.dataset.giorno;
      const it = itinerariData.find(x => x.giorno === giorno);
      if (!it) return;
      const isActive = btn.classList.contains('active');
      // Toggle off
      container.querySelectorAll('.itinerario-map-btn').forEach(b => b.classList.remove('active'));
      if (isActive) {
        clearItinerarioLayer();
        return;
      }
      btn.classList.add('active');
      showItinerarioOnMap(it);
      closeSidebar();
    });
  });

  updateMyDayBtnPreview();
}

function clearItinerarioLayer() {
  if (itinerarioLayer) {
    map.removeLayer(itinerarioLayer);
    itinerarioLayer = null;
  }
  scheduleMarkers(100); // restore normal markers
}

function showItinerarioOnMap(it) {
  if (!map) return;

  // Remove previous itinerary layer
  if (itinerarioLayer) { map.removeLayer(itinerarioLayer); itinerarioLayer = null; }

  // Remove normal markers
  if (markerCluster) { map.removeLayer(markerCluster); markerCluster = null; }

  const group = L.layerGroup();
  const coords = [];

  it.tappe.forEach((tp, idx) => {
    const p = _resolvePepitaByName(tp.pepita);
    if (!p || !p.lat || !p.lng) return;

    coords.push([p.lat, p.lng]);

    // Numbered stop marker
    const icon = L.divIcon({
      className: 'pepite-marker',
      html: `<div style="
        background:#1A1A1A;
        border:2px solid #FFF;
        border-radius:50%;
        width:32px;height:32px;
        display:flex;align-items:center;justify-content:center;
        font-family:var(--font-sans,sans-serif);
        font-size:11px;font-weight:700;
        color:#FFF;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      ">${idx + 1}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([p.lat, p.lng], { icon });
    marker.bindTooltip(`${idx + 1}. ${tp.nome}`, { direction: 'top', offset: [0, -18], className: 'pepite-tooltip' });
    marker.on('click', () => openDetail(p));
    group.addLayer(marker);
  });

  // Draw polyline connecting stops
  if (coords.length >= 2) {
    const line = L.polyline(coords, {
      color: '#1A1A1A',
      weight: 2,
      opacity: 0.5,
      dashArray: '5, 7'
    });
    group.addLayer(line);
  }

  itinerarioLayer = group;
  map.addLayer(itinerarioLayer);

  // Fit map to itinerary bounds
  if (coords.length > 0) {
    map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
  }
}

// ── My Day Plan (custom itinerary built from saved pepite + eventi) ──
// Set (to a resolved item list) when viewing a plan opened via a shared #giornata= link;
// null means the normal, favourites-driven view. Reset on close so it never leaks.
let _myDaySharedItems = null;

function _currentMyDayItems() {
  return _myDaySharedItems || getMyDayItems();
}

function _getMyDayOrder() {
  return safeLocalStorageJson('myday_order', []); // ordered keys: "p<id>" | "e<id>"
}

function _setMyDayOrder(order) {
  safeLocalStorageSet('myday_order', JSON.stringify(order));
}

/** Resolve saved pepite+eventi into an ordered list, reconciling with the persisted custom order
 *  (favourites remain the single source of truth — the order is just a preference layer on top). */
function getMyDayItems() {
  const savedKeys = [
    ...pepite.filter(p => p.salvato).map(p => 'p' + p.id),
    ...eventi.filter(e => e.salvato).map(e => 'e' + e.id)
  ];
  const savedSet = new Set(savedKeys);

  const order = _getMyDayOrder().filter(k => savedSet.has(k));
  const known = new Set(order);
  savedKeys.forEach(k => { if (!known.has(k)) order.push(k); });
  _setMyDayOrder(order);

  return order.map(key => {
    const type = key[0] === 'p' ? 'pepita' : 'evento';
    const id = key.slice(1);
    const obj = type === 'pepita'
      ? pepite.find(x => String(x.id) === id)
      : eventi.find(x => String(x.id) === id);
    return obj ? { type, key, obj } : null;
  }).filter(Boolean);
}

/** Keeps the "La mia giornata" CTA card (top of the Itinerari tab) showing a live
 *  preview of the user's own plan instead of the same generic prompt regardless
 *  of state — the curated itineraries below it are fixed, this one isn't. */
function updateMyDayBtnPreview() {
  const sub = document.getElementById('myDayBtnSub');
  const btn = document.getElementById('myDayBtn');
  if (!sub) return;
  const items = getMyDayItems();
  if (items.length === 0) {
    sub.textContent = t('myDayBtnSub');
    btn?.classList.remove('has-plan');
    return;
  }
  const isEn = currentLang === 'en';
  const names = items.slice(0, 3).map(({ type, obj }) =>
    type === 'pepita' ? obj.nome : ((isEn ? (obj.titolo_en || obj.titolo) : obj.titolo) || ''));
  const label = names.join(', ') + (items.length > 3 ? ` +${items.length - 3}` : '');
  sub.textContent = t('myDayBtnPreview', items.length, label);
  btn?.classList.add('has-plan');
}

function openMyDay(sharedItems = null) {
  const overlay = document.getElementById('myDayOverlay');
  if (!overlay) return;
  _myDaySharedItems = sharedItems;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderMyDayList();
  // Saved eventi only surface once eventi.json has loaded — refresh once it lands
  // (skip for a shared plan: its items are already fully resolved up front)
  if (!sharedItems && !eventiLoaded) loadEventiData().then(renderMyDayList);
}

function closeMyDay() {
  const overlay = document.getElementById('myDayOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
  _myDaySharedItems = null;
}

function renderMyDayList() {
  const list = document.getElementById('myDayList');
  const actions = document.getElementById('myDayActions');
  const banner = document.getElementById('myDaySharedBanner');
  if (!list) return;
  const isShared = !!_myDaySharedItems;
  const items = _currentMyDayItems();
  const isEn = currentLang === 'en';

  if (banner) {
    banner.style.display = isShared ? 'flex' : 'none';
    if (isShared) {
      const bannerText = document.getElementById('myDaySharedBannerText');
      if (bannerText) bannerText.textContent = t('myDaySharedBanner');
      const saveBtn = document.getElementById('myDaySharedSaveBtn');
      if (saveBtn) { saveBtn.textContent = t('myDaySharedSave'); saveBtn.disabled = false; }
    }
  }

  if (items.length === 0) {
    list.innerHTML = `<div class="myday-empty"><strong>${t('myDayEmptyTitle')}</strong><br>${t('myDayEmptyText')}</div>`;
    if (actions) actions.style.display = 'none';
    return;
  }
  if (actions) actions.style.display = 'flex';

  list.innerHTML = items.map(({ type, key, obj }, idx) => {
    const emoji = type === 'pepita' ? (categoryEmoji[obj.categoria] || '✨') : (eventBadgeEmoji[obj.badge] || '📅');
    const name  = type === 'pepita' ? obj.nome : ((isEn ? (obj.titolo_en || obj.titolo) : obj.titolo) || '');
    const meta  = type === 'pepita' ? obj.quartiere : `${obj.giorno} ${obj.mese}`;
    // Reordering/removal only make sense for the viewer's own favourites-backed plan —
    // a shared plan (not yet saved by this viewer) is shown read-only until adopted.
    const itemControls = isShared ? '' : `
        <div class="myday-item-actions">
          <button class="myday-item-btn up" data-key="${key}" ${idx === 0 ? 'disabled' : ''} aria-label="Sposta su">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button class="myday-item-btn down" data-key="${key}" ${idx === items.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button class="myday-item-btn remove" data-key="${key}" aria-label="Rimuovi">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>`;
    return `
      <div class="myday-item">
        <span class="myday-item-num">${idx + 1}</span>
        <span class="myday-item-emoji">${emoji}</span>
        <div class="myday-item-info" data-open="${key}">
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(meta || '')}</span>
        </div>
        ${itemControls}
      </div>`;
  }).join('');

  list.querySelectorAll('.myday-item-info').forEach(el => {
    el.addEventListener('click', () => {
      const item = items.find(x => x.key === el.dataset.open);
      if (!item) return;
      closeMyDay();
      if (item.type === 'pepita') openDetail(item.obj); else openEventDetail(item.obj);
    });
  });
  if (!isShared) {
    list.querySelectorAll('.myday-item-btn.up').forEach(btn =>
      btn.addEventListener('click', () => moveMyDayItem(btn.dataset.key, -1)));
    list.querySelectorAll('.myday-item-btn.down').forEach(btn =>
      btn.addEventListener('click', () => moveMyDayItem(btn.dataset.key, 1)));
    list.querySelectorAll('.myday-item-btn.remove').forEach(btn =>
      btn.addEventListener('click', () => removeMyDayItem(btn.dataset.key)));
  }
}

/** Adopts a shared plan: saves every item to the viewer's own favourites, then
 *  switches the overlay back to the normal (now-editable) favourites-driven view. */
function saveSharedMyDay() {
  if (!_myDaySharedItems) return;
  _myDaySharedItems.forEach(({ type, obj }) => {
    if (type === 'pepita') { if (!obj.salvato) toggleSave(obj); }
    else { if (!obj.salvato) toggleEventSave(obj); }
  });
  // Preserve the shared order as the starting custom order for the adopted plan
  _setMyDayOrder(_myDaySharedItems.map(x => x.key));
  _myDaySharedItems = null;
  renderPepiteList();
  renderMarkers();
  if (eventiLoaded) renderEventi();
  renderMyDayList();
}

function moveMyDayItem(key, delta) {
  const order = _getMyDayOrder();
  const idx = order.indexOf(key);
  const newIdx = idx + delta;
  if (idx === -1 || newIdx < 0 || newIdx >= order.length) return;
  [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
  _setMyDayOrder(order);
  renderMyDayList();
}

function removeMyDayItem(key) {
  const type = key[0] === 'p' ? 'pepita' : 'evento';
  const id = key.slice(1);
  if (type === 'pepita') {
    const p = pepite.find(x => String(x.id) === id);
    if (p) toggleSave(p);
  } else {
    const e = eventi.find(x => String(x.id) === id);
    if (e) toggleEventSave(e);
  }
  renderPepiteList();
  renderMarkers();
  if (eventiLoaded) renderEventi();
  renderMyDayList();
}

function showMyDayOnMap(items) {
  if (!map) return;

  if (itinerarioLayer) { map.removeLayer(itinerarioLayer); itinerarioLayer = null; }
  if (markerCluster) { map.removeLayer(markerCluster); markerCluster = null; }
  if (currentMapMode === 'eventi') { clearEventiMarkers(); currentMapMode = 'pepite'; }

  const isEn = currentLang === 'en';
  const group = L.layerGroup();
  const coords = [];

  items.forEach(({ type, obj }, idx) => {
    const lat = type === 'pepita' ? obj.lat : (obj.lat || (quartiereCoords[obj.quartiere] || [])[0]);
    const lng = type === 'pepita' ? obj.lng : (obj.lng || (quartiereCoords[obj.quartiere] || [])[1]);
    if (!lat || !lng) return;

    coords.push([lat, lng]);
    const name = type === 'pepita' ? obj.nome : ((isEn ? (obj.titolo_en || obj.titolo) : obj.titolo) || '');

    const icon = L.divIcon({
      className: 'pepite-marker',
      html: `<div style="
        background:#1A1A1A;
        border:2px solid #FFF;
        border-radius:50%;
        width:32px;height:32px;
        display:flex;align-items:center;justify-content:center;
        font-family:var(--font-sans,sans-serif);
        font-size:11px;font-weight:700;
        color:#FFF;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
      ">${idx + 1}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([lat, lng], { icon });
    marker.bindTooltip(`${idx + 1}. ${escapeHtml(name)}`, { direction: 'top', offset: [0, -18], className: 'pepite-tooltip' });
    marker.on('click', () => { if (type === 'pepita') openDetail(obj); else openEventDetail(obj); });
    group.addLayer(marker);
  });

  if (coords.length >= 2) {
    group.addLayer(L.polyline(coords, { color: '#1A1A1A', weight: 2, opacity: 0.5, dashArray: '5, 7' }));
  }

  itinerarioLayer = group;
  map.addLayer(itinerarioLayer);

  if (coords.length > 0) {
    map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
  }
}

async function shareMyDay(items) {
  const isEn = currentLang === 'en';
  const names = items.map(({ type, obj }) =>
    type === 'pepita' ? obj.nome : ((isEn ? (obj.titolo_en || obj.titolo) : obj.titolo) || ''));
  const text = t('myDayShareText', names.join(' → '));
  // Encode the actual plan (not just a generic app link) so whoever opens it sees these same tappe
  const planParam = items.map(x => x.key).join(',');
  const appUrl = `${window.location.origin}${window.location.pathname}#giornata=${encodeURIComponent(planParam)}`;
  const shareData = { title: t('myDayTitle'), text, url: appUrl };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (_) { /* cancelled */ }
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + appUrl)}`);
  }
}

function setupMyDayPlan() {
  document.getElementById('myDayBtn')?.addEventListener('click', () => {
    navigator.vibrate?.(20);
    openMyDay();
  });
  document.getElementById('myDayClose')?.addEventListener('click', closeMyDay);
  document.getElementById('myDayOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'myDayOverlay') closeMyDay();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('myDayOverlay')?.style.display !== 'none') closeMyDay();
  });
  document.getElementById('myDayShowMap')?.addEventListener('click', () => {
    const items = _currentMyDayItems();
    if (items.length === 0) return;
    closeMyDay();
    showMyDayOnMap(items);
    closeSidebar();
  });
  document.getElementById('myDayShare')?.addEventListener('click', () => {
    const items = _currentMyDayItems();
    if (items.length > 0) shareMyDay(items);
  });
  document.getElementById('myDaySharedSaveBtn')?.addEventListener('click', saveSharedMyDay);

  // Contextual hints shown on the Preferiti view of Pepite/Eventi
  document.getElementById('pepiteMyDayHint')?.addEventListener('click', () => {
    navigator.vibrate?.(20);
    openMyDay();
  });
  document.getElementById('eventiMyDayHint')?.addEventListener('click', () => {
    navigator.vibrate?.(20);
    openMyDay();
  });
  // Always-visible CTA in the mobile sheet's editorial preview
  document.getElementById('mobileMyDayHint')?.addEventListener('click', () => {
    navigator.vibrate?.(20);
    openMyDay();
  });
}

// ── Eventi del Mese ──
// ── Event Badge Emoji Map ──
const eventBadgeEmoji = {
  'food': '🍷',
  'design': '🎨',
  'arte': '🖼️',
  'musica': '🎵',
  'festival': '🎪',
  'mercato': '🛍️',
  'cinema': '🎬',
  'bambini': '👨‍👩‍👧',
  'teatro': '🎭',
  'moda': '👗'
};

// ── Build Event Date Quick Filters ──
function buildEventiDateFilters() {
  const wrap = document.getElementById('eventiDateFilters');
  if (!wrap) return;
  const labels = currentLang === 'en'
    ? { oggi: 'Today', weekend: 'Weekend' }
    : { oggi: 'Oggi',  weekend: 'Weekend' };
  wrap.innerHTML = `
    <button class="eventi-date-btn${currentDateFilter === 'oggi'    ? ' active' : ''}" data-date="oggi">📍 ${labels.oggi}</button>
    <button class="eventi-date-btn${currentDateFilter === 'weekend' ? ' active' : ''}" data-date="weekend">🗓 ${labels.weekend}</button>`;
  wrap.querySelectorAll('.eventi-date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.date;
      currentDateFilter = currentDateFilter === val ? null : val; // toggle off if already active
      safeLocalStorageSet('eventi_date_filter', currentDateFilter || '');
      wrap.querySelectorAll('.eventi-date-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.date === currentDateFilter));
      renderEventi();
    });
  });
}

// ── Build Event Category Filters ──
function buildEventiFilters() {
  const container = document.getElementById('eventiFilters');
  if (!container) return;

  // Base list for counts: exclude past events (same logic as getFilteredEventi)
  const baseList = eventi.filter(e => e.salvato || !isEventPast(e));
  // Group to get accurate counts (multi-day same-title/location = 1 card)
  const baseGrouped = groupEventi([...baseList].sort((a, b) => parseInt(a.giorno, 10) - parseInt(b.giorno, 10)));

  // Badges from ALL events (including past) so category filters never disappear
  const badges = [...new Set(eventi.map(e => e.badge).filter(Boolean))];
  const isEn = currentLang === 'en';

  // Badge label map
  const badgeLabels = {
    'food': { it: 'Food & Wine', en: 'Food & Wine' },
    'design': { it: 'Design Week', en: 'Design Week' },
    'arte': { it: 'Mostre & Arte & Musei', en: 'Art & Culture' },
    'musica': { it: 'Concerti', en: 'Music' },
    'festival': { it: 'Festival', en: 'Festival' },
    'mercato': { it: 'Mercati', en: 'Markets' },
    'cinema': { it: 'Cinema', en: 'Cinema' },
    'bambini': { it: 'Famiglia & Bambini', en: 'Family & Kids' },
    'teatro': { it: 'Teatri', en: 'Theater' },
    'moda': { it: 'Fashion', en: 'Fashion' }
  };

  const allCount   = baseGrouped.length;
  const savedCount = groupEventi([...eventi.filter(e => e.salvato)].sort((a, b) => parseInt(a.giorno, 10) - parseInt(b.giorno, 10))).length;
  container.innerHTML = `<button class="eventi-filter-btn${currentEventFilter === 'all' ? ' active' : ''}" data-badge="all">${t('eventiFilterAll')} <span class="eventi-filter-count">${allCount}</span></button>` +
    badges.map(b => {
      const label = badgeLabels[b] ? (isEn ? badgeLabels[b].en : badgeLabels[b].it) : escapeHtml(b);
      const emoji = eventBadgeEmoji[b] || '📌';
      const count = baseGrouped.filter(e => e.badge === b).length;
      return `<button class="eventi-filter-btn${currentEventFilter === b ? ' active' : ''}" data-badge="${escapeHtml(b)}">${emoji} ${label} <span class="eventi-filter-count">${count}</span></button>`;
    }).join('') +
    `<button class="eventi-filter-btn${currentEventFilter === 'fav' ? ' active' : ''}" data-badge="fav">${t('eventiFilterFav')} ${savedCount > 0 ? `<span class="eventi-filter-count">${savedCount}</span>` : ''}</button>`;

  // Attach click listeners
  container.querySelectorAll('.eventi-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.eventi-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentEventFilter = btn.dataset.badge;
      safeLocalStorageSet('eventi_filter', currentEventFilter);
      renderEventi();
    });
  });
}

// ── Event date helpers ──
const _MESE_TO_MONTH = { GEN:0, FEB:1, MAR:2, APR:3, MAG:4, GIU:5, LUG:6, AGO:7, SET:8, OTT:9, NOV:10, DIC:11 };

/** Returns a Date at midnight for the event's day, or null if unparseable. */
function parseEventDate(e) {
  const month = _MESE_TO_MONTH[e.mese];
  if (month === undefined) {
    if (e.mese) console.warn(`[Pepite] parseEventDate: unknown month "${e.mese}" on event id=${e.id}`);
    return null;
  }
  const day = parseInt(e.giorno, 10);
  if (!day) {
    console.warn(`[Pepite] parseEventDate: invalid day "${e.giorno}" on event id=${e.id}`);
    return null;
  }
  const year = e.anno || new Date().getFullYear();
  return new Date(year, month, day);
}

/** Returns true if the event's day is strictly before today (already over). */
function isEventPast(e) {
  const d = parseEventDate(e);
  if (!d) return false; // unknown date → keep
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

// ── Group events: same title + same location across different days → one card ──
function groupEventi(list) {
  const groups = new Map();
  list.forEach(e => {
    const titolo = (e.titolo || '').trim().toLowerCase();
    const luogo  = (e.luogo || e.luogo_en || '').trim().toLowerCase();
    // Events without a location get a unique key (id suffix) so they are never merged
    // with unrelated events that happen to share the same title.
    const key = luogo ? `${titolo}||${luogo}` : `${titolo}||__id__${e.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  return [...groups.values()].map(days => {
    // Sort within group by day number
    days.sort((a, b) => parseInt(a.giorno, 10) - parseInt(b.giorno, 10));
    if (days.length === 1) return days[0]; // single occurrence — no change

    const nums = days.map(d => parseInt(d.giorno, 10));
    const isConsecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);

    // Date label: "8–13" for consecutive, "8,12,19" (up to 3, then "…") for scattered
    let dateDisplay;
    if (isConsecutive) {
      dateDisplay = `${nums[0]}–${nums[nums.length - 1]}`;
    } else if (nums.length <= 3) {
      dateDisplay = nums.join(',');
    } else {
      dateDisplay = `${nums[0]},${nums[1]}…`;
    }

    // Representative = first (earliest) event; carry group metadata
    return { ...days[0], _days: days, _dateDisplay: dateDisplay };
  });
}

// ── Get Filtered Events ──
function getFilteredEventi() {
  let list = [...eventi];

  // Hide past events (events saved as favourites are always shown regardless of date)
  list = list.filter(e => e.salvato || !isEventPast(e));

  // Badge filter
  if (currentEventFilter === 'fav') {
    list = list.filter(e => e.salvato);
  } else if (currentEventFilter !== 'all') {
    list = list.filter(e => e.badge === currentEventFilter);
  }

  // Date quick filter (Oggi / Weekend)
  if (currentDateFilter) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    list = list.filter(e => {
      const d = parseEventDate(e);
      if (!d) return false;
      if (currentDateFilter === 'oggi')    return d.getTime() === today.getTime();
      if (currentDateFilter === 'weekend') { const dow = d.getDay(); return dow === 0 || dow === 6; }
      return true;
    });
  }

  // Map bounds filter (active when user toggles sync)
  if (mapBoundsFilterActive && map) {
    const bounds = map.getBounds();
    list = list.filter(e => {
      const lat = e.lat || (quartiereCoords[e.quartiere] || [])[0];
      const lng = e.lng || (quartiereCoords[e.quartiere] || [])[1];
      if (!lat || !lng) return true; // no coords → always show (uses Milan-centre fallback on map)
      return bounds.contains(L.latLng(lat, lng));
    });
  }

  // Sort by earliest day, then group same-title/same-location events
  list.sort((a, b) => parseInt(a.giorno, 10) - parseInt(b.giorno, 10));
  let grouped = groupEventi(list);

  // Search filter — applied after grouping so multi-day groups are matched correctly
  const query = normalizeSearch(document.getElementById('eventiSearchInput')?.value.trim());
  if (query && query.length >= 2) {
    const isEn = currentLang === 'en';
    const matchesQuery = e => {
      const titolo = (isEn ? (e.titolo_en || e.titolo) : e.titolo) || '';
      const desc   = (isEn ? (e.descrizione_en || e.desc_en || e.descrizione || e.desc) : (e.descrizione || e.desc)) || '';
      const tag    = (isEn ? (e.tag_en    || e.tag)    : e.tag)    || '';
      const luogo  = (isEn ? (e.luogo_en  || e.luogo)  : e.luogo)  || '';
      return normalizeSearch(titolo).includes(query) ||
             normalizeSearch(desc).includes(query)   ||
             normalizeSearch(tag).includes(query)    ||
             normalizeSearch(luogo).includes(query)  ||
             normalizeSearch(e.quartiere || '').includes(query);
    };
    grouped = grouped.filter(e =>
      matchesQuery(e) || (e._days && e._days.some(matchesQuery))
    );
  }

  // Sort by distance when "Near me" is active (falls back to quartiere centroid)
  if (nearMeActive && userLocation) {
    const distOf = (e) => {
      const lat = e.lat || (quartiereCoords[e.quartiere] || [])[0];
      const lng = e.lng || (quartiereCoords[e.quartiere] || [])[1];
      return (lat && lng) ? haversineKm(userLocation.lat, userLocation.lng, lat, lng) : Infinity;
    };
    grouped.sort((a, b) => distOf(a) - distOf(b));
  }

  return grouped;
}

// ── Setup Event Search ──
function setupEventiSearch() {
  const input = document.getElementById('eventiSearchInput');
  const clearBtn = document.getElementById('eventiSearchClear');
  if (!input) return;
  let debounceTimer;

  const toggleClear = () => {
    if (clearBtn) clearBtn.classList.toggle('visible', input.value.length > 0);
  };

  input.addEventListener('input', () => {
    toggleClear();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderEventi(), 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      toggleClear();
      renderEventi();
      input.focus();
    });
  }

  document.getElementById('eventiNearMeBadgeClear')?.addEventListener('click', clearNearMe);
}

// ── Virtual scroll helpers ──
function _buildEventiCardHTML(e, isEn) {
  const isActive = currentEventDetail && currentEventDetail.id === e.id;
  const isMulti  = !!e._days;
  const dayLabel = e._dateDisplay || e.giorno;

  let distBadge = '';
  if (nearMeActive && userLocation) {
    const lat = e.lat || (quartiereCoords[e.quartiere] || [])[0];
    const lng = e.lng || (quartiereCoords[e.quartiere] || [])[1];
    if (lat && lng) {
      distBadge = `<span class="dist-badge">📍 ${formatDist(haversineKm(userLocation.lat, userLocation.lng, lat, lng))}</span>`;
    }
  }

  return `
  <div class="evento-card${isActive ? ' active' : ''}" data-id="${e.id}" ${e.quartiere ? `data-quartiere="${escapeHtml(e.quartiere)}"` : ''} role="button" tabindex="0" aria-label="${escapeHtml(isEn ? (e.titolo_en || e.titolo) : e.titolo)}">
    <div class="evento-date${isMulti ? ' multiday' : ''}">
      <span class="day">${escapeHtml(dayLabel)}</span>
      <span class="month">${escapeHtml(e.mese)}</span>
      ${isMulti ? `<span class="multiday-count">${e._days.length}g</span>` : ''}
    </div>
    <div class="evento-info">
      <h4>${escapeHtml(isEn ? (e.titolo_en || e.titolo) : e.titolo)}</h4>
      <p>${escapeHtml((isEn ? (e.descrizione_en || e.desc_en || e.descrizione || e.desc) : (e.descrizione || e.desc)) || '')}</p>
      <div class="evento-meta-row">
        <span class="evento-badge ${e.badge || ''}">${escapeHtml((isEn ? (e.tag_en || e.tag) : e.tag) || '')}</span>
        ${e.quartiere ? `<span class="evento-quartiere">${escapeHtml(e.quartiere)}</span>` : ''}
        ${distBadge}
      </div>
    </div>
    <button class="evento-save-btn${e.salvato ? ' saved' : ''}" data-eid="${e.id}" title="${e.salvato ? '❤️' : '♡'}">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${e.salvato ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </button>
    <div class="evento-arrow">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>`;
}

function _appendEventiSlice() {
  const container = document.getElementById('eventiList');
  if (!container || _evWindowStart >= _evAllItems.length) return;
  const isEn  = currentLang === 'en';
  const slice = _evAllItems.slice(_evWindowStart, _evWindowStart + EVENTI_PAGE_SIZE);
  _evWindowStart += slice.length;
  container.insertAdjacentHTML('beforeend', slice.map(e => _buildEventiCardHTML(e, isEn)).join(''));
}

function _setupEventiScroll() {
  if (_evScrollSetup) return;
  const container = document.getElementById('eventiList');
  if (!container) return;
  const scrollEl = container.closest('.tab-scroll');
  if (!scrollEl) return;
  _evScrollSetup = true;
  scrollEl.addEventListener('scroll', () => {
    if (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 250) {
      _appendEventiSlice();
    }
  }, { passive: true });
}

// ── Render Events ──
function renderEventi() {
  const container = document.getElementById('eventiList');
  if (!container) return;
  const isEn = currentLang === 'en';

  // Compute full filtered list and store for virtual scroll
  _evAllItems    = getFilteredEventi();
  _evWindowStart = 0;

  // Update title + count
  const titleEl = document.getElementById('eventiListTitle');
  const countEl = document.getElementById('eventiListCount');
  if (titleEl) {
    if (currentEventFilter === 'all') {
      titleEl.textContent = t('eventiAll');
    } else if (currentEventFilter === 'fav') {
      titleEl.textContent = `❤️ ${t('eventiSaved')}`;
    } else {
      const emoji = eventBadgeEmoji[currentEventFilter] || '📌';
      const tag   = _evAllItems.length > 0
        ? (isEn ? (_evAllItems[0].tag_en || _evAllItems[0].tag) : _evAllItems[0].tag)
        : currentEventFilter;
      titleEl.textContent = `${emoji} ${tag}`;
    }
  }
  if (countEl) countEl.textContent = t('eventiResults', _evAllItems.length);

  // "Vicino a me" is toggled from the Pepite tab but also re-sorts eventi — surface it here too
  const nearMeBadge = document.getElementById('eventiNearMeBadge');
  if (nearMeBadge) {
    nearMeBadge.style.display = (nearMeActive && userLocation) ? 'flex' : 'none';
    const badgeText = document.getElementById('eventiNearMeBadgeText');
    if (badgeText) badgeText.textContent = t('nearMeEventiBadge');
  }

  // Point Preferiti visitors at the day-plan builder
  const eventiMyDayHint = document.getElementById('eventiMyDayHint');
  if (eventiMyDayHint) eventiMyDayHint.style.display = (currentEventFilter === 'fav' && _evAllItems.length > 0) ? 'flex' : 'none';

  if (_evAllItems.length === 0) {
    const query    = document.getElementById('eventiSearchInput')?.value.trim() || '';
    const queryEsc = escapeHtml(query);
    const dateLabel = currentDateFilter === 'oggi'
      ? (isEn ? 'today' : 'oggi')
      : currentDateFilter === 'weekend' ? 'weekend' : '';
    const catLabel = currentEventFilter !== 'all' && currentEventFilter !== 'saved'
      ? escapeHtml(currentEventFilter) : '';

    let msg, sub;
    const parts = [catLabel, dateLabel].filter(Boolean);
    if (query && parts.length) {
      msg = isEn ? `No "${parts.join(' · ')}" events for "${queryEsc}"` : `Nessun evento "${parts.join(' · ')}" per "${queryEsc}"`;
    } else if (query) {
      msg = isEn ? `No results for "${queryEsc}"` : `Nessun risultato per "${queryEsc}"`;
    } else if (parts.length) {
      msg = isEn ? `No ${parts.join(' · ')} events` : `Nessun evento ${parts.join(' · ')}`;
    } else {
      msg = t('eventiEmptyTitle');
    }
    sub = isEn ? 'Try removing filters or check back soon.' : 'Prova a rimuovere i filtri o torna più tardi.';

    container.innerHTML = `
      <div class="pepite-list-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <h4>${msg}</h4>
        <p>${sub}</p>
        <button class="empty-reset-btn">${isEn ? 'Reset filters' : 'Rimuovi filtri'}</button>
      </div>`;
    container.querySelector('.empty-reset-btn').addEventListener('click', () => {
      currentEventFilter  = 'all';
      currentDateFilter   = null;
      safeLocalStorageSet('eventi_filter', 'all');
      safeLocalStorageSet('eventi_date_filter', '');
      if (document.getElementById('eventiSearchInput')) document.getElementById('eventiSearchInput').value = '';
      buildEventiDateFilters();
      buildEventiFilters();
      renderEventi();
    });
    return;
  }

  // Render first slice; remaining slices load on scroll
  container.innerHTML = '';
  _appendEventiSlice();
  _setupEventiScroll();

  // Sync map markers (debounced — direct calls bypass this)
  if (currentMapMode === 'eventi' && map) {
    clearTimeout(_evMarkerTimer);
    _evMarkerTimer = setTimeout(renderEventiMarkers, 400);
  }
}

// ── Open Event Detail ──
function openEventDetail(ev) {
  const hadDetail = !!(currentDetail || currentEventDetail); // capture before reset
  currentEventDetail = ev;
  currentDetail = null; // clear pepite detail
  const panel = document.getElementById('detailPanel');
  const isEn = currentLang === 'en';
  const emoji = eventBadgeEmoji[ev.badge] || '📌';

  // Events have no fonti — hide the bento-box section
  const fontiEl = document.getElementById('detailFonti');
  if (fontiEl) { fontiEl.style.display = 'none'; fontiEl.innerHTML = ''; }

  // Update URL hash — pushState so back button closes the panel
  if (hadDetail) {
    history.replaceState({ type: 'evento', id: ev.id }, '', `#evento-${ev.id}`);
  } else {
    history.pushState({ type: 'evento', id: ev.id }, '', `#evento-${ev.id}`);
  }

  // Image — with fallback SVG for missing/broken images
  const _evImgFallback = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23F4E1D2'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='64'%3E📅%3C/text%3E%3C/svg%3E`;
  const detailImg   = document.getElementById('detailImage');
  const _detailWebpEv = document.getElementById('detailImageWebp');
  // Clear any stale srcset from a previous event before setting the new one
  if (_detailWebpEv) _detailWebpEv.removeAttribute('srcset');
  detailImg.onerror = function() {
    this.onerror = null;
    // Remove broken WebP srcset so the browser stops retrying it
    if (_detailWebpEv) _detailWebpEv.removeAttribute('srcset');
    this.src = _evImgFallback;
  };
  detailImg.src = ev.immagine || _evImgFallback;
  detailImg.alt = isEn ? (ev.titolo_en || ev.titolo) : ev.titolo;
  if (_detailWebpEv && ev.immagine) { _detailWebpEv.srcset = _webpUrl(ev.immagine); }
  const creditEl = document.getElementById('detailImgCredit');
  if (creditEl) { creditEl.textContent = ev.credit_immagine || ''; creditEl.style.display = ev.credit_immagine ? '' : 'none'; }

  // Meta: badge tag
  document.getElementById('detailMeta').textContent = `${emoji} ${(isEn ? (ev.tag_en || ev.tag) : ev.tag) || ''}`;

  // Title
  document.getElementById('detailNome').textContent = (isEn ? (ev.titolo_en || ev.titolo) : ev.titolo) || '';

  // Location (quartiere)
  document.getElementById('detailQuartiere').textContent = ev.quartiere ? `${ev.quartiere}, Milano` : 'Milano';

  // Hide date/time from header — shown in the "Quando" info block instead
  const evOrariEl = document.getElementById('detailOrari');
  if (evOrariEl) evOrariEl.style.display = 'none';
  const evPrezzoEl = document.getElementById('detailPrezzo');
  if (evPrezzoEl) evPrezzoEl.textContent = '';

  // Description: build rich content
  const descEl = document.getElementById('detailDescrizione');
  const longDesc = (isEn
    ? (ev.descrizione_lunga_en || ev.descrizione_en || ev.desc_en || ev.descrizione_lunga || ev.descrizione || ev.desc)
    : (ev.descrizione_lunga    || ev.descrizione    || ev.desc)) || '';
  const luogo    = (isEn ? (ev.luogo_en  || ev.luogo  || '') : (ev.luogo  || '')) || '';
  const prezzo   = (isEn ? (ev.prezzo_en || ev.prezzo || '') : (ev.prezzo || '')) || '';

  let descHTML = longDesc;

  // Info block — always shown (date is always available)
  {
    descHTML += '<div class="evento-detail-info">';
    // "Quando": all days + times for grouped events, single day otherwise
    let quandoHTML;
    if (ev._days && ev._days.length > 1) {
      quandoHTML = ev._days.map(d => {
        const dateStr = `${escapeHtml(d.giorno)} ${escapeHtml(d.mese)}`;
        return d.orario ? `${dateStr} · ${escapeHtml(d.orario)}` : dateStr;
      }).join('<br>');
    } else {
      const dateStr = `${escapeHtml(ev.giorno)} ${escapeHtml(ev.mese)}`;
      quandoHTML = ev.orario ? `${dateStr} · ${escapeHtml(ev.orario)}` : dateStr;
    }
    descHTML += `<div class="evento-detail-row"><strong>${t('eventiWhen')}:</strong> ${quandoHTML}</div>`;
    if (luogo) {
      descHTML += `<div class="evento-detail-row"><strong>${t('eventiWhere')}:</strong> ${escapeHtml(luogo)}</div>`;
    }
    if (prezzo) descHTML += `<div class="evento-detail-row"><strong>${t('eventiPrice')}:</strong> ${escapeHtml(prezzo)}</div>`;
    descHTML += '</div>';
  }

  // Linked pepita — try immediately; if pepite not yet loaded, retry after lazy load
  let linkedPep = findPepitaForEvent(ev);
  const _renderLinkedPep = (lp) => {
    if (!lp) return '';
    const pEmoji = categoryEmoji[lp.categoria] || '✨';
    return `<div class="linked-pepita-block" data-pepita-id="${lp.id}">
      <span class="linked-pepita-lbl">${t('linkedPepitaLabel')}</span>
      <span class="linked-pepita-name">${pEmoji} ${escapeHtml(lp.nome)}</span>
      <span class="linked-pepita-arrow">→</span>
    </div>`;
  };
  descHTML += _renderLinkedPep(linkedPep);

  // Source link
  if (ev.url) {
    descHTML += `<a class="evento-source-link" href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      ${t('eventiSource')}
    </a>`;
  }

  descEl.innerHTML = descHTML;

  // Wire up linked pepita click (after innerHTML set)
  const _wirePepitaClick = () => {
    descEl.querySelector('.linked-pepita-block')?.addEventListener('click', () => {
      if (linkedPep) openDetail(linkedPep);
    });
  };
  _wirePepitaClick();

  // If pepite weren't loaded yet, load them and inject the block retroactively
  if (!linkedPep && !pepiteLoaded) {
    loadPepiteData().then(() => {
      linkedPep = findPepitaForEvent(ev);
      if (linkedPep && currentEventDetail?.id === ev.id) {
        // Insert just before the source link (or at end of desc)
        const sourceLink = descEl.querySelector('.evento-source-link');
        const block = document.createElement('div');
        block.innerHTML = _renderLinkedPep(linkedPep);
        sourceLink
          ? descEl.insertBefore(block.firstChild, sourceLink)
          : descEl.appendChild(block.firstChild);
        _wirePepitaClick();
      }
    });
  }

  // Show save button for events (repurpose the bookmark button)
  const saveBtn = document.getElementById('detailSaveBtn');
  saveBtn.style.display = '';
  updateEventSaveBtn(ev);
  saveBtn.onclick = () => {
    toggleEventSave(ev);
    updateEventSaveBtn(ev);
  };

  // Detail actions area: Share + Calendar (replace Directions)
  const shareBtn = document.getElementById('detailShareBtn');
  const svgShare = shareBtn.querySelector('svg');
  shareBtn.textContent = '';
  if (svgShare) shareBtn.appendChild(svgShare);
  shareBtn.append(' ' + t('eventiShare'));

  // Deep link URL for sharing
  const eventUrl = `${window.location.origin}${window.location.pathname}#evento-${ev.id}`;

  // Share action with deep link
  shareBtn.onclick = async () => {
    const title = isEn ? (ev.titolo_en || ev.titolo) : ev.titolo;
    const desc = (isEn ? (ev.descrizione_en || ev.desc_en || ev.descrizione || ev.desc) : (ev.descrizione || ev.desc)) || '';
    const shareData = {
      title: title,
      text: `${title} — ${ev.giorno} ${ev.mese} @ ${ev.quartiere || 'Milano'}: ${desc}`,
      url: eventUrl
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (e) { /* cancelled */ }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + ' ' + eventUrl)}`);
    }
  };

  // Maps button — shown only when location is available
  const mapsBtn = document.getElementById('detailMapsBtn');
  if (mapsBtn) {
    if (luogo) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(luogo + ', Milano')}`;
      mapsBtn.style.display = '';
      mapsBtn.onclick = () => window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    } else {
      mapsBtn.style.display = 'none';
    }
  }

  // Replace Directions with Calendar button
  const dirBtn = document.getElementById('detailDirectionsBtn');
  dirBtn.style.display = '';
  const svgDir = dirBtn.querySelector('svg');
  dirBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${t('eventiCalendar')}`;
  dirBtn.onclick = () => downloadEventICS(ev);

  panel.scrollTop = 0;
  panel.classList.add('active');

  // Fly map to event — precise coords first, then quartiere centroid, then Milan centre
  if (map) {
    const MILAN_CENTER = [45.4641, 9.1919];
    const evCoords = (ev.lat && ev.lng)
      ? [ev.lat, ev.lng]
      : (quartiereCoords[ev.quartiere] || MILAN_CENTER);
    map.flyTo(evCoords, 15, { duration: 0.8 });
  }

  // Highlight event marker on map
  if (currentMapMode === 'eventi') renderEventiMarkers(ev.id);

  // Highlight active card in list
  document.querySelectorAll('.evento-card').forEach(card => {
    card.classList.toggle('active', +card.dataset.id === ev.id);
  });

  // Scroll into view
  const activeCard = document.querySelector(`.evento-card[data-id="${ev.id}"]`);
  if (activeCard) activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Push Notifications for saved events ──

/** Requests notification permission in context (only triggers browser dialog). */
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/**
 * Schedules a showNotification() for each saved event happening *tomorrow*.
 * Fires at 09:00 today (or immediately if already past 09:00).
 * Deduplicates via localStorage key  `eventi_notified`  (cleared daily).
 */
function scheduleEventNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  // Cancel any previously scheduled timers
  _notifTimers.forEach(id => clearTimeout(id));
  _notifTimers.clear();

  const now      = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowKey = tomorrow.toDateString(); // e.g. "Thu Apr 17 2025"

  // Clean up stale notified keys (keep only today's)
  const notifiedRaw = safeLocalStorageJson('eventi_notified', []);
  const notified = new Set(notifiedRaw.filter(k => k.endsWith(tomorrowKey)));
  safeLocalStorageSet('eventi_notified', JSON.stringify([...notified]));

  // Delay until 09:00 today; if already past, fire in 2 s (late-opener case)
  const notifAt = new Date(now);
  notifAt.setHours(9, 0, 0, 0);
  const delay = Math.max(notifAt.getTime() - now.getTime(), 2000);

  eventi.filter(e => e.salvato).forEach(ev => {
    const d = parseEventDate(ev);
    if (!d || d.toDateString() !== tomorrowKey) return;

    const dedupeKey = `${ev.id}-${tomorrowKey}`;
    if (notified.has(dedupeKey)) return; // already notified today

    const timerId = setTimeout(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const isEn  = currentLang === 'en';
        const title = isEn ? (ev.titolo_en || ev.titolo) : ev.titolo;
        const prefix = isEn ? 'Tomorrow:' : 'Domani:';
        const orario = ev.orario ? `${ev.orario} · ` : '';
        const luogo  = ev.luogo  || ev.quartiere || 'Milano';
        await reg.showNotification(`🗓 ${prefix} ${title}`, {
          body: `${orario}${luogo}`,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-96.png',
          tag: `evento-${ev.id}`,          // collapses duplicates
          data: { eventId: ev.id },
          requireInteraction: false
        });
        notified.add(dedupeKey);
        safeLocalStorageSet('eventi_notified', JSON.stringify([...notified]));
      } catch (_) { /* permission revoked or SW unavailable */ }
    }, delay);

    _notifTimers.set(ev.id, timerId);
  });
}

// ── Toggle Event Save ──
function toggleEventSave(ev) {
  const newSalvato = !ev.salvato;
  ev.salvato = newSalvato;

  // groupEventi returns spread-copies for multi-day events, so ev may not be
  // the same object reference as the entries in eventi[]. Sync back to the
  // master array (and track all day-IDs so the SALVATI filter counts correctly).
  const relatedIds = ev._days ? ev._days.map(d => d.id) : [ev.id];
  relatedIds.forEach(id => {
    const master = eventi.find(x => x.id === id);
    if (master) master.salvato = newSalvato;
    if (newSalvato) savedEventiIds.add(id);
    else            savedEventiIds.delete(id);
  });

  safeLocalStorageSet('eventi_saved', JSON.stringify([...savedEventiIds]));
  buildEventiDateFilters(); buildEventiFilters();
  renderEventi();
  if (currentEventDetail && currentEventDetail.id === ev.id) {
    updateEventSaveBtn(ev);
  }

  // Notification scheduling: ask permission on first save, then reschedule
  if (newSalvato && Notification?.permission === 'default') {
    requestNotificationPermission().then(granted => {
      if (granted) scheduleEventNotifications();
    });
  } else if (Notification?.permission === 'granted') {
    scheduleEventNotifications(); // only reschedule if permission is actually granted
  }
  updateMyDayBtnPreview();
}

// ── Update Event Save Button ──
function updateEventSaveBtn(ev) {
  const btn = document.getElementById('detailSaveBtn');
  if (ev.salvato) {
    btn.classList.add('saved');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  } else {
    btn.classList.remove('saved');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
  }
}

// ── Download ICS Calendar File ──
function downloadEventICS(ev) {
  const isEn = currentLang === 'en';
  const title = isEn ? (ev.titolo_en || ev.titolo) : ev.titolo;
  const desc = (isEn ? (ev.descrizione_en || ev.desc_en || ev.descrizione || ev.desc) : (ev.descrizione || ev.desc)) || '';
  const luogo = isEn ? (ev.luogo_en || ev.luogo || '') : (ev.luogo || '');

  // Parse start time from orario (e.g., "18:00 – 23:00")
  const day = ev.giorno.padStart(2, '0');
  const monthMap = { 'GEN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAG': '05', 'GIU': '06',
                     'LUG': '07', 'AGO': '08', 'SET': '09', 'OTT': '10', 'NOV': '11', 'DIC': '12' };
  const month = monthMap[ev.mese] || '03';
  const year = String(ev.anno || new Date().getFullYear());

  let startTime = '100000';
  let endTime = '230000';
  if (ev.orario) {
    const times = ev.orario.replace(/\s/g, '').split('–');
    if (times[0]) startTime = times[0].replace(':', '') + '00';
    if (times[1]) endTime = times[1].replace(':', '') + '00';
  }

  const dtStart = `${year}${month}${day}T${startTime}`;
  const dtEnd = `${year}${month}${day}T${endTime}`;
  const eventUrl = `${window.location.origin}${window.location.pathname}#evento-${ev.id}`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WOW Milano//Eventi//IT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Rome:${dtStart}`,
    `DTEND;TZID=Europe/Rome:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc.replace(/\n/g, '\\n')}\\n\\n${eventUrl}`,
    `LOCATION:${luogo}${luogo ? ', Milano' : 'Milano'}`,
    `URL:${ev.url || eventUrl}`,
    `UID:evento-${ev.id}@wowmilano.app`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wow-milano-${ev.id}-${title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Deep Link Handler ──
async function handleDeepLink() {
  const hash = window.location.hash;
  if (!hash) return;

  // Deep link to a shared "La mia giornata" plan — #giornata=p12,e5,p33
  const giornataMatch = hash.match(/^#giornata=(.+)$/);
  if (giornataMatch) {
    await Promise.all([loadPepiteData(), loadEventiData()]);
    const keys = decodeURIComponent(giornataMatch[1]).split(',').map(k => k.trim()).filter(Boolean);
    const items = keys.map(key => {
      const type = key[0] === 'p' ? 'pepita' : 'evento';
      const id = key.slice(1);
      const obj = type === 'pepita'
        ? pepite.find(x => String(x.id) === id)
        : eventi.find(x => String(x.id) === id);
      return obj ? { type, key, obj } : null;
    }).filter(Boolean);
    if (items.length > 0) openMyDay(items);
    return;
  }

  // Deep link to evento
  const eventoMatch = hash.match(/^#evento-(\d+)$/);
  if (eventoMatch) {
    await loadEventiData(); // ensure data is present
    const id = parseInt(eventoMatch[1]);
    const ev = eventi.find(e => e.id === id);
    if (ev) {
      document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.sidebar-tab-content').forEach(tc => tc.classList.remove('active'));
      const evTab = document.querySelector('.sidebar-tab[data-tab="eventi"]');
      const evContent = document.getElementById('tabEventi');
      if (evTab) evTab.classList.add('active');
      if (evContent) evContent.classList.add('active');
      // Set map to eventi mode
      currentMapMode = 'eventi';
      if (markerCluster && map) { map.removeLayer(markerCluster); markerCluster = null; }
      renderEventiMarkers(ev.id);
      requestAnimationFrame(() => requestAnimationFrame(() => openEventDetail(ev)));
    }
    return;
  }

  // Deep link to pepita
  const pepitaMatch = hash.match(/^#pepita-(\d+)$/);
  if (pepitaMatch) {
    await loadPepiteData(); // ensure data is present
    const id = parseInt(pepitaMatch[1]);
    const p = pepite.find(x => x.id === id);
    if (p) {
      // Switch map mode back to pepite (default is eventi in beta)
      if (currentMapMode === 'eventi') {
        currentMapMode = 'pepite';
        clearTimeout(_evMarkerTimer); // cancel any in-flight eventi marker update
        clearEventiMarkers();
        scheduleMarkers(150);
      }
      // Activate pepite tab
      document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.sidebar-tab-content').forEach(tc => tc.classList.remove('active'));
      const pepTab = document.querySelector('.sidebar-tab[data-tab="pepite"]');
      const pepContent = document.getElementById('tabPepite');
      if (pepTab) pepTab.classList.add('active');
      if (pepContent) pepContent.classList.add('active');
      updateOGTags(p);
      // Wait for DOM to settle after tab switch, then open detail
      requestAnimationFrame(() => requestAnimationFrame(() => openDetail(p)));
    }
  }
}

// ── Image Fallback ──
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') {
    e.target.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#F4E1D2"/><text x="300" y="190" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#2D2D2D">✨</text><text x="300" y="230" text-anchor="middle" font-family="Inter,sans-serif" font-size="14" fill="#6B6B6B">Immagine non disponibile</text></svg>');
    e.target.style.objectFit = 'cover';
  }
}, true);

// ══════════════════════════════════════════════════════
//  STORIE DI MILANO
// ══════════════════════════════════════════════════════

let storieData = [];
let storieLoaded = false;
let _storieLoadFailed = false; // true when fetch/parse of storie.json failed

async function loadStorieData() {
  if (storieLoaded) { renderStorie(); return; }
  _storieLoadFailed = false;
  try {
    const res = await fetch('storie.json');
    if (!res.ok) throw new Error(`storie.json fetch failed (${res.status})`);
    storieData = await res.json();
  } catch (err) {
    console.error('[Storie] Failed to load storie.json:', err);
    storieData = [];
    _storieLoadFailed = true;
  }
  storieLoaded = true;
  renderStorie();
  renderMobileEditorialPreview();
}

let currentStoria = null;
let currentSlideIdx = 0;

function renderStorie() {
  const container = document.getElementById('storieList');
  if (!container) return;
  const lang = currentLang;
  const isEn = lang === 'en';

  // ── Error state ──
  if (_storieLoadFailed) {
    container.innerHTML = `
      <div class="pepite-list-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h4>${isEn ? 'Content not available' : 'Contenuto non disponibile'}</h4>
        <p>${isEn ? 'Check your connection and try again.' : 'Controlla la connessione e riprova.'}</p>
        <button class="empty-reset-btn" id="storieRetryBtn">${isEn ? 'Retry' : 'Riprova'}</button>
      </div>`;
    container.querySelector('#storieRetryBtn')?.addEventListener('click', () => {
      storieLoaded = false;
      _storieLoadFailed = false;
      loadStorieData();
    });
    return;
  }

  // ── Empty state (no stories in JSON) ──
  if (storieData.length === 0) {
    container.innerHTML = `
      <div class="pepite-list-empty">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h4>${isEn ? 'No stories yet' : 'Nessuna storia disponibile'}</h4>
        <p>${isEn ? 'Come back soon.' : 'Torna a breve.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = storieData.map(storia => {
    // Cover image: prefer pics field from cover slide (or first slide with pics),
    // fallback to pepita lookup for backward compatibility
    const coverSlide = storia.slides[0];
    const coverImg = coverSlide?.pics
      || storia.slides.find(s => s.pics)?.pics
      || (() => {
        const p = pepite.find(x =>
          coverSlide?.pepita && (x.nome.includes(coverSlide.pepita) || coverSlide.pepita.includes(x.nome))
        );
        return p?.immagine || '';
      })();
    const title = storia.title[lang] || storia.title.it;
    const sub   = storia.sub[lang]   || storia.sub.it;

    // Build tag chips for the card preview
    const pepiteChips = (storia.tags?.pepite || []).map(name => {
      const p = pepite.find(x => x.nome.includes(name) || name.includes(x.nome));
      return p
        ? `<button class="storia-tag storia-tag--pepita" data-type="pepita" data-id="${p.id}">${categoryEmoji[p.categoria] || '✨'} ${escapeHtml(p.nome)}</button>`
        : null;
    }).filter(Boolean).join('');

    const eventiChips = (storia.tags?.eventi || []).map(t => {
      const ev = eventi.find(x => x.titolo && (x.titolo.includes(t) || t.includes(x.titolo)));
      return ev
        ? `<button class="storia-tag storia-tag--evento" data-type="evento" data-id="${ev.id}">${eventBadgeEmoji[ev.badge] || '📅'} ${escapeHtml(ev.titolo)}</button>`
        : null;
    }).filter(Boolean).join('');

    const tagsRow = (pepiteChips || eventiChips)
      ? `<div class="storia-tags-preview">${pepiteChips}${eventiChips}</div>`
      : '';

    return `
      <div class="storia-card" data-id="${storia.id}">
        <div class="storia-cover" style="${coverImg ? `background-image:image-set(url('${escapeHtml(_webpUrl(coverImg))}') type('image/webp'), url('${escapeHtml(coverImg)}') type('image/jpeg'))` : ''}">
          <div class="storia-cover-overlay"></div>
          <div class="storia-cover-info">
            <span class="storia-emoji">${escapeHtml(storia.emoji)}</span>
            <div>
              <h4 class="storia-title">${escapeHtml(title)}</h4>
              <p class="storia-sub">${escapeHtml(sub)}</p>
            </div>
          </div>
          <span class="storia-slides-count">${storia.slides.length - 1} slide</span>
        </div>
        ${tagsRow}
      </div>`;
  }).join('');

  // Card click → open story viewer
  container.querySelectorAll('.storia-card').forEach(card => {
    card.addEventListener('click', () => {
      const storia = storieData.find(s => s.id === card.dataset.id);
      if (storia) openStoria(storia);
    });
  });

  // Tag chip click → open detail directly, skip story viewer
  container.querySelectorAll('.storia-tag').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const id = +chip.dataset.id;
      if (chip.dataset.type === 'pepita') {
        const p = pepite.find(x => x.id === id);
        if (p) openDetail(p);
      } else {
        const ev = eventi.find(x => x.id === id);
        if (ev) openEventDetail(ev);
      }
    });
  });
}

function openStoria(storia) {
  currentStoria = storia;
  currentSlideIdx = 0;
  document.getElementById('storyOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  buildStoryProgress();
  buildStoryTags(storia);
  renderSlide(0);
}

function closeStoria() {
  navigator.vibrate?.(30);
  document.getElementById('storyOverlay').style.display = 'none';
  document.body.style.overflow = '';
  const tagsBar = document.getElementById('storyTagsBar');
  if (tagsBar) { tagsBar.innerHTML = ''; tagsBar.style.display = 'none'; }
  currentStoria = null;
  currentSlideIdx = 0;
}

// ── Story-level tag chips (persistent bar in viewer — eventi only) ──
// Pepite are already linked per-slide via story-pepita-btn; no duplication needed.
function buildStoryTags(storia) {
  const bar = document.getElementById('storyTagsBar');
  if (!bar) return;

  const eItems = (storia.tags?.eventi || []).reduce((acc, title) => {
    const ev = eventi.find(x => x.titolo && (x.titolo.includes(title) || title.includes(x.titolo)));
    if (ev) acc.push({ type: 'evento', id: ev.id, label: ev.titolo, emoji: eventBadgeEmoji[ev.badge] || '📅' });
    return acc;
  }, []);

  const all = eItems;
  if (!all.length) { bar.style.display = 'none'; return; }

  bar.style.display = '';
  bar.innerHTML = all.map(item =>
    `<button class="story-tag-chip story-tag-chip--${item.type}" data-type="${item.type}" data-id="${item.id}">
      <span>${escapeHtml(item.emoji)}</span><span>${escapeHtml(item.label)}</span>
    </button>`
  ).join('');

  bar.querySelectorAll('.story-tag-chip').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const id = +chip.dataset.id;
      if (chip.dataset.type === 'pepita') {
        const p = pepite.find(x => x.id === id);
        if (p) { closeStoria(); openDetail(p); }
      } else {
        const ev = eventi.find(x => x.id === id);
        if (ev) { closeStoria(); openEventDetail(ev); }
      }
    });
  });
}

function buildStoryProgress() {
  if (!currentStoria) return;
  const bar = document.getElementById('storyProgressBars');
  bar.innerHTML = currentStoria.slides.map((_, i) =>
    `<div class="sp-seg" id="sp-${i}"></div>`
  ).join('');
  updateProgress(0);
}

function updateProgress(idx) {
  document.querySelectorAll('.sp-seg').forEach((seg, i) => {
    seg.classList.toggle('done', i < idx);
    seg.classList.toggle('active', i === idx);
  });
}

function renderSlide(idx) {
  if (!currentStoria) return;
  const slide = currentStoria.slides[idx];
  const lang = currentLang;
  const wrap = document.getElementById('storySlideWrap');

  // Resolve slide background: prefer slide.pics, fallback to pepita lookup
  const bgImg = slide.pics || (() => {
    if (!slide.pepita) return '';
    const p = pepite.find(x => x.nome.includes(slide.pepita) || slide.pepita.includes(x.nome));
    return p?.immagine || '';
  })();
  const bgStyle = bgImg
    ? `style="background-image:image-set(url('${escapeHtml(_webpUrl(bgImg))}') type('image/webp'), url('${escapeHtml(bgImg)}') type('image/jpeg'))"`
    : '';

  if (slide.type === 'cover') {
    const title = currentStoria.title[lang] || currentStoria.title.it;
    const sub   = currentStoria.sub[lang]   || currentStoria.sub.it;
    wrap.innerHTML = `
      <div class="story-slide story-slide-cover" ${bgStyle}>
        <div class="story-slide-gradient"></div>
        <div class="story-slide-cover-content">
          <span class="story-cover-emoji">${escapeHtml(currentStoria.emoji)}</span>
          <h2 class="story-cover-title">${escapeHtml(title)}</h2>
          <p class="story-cover-sub">${escapeHtml(sub)}</p>
        </div>
      </div>`;
  } else {
    const title = slide.title?.[lang] || slide.title?.it || '';
    const body  = slide.body?.[lang]  || slide.body?.it  || '';
    const p  = slide.pepita ? pepite.find(x => x.nome.includes(slide.pepita) || slide.pepita.includes(x.nome)) : null;
    const ev = slide.evento ? eventi.find(x => x.titolo && (x.titolo.includes(slide.evento) || slide.evento.includes(x.titolo))) : null;
    const _arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
    wrap.innerHTML = `
      <div class="story-slide story-slide-text" ${bgStyle}>
        <div class="story-slide-gradient"></div>
        <div class="story-slide-content">
          ${slide.ora ? `<span class="story-ora">${escapeHtml(slide.ora)}</span>` : ''}
          <h3 class="story-slide-title">${escapeHtml(title)}</h3>
          <p class="story-slide-body">${escapeHtml(body)}</p>
          ${(p || ev) ? `<div class="story-cta-row">
            ${p  ? `<button class="story-pepita-btn" data-pepita-id="${p.id}"><span>${categoryEmoji[p.categoria] || '✨'}</span><span>${escapeHtml(p.nome)}</span>${_arrowSvg}</button>` : ''}
            ${ev ? `<button class="story-evento-btn" data-evento-id="${ev.id}"><span>${eventBadgeEmoji[ev.badge] || '📅'}</span><span>${escapeHtml(ev.titolo)}</span>${_arrowSvg}</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    wrap.querySelector('.story-pepita-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = +e.currentTarget.dataset.pepitaId;
      const pep = pepite.find(x => x.id === pid);
      if (pep) { closeStoria(); openDetail(pep); }
    });
    wrap.querySelector('.story-evento-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const eid = +e.currentTarget.dataset.eventoId;
      const found = eventi.find(x => x.id === eid);
      if (found) { closeStoria(); openEventDetail(found); }
    });
  }

  updateProgress(idx);

  // Update nav button visibility
  document.getElementById('storyPrev').style.opacity = idx > 0 ? '1' : '0.3';
  document.getElementById('storyNext').innerHTML = idx < currentStoria.slides.length - 1
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
}

function setupStoryViewer() {
  document.getElementById('storyClose').addEventListener('click', closeStoria);

  document.getElementById('storyPrev').addEventListener('click', () => {
    if (!currentStoria || currentSlideIdx === 0) return;
    currentSlideIdx--;
    renderSlide(currentSlideIdx);
  });

  document.getElementById('storyNext').addEventListener('click', () => {
    if (!currentStoria) return;
    if (currentSlideIdx < currentStoria.slides.length - 1) {
      currentSlideIdx++;
      renderSlide(currentSlideIdx);
    } else {
      closeStoria();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (document.getElementById('storyOverlay').style.display === 'none') return;
    if (e.key === 'ArrowRight') document.getElementById('storyNext').click();
    if (e.key === 'ArrowLeft')  document.getElementById('storyPrev').click();
    if (e.key === 'Escape')     closeStoria();
  });

  // Touch swipe
  let touchStartX = 0;
  const overlay = document.getElementById('storyOverlay');
  overlay.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (e.target.closest('#storyTagsBar')) return; // let the tag bar scroll freely
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) document.getElementById('storyNext').click();
    else         document.getElementById('storyPrev').click();
  });

  // Tap-to-navigate: left 40% → prev, right 60% → next
  // pointerdown tracks start so we can ignore drags masquerading as clicks
  let _tapStartX = 0;
  overlay.addEventListener('pointerdown', (e) => { _tapStartX = e.clientX; }, { passive: true });
  overlay.addEventListener('click', (e) => {
    if (Math.abs(e.clientX - _tapStartX) > 15) return; // was a drag/swipe, not a tap
    if (e.target.closest('button, a')) return;          // let buttons handle themselves
    if (!currentStoria) return;
    const rect = overlay.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.4) {
      // Left zone → previous slide
      if (currentSlideIdx === 0) return;
      currentSlideIdx--;
      renderSlide(currentSlideIdx);
    } else {
      // Right zone → next slide (or close on last)
      if (currentSlideIdx < currentStoria.slides.length - 1) {
        currentSlideIdx++;
        renderSlide(currentSlideIdx);
      } else {
        closeStoria();
      }
    }
  });
}


// ── Global Cross-Domain Search (pepite + eventi + itinerari + storie) ──
function openGlobalSearch() {
  const overlay = document.getElementById('globalSearchOverlay');
  const input   = document.getElementById('globalSearchInput');
  if (!overlay || !input) return;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderGlobalSearchResults(input.value);
  setTimeout(() => input.focus(), 50);
  // Storie/eventi may not be loaded yet — load in background so results are complete
  if (!eventiLoaded) loadEventiData();
  if (!storieLoaded) loadStorieData();
}

function closeGlobalSearch() {
  const overlay = document.getElementById('globalSearchOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

function setupGlobalSearch() {
  const btn      = document.getElementById('globalSearchBtn');
  const overlay  = document.getElementById('globalSearchOverlay');
  const input    = document.getElementById('globalSearchInput');
  const closeBtn = document.getElementById('globalSearchClose');
  if (!btn || !overlay || !input) return;

  btn.addEventListener('click', openGlobalSearch);
  closeBtn?.addEventListener('click', closeGlobalSearch);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeGlobalSearch(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeGlobalSearch();
  });

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderGlobalSearchResults(input.value), 150);
  });

  // Keyboard navigation: ↓/↑ move between results, Enter opens the focused (or first) one.
  const resultsContainer = document.getElementById('globalSearchResults');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const results = resultsContainer ? Array.from(resultsContainer.querySelectorAll('.gs-result')) : [];
    if (results.length === 0) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') results[0].focus();
    else if (e.key === 'ArrowUp') results[results.length - 1].focus();
    else results[0].click();
  });
  resultsContainer?.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const results = Array.from(resultsContainer.querySelectorAll('.gs-result'));
    const idx = results.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && idx === 0) { input.focus(); return; }
    const nextIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, results.length - 1) : Math.max(idx - 1, 0);
    results[nextIdx].focus();
  });
}

function _gsMatch(haystack, query) {
  return !!haystack && normalizeSearch(haystack).includes(query);
}

function renderGlobalSearchResults(rawQuery) {
  const container = document.getElementById('globalSearchResults');
  if (!container) return;
  const query = normalizeSearch(rawQuery.trim());
  const isEn  = currentLang === 'en';

  if (query.length < 2) {
    container.innerHTML = `<div class="gs-empty">${isEn ? 'Type at least 2 characters to search everywhere.' : 'Scrivi almeno 2 caratteri per cercare ovunque.'}</div>`;
    return;
  }

  const MAX_PER_GROUP = 5;

  const pepiteResults = pepite.filter(p =>
    _gsMatch(p.nome, query) || _gsMatch(p.quartiere, query) || _gsMatch(getCat(p), query)
  ).slice(0, MAX_PER_GROUP);

  const eventiResults = eventi.filter(e => {
    const titolo = isEn ? (e.titolo_en || e.titolo) : e.titolo;
    const tag    = isEn ? (e.tag_en || e.tag) : e.tag;
    return _gsMatch(titolo, query) || _gsMatch(e.quartiere, query) || _gsMatch(tag, query);
  }).slice(0, MAX_PER_GROUP);

  const itinerariResults = itinerariData.filter(it =>
    _gsMatch(t(it.titoloKey), query) || _gsMatch(t(it.subKey), query)
  ).slice(0, MAX_PER_GROUP);

  const storieResults = storieData.filter(s => {
    const title = s.title?.[currentLang] || s.title?.it || '';
    const sub   = s.sub?.[currentLang]   || s.sub?.it   || '';
    return _gsMatch(title, query) || _gsMatch(sub, query);
  }).slice(0, MAX_PER_GROUP);

  const totalCount = pepiteResults.length + eventiResults.length + itinerariResults.length + storieResults.length;

  if (totalCount === 0) {
    container.innerHTML = `<div class="gs-empty">${isEn ? `No results for "${escapeHtml(rawQuery.trim())}"` : `Nessun risultato per "${escapeHtml(rawQuery.trim())}"`}</div>`;
    return;
  }

  let html = '';

  if (pepiteResults.length) {
    html += `<span class="gs-group-label">${t('tabPepite')}</span>`;
    html += pepiteResults.map(p => `
      <button class="gs-result" data-type="pepita" data-id="${p.id}">
        <span class="gs-result-emoji">${categoryEmoji[p.categoria] || '✨'}</span>
        <div class="gs-result-info">
          <span class="gs-result-name">${escapeHtml(p.nome)}</span>
          <span class="gs-result-meta">${escapeHtml(p.quartiere)}</span>
        </div>
      </button>`).join('');
  }

  if (eventiResults.length) {
    html += `<span class="gs-group-label">${t('tabEventi')}</span>`;
    html += eventiResults.map(e => {
      const titolo = isEn ? (e.titolo_en || e.titolo) : e.titolo;
      return `
      <button class="gs-result" data-type="evento" data-id="${e.id}">
        <span class="gs-result-emoji">${eventBadgeEmoji[e.badge] || '📅'}</span>
        <div class="gs-result-info">
          <span class="gs-result-name">${escapeHtml(titolo)}</span>
          <span class="gs-result-meta">${escapeHtml(e.giorno)} ${escapeHtml(e.mese)}${e.quartiere ? ' · ' + escapeHtml(e.quartiere) : ''}</span>
        </div>
      </button>`;
    }).join('');
  }

  if (itinerariResults.length) {
    html += `<span class="gs-group-label">${t('tabItinerari')}</span>`;
    html += itinerariResults.map(it => `
      <button class="gs-result" data-type="itinerario" data-giorno="${it.giorno}">
        <span class="gs-result-emoji">🗺️</span>
        <div class="gs-result-info">
          <span class="gs-result-name">${escapeHtml(t(it.titoloKey))}</span>
          <span class="gs-result-meta">${escapeHtml(t(it.subKey))}</span>
        </div>
      </button>`).join('');
  }

  if (storieResults.length) {
    html += `<span class="gs-group-label">${t('storieTab')}</span>`;
    html += storieResults.map(s => {
      const title = s.title?.[currentLang] || s.title?.it || '';
      return `
      <button class="gs-result" data-type="storia" data-id="${s.id}">
        <span class="gs-result-emoji">${escapeHtml(s.emoji || '📖')}</span>
        <div class="gs-result-info">
          <span class="gs-result-name">${escapeHtml(title)}</span>
        </div>
      </button>`;
    }).join('');
  }

  container.innerHTML = html;
  container.querySelectorAll('.gs-result').forEach(btn => {
    btn.addEventListener('click', () => _openGlobalSearchResult(btn.dataset));
  });
}

function _openGlobalSearchResult(data) {
  document.getElementById('globalSearchOverlay').style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('globalSearchInput').value = '';

  const goToTab = (tabName) => document.querySelector(`.sidebar-tab[data-tab="${tabName}"]`)?.click();

  if (data.type === 'pepita') {
    goToTab('pepite');
    const p = pepite.find(x => x.id === +data.id);
    if (p) openDetail(p);
  } else if (data.type === 'evento') {
    goToTab('eventi');
    const ev = eventi.find(x => x.id === +data.id);
    if (ev) openEventDetail(ev);
  } else if (data.type === 'itinerario') {
    goToTab('itinerari');
    setTimeout(() => {
      const card = document.querySelector(`.itinerario-card[data-giorno="${data.giorno}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('gs-highlight');
        setTimeout(() => card.classList.remove('gs-highlight'), 1600);
      }
    }, 100);
  } else if (data.type === 'storia') {
    goToTab('storie');
    const s = storieData.find(x => x.id === data.id);
    if (s) openStoria(s);
  }
  closeSidebar();
}

// ── Offline Indicator ──
function setupOfflineIndicator() {
  const banner = document.getElementById('offlineBanner');
  const text   = document.getElementById('offlineBannerText');
  if (!banner) return;

  function update() {
    if (navigator.onLine) {
      banner.style.display = 'none';
    } else {
      if (text) text.textContent = currentLang === 'en'
        ? "You're offline — using cached data"
        : 'Sei offline — usando dati in cache';
      banner.style.display = 'flex';
    }
  }

  update(); // check immediately on load
  window.addEventListener('offline', update);
  window.addEventListener('online',  update);
}


// ══════════════════════════════════════════════════════
//  MOOD MATCHER
// ══════════════════════════════════════════════════════

const moodWeights = {
  solo:     { 'Caffè & Bistrot': 3, 'Oasi Segrete': 2, 'Botteghe': 2, 'Brunch & Colazioni': 1, 'Merende': 1 },
  coppia:   { 'Ristoranti Romantici': 3, 'Oasi Segrete': 2, 'Caffè & Bistrot': 1, 'Aperitivi': 1 },
  amici:    { 'Aperitivi': 3, 'Hamburger': 2, 'Cena tra Amici': 3, 'Brunch & Colazioni': 1 },
  famiglia: { 'Brunch & Colazioni': 2, 'Merende': 3, 'Oasi Segrete': 2, 'Cascine': 3 }
};

const atmosferaWeights = {
  romantica:  { 'Ristoranti Romantici': 3, 'Oasi Segrete': 2, 'Caffè & Bistrot': 1 },
  vivace:     { 'Aperitivi': 3, 'Hamburger': 2, 'Cena tra Amici': 2 },
  tranquilla: { 'Oasi Segrete': 3, 'Caffè & Bistrot': 2, 'Brunch & Colazioni': 2, 'Cascine': 1 },
  creativa:   { 'Botteghe': 3, 'Oasi Segrete': 2, 'Caffè & Bistrot': 1 }
};

const tempoCount = { '1h': 2, 'mezza': 4, 'sera': 5 };

const moodStartHour = { '1h': 16, 'mezza': 10, 'sera': 18 };
const moodGap = { '1h': 45, 'mezza': 90, 'sera': 80 };

let moodSelections = { chi: null, atmosfera: null, tempo: null };

const moodSteps = [
  {
    key: 'chi', titleIt: 'Con chi sei?', titleEn: 'Who are you with?',
    options: [
      { val: 'solo',     emoji: '🚶', it: 'Da solo',   en: 'Solo' },
      { val: 'coppia',   emoji: '💑', it: 'In coppia', en: 'As a couple' },
      { val: 'amici',    emoji: '🎉', it: 'Con amici', en: 'With friends' },
      { val: 'famiglia', emoji: '👨‍👩‍👧', it: 'In famiglia', en: 'With family' }
    ]
  },
  {
    key: 'atmosfera', titleIt: "Che atmosfera cerchi?", titleEn: 'What vibe are you after?',
    options: [
      { val: 'romantica',  emoji: '🕯️', it: 'Romantica',  en: 'Romantic' },
      { val: 'vivace',     emoji: '🔥', it: 'Vivace',      en: 'Lively' },
      { val: 'tranquilla', emoji: '🌿', it: 'Tranquilla',  en: 'Quiet' },
      { val: 'creativa',   emoji: '🎨', it: 'Creativa',    en: 'Creative' }
    ]
  },
  {
    key: 'tempo', titleIt: 'Quanto tempo hai?', titleEn: 'How much time do you have?',
    options: [
      { val: '1h',    emoji: '⚡', it: '1 ora',          en: '1 hour' },
      { val: 'mezza', emoji: '☀️', it: 'Mezza giornata', en: 'Half a day' },
      { val: 'sera',  emoji: '🌙', it: 'Sera intera',    en: 'Full evening' }
    ]
  }
];

let currentMoodStep = 0;

function setupMoodMatcher() {
  document.getElementById('moodMatcherBtn')?.addEventListener('click', openMoodMatcher);
  document.getElementById('moodClose')?.addEventListener('click', closeMoodMatcher);
  document.getElementById('moodOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('moodOverlay')) closeMoodMatcher();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('moodOverlay')?.style.display !== 'none') {
      closeMoodMatcher();
    }
  });
}

function openMoodMatcher() {
  moodSelections = { chi: null, atmosfera: null, tempo: null };
  currentMoodStep = 0;
  document.getElementById('moodOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  renderMoodStep(0);
}

function closeMoodMatcher() {
  document.getElementById('moodOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

function renderMoodStep(stepIdx) {
  const wizard = document.getElementById('moodWizard');
  const lang = currentLang;

  if (stepIdx >= moodSteps.length) {
    // Show result
    renderMoodResult(wizard);
    return;
  }

  const step = moodSteps[stepIdx];
  const title = lang === 'en' ? step.titleEn : step.titleIt;

  wizard.innerHTML = `
    <div class="mood-step-num">${stepIdx + 1} / ${moodSteps.length}</div>
    <div class="mood-progress">
      ${moodSteps.map((_, i) => `<div class="mp-dot${i <= stepIdx ? ' active' : ''}"></div>`).join('')}
    </div>
    <h2 class="mood-step-title">${title}</h2>
    <div class="mood-options">
      ${step.options.map(opt => `
        <button class="mood-option" data-val="${opt.val}">
          <span class="mo-emoji">${opt.emoji}</span>
          <span class="mo-label">${lang === 'en' ? opt.en : opt.it}</span>
        </button>
      `).join('')}
    </div>
    ${stepIdx > 0 ? `<button class="mood-back-btn" id="moodBack">← ${lang === 'en' ? 'Back' : 'Indietro'}</button>` : ''}
  `;

  wizard.querySelectorAll('.mood-option').forEach(btn => {
    btn.addEventListener('click', () => {
      moodSelections[step.key] = btn.dataset.val;
      // Animate selection
      wizard.querySelectorAll('.mood-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentMoodStep = stepIdx + 1;
      setTimeout(() => renderMoodStep(currentMoodStep), 280);
    });
  });

  document.getElementById('moodBack')?.addEventListener('click', () => {
    currentMoodStep = stepIdx - 1;
    renderMoodStep(currentMoodStep);
  });
}

function renderMoodResult(wizard) {
  const lang = currentLang;
  const { chi, atmosfera, tempo } = moodSelections;

  // Score pepite
  const wChi = moodWeights[chi] || {};
  const wAtm = atmosferaWeights[atmosfera] || {};
  const count = tempoCount[tempo] || 3;

  const scored = pepite
    .filter(p => p.lat && p.lng)
    .map(p => ({ p, score: (wChi[p.categoria] || 0) + (wAtm[p.categoria] || 0) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score !== a.score ? b.score - a.score : Math.random() - 0.5);

  const selected = scored.slice(0, count).map(x => x.p);

  // Generate time slots
  let mins = (moodStartHour[tempo] || 10) * 60;
  const gap = moodGap[tempo] || 90;
  const slots = selected.map(() => {
    const h = Math.floor(mins / 60), m = mins % 60;
    mins += gap + 15;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  });

  // Generate title
  const chiLabels = {
    it: { solo: 'in solitaria', coppia: 'romantica', amici: 'con gli amici', famiglia: 'in famiglia' },
    en: { solo: 'solo', coppia: 'romantic', amici: 'with friends', famiglia: 'with family' }
  };
  const tempoLabels = {
    it: { '1h': 'in un\'ora', 'mezza': 'per mezza giornata', 'sera': 'per una sera' },
    en: { '1h': 'in an hour', 'mezza': 'for half a day', 'sera': 'for an evening' }
  };
  const atmEmoji = { romantica: '🕯️', vivace: '🔥', tranquilla: '🌿', creativa: '🎨' };
  const headline = lang === 'en'
    ? `${atmEmoji[atmosfera]} Your Milan ${chiLabels.en[chi]} ${tempoLabels.en[tempo]}`
    : `${atmEmoji[atmosfera]} La tua Milano ${chiLabels.it[chi]} ${tempoLabels.it[tempo]}`;

  wizard.innerHTML = `
    <div class="mood-result">
      <div class="mood-result-headline">${headline}</div>
      <div class="mood-result-stops">
        ${selected.map((p, i) => `
          <div class="mood-stop" data-pepita-id="${p.id}">
            <span class="ms-time">${slots[i]}</span>
            <span class="ms-emoji">${categoryEmoji[p.categoria] || '✨'}</span>
            <div class="ms-info">
              <strong>${escapeHtml(p.nome)}</strong>
              <span>${escapeHtml(p.quartiere)}</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="mood-result-actions">
        <button class="mood-action-main" id="moodShowMap">${lang === 'en' ? '🗺 Show on map' : '🗺 Mostra sulla mappa'}</button>
        <button class="mood-action-sec" id="moodRestart">${lang === 'en' ? '↺ Try again' : '↺ Ricomincia'}</button>
      </div>
    </div>
  `;

  wizard.querySelectorAll('.mood-stop').forEach(stop => {
    stop.addEventListener('click', () => {
      const pid = +stop.dataset.pepitaId;
      const p = pepite.find(x => x.id === pid);
      if (p) { closeMoodMatcher(); openDetail(p); } // flyTo + uncluster handled inside openDetail
    });
  });

  document.getElementById('moodShowMap')?.addEventListener('click', () => {
    closeMoodMatcher();
    showMoodResultOnMap(selected);
  });

  document.getElementById('moodRestart')?.addEventListener('click', () => {
    moodSelections = { chi: null, atmosfera: null, tempo: null };
    currentMoodStep = 0;
    renderMoodStep(0);
  });
}

function showMoodResultOnMap(pepiteList) {
  if (!map) return;
  if (itinerarioLayer) { map.removeLayer(itinerarioLayer); itinerarioLayer = null; }
  if (markerCluster) { map.removeLayer(markerCluster); markerCluster = null; }

  const group = L.layerGroup();
  const coords = [];

  pepiteList.forEach((p, idx) => {
    if (!p.lat || !p.lng) return;
    coords.push([p.lat, p.lng]);
    const icon = L.divIcon({
      className: 'pepite-marker',
      html: `<div style="background:#1A1A1A;border:2px solid #FFF;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:11px;font-weight:700;color:#FFF;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${idx + 1}</div>`,
      iconSize: [32, 32], iconAnchor: [16, 16]
    });
    const marker = L.marker([p.lat, p.lng], { icon });
    marker.bindTooltip(`${idx + 1}. ${escapeHtml(p.nome)}`, { direction: 'top', offset: [0, -18], className: 'pepite-tooltip' });
    marker.on('click', () => {
  // 1. Mantiene la tua funzione originale per aprire i dettagli
  openDetail(p); 
  
  // 2. NUOVO: Codice di monitoraggio
  // Se Google Analytics è attivo, gli inviamo il nome della Pepita cliccata
  if (typeof gtag === 'function') {
    gtag('event', 'clic_su_pepita', {
      'event_category': 'Interazione Mappa',
      'event_label': p.nome // Invia il nome esatto del luogo, es. "Bar Luce"
    });
    console.log("Tracciamento inviato per: " + p.nome); // Ti aiuta a testarlo!
  }
});
    group.addLayer(marker);
  });

  if (coords.length >= 2) {
    group.addLayer(L.polyline(coords, { color: '#1A1A1A', weight: 2, opacity: 0.45, dashArray: '5, 7' }));
  }

  itinerarioLayer = group;
  map.addLayer(itinerarioLayer);
  if (coords.length > 0) map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 15 });
}


// ══════════════════════════════════════════════════════
//  FEATURE: APERTO ORA — opening-hours parser
// ══════════════════════════════════════════════════════

// Cache per (pepita.id + calendar-day) so the parser runs once per pepita per day
// instead of on every renderPepiteList() call (which may have 50+ items).
const _openNowCache = new Map();

function isOpenNow(p) {
  if (!p.orari) return null;
  const now    = new Date();
  // Key includes hour so the cache refreshes every 60 min; getMonth()+1 for correct 1-12 range
  const hourKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}`;
  const key     = `${p.id}|${hourKey}`;
  if (_openNowCache.has(key)) return _openNowCache.get(key);
  const result = _computeOpenNow(p, now);
  _openNowCache.set(key, result);
  return result;
}

function _computeOpenNow(p, now) {
  const orari = p.orari;
  if (!orari) return null; // unknown

  const currentDayIT = now.getDay() === 0 ? 7 : now.getDay(); // IT: Lun=1…Dom=7
  const currentMins  = now.getHours() * 60 + now.getMinutes();

  const dayIT = { lun:1, mar:2, mer:3, gio:4, ven:5, sab:6, dom:7 };

  function parseDays(str) {
    // A comma-joined list of day tokens (e.g. "Ven,Sab" or "Mer,Gio-Dom"), each either
    // a single day or a hyphen range — union of all of them.
    const days = [];
    for (const token of str.trim().toLowerCase().split(',')) {
      const parts = token.split('-');
      const start = dayIT[parts[0]];
      if (!start) continue;
      const end = parts.length > 1 ? (dayIT[parts[1]] ?? start) : start;
      if (start <= end) {
        for (let d = start; d <= end; d++) days.push(d);
      } else {
        // wraps around: e.g. Ven(5)→Lun(1) = Fri Sat Sun Mon
        for (let d = start; d <= 7; d++) days.push(d);
        for (let d = 1; d <= end; d++) days.push(d);
      }
    }
    return days;
  }

  function parseMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function inRange(open, close) {
    // Handles overnight: e.g. 22:00–02:00
    if (close < open) return currentMins >= open || currentMins < close;
    return currentMins >= open && currentMins < close;
  }

  // Split only on ", " (comma + space): a bare comma with no following space joins a
  // day list that shares one time range (e.g. "Mer,Gio 18:30–23:30") and must stay together.
  const segments = orari.split(/,\s+/).map(s => s.trim()).filter(Boolean);
  let lastDays = null;

  for (const seg of segments) {
    // "Chiuso Lun-Mar" or "Chiuso Dom"
    if (/^chiuso/i.test(seg)) {
      const closedDays = parseDays(seg.replace(/^chiuso\s*/i, ''));
      if (closedDays.includes(currentDayIT)) return false;
      continue;
    }

    // "Mer-Dom 12:30–14:30", "Lun 09:00-18:00" or "Ven,Sab 18:30–01:00" — data uses an en
    // dash (–) between times (a plain hyphen also appears in a few entries, so accept both)
    // and commas without a space to list non-contiguous days sharing one time range.
    const full  = seg.match(/^([A-Za-z,-]+)\s+(\d{1,2}:\d{2})[-–](\d{1,2}:\d{2})$/);
    // "19:30–22:30"  (inherits last day range)
    const tOnly = seg.match(/^(\d{1,2}:\d{2})[-–](\d{1,2}:\d{2})$/);

    if (full) {
      lastDays = parseDays(full[1]);
      if (lastDays.includes(currentDayIT)) {
        if (inRange(parseMins(full[2]), parseMins(full[3]))) return true;
      }
    } else if (tOnly && lastDays) {
      if (lastDays.includes(currentDayIT)) {
        if (inRange(parseMins(tOnly[1]), parseMins(tOnly[2]))) return true;
      }
    }
  }

  return false;
}

// ══════════════════════════════════════════════════════
//  FEATURE: PEPITA ↔ EVENT LINKING
// ══════════════════════════════════════════════════════

// Words to ignore when matching names/addresses
const _linkStopWords = new Set([
  'via', 'corso', 'piazza', 'viale', 'largo', 'della', 'delle', 'degli',
  'dello', 'dell', 'piatto', 'posto', 'borgo', 'arte', 'casa', 'club',
  'trattoria', 'osteria', 'locanda', 'milan', 'milano', 'street', 'road'
]);

function _sigWords(str, minLen) {
  return (str || '').toLowerCase()
    .split(/[\s,.'&\-/()]+/)
    .filter(w => w.length >= minLen && !_linkStopWords.has(w));
}

function findEventsForPepita(p) {
  if (!p || !eventi.length) return [];
  const nomeW = _sigWords(p.nome,      4); // 4 chars: catches "Prada", "NoLo", "Brera"…
  const addrW = _sigWords(p.indirizzo, 4);
  return eventi.filter(ev => {
    if (isEventPast(ev)) return false;      // skip past events
    if (ev.pepita_id === p.id) return true; // explicit link always wins
    const luogo    = (ev.luogo    || '').toLowerCase();
    const luogoEn  = (ev.luogo_en || '').toLowerCase();
    const titolo   = (ev.titolo   || '').toLowerCase();
    const haystack = `${luogo} ${luogoEn} ${titolo}`;
    if (nomeW.some(w => haystack.includes(w))) return true;
    if (addrW.some(w => haystack.includes(w))) return true;
    return false;
  });
}

function findPepitaForEvent(ev) {
  if (!ev) return null;
  // Explicit link — works even without full pepite array
  if (ev.pepita_id && pepite.length) {
    const byId = pepite.find(p => p.id === ev.pepita_id);
    if (byId) return byId;
  }
  if (!pepite.length) return null; // pepite not loaded yet — caller handles async case
  const luogo    = (ev.luogo    || '').toLowerCase();
  const luogoEn  = (ev.luogo_en || '').toLowerCase();
  const titolo   = (ev.titolo   || '').toLowerCase();
  const haystack = `${luogo} ${luogoEn} ${titolo}`;
  return pepite.find(p => {
    const nomeW = _sigWords(p.nome,      4);
    const addrW = _sigWords(p.indirizzo, 4);
    return nomeW.some(w => haystack.includes(w))
        || addrW.some(w => haystack.includes(w));
  }) ?? null;
}

// ══════════════════════════════════════════════════════
//  FEATURE 16 — OPEN GRAPH DINAMICO
// ══════════════════════════════════════════════════════

function updateOGTags(p) {
  const base = window.location.origin + window.location.pathname;
  const defaultTitle = 'Milano Pepite — Scopri le gemme nascoste di Milano';
  const defaultDesc  = 'Le pepite nascoste di Milano: i luoghi autentici selezionati per te.';

  const title = p ? `${p.nome} — Milano Pepite` : defaultTitle;
  const rawDesc = p ? (p.descrizione_it || p.descrizione || defaultDesc) : defaultDesc;
  const desc  = rawDesc.length > 155 ? rawDesc.substring(0, 152) + '…' : rawDesc;
  const defaultImg = `${base}share.webp`;
  const img   = p?.immagine || defaultImg;
  const url   = p ? `${base}#pepita-${p.id}` : base;

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('content', val);
  };

  set('ogTitle',           title);
  set('ogDescription',     desc);
  set('ogImage',           img);
  set('ogUrl',             url);
  set('twitterTitle',      title);
  set('twitterDescription', desc);
  set('twitterImage',      img);
  document.title = title;
}

// ══════════════════════════════════════════════════════
//  FEATURE 18 — PEPITA DEL GIORNO EDITORIALE
// ══════════════════════════════════════════════════════

function getPurcheOggi(p) {
  const now  = new Date();
  const h    = now.getHours();
  const dow  = now.getDay(); // 0 = domenica
  const isWE = dow === 0 || dow === 6;

  const isMorning   = h >= 6  && h < 12;
  const isAfternoon = h >= 12 && h < 17;
  const isEvening   = h >= 17 && h < 21;

  const phraseMap = {
    'Caffè & Bistrot': {
      morning:   isWE ? 'Il sabato inizia meglio con un cornetto perfetto qui.'
                      : 'La colazione giusta prima di tutto.',
      afternoon: 'La pausa pomeriggio ideale per rallentare.',
      evening:   'Un ultimo caffè prima di sera.',
      night:     'Per gli amanti del tardo espresso.'
    },
    'Ristoranti Romantici': {
      morning:   'Prenota già per stasera — i tavoli finiscono.',
      afternoon: isWE ? 'Un pranzo romantico? È ancora in tempo.'
                      : 'Perfetto per un appuntamento serale.',
      evening:   'La serata ideale inizia qui.',
      night:     'La notte è giovane — e questo posto anche.'
    },
    'Aperitivi': {
      morning:   isWE ? 'Brunch-aperitivo: la combo del weekend.'
                      : 'Segnatelo per stasera.',
      afternoon: 'Happy hour tra un\'ora. Ci sei?',
      evening:   'È l\'ora migliore per essere qui.',
      night:     'Il posto giusto per continuare la serata.'
    },
    'Oasi Segrete': {
      morning:   'Il mattino perfetto per scoprire angoli nascosti.',
      afternoon: isWE ? 'La Milano segreta aspetta.'
                      : 'Fuga pomeridiana dalla routine.',
      evening:   'La luce del tramonto trasforma tutto.',
      night:     'Un segreto che vale la notte.'
    },
    'Botteghe': {
      morning:   'Prima della folla — il momento migliore.',
      afternoon: 'Pomeriggio di scoperte artigiane.',
      evening:   'Le botteghe migliori aprono tardi.',
      night:     'Vernissage, eventi, aperture speciali.'
    },
    'Brunch & Colazioni': {
      morning:   isWE ? 'Il brunch del weekend ti aspetta.'
                      : 'La colazione perfetta per iniziare.',
      afternoon: 'Brunch tardivo — un lusso che ti meriti.',
      evening:   'Per la cena leggera che sembra un brunch.',
      night:     'Qualcuno ci va anche di notte. Davvero.'
    },
    'Cascine': {
      morning:   'L\'aria di campagna in città al mattino presto.',
      afternoon: isWE ? 'La gita fuori porta senza uscire da Milano.'
                      : 'Una pausa verde tra grigi urbani.',
      evening:   'Il tramonto sulle cascine vale il viaggio.',
      night:     'Silenzio e stelle — rarità assoluta in città.'
    },
    'Merende': {
      morning:   'Per chi fa colazione due volte. Nessun giudizio.',
      afternoon: 'L\'ora della merenda è sacra. Rispettala.',
      evening:   'Merenda serale: il terzo pasto milanese.',
      night:     'Dolcezza notturna per chi sa dove cercare.'
    }
  };

  const def = {
    morning:   isWE ? 'Il weekend migliora con le scoperte giuste.'
                    : 'Inizia la giornata con una pepita.',
    afternoon: 'Il pomeriggio milanese ha un posto per te.',
    evening:   'La serata si fa bella da qui.',
    night:     'Le pepite vere non dormono mai.'
  };

  const phrases = phraseMap[p.categoria] || def;
  if (isMorning)   return phrases.morning;
  if (isAfternoon) return phrases.afternoon;
  if (isEvening)   return phrases.evening;
  return phrases.night;
}

function getPairedPepita(daily) {
  if (!daily || pepite.length < 2) return null;
  const now = new Date();
  const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  // Prefer same quartiere, different category
  const sameQ = pepite.filter(p =>
    p.id !== daily.id &&
    p.categoria !== daily.categoria &&
    p.quartiere === daily.quartiere
  );
  if (sameQ.length > 0) return sameQ[doy % sameQ.length];

  // Fallback: different category, any quartiere
  const diffCat = pepite.filter(p =>
    p.id !== daily.id &&
    p.categoria !== daily.categoria
  );
  if (diffCat.length > 0) return diffCat[(doy + 1) % diffCat.length];

  return null;
}

// ── Mobile bottom-sheet editorial preview (Pepite tab, mobile only) ──
// Surfaces the same curated content as the desktop's floating daily card + Diario tab,
// as the sheet's "editorial" resting state — see setupMobileSheetDrag.
function renderMobileEditorialPreview() {
  const dailyEl   = document.getElementById('medDaily');
  const dailyText = document.getElementById('medDailyText');
  if (dailyEl && dailyText && pepite.length > 0) {
    const now   = new Date();
    const doy   = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const daily = pepite[doy % pepite.length];
    dailyText.innerHTML = `<b>${escapeHtml(t('dailyCardLabel'))}</b> — ${escapeHtml(daily.nome)}`;
    dailyEl.style.display = 'flex';
  }

  const storiesEl    = document.getElementById('medStories');
  const storiesRow   = document.getElementById('medStoriesRow');
  const storiesLabel = document.getElementById('medStoriesLabel');
  if (storiesEl && storiesRow) {
    if (storieData.length > 0) {
      if (storiesLabel) storiesLabel.textContent = t('storieTab');
      storiesRow.innerHTML = storieData.slice(0, 4).map(s => {
        const title = s.title?.[currentLang] || s.title?.it || '';
        return `<div class="med-story" data-id="${escapeHtml(s.id)}" role="button" tabindex="0" aria-label="${escapeHtml(title)}"><span>${escapeHtml(s.emoji || '📖')} ${escapeHtml(title)}</span></div>`;
      }).join('');
      storiesRow.querySelectorAll('.med-story').forEach(el => {
        const activate = () => {
          const s = storieData.find(x => String(x.id) === el.dataset.id);
          if (s) openStoria(s);
        };
        el.addEventListener('click', activate);
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          activate();
        });
      });
      storiesEl.style.display = 'block';
    } else {
      storiesEl.style.display = 'none';
    }
  }

  const myDayText = document.getElementById('mobileMyDayHintText');
  if (myDayText) myDayText.textContent = t('myDayHint');
}

function renderDailyCard() {
  const container = document.getElementById('dailyCard');
  if (!container || pepite.length === 0) return;

  const now  = new Date();
  const doy  = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const daily = pepite[doy % pepite.length];

  const paired  = getPairedPepita(daily);
  const perche  = getPurcheOggi(daily);
  const emoji   = categoryEmoji[daily.categoria] || '✨';
  const pEmoji  = paired ? (categoryEmoji[paired.categoria] || '✨') : null;
  const label   = t('dailyCardLabel');
  const abbinaL = t('dailyAbbina');

  // Fallback SVG for missing images
  const fallbackSvg = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#F4E1D2"/><text x="32" y="40" text-anchor="middle" font-size="26">${emoji}</text></svg>`
  )}`;

  const dailyImgSrc  = daily.immagine || fallbackSvg;
  const dailyImgWebp = _webpUrl(dailyImgSrc);
  const dailyPicture = dailyImgWebp !== dailyImgSrc
    ? `<picture><source type="image/webp" srcset="${escapeHtml(dailyImgWebp)}"><img class="daily-img" src="${escapeHtml(dailyImgSrc)}" alt="${escapeHtml(daily.nome)}" loading="lazy"></picture>`
    : `<img class="daily-img" src="${escapeHtml(dailyImgSrc)}" alt="${escapeHtml(daily.nome)}" loading="lazy">`;
  container.innerHTML = `
    <span class="daily-badge">${label}</span>
    ${dailyPicture}
    <div class="daily-info">
      <span class="daily-cat">${emoji} ${escapeHtml(daily.categoria)}</span>
      <h3>${escapeHtml(daily.nome)}</h3>
      <p class="daily-perche">${escapeHtml(perche)}</p>
      ${paired ? `
      <div class="daily-abbina">
        <span class="daily-abbina-lbl">${abbinaL}</span>
        <span class="daily-abbina-name" data-id="${paired.id}">${pEmoji} ${escapeHtml(paired.nome)}</span>
      </div>` : ''}
    </div>
  `;

  // Attach error handler via DOM property — avoids inline handler and potential XSS
  const dailyImg = container.querySelector('.daily-img');
  if (dailyImg) dailyImg.onerror = function() { this.onerror = null; this.src = fallbackSvg; };

  container.style.display = ''; // reveal now that content is ready
  container.onclick = () => openDetail(daily);

  if (paired) {
    container.querySelector('.daily-abbina-name')?.addEventListener('click', e => {
      e.stopPropagation();
      openDetail(paired);
    });
  }
}

// ── Service Worker Registration + update listener ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: '/beta/' }).catch(() => {});
  });

  // Schedule tomorrow-notifications on startup (if permission already granted)
  if (Notification?.permission === 'granted') {
    // Wait until events are loaded before scheduling; give up after 15 s
    const _notifWaitDeadline = Date.now() + 15_000;
    const _waitEvents = setInterval(() => {
      if (eventiLoaded) {
        clearInterval(_waitEvents);
        scheduleEventNotifications();
      } else if (Date.now() > _notifWaitDeadline) {
        clearInterval(_waitEvents); // events failed to load — don't loop forever
      }
    }, 500);
  }

  // Listen for SW messages (events update + notification tap)
  navigator.serviceWorker.addEventListener('message', async (e) => {
    // Notification tap → open the relevant event detail
    if (e.data?.type === 'OPEN_EVENT') {
      const ev = eventi.find(x => x.id === e.data.eventId);
      if (ev) openEventDetail(ev);
      return;
    }

    if (e.data?.type !== 'EVENTI_UPDATED') return;

    // If no panel is open, silently reload events data and re-render
    if (!currentDetail && !currentEventDetail) {
      eventiLoaded = false;
      const res = await fetch('eventi.json');
      eventi = parseJsonRobust(await res.text());
      savedEventiIds = new Set(safeLocalStorageJson('eventi_saved', []));
      eventi.forEach(ev => { if (savedEventiIds.has(ev.id)) ev.salvato = true; });
      eventiLoaded = true;
      buildEventiDateFilters(); buildEventiFilters();
      renderEventi();
      if (currentMapMode === 'eventi') renderEventiMarkers();
    } else {
      // Panel is open — show a non-intrusive banner
      if (document.getElementById('eventiUpdateBanner')) return; // already shown
      const banner = document.createElement('div');
      banner.id = 'eventiUpdateBanner';
      banner.style.cssText = `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:var(--text);color:var(--bg-card);
        padding:10px 18px;border-radius:24px;font-size:13px;font-weight:500;
        box-shadow:0 4px 16px rgba(0,0,0,0.18);z-index:9000;
        display:flex;align-items:center;gap:12px;white-space:nowrap;`;
      banner.innerHTML = `<span>Nuovi eventi disponibili</span>
        <button style="background:var(--bg-card);color:var(--text);border:none;border-radius:12px;
          padding:4px 12px;font-size:12px;font-weight:600;cursor:pointer;">Ricarica</button>`;
      banner.querySelector('button').onclick = () => location.reload();
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 12000); // auto-dismiss after 12s
    }
  });
}
