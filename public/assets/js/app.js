import {
  CONFIG,
  getHome,
  getList,
  getDetail,
  getMoviePlayback,
  normalizeEpisodes,
  animeEpisodeSource,
  detailHref,
  watchHref
} from "./api.js";
import {
  getWatchlist,
  isSaved,
  toggleWatchlist,
  getContinueWatching,
  saveProgress,
  getPreferences,
  setPreferences
} from "./store.js";

const main = document.querySelector("#main-content");
const header = document.querySelector("#site-header");
const toastRegion = document.querySelector("#toast-region");
const genreDrawer = document.querySelector("#genre-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const genreList = document.querySelector("#genre-list");
const cardRegistry = new Map();

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy",
  "History", "Horror", "Isekai", "Kids", "Music", "Mystery", "Psychological", "Romance",
  "School", "Sci-Fi", "Shounen", "Slice of Life", "Sports", "Supernatural", "Thriller", "War"
];

const icons = {
  play: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z"/></svg>',
  plus: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  info: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg>',
  search: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>',
  bookmark: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>',
  arrow: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  back: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
  forward: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
  list: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  empty: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>'
};

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truncate(value, length = 220) {
  const content = String(value || "").trim();
  return content.length > length ? `${content.slice(0, length).trim()}…` : content;
}

function registerCards(items = []) {
  items.forEach((card) => card?.key && cardRegistry.set(card.key, card));
}

function providerLabel(card) {
  if (card?.provider === "animapo") return "Anime";
  if (card?.contentType === "movie") return "Movie";
  if (card?.contentType === "tv") return "TV Series";
  return card?.format || "Video";
}

function cardMeta(card) {
  const pieces = [];
  if (card.year) pieces.push(card.year);
  if (card.format) pieces.push(card.format);
  if (card.episodes) pieces.push(`${card.episodes} ep${Number(card.episodes) === 1 ? "" : "s"}`);
  if (card.rating) pieces.push(`★ ${Number(card.rating).toFixed(1)}`);
  return pieces.slice(0, 2).join(" • ");
}

function posterMarkup(card, className = "") {
  const title = escapeHTML(card?.name || "Untitled");
  if (!card?.poster) return `<div class="image-fallback ${className}">${title}</div>`;
  return `<img class="${className}" src="${escapeHTML(card.poster)}" alt="${title} poster" loading="lazy" referrerpolicy="no-referrer">`;
}

function cardBadges(card) {
  const language = [];
  if (card.sub) language.push(`<span class="badge sub">SUB ${escapeHTML(card.sub)}</span>`);
  if (card.dub) language.push(`<span class="badge dub">DUB ${escapeHTML(card.dub)}</span>`);
  if (!language.length) language.push(`<span class="badge">${escapeHTML(providerLabel(card))}</span>`);
  return language.join("");
}

function mediaCard(card, progress = null) {
  registerCards([card]);
  const saved = isSaved(card);
  const href = detailHref(card);
  const providerClass = card.provider === "animapo" ? "provider-anime" : "provider-movie";
  return `
    <article class="media-card" data-card="${escapeHTML(card.key)}">
      <a class="card-poster" href="${escapeHTML(href)}" data-link aria-label="View ${escapeHTML(card.name)}">
        ${posterMarkup(card)}
        <div class="card-badges"><div class="card-language">${cardBadges(card)}</div></div>
        <span class="card-play">${icons.play}</span>
        ${progress ? `<div class="card-progress"><span style="width:${Math.max(2, Math.min(100, Number(progress.percent || 0)))}%"></span></div>` : ""}
      </a>
      <button class="card-save ${saved ? "saved" : ""}" type="button" data-save="${escapeHTML(card.key)}" aria-label="${saved ? "Remove from" : "Add to"} My List">${saved ? icons.check : icons.plus}</button>
      <div class="card-copy">
        <h3 class="card-title"><a href="${escapeHTML(href)}" data-link>${escapeHTML(card.name)}</a></h3>
        <div class="card-meta"><span class="${providerClass}">${escapeHTML(providerLabel(card))}</span>${cardMeta(card) ? `<span>${escapeHTML(cardMeta(card))}</span>` : ""}</div>
      </div>
    </article>`;
}

function skeletonGrid(count = 12, horizontal = false) {
  const cards = Array.from({ length: count }, () => `
    <article class="media-card skeleton-card" aria-hidden="true">
      <div class="skeleton poster-skeleton"></div><div class="skeleton line-skeleton"></div><div class="skeleton line-skeleton short"></div>
    </article>`).join("");
  return `<div class="${horizontal ? "horizontal-scroller" : "media-grid"}">${cards}</div>`;
}

function sectionMarkup(section, { progressItems = [] } = {}) {
  const progressMap = new Map(progressItems.map((item) => [item.key, item]));
  registerCards(section.items);
  const route = ["movie", "movies"].includes(section.slug) ? "/browse/movie"
    : ["tv", "tvshows", "tv-shows"].includes(String(section.slug).toLowerCase()) ? "/browse/tv"
      : ["most-popular", "mostpopular"].includes(String(section.slug).toLowerCase()) ? "/browse/most-popular"
        : null;
  return `
    <section class="section">
      <div class="section-head">
        <div><h2 class="section-title">${escapeHTML(section.title)}</h2>${section.description ? `<p class="section-description">${escapeHTML(section.description)}</p>` : ""}</div>
        ${route ? `<a class="section-link" href="${route}" data-link>View all ${icons.arrow}</a>` : ""}
      </div>
      <div class="horizontal-scroller">${section.items.map((item) => mediaCard(item, progressMap.get(item.key))).join("")}</div>
    </section>`;
}

function heroMarkup(card) {
  registerCards([card]);
  const background = card.backdrop || card.poster;
  const watch = watchHref(card, card.provider === "animapo" ? { episode: 1, language: card.sub ? "sub" : "dub" } : {});
  const saved = isSaved(card);
  return `
    <section class="hero">
      <div class="hero-media">${background ? `<img src="${escapeHTML(background)}" alt="" referrerpolicy="no-referrer">` : ""}</div>
      <div class="hero-content shell">
        <div class="hero-copy">
          <div class="hero-badges"><span class="badge primary">${escapeHTML(providerLabel(card))}</span>${card.rating ? `<span class="badge rating">★ ${escapeHTML(Number(card.rating).toFixed(1))}</span>` : ""}${card.sub ? `<span class="badge sub">SUB ${escapeHTML(card.sub)}</span>` : ""}${card.dub ? `<span class="badge dub">DUB ${escapeHTML(card.dub)}</span>` : ""}</div>
          <h1>${escapeHTML(card.name)}</h1>
          <div class="meta-row">${[card.year, card.format, card.episodes ? `${card.episodes} episodes` : "", card.genres?.slice(0, 2).join(" • ")].filter(Boolean).map((item, index) => `<span class="${index ? "meta-dot" : ""}">${escapeHTML(item)}</span>`).join("")}</div>
          <p class="hero-description">${escapeHTML(truncate(card.description || `Discover ${card.name} on SupaPlay.`, 360))}</p>
          <div class="hero-actions">
            <a class="button primary" href="${escapeHTML(watch)}" data-link>${icons.play}<span>Watch now</span></a>
            <a class="button ghost" href="${escapeHTML(detailHref(card))}" data-link>${icons.info}<span>More info</span></a>
            <button class="button ghost" type="button" data-save="${escapeHTML(card.key)}">${saved ? icons.check : icons.plus}<span>${saved ? "In My List" : "My List"}</span></button>
          </div>
        </div>
      </div>
    </section>`;
}

function pageError(title, message) {
  return `<div class="page shell"><div class="error-state"><div class="empty-icon">${icons.info}</div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p><button class="button primary" type="button" data-retry>Try again</button></div></div>`;
}

function emptyState(title, message, action = "") {
  return `<div class="empty-state"><div class="empty-icon">${icons.empty}</div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(message)}</p>${action}</div>`;
}

function setSEO({ title = "SupaPlay", description = "Anime, movies and TV shows together in one seamless catalogue.", image = "", path = location.pathname } = {}) {
  document.title = title === "SupaPlay" ? "SupaPlay — Anime, Movies & TV" : `${title} — SupaPlay`;
  const canonical = new URL(path, CONFIG.siteUrl).toString();
  const values = {
    'meta[name="description"]': description,
    'meta[property="og:title"]': document.title,
    'meta[property="og:description"]': description,
    'meta[property="og:url"]': canonical
  };
  for (const [selector, content] of Object.entries(values)) {
    const element = document.querySelector(selector);
    if (element) element.setAttribute("content", content);
  }
  const canonicalElement = document.querySelector('link[rel="canonical"]');
  if (canonicalElement) canonicalElement.href = canonical;
  let imageMeta = document.querySelector('meta[property="og:image"]');
  if (image) {
    if (!imageMeta) {
      imageMeta = document.createElement("meta");
      imageMeta.setAttribute("property", "og:image");
      document.head.append(imageMeta);
    }
    imageMeta.setAttribute("content", image);
  } else if (imageMeta) imageMeta.remove();
}

function setStructuredData(card = null) {
  document.querySelector("#page-jsonld")?.remove();
  if (!card) return;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "page-jsonld";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": card.format === "Movie" ? "Movie" : "TVSeries",
    name: card.name,
    description: card.description || undefined,
    image: card.poster || undefined,
    genre: card.genres || undefined,
    datePublished: card.year || undefined,
    aggregateRating: card.rating ? { "@type": "AggregateRating", ratingValue: card.rating, bestRating: 10 } : undefined
  });
  document.head.append(script);
}

function toast(message) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;
  toastRegion.append(element);
  setTimeout(() => element.remove(), 2800);
}

function updateActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === name));
}

function navigate(url, { replace = false } = {}) {
  closeGenres();
  const target = new URL(url, location.href);
  if (target.origin !== location.origin) {
    location.href = target.href;
    return;
  }
  history[replace ? "replaceState" : "pushState"]({}, "", `${target.pathname}${target.search}${target.hash}`);
  renderRoute();
}

async function renderHome() {
  updateActiveNav("home");
  setSEO();
  setStructuredData();
  main.innerHTML = `<section class="hero"><div class="hero-content shell"><div class="hero-copy"><div class="skeleton line-skeleton short"></div><div class="skeleton" style="height:90px;border-radius:18px;margin-top:18px"></div><div class="skeleton" style="height:70px;border-radius:14px;margin-top:18px"></div></div></div></section><div class="home-content shell">${skeletonGrid(8, true)}<div class="section">${skeletonGrid(8, true)}</div></div>`;
  try {
    const home = await getHome(1, 24);
    const sections = home.sections.filter((section) => section.items?.length);
    const hero = sections.find((item) => /popular|trending/i.test(item.title))?.items?.[0] || sections[0]?.items?.[0];
    if (!hero) throw new Error("No catalogue items were returned");
    const continueWatching = getContinueWatching();
    const watchlist = getWatchlist();
    const personal = [];
    if (continueWatching.length) personal.push({ title: "Continue Watching", slug: "continue", description: "Pick up where you stopped", items: continueWatching });
    if (watchlist.length) personal.push({ title: "My List", slug: "watchlist", description: "Titles saved on this device", items: watchlist.slice(0, 24) });
    main.innerHTML = `${heroMarkup(hero)}<div class="home-content shell">${personal.map((item) => sectionMarkup(item, { progressItems: continueWatching })).join("")}${sections.map((item) => sectionMarkup(item)).join("")}</div>`;
  } catch (error) {
    main.innerHTML = pageError("SupaPlay could not load", error.message || "The catalogue is temporarily unavailable.");
  }
}

const BROWSE_LABELS = {
  movie: ["Movies", "Anime films and live-action movies in one catalogue"],
  tv: ["TV Shows", "Anime series and live-action television together"],
  anime: ["Anime", "Series, films, OVAs and specials from the anime catalogue"],
  "most-popular": ["Most Popular", "What viewers are discovering across SupaPlay"]
};

async function loadBrowseItems(kind, page, genre = "") {
  if (kind === "anime") {
    const [tv, movies] = await Promise.all([getList("tv", { page, perPage: 30 }), getList("movie", { page, perPage: 30 })]);
    const seen = new Set();
    return {
      items: [...tv.items, ...movies.items].filter((item) => item.provider === "animapo" && !seen.has(item.key) && seen.add(item.key)),
      pagination: { page, count: tv.items.length + movies.items.length }
    };
  }
  return getList(genre ? "genre" : kind, { value: genre, page, perPage: 30 });
}

async function renderBrowse(pathParts, params) {
  const genre = pathParts[0] === "genre" ? decodeURIComponent(pathParts[1] || "") : "";
  const kind = genre ? "genre" : (pathParts[0] || "most-popular");
  const page = Math.max(1, Number(params.get("page") || 1));
  const sourceFilter = params.get("source") || "all";
  const [title, subtitle] = genre ? [`${genre.replace(/-/g, " ")} titles`, `Anime, movies and TV in the ${genre.replace(/-/g, " ")} genre`] : (BROWSE_LABELS[kind] || ["Browse", "Explore SupaPlay"]);
  updateActiveNav(kind === "movie" ? "movie" : kind === "tv" ? "tv" : kind === "anime" ? "anime" : "home");
  setSEO({ title, description: subtitle, path: location.pathname });
  main.innerHTML = `<div class="page shell"><div class="page-head"><div><span class="eyebrow">SupaPlay catalogue</span><h1 class="page-title">${escapeHTML(title)}</h1><p class="page-subtitle">${escapeHTML(subtitle)}</p></div></div><div class="chip-row"><button class="chip active">All</button><button class="chip">Anime</button><button class="chip">Movies & TV</button></div>${skeletonGrid(18)}</div>`;
  try {
    const result = await loadBrowseItems(kind, page, genre);
    registerCards(result.items);
    const filtered = result.items.filter((item) => sourceFilter === "anime" ? item.provider === "animapo" : sourceFilter === "moviebox" ? item.provider === "moviebox" : true);
    const basePath = genre ? `/genre/${encodeURIComponent(genre)}` : `/browse/${kind}`;
    main.innerHTML = `
      <div class="page shell">
        <div class="page-head"><div><span class="eyebrow">SupaPlay catalogue</span><h1 class="page-title" style="text-transform:capitalize">${escapeHTML(title)}</h1><p class="page-subtitle">${escapeHTML(subtitle)}</p></div><span class="badge">Page ${page}</span></div>
        <div class="chip-row">
          <button class="chip ${sourceFilter === "all" ? "active" : ""}" data-source-filter="all" data-base="${escapeHTML(basePath)}">All</button>
          <button class="chip ${sourceFilter === "anime" ? "active" : ""}" data-source-filter="anime" data-base="${escapeHTML(basePath)}">Anime</button>
          <button class="chip ${sourceFilter === "moviebox" ? "active" : ""}" data-source-filter="moviebox" data-base="${escapeHTML(basePath)}">Movies & TV</button>
        </div>
        ${filtered.length ? `<div class="media-grid">${filtered.map((item) => mediaCard(item)).join("")}</div>` : emptyState("Nothing found", "Try another source filter or browse a different genre.")}
        <div class="hero-actions" style="justify-content:center;margin-top:42px">
          ${page > 1 ? `<a class="button ghost" href="${basePath}?page=${page - 1}${sourceFilter !== "all" ? `&source=${sourceFilter}` : ""}" data-link>${icons.back} Previous</a>` : ""}
          ${result.items.length ? `<a class="button primary" href="${basePath}?page=${page + 1}${sourceFilter !== "all" ? `&source=${sourceFilter}` : ""}" data-link>Next ${icons.forward}</a>` : ""}
        </div>
      </div>`;
  } catch (error) {
    main.innerHTML = pageError("Could not load this catalogue", error.message);
  }
}

async function renderSearch(params) {
  updateActiveNav("search");
  const query = String(params.get("q") || "").trim();
  setSEO({ title: query ? `Search: ${query}` : "Search", description: "Search anime, movies and TV shows on SupaPlay.", path: "/search" });
  main.innerHTML = `
    <div class="search-hero shell"><div class="search-panel"><span class="eyebrow">Find your next favourite</span><h1>Search SupaPlay</h1><p class="page-subtitle" style="margin-inline:auto">Search anime, movies and TV shows from both catalogues at once.</p>
      <form class="big-search" id="page-search-form">${icons.search}<input name="q" type="search" value="${escapeHTML(query)}" placeholder="Try One Piece, Dune, drama…" autocomplete="off" autofocus><button class="button primary" type="submit">${icons.search}<span>Search</span></button></form>
    </div></div>
    <div class="shell" id="search-results">${query ? skeletonGrid(18) : ""}</div>`;
  if (!query) {
    try {
      const result = await getList("most-popular", { page: 1, perPage: 18 });
      document.querySelector("#search-results").innerHTML = `<section class="section"><div class="section-head"><div><h2 class="section-title">Popular searches</h2><p class="section-description">Start with what is trending now</p></div></div><div class="media-grid">${result.items.slice(0, 18).map((item) => mediaCard(item)).join("")}</div></section>`;
    } catch {
      document.querySelector("#search-results").innerHTML = "";
    }
    return;
  }
  try {
    const page = Math.max(1, Number(params.get("page") || 1));
    const result = await getList("search", { value: query, page, perPage: 30 });
    document.querySelector("#search-results").innerHTML = result.items.length
      ? `<section class="section"><div class="section-head"><div><h2 class="section-title">Results for “${escapeHTML(query)}”</h2><p class="section-description">${result.items.length} matches from the combined catalogue</p></div></div><div class="media-grid">${result.items.map((item) => mediaCard(item)).join("")}</div></section>`
      : emptyState("No results found", `Nothing matched “${query}”. Try a shorter title or another spelling.`);
  } catch (error) {
    document.querySelector("#search-results").innerHTML = pageError("Search failed", error.message);
  }
}

function detailMeta(card) {
  return [card.year, card.format, card.country, card.episodes ? `${card.episodes} episodes` : ""].filter(Boolean);
}

function detailInfo(card) {
  const rows = [
    ["Provider", card.provider === "animapo" ? "Animapo Anime" : "SupaPlay Movies"],
    ["Type", providerLabel(card)],
    ["Genres", card.genres?.join(", ") || "Not specified"],
    ["Released", card.year || card.releaseDate || "Not specified"],
    ["Country", card.country || "Not specified"],
    ["Episodes", card.episodes || "Not specified"],
    ["Sub / Dub", card.provider === "animapo" ? `${card.sub || 0} / ${card.dub || 0}` : "Not applicable"]
  ];
  return `<div class="info-panel">${rows.map(([label, value]) => `<div class="info-row"><strong>${escapeHTML(label)}</strong><span>${escapeHTML(value)}</span></div>`).join("")}</div>`;
}

function episodeGrid(card, rawEpisodes) {
  const episodes = normalizeEpisodes(rawEpisodes);
  if (!episodes.length) return "";
  return `
    <section class="section" id="episodes">
      <div class="episode-toolbar"><div><span class="eyebrow">Episode guide</span><h2 class="section-title" style="margin-top:6px">Episodes</h2></div><div class="segmented" data-language-switch><button class="active" data-detail-language="sub">Sub</button><button data-detail-language="dub">Dub</button></div></div>
      <div class="episode-list" data-episode-list>${episodes.map((episode) => {
        const hasSub = Boolean(episode.sub); const hasDub = Boolean(episode.dub);
        return `<a class="episode-button" href="${escapeHTML(watchHref(card, { episode: episode.number, language: hasSub ? "sub" : "dub" }))}" data-link data-episode-sub="${hasSub ? "1" : "0"}" data-episode-dub="${hasDub ? "1" : "0"}"><span class="episode-number">Episode ${escapeHTML(episode.number)}</span><span class="episode-lang">${hasSub ? "SUB" : ""}${hasSub && hasDub ? " + " : ""}${hasDub ? "DUB" : ""}</span></a>`;
      }).join("")}</div>
    </section>`;
}

function genericSeasonData(rawSeasons = []) {
  return rawSeasons.map((season, index) => {
    const number = Number(season?.season ?? season?.se ?? season?.number ?? season?.seasonNumber ?? index + 1);
    const episodeCount = Number(season?.episodeCount ?? season?.episodes?.length ?? season?.epCount ?? 0);
    return { number: Number.isFinite(number) ? number : index + 1, episodeCount, raw: season };
  });
}

function movieSeasonGrid(card, rawSeasons) {
  if (card.contentType !== "tv") return "";
  const seasons = genericSeasonData(rawSeasons);
  const usable = seasons.length ? seasons : [{ number: 1, episodeCount: Number(card.episodes || 12) }];
  return `
    <section class="section"><div class="section-head"><div><span class="eyebrow">Episode guide</span><h2 class="section-title" style="margin-top:6px">Seasons</h2></div></div>
      ${usable.map((season) => `<div class="section" style="margin-top:22px"><h3>Season ${season.number}</h3><div class="episode-list">${Array.from({ length: Math.max(1, season.episodeCount || 12) }, (_, index) => `<a class="episode-button" href="${escapeHTML(watchHref(card, { season: season.number, episode: index + 1 }))}" data-link><span class="episode-number">Episode ${index + 1}</span>${icons.play}</a>`).join("")}</div></div>`).join("")}
    </section>`;
}

async function renderDetail(identifier, params) {
  const source = params.get("source") === "movie" ? "movie" : "anime";
  const subjectId = params.get("id") || params.get("subjectId") || "";
  updateActiveNav(source === "anime" ? "anime" : "home");
  main.innerHTML = `<div class="detail-hero"><div class="shell detail-layout"><div class="skeleton" style="aspect-ratio:2/3;border-radius:22px"></div><div><div class="skeleton" style="height:80px;border-radius:18px"></div><div class="skeleton" style="height:120px;border-radius:16px;margin-top:18px"></div></div></div></div>`;
  try {
    const detail = await getDetail({ identifier, source, subjectId });
    const card = detail.card;
    if (!card) throw new Error("The detail response did not contain a valid title");
    registerCards([card]);
    const saved = isSaved(card);
    const backdrop = card.backdrop || card.poster;
    const watch = watchHref(card, card.provider === "animapo" ? { episode: 1, language: card.sub ? "sub" : "dub" } : card.contentType === "tv" ? { season: 1, episode: 1 } : { season: 0, episode: 0 });
    setSEO({ title: card.name, description: truncate(card.description || `Watch ${card.name} on SupaPlay.`, 160), image: card.poster, path: location.pathname });
    setStructuredData(card);
    main.innerHTML = `
      <section class="detail-hero">
        <div class="detail-backdrop">${backdrop ? `<img src="${escapeHTML(backdrop)}" alt="" referrerpolicy="no-referrer">` : ""}</div>
        <div class="shell detail-layout">
          <div>${posterMarkup(card, "detail-poster")}</div>
          <div class="detail-copy">
            <div class="hero-badges"><span class="badge primary">${escapeHTML(providerLabel(card))}</span>${card.rating ? `<span class="badge rating">★ ${escapeHTML(Number(card.rating).toFixed(1))}</span>` : ""}${card.sub ? `<span class="badge sub">SUB ${card.sub}</span>` : ""}${card.dub ? `<span class="badge dub">DUB ${card.dub}</span>` : ""}</div>
            <h1>${escapeHTML(card.name)}</h1>
            ${card.alternativeName && card.alternativeName !== card.name ? `<p style="color:var(--muted);margin-top:-4px">${escapeHTML(card.alternativeName)}</p>` : ""}
            <div class="meta-row">${detailMeta(card).map((item, index) => `<span class="${index ? "meta-dot" : ""}">${escapeHTML(item)}</span>`).join("")}</div>
            <p class="detail-description">${escapeHTML(card.description || "No description is available for this title yet.")}</p>
            <div class="detail-actions"><a class="button primary" href="${escapeHTML(watch)}" data-link>${icons.play} Watch now</a><button class="button ghost" type="button" data-save="${escapeHTML(card.key)}">${saved ? icons.check : icons.plus} ${saved ? "In My List" : "Add to My List"}</button></div>
          </div>
        </div>
      </section>
      <div class="detail-content shell">
        <div class="detail-columns">
          <div>${card.provider === "animapo" ? episodeGrid(card, detail.episodes) : movieSeasonGrid(card, detail.seasons)}</div>
          <aside class="detail-side"><span class="eyebrow">About this title</span><h2 class="section-title" style="margin:7px 0 16px">Details</h2>${detailInfo(card)}</aside>
        </div>
        <div id="recommendations"></div>
      </div>`;
    const firstGenre = card.genres?.[0];
    if (firstGenre) {
      getList("genre", { value: slugify(firstGenre), page: 1, perPage: 18 }).then((result) => {
        const items = result.items.filter((item) => item.key !== card.key).slice(0, 16);
        if (items.length && document.querySelector("#recommendations")) document.querySelector("#recommendations").innerHTML = sectionMarkup({ title: "You may also like", slug: "recommendations", items });
      }).catch(() => {});
    }
  } catch (error) {
    main.innerHTML = pageError("This title could not be loaded", error.message);
  }
}

function appendPlayerParams(url, preferences) {
  try {
    const parsed = new URL(url, location.href);
    parsed.searchParams.set("autoplay", preferences.autoplay ? "true" : "false");
    parsed.searchParams.set("autoskip", preferences.autoSkip ? "true" : "false");
    return parsed.toString();
  } catch {
    return url;
  }
}

function captionTrack(caption, index) {
  const src = caption?.url || caption?.src || caption?.file;
  if (!src) return "";
  const language = caption?.language || caption?.lang || caption?.languageCode || "en";
  const label = caption?.label || caption?.languageName || language.toUpperCase();
  return `<track kind="subtitles" src="${escapeHTML(src)}" srclang="${escapeHTML(language)}" label="${escapeHTML(label)}" ${index === 0 ? "default" : ""}>`;
}

async function renderAnimeWatch(card, detail, params) {
  const preferences = getPreferences();
  const episodes = normalizeEpisodes(detail.episodes);
  let episodeNumber = Math.max(1, Number(params.get("episode") || 1));
  let language = params.get("lang") === "dub" ? "dub" : params.get("lang") === "sub" ? "sub" : preferences.preferredLanguage;
  const episode = episodes.find((item) => item.number === episodeNumber) || episodes[0];
  if (!episode) throw new Error("No episodes were returned for this anime");
  episodeNumber = episode.number;
  let source = language === "dub" ? episode.dub : episode.sub;
  if (!source) {
    language = language === "dub" ? "sub" : "dub";
    source = language === "dub" ? episode.dub : episode.sub;
  }
  if (!source) throw new Error("This episode does not have a playable source");
  setPreferences({ preferredLanguage: language });
  const iframeSource = appendPlayerParams(source, preferences);
  const stage = document.querySelector("#player-stage");
  stage.innerHTML = `<iframe src="${escapeHTML(iframeSource)}" title="${escapeHTML(card.name)} episode ${episodeNumber}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="origin-when-cross-origin"></iframe>`;
  document.querySelector("#watch-episode-label").textContent = `Episode ${episodeNumber} • ${language.toUpperCase()}`;
  document.querySelector("#watch-extra").innerHTML = `
    <section class="watch-episodes"><div class="episode-toolbar"><div><h2 class="section-title">Episodes</h2></div><div class="segmented"><button class="${language === "sub" ? "active" : ""}" data-watch-lang="sub">Sub</button><button class="${language === "dub" ? "active" : ""}" data-watch-lang="dub">Dub</button></div></div>
    <div class="episode-list">${episodes.map((item) => `<a class="episode-button" href="${escapeHTML(watchHref(card, { episode: item.number, language }))}" data-link style="${item.number === episodeNumber ? "border-color:var(--primary);background:rgba(139,92,246,.14)" : ""}"><span class="episode-number">Episode ${item.number}</span><span class="episode-lang">${item.sub ? "SUB" : ""}${item.sub && item.dub ? " + " : ""}${item.dub ? "DUB" : ""}</span></a>`).join("")}</div></section>`;
  const previous = episodes.find((item) => item.number === episodeNumber - 1);
  const next = episodes.find((item) => item.number === episodeNumber + 1);
  document.querySelector("#watch-controls").innerHTML = `${previous ? `<a class="button ghost small" href="${escapeHTML(watchHref(card, { episode: previous.number, language }))}" data-link>${icons.back} Previous</a>` : ""}${next ? `<a class="button primary small" href="${escapeHTML(watchHref(card, { episode: next.number, language }))}" data-link>Next ${icons.forward}</a>` : ""}`;
  saveProgress(card, { episode: episodeNumber, language, percent: 1 });

  window.__supaplayMessageHandler && window.removeEventListener("message", window.__supaplayMessageHandler);
  window.__supaplayMessageHandler = (event) => {
    const data = event.data || {};
    const currentTime = Number(data.currentTime ?? data.time ?? data.position ?? 0);
    const duration = Number(data.duration ?? 0);
    if (currentTime > 0 || duration > 0) saveProgress(card, { episode: episodeNumber, language, currentTime, duration });
    if ((data.type === "complete" || data.event === "complete") && preferences.autoplay && next) navigate(watchHref(card, { episode: next.number, language }));
  };
  window.addEventListener("message", window.__supaplayMessageHandler);
}

async function renderMovieWatch(card, detail, params) {
  const season = Math.max(0, Number(params.get("season") ?? (card.contentType === "movie" ? 0 : 1)) || 0);
  const episode = Math.max(0, Number(params.get("episode") ?? (card.contentType === "movie" ? 0 : 1)) || 0);
  document.querySelector("#watch-episode-label").textContent = card.contentType === "movie" ? "Movie" : `Season ${season} • Episode ${episode}`;
  const playback = await getMoviePlayback({ subjectId: card.subjectId, detailPath: card.detailPath, season, episode });
  const resume = getContinueWatching().find((item) => item.key === card.key && Number(item.season) === season && Number(item.episode) === episode);
  const stage = document.querySelector("#player-stage");
  const first = playback.streams[0];
  stage.innerHTML = `
    <video id="movie-video" controls autoplay playsinline preload="metadata" crossorigin="anonymous">${playback.captions.map(captionTrack).join("")}</video>
    ${playback.streams.length > 1 ? `<div class="player-options"><select class="player-select" id="quality-select" aria-label="Video quality">${playback.streams.map((stream, index) => `<option value="${index}">${escapeHTML(stream.quality)}</option>`).join("")}</select></div>` : ""}`;
  const video = document.querySelector("#movie-video");
  video.src = first.url;
  let progressTimer = 0;
  video.addEventListener("loadedmetadata", () => {
    if (resume?.currentTime && resume.currentTime < video.duration - 20) video.currentTime = resume.currentTime;
  }, { once: true });
  video.addEventListener("timeupdate", () => {
    const now = Date.now();
    if (now - progressTimer < 4000) return;
    progressTimer = now;
    saveProgress(card, { season, episode, currentTime: video.currentTime, duration: video.duration });
  });
  video.addEventListener("ended", () => saveProgress(card, { season, episode, currentTime: video.duration, duration: video.duration, percent: 100 }));
  document.querySelector("#quality-select")?.addEventListener("change", (event) => {
    const selected = playback.streams[Number(event.target.value)] || first;
    const time = video.currentTime;
    const paused = video.paused;
    video.src = selected.url;
    video.addEventListener("loadedmetadata", () => { video.currentTime = time; if (!paused) video.play().catch(() => {}); }, { once: true });
  });
  saveProgress(card, { season, episode, percent: 1 });

  if (card.contentType === "tv") {
    const seasons = genericSeasonData(detail.seasons);
    const currentSeason = seasons.find((item) => item.number === season);
    const count = currentSeason?.episodeCount || Number(card.episodes || 12);
    document.querySelector("#watch-extra").innerHTML = `<section class="watch-episodes"><div class="section-head"><div><h2 class="section-title">Season ${season}</h2></div></div><div class="episode-list">${Array.from({ length: Math.max(1, count) }, (_, index) => `<a class="episode-button" href="${escapeHTML(watchHref(card, { season, episode: index + 1 }))}" data-link style="${episode === index + 1 ? "border-color:var(--primary);background:rgba(139,92,246,.14)" : ""}"><span class="episode-number">Episode ${index + 1}</span>${icons.play}</a>`).join("")}</div></section>`;
    document.querySelector("#watch-controls").innerHTML = `${episode > 1 ? `<a class="button ghost small" href="${escapeHTML(watchHref(card, { season, episode: episode - 1 }))}" data-link>${icons.back} Previous</a>` : ""}<a class="button primary small" href="${escapeHTML(watchHref(card, { season, episode: episode + 1 }))}" data-link>Next ${icons.forward}</a>`;
  }
}

async function renderWatch(identifier, params) {
  const source = params.get("source") === "movie" ? "movie" : "anime";
  const subjectId = params.get("id") || "";
  updateActiveNav(source === "anime" ? "anime" : "home");
  setSEO({ title: "Watch", description: "Watch on SupaPlay", path: location.pathname });
  main.innerHTML = `
    <div class="watch-page"><div class="watch-shell">
      <div class="player-stage" id="player-stage"><div class="player-message"><div><div class="player-loader"></div><h2>Preparing your video</h2><p>SupaPlay is resolving the best available source.</p></div></div></div>
      <div class="watch-info"><div><span class="eyebrow" id="watch-episode-label">Loading</span><h1 id="watch-title">SupaPlay</h1><p class="page-subtitle" id="watch-description"></p></div><div class="watch-controls" id="watch-controls"></div></div>
      <div id="watch-extra"></div>
    </div></div>`;
  try {
    const detail = await getDetail({ identifier, source, subjectId });
    const card = detail.card;
    if (!card) throw new Error("The title metadata could not be resolved");
    registerCards([card]);
    document.querySelector("#watch-title").textContent = card.name;
    document.querySelector("#watch-description").textContent = truncate(card.description, 190);
    setSEO({ title: `Watch ${card.name}`, description: truncate(card.description || `Watch ${card.name} on SupaPlay`, 160), image: card.poster, path: location.pathname });
    if (card.provider === "animapo") await renderAnimeWatch(card, detail, params);
    else await renderMovieWatch(card, detail, params);
  } catch (error) {
    document.querySelector("#player-stage").innerHTML = `<div class="player-message"><div><div class="empty-icon" style="margin-bottom:16px">${icons.info}</div><h2>Playback unavailable</h2><p>${escapeHTML(error.message)}</p><button class="button primary" type="button" data-retry>Try again</button></div></div>`;
  }
}

function renderWatchlist() {
  updateActiveNav("watchlist");
  setSEO({ title: "My List", description: "Titles saved to your SupaPlay list on this device.", path: "/watchlist" });
  const items = getWatchlist();
  registerCards(items);
  main.innerHTML = `<div class="page shell"><div class="page-head"><div><span class="eyebrow">Your library</span><h1 class="page-title">My List</h1><p class="page-subtitle">Saved locally on this device. No account is required.</p></div><span class="badge">${items.length} title${items.length === 1 ? "" : "s"}</span></div>${items.length ? `<div class="media-grid">${items.map((item) => mediaCard(item)).join("")}</div>` : emptyState("Your list is empty", "Save any anime, movie or TV show and it will appear here.", `<a class="button primary" href="/" data-link>Browse SupaPlay</a>`)}</div>`;
}

async function renderRoute() {
  window.scrollTo({ top: 0, behavior: "auto" });
  const url = new URL(location.href);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  try {
    if (!parts.length) await renderHome();
    else if (parts[0] === "browse") await renderBrowse(parts.slice(1), url.searchParams);
    else if (parts[0] === "genre") await renderBrowse(["genre", parts.slice(1).join("/")], url.searchParams);
    else if (parts[0] === "search") await renderSearch(url.searchParams);
    else if (parts[0] === "detail" && parts[1]) await renderDetail(parts.slice(1).join("/"), url.searchParams);
    else if (parts[0] === "watch" && parts[1]) await renderWatch(parts.slice(1).join("/"), url.searchParams);
    else if (parts[0] === "watchlist") renderWatchlist();
    else main.innerHTML = pageError("Page not found", "The requested SupaPlay page does not exist.");
  } catch (error) {
    main.innerHTML = pageError("Something went wrong", error.message || "SupaPlay could not render this page.");
  }
  requestAnimationFrame(() => main.focus({ preventScroll: true }));
}

function openGenres() {
  genreDrawer.classList.add("open");
  genreDrawer.setAttribute("aria-hidden", "false");
  drawerBackdrop.hidden = false;
  document.body.classList.add("drawer-open");
}

function closeGenres() {
  genreDrawer.classList.remove("open");
  genreDrawer.setAttribute("aria-hidden", "true");
  drawerBackdrop.hidden = true;
  document.body.classList.remove("drawer-open");
}

genreList.innerHTML = GENRES.map((genre) => `<a href="/genre/${slugify(genre)}" data-link>${escapeHTML(genre)}</a>`).join("");

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-link]");
  if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(link.href);
    return;
  }
  if (event.target.closest("[data-open-genres]")) openGenres();
  if (event.target.closest("[data-close-genres]") || event.target === drawerBackdrop) closeGenres();

  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    const card = cardRegistry.get(saveButton.dataset.save);
    if (!card) return;
    const result = toggleWatchlist(card);
    document.querySelectorAll(`[data-save="${CSS.escape(card.key)}"]`).forEach((button) => {
      button.classList.toggle("saved", result.saved);
      button.innerHTML = button.classList.contains("card-save") ? (result.saved ? icons.check : icons.plus) : `${result.saved ? icons.check : icons.plus}<span>${result.saved ? "In My List" : "My List"}</span>`;
    });
    toast(result.saved ? `${card.name} added to My List` : `${card.name} removed from My List`);
  }

  const retry = event.target.closest("[data-retry]");
  if (retry) renderRoute();

  const sourceFilter = event.target.closest("[data-source-filter]");
  if (sourceFilter) {
    const query = new URLSearchParams(location.search);
    if (sourceFilter.dataset.sourceFilter === "all") query.delete("source");
    else query.set("source", sourceFilter.dataset.sourceFilter);
    navigate(`${sourceFilter.dataset.base}${query.toString() ? `?${query}` : ""}`);
  }

  const languageButton = event.target.closest("[data-detail-language]");
  if (languageButton) {
    const language = languageButton.dataset.detailLanguage;
    document.querySelectorAll("[data-detail-language]").forEach((button) => button.classList.toggle("active", button === languageButton));
    document.querySelectorAll("[data-episode-list] .episode-button").forEach((button) => {
      const available = button.dataset[`episode${language[0].toUpperCase()}${language.slice(1)}`] === "1";
      button.style.display = available ? "" : "none";
      if (available) {
        const target = new URL(button.href);
        target.searchParams.set("lang", language);
        button.href = target.toString();
      }
    });
  }

  const watchLanguage = event.target.closest("[data-watch-lang]");
  if (watchLanguage) {
    const query = new URLSearchParams(location.search);
    query.set("lang", watchLanguage.dataset.watchLang);
    navigate(`${location.pathname}?${query}`);
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#header-search, #page-search-form")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const query = String(data.get("q") || "").trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  }
});

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.dataset.failed) return;
  image.dataset.failed = "1";
  const fallback = document.createElement("div");
  fallback.className = image.className.includes("detail-poster") ? "image-fallback detail-poster" : "image-fallback";
  fallback.textContent = image.alt?.replace(/ poster$/i, "") || "SupaPlay";
  image.replaceWith(fallback);
}, true);

window.addEventListener("popstate", renderRoute);
window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 18), { passive: true });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeGenres(); });

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});

renderRoute();
