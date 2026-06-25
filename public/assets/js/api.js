const CONFIG = {
  siteName: "SupaPlay",
  siteUrl: "https://legal.supaplay.fun",
  unifiedApiBase: "/api",
  animeApiBase: "https://api.animapo.fun/api",
  movieApiBase: "https://movie.supaplay.fun",
  moviePlayerApiBase: "https://movie.supaplay.fun",
  defaultPerPage: 24,
  ...(window.SUPAPLAY_CONFIG || {})
};

const requestCache = new Map();
const CACHE_TTL = 45_000;

function text(value, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function nullable(value) {
  const result = text(value);
  return result || null;
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function genres(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => text(item)).filter(Boolean))];
  return [...new Set(text(value).split(/[,|/]/).map((item) => item.trim()).filter(Boolean))];
}

function absoluteApi(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${CONFIG.unifiedApiBase.replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
}

async function requestJSON(url, options = {}, cacheMs = 0) {
  const key = `${options.method || "GET"}:${url}:${options.body || ""}`;
  if (cacheMs > 0) {
    const cached = requestCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 22_000);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal,
      credentials: url.startsWith(CONFIG.moviePlayerApiBase) ? "include" : (url.startsWith(location.origin) || url.startsWith("/") ? "same-origin" : "omit")
    });
    const raw = await response.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { throw new Error(`Invalid JSON returned by ${new URL(url, location.href).hostname}`); }
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || `Request failed with HTTP ${response.status}`);
    }
    if (cacheMs > 0) requestCache.set(key, { value: payload, expiresAt: Date.now() + cacheMs });
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The request timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeType(value) {
  const raw = text(value, "TV").toLowerCase();
  if (raw.includes("movie") || raw === "film") return "Movie";
  if (raw.includes("ona")) return "ONA";
  if (raw.includes("ova")) return "OVA";
  if (raw.includes("special")) return "Special";
  if (raw.includes("music")) return "Music";
  return "TV";
}

export function normalizeAnime(raw) {
  if (!raw || typeof raw !== "object") return null;
  const animeSlug = text(raw.animeSlug || raw.id || raw.slug);
  if (!animeSlug) return null;
  const name = text(raw.name || raw.title || raw.jname, "Untitled");
  const format = normalizeType(raw.format || raw.showType || raw.tvInfo?.showType);
  return {
    key: `animapo:${animeSlug}`,
    provider: "animapo",
    source: "anime",
    contentType: "anime",
    format,
    name,
    title: name,
    alternativeName: nullable(raw.alternativeName || raw.jname || raw.japaneseTitle),
    poster: text(raw.poster || raw.image || raw.cover?.url),
    backdrop: text(raw.backdrop || raw.banner || raw.poster || raw.image),
    description: text(raw.description || raw.synopsis),
    genres: genres(raw.genres || raw.genre || raw.description),
    year: nullable(raw.year || raw.releaseYear),
    rating: number(raw.rating ?? raw.score),
    country: nullable(raw.country),
    animeSlug,
    detailPath: null,
    subjectId: null,
    subjectType: null,
    sub: number(raw.sub ?? raw.tvInfo?.sub ?? raw.episodes?.sub),
    dub: number(raw.dub ?? raw.tvInfo?.dub ?? raw.episodes?.dub),
    episodes: number(raw.eps ?? raw.tvInfo?.eps ?? raw.episodes?.total ?? raw.episodeCount),
    adultContent: Boolean(raw.adultContent)
  };
}

export function normalizeMovie(raw) {
  if (!raw || typeof raw !== "object") return null;
  const subject = raw.subject && typeof raw.subject === "object" ? raw.subject : raw;
  const subjectId = text(subject.subjectId || raw.subjectId || subject.id || raw.id);
  const detailPath = text(subject.detailPath || raw.detailPath);
  if (!subjectId && !detailPath) return null;
  const subjectType = Number(subject.subjectType ?? raw.subjectType ?? 0) || 0;
  const contentType = subjectType === 1 ? "movie" : subjectType === 2 ? "tv" : text(raw.contentType || raw.source, "video");
  const releaseDate = text(subject.releaseDate || raw.releaseDate);
  const name = text(subject.title || raw.title || subject.name || raw.name, "Untitled");
  return {
    key: `moviebox:${subjectId || detailPath}`,
    provider: "moviebox",
    source: contentType,
    contentType,
    format: contentType === "movie" ? "Movie" : contentType === "tv" ? "TV" : text(raw.format, "Video"),
    name,
    title: name,
    alternativeName: nullable(subject.originalTitle || raw.originalTitle),
    poster: text(subject.poster || raw.poster || subject.cover?.url || raw.cover?.url || subject.image || raw.image),
    backdrop: text(subject.backdrop || raw.backdrop || subject.stills?.url || raw.stills?.url || subject.cover?.url || raw.cover?.url),
    description: text(subject.description || raw.description || subject.overview || raw.overview),
    genres: genres(subject.genre || raw.genre || subject.genres || raw.genres),
    year: /^\d{4}/.test(releaseDate) ? releaseDate.slice(0, 4) : nullable(subject.year || raw.year),
    releaseDate: releaseDate || null,
    rating: number(subject.imdbRatingValue ?? raw.imdbRatingValue ?? subject.rating ?? raw.rating),
    country: nullable(subject.countryName || raw.countryName || subject.country || raw.country),
    animeSlug: null,
    detailPath: detailPath || null,
    subjectId: subjectId || null,
    subjectType: subjectType || null,
    sub: null,
    dub: null,
    episodes: number(subject.episodeCount || raw.episodeCount),
    adultContent: Boolean(subject.adultContent || raw.adultContent)
  };
}

export function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.provider === "animapo" || raw.animeSlug || (raw.id && raw.tvInfo)) return normalizeAnime(raw);
  if (raw.provider === "moviebox" || raw.detailPath || raw.subjectId || raw.subjectType) return normalizeMovie(raw);
  return null;
}

function animeItems(payload) {
  const candidates = [
    payload?.results?.data,
    payload?.data?.results?.data,
    payload?.data?.data,
    payload?.data?.items,
    payload?.items,
    payload?.data,
    payload
  ];
  return (candidates.find(Array.isArray) || []).map(normalizeAnime).filter(Boolean);
}

function movieItems(payload) {
  const candidates = [
    payload?.data?.subjectList,
    payload?.subjectList,
    payload?.data?.results,
    payload?.results,
    payload?.data?.items,
    payload?.items,
    payload?.data,
    payload
  ];
  return (candidates.find(Array.isArray) || []).map(normalizeMovie).filter(Boolean);
}

function normalizedItems(payload) {
  const candidates = [payload?.data, payload?.items, payload?.results?.data, payload];
  const list = candidates.find(Array.isArray) || [];
  return list.map(normalizeCard).filter(Boolean);
}

function unique(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.key)) return false;
    seen.add(item.key);
    return !item.adultContent;
  });
}

export function interleave(first, second) {
  const output = [];
  const max = Math.max(first.length, second.length);
  for (let index = 0; index < max; index += 1) {
    if (first[index]) output.push(first[index]);
    if (second[index]) output.push(second[index]);
  }
  return unique(output);
}

function section(title, items, slug, description = "") {
  return { title, slug, description, items: unique(items || []) };
}

function parseUnifiedHome(payload) {
  const source = payload?.data || payload || {};
  const sections = source.sections || {};
  const output = [];
  for (const [slug, rawSection] of Object.entries(sections)) {
    const list = Array.isArray(rawSection) ? rawSection : rawSection?.items;
    if (!Array.isArray(list)) continue;
    const items = list.map(normalizeCard).filter(Boolean);
    if (!items.length) continue;
    output.push(section(rawSection?.title || slug.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " "), items, slug, rawSection?.description || ""));
  }
  return {
    banner: Array.isArray(source.banner) ? source.banner : [],
    categories: Array.isArray(source.categories) ? source.categories : [],
    sections: output,
    meta: payload?.meta || {}
  };
}

function cleanMovieSections(payload) {
  const operating = Array.isArray(payload?.data?.operatingList) ? payload.data.operatingList : [];
  const sections = [];
  for (const item of operating) {
    const list = Array.isArray(item?.subjects) ? item.subjects : Array.isArray(item?.subjectList) ? item.subjectList : [];
    const normalized = list.map(normalizeMovie).filter(Boolean);
    if (normalized.length) sections.push(section(text(item.title, "Featured"), normalized, `movie-${text(item.title, "featured").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`));
  }
  return sections;
}

export async function getHome(page = 1, perPage = CONFIG.defaultPerPage) {
  try {
    const unified = await requestJSON(absoluteApi(`home?page=${page}&perPage=${perPage}`), {}, CACHE_TTL);
    const parsed = parseUnifiedHome(unified);
    if (parsed.sections.length) return parsed;
  } catch {
    // Use the two public providers directly below.
  }

  const requests = await Promise.allSettled([
    requestJSON(`${CONFIG.animeApiBase}/most-popular?page=${page}`, {}, CACHE_TTL).catch(() => requestJSON(`${CONFIG.animeApiBase}/most-viewed?page=${page}`, {}, CACHE_TTL)),
    requestJSON(`${CONFIG.animeApiBase}/tv?page=${page}`, {}, CACHE_TTL),
    requestJSON(`${CONFIG.animeApiBase}/movie?page=${page}`, {}, CACHE_TTL),
    requestJSON(`${CONFIG.movieApiBase}/trending?page=${page}&perPage=${perPage}`, {}, CACHE_TTL),
    requestJSON(`${CONFIG.movieApiBase}/genre/all?type=tv&page=${page}&perPage=${perPage}`, {}, CACHE_TTL),
    requestJSON(`${CONFIG.movieApiBase}/genre/all?type=movie&page=${page}&perPage=${perPage}`, {}, CACHE_TTL),
    requestJSON(`${CONFIG.movieApiBase}/api/clean`, {}, CACHE_TTL)
  ]);
  const value = (index) => requests[index].status === "fulfilled" ? requests[index].value : {};
  const popular = interleave(animeItems(value(0)), movieItems(value(3)));
  const tv = interleave(animeItems(value(1)), movieItems(value(4)).filter((item) => item.contentType === "tv"));
  const movies = interleave(animeItems(value(2)), movieItems(value(5)).filter((item) => item.contentType === "movie"));
  const extra = cleanMovieSections(value(6));
  const sections = [
    section("Most Popular", popular, "most-popular", "Trending anime, movies and shows"),
    section("TV Shows", tv, "tv", "Anime series and live-action television"),
    section("Movies", movies, "movie", "Anime films and feature movies"),
    ...extra
  ].filter((item) => item.items.length);
  if (!sections.length) throw new Error("Both catalogue providers are currently unavailable");
  return { banner: [], categories: [], sections, meta: { partial: requests.some((item) => item.status === "rejected") } };
}

async function listFallback(kind, value, page, perPage) {
  let animeUrl;
  let movieUrl;
  if (kind === "genre") {
    animeUrl = `${CONFIG.animeApiBase}/genre/${encodeURIComponent(value)}?page=${page}`;
    movieUrl = `${CONFIG.movieApiBase}/genre/${encodeURIComponent(value)}?type=all&page=${page}&perPage=${perPage}`;
  } else if (kind === "search") {
    const [animeResult, movieResult] = await Promise.allSettled([
      requestJSON(`${CONFIG.animeApiBase}/search?keyword=${encodeURIComponent(value)}&page=${page}`, {}, CACHE_TTL),
      requestJSON(`${CONFIG.movieApiBase}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: value, page, perPage, subjectType: 0 })
      }, CACHE_TTL)
    ]);
    return interleave(
      animeResult.status === "fulfilled" ? animeItems(animeResult.value) : [],
      movieResult.status === "fulfilled" ? movieItems(movieResult.value) : []
    );
  } else if (kind === "most-popular") {
    const [animeResult, movieResult] = await Promise.allSettled([
      requestJSON(`${CONFIG.animeApiBase}/most-popular?page=${page}`, {}, CACHE_TTL).catch(() => requestJSON(`${CONFIG.animeApiBase}/most-viewed?page=${page}`, {}, CACHE_TTL)),
      requestJSON(`${CONFIG.movieApiBase}/trending?page=${page}&perPage=${perPage}`, {}, CACHE_TTL)
    ]);
    return interleave(
      animeResult.status === "fulfilled" ? animeItems(animeResult.value) : [],
      movieResult.status === "fulfilled" ? movieItems(movieResult.value) : []
    );
  } else {
    animeUrl = `${CONFIG.animeApiBase}/${kind}?page=${page}`;
    movieUrl = `${CONFIG.movieApiBase}/genre/all?type=${encodeURIComponent(kind)}&page=${page}&perPage=${perPage}`;
  }

  const [animeResult, movieResult] = await Promise.allSettled([
    requestJSON(animeUrl, {}, CACHE_TTL), requestJSON(movieUrl, {}, CACHE_TTL)
  ]);
  const first = animeResult.status === "fulfilled" ? animeItems(animeResult.value) : [];
  let second = movieResult.status === "fulfilled" ? movieItems(movieResult.value) : [];
  if (kind === "movie" || kind === "tv") second = second.filter((item) => item.contentType === kind);
  return interleave(first, second);
}

export async function getList(kind, { value = "", page = 1, perPage = CONFIG.defaultPerPage } = {}) {
  const route = kind === "genre"
    ? `genre/${encodeURIComponent(value)}`
    : kind === "search"
      ? `search?keyword=${encodeURIComponent(value)}`
      : kind;
  const separator = route.includes("?") ? "&" : "?";
  try {
    const payload = await requestJSON(absoluteApi(`${route}${separator}page=${page}&perPage=${perPage}`), {}, CACHE_TTL);
    const items = normalizedItems(payload);
    if (items.length || payload?.success) return { items, pagination: payload?.pagination || { page, perPage, count: items.length }, meta: payload?.meta || {} };
  } catch {
    // Use direct provider fallback.
  }
  const items = await listFallback(kind, value, page, perPage);
  return { items, pagination: { page, perPage, count: items.length }, meta: { directProviders: true } };
}

function normalizeAnimeDetail(payload, identifier) {
  const raw = payload?.data || payload || {};
  const nested = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
  const anime = nested?.anime || nested?.series || {};
  const episodes = Array.isArray(nested?.episodes) ? nested.episodes : [];
  const card = normalizeAnime({
    ...anime,
    id: nested?.slug || anime?.slug || identifier,
    poster: anime?.poster || nested?.poster,
    sub: nested?.language_availability?.sub_episodes ?? anime?.sub,
    dub: nested?.language_availability?.dub_episodes ?? anime?.dub,
    eps: episodes.length || anime?.episodes
  });
  return {
    card,
    episodes,
    seasons: [],
    languageAvailability: nested?.language_availability || null,
    providerData: nested
  };
}

function findArray(object, keys, depth = 0) {
  if (!object || typeof object !== "object" || depth > 4) return [];
  for (const key of keys) if (Array.isArray(object[key])) return object[key];
  for (const value of Object.values(object)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = findArray(value, keys, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function normalizeMovieDetail(payload, identifier, subjectId) {
  const raw = payload?.data || payload || {};
  const card = normalizeMovie({ ...raw, detailPath: raw?.detailPath || identifier, subjectId: raw?.subjectId || subjectId });
  const seasons = Array.isArray(raw?.seasons) ? raw.seasons : Array.isArray(raw?.seasonList) ? raw.seasonList : findArray(raw, ["seasons", "seasonList"]);
  return { card, episodes: [], seasons, providerData: raw };
}

export async function getDetail({ identifier, source, subjectId = "" }) {
  const cleanSource = source === "movie" || source === "moviebox" ? "movie" : "anime";
  const query = new URLSearchParams({ source: cleanSource });
  if (subjectId) query.set("id", subjectId);
  try {
    const payload = await requestJSON(absoluteApi(`detail/${encodeURIComponent(identifier)}?${query}`), {}, CACHE_TTL);
    const data = payload?.data || {};
    const card = normalizeCard(data);
    if (card) {
      return {
        card,
        episodes: Array.isArray(data.episodes) ? data.episodes : [],
        seasons: Array.isArray(data.seasons) ? data.seasons : [],
        languageAvailability: data.languageAvailability || null,
        providerData: data.providerData || data
      };
    }
  } catch {
    // Use direct provider detail below.
  }
  if (cleanSource === "anime") {
    const payload = await requestJSON(`${CONFIG.animeApiBase}/series/${encodeURIComponent(identifier)}`, {}, CACHE_TTL);
    return normalizeAnimeDetail(payload, identifier);
  }
  if (!subjectId) throw new Error("This movie or TV item is missing its subjectId");
  const payload = await requestJSON(`${CONFIG.movieApiBase}/detail/${encodeURIComponent(subjectId)}`, {}, CACHE_TTL);
  return normalizeMovieDetail(payload, identifier, subjectId);
}

function episodeNumber(episode, fallback) {
  return Number(episode?.number ?? episode?.episode ?? episode?.episode_number ?? episode?.ep ?? fallback) || fallback;
}

export function animeEpisodeSource(episode, language = "sub") {
  if (!episode) return "";
  const lang = language === "dub" ? "dub" : "sub";
  const candidates = [
    typeof episode?.embed_url === "object" ? episode.embed_url[lang] : null,
    episode?.[`${lang}_url`],
    episode?.[`embed_${lang}_url`],
    episode?.streams?.[lang]?.url,
    episode?.sources?.[lang]?.url,
    lang === "sub" && typeof episode?.embed_url === "string" ? episode.embed_url : null
  ];
  return text(candidates.find((item) => typeof item === "string" && item.trim()));
}

export function normalizeEpisodes(episodes = []) {
  return episodes.map((episode, index) => ({
    raw: episode,
    number: episodeNumber(episode, index + 1),
    title: text(episode?.title || episode?.name, `Episode ${episodeNumber(episode, index + 1)}`),
    sub: animeEpisodeSource(episode, "sub"),
    dub: animeEpisodeSource(episode, "dub")
  }));
}

function streamList(payload) {
  const candidates = [payload?.data?.streams, payload?.streams, payload?.data?.data?.streams];
  return candidates.find(Array.isArray) || [];
}

export async function getMoviePlayback({ subjectId, detailPath, season = 0, episode = 0 }) {
  if (!subjectId || !detailPath) throw new Error("Movie playback requires subjectId and detailPath");
  const params = new URLSearchParams({
    subjectId: String(subjectId),
    detailPath: String(detailPath),
    se: String(Math.max(0, Number(season) || 0)),
    ep: String(Math.max(0, Number(episode) || 0)),
    proxy: "1"
  });
  const payload = await requestJSON(`${CONFIG.moviePlayerApiBase}/fetchVideo?${params}`, {}, 0);
  const streams = streamList(payload).map((stream, index) => ({
    ...stream,
    url: text(stream?.streamUrl || stream?.url),
    quality: text(stream?.quality || stream?.resolution || stream?.label, `Source ${index + 1}`)
  })).filter((stream) => stream.url);
  if (!streams.length) throw new Error(payload?.message || "No playable stream was returned");

  let captions = [];
  try {
    const captionParams = new URLSearchParams({
      subjectId: String(subjectId), detailPath: String(detailPath), season: String(season), episode: String(episode)
    });
    const captionPayload = await requestJSON(`${CONFIG.moviePlayerApiBase}/fetchCaptions?${captionParams}`, {}, 0);
    if (Array.isArray(captionPayload)) captions = captionPayload;
    else captions = captionPayload?.data?.captions || captionPayload?.captions || [];
  } catch {
    captions = [];
  }
  captions = captions.map((caption) => {
    const original = caption?.url || caption?.src || caption?.file || "";
    if (!original) return caption;
    return {
      ...caption,
      originalUrl: original,
      src: `${CONFIG.moviePlayerApiBase}/subtitle?url=${encodeURIComponent(original)}`
    };
  });
  return { streams, captions, raw: payload };
}

export function detailHref(card) {
  const identifier = card?.animeSlug || card?.detailPath || card?.subjectId;
  if (!identifier) return "/";
  const params = new URLSearchParams({ source: card.animeSlug ? "anime" : "movie" });
  if (card.subjectId) params.set("id", card.subjectId);
  return `/detail/${encodeURIComponent(identifier)}?${params}`;
}

export function watchHref(card, options = {}) {
  const identifier = card?.animeSlug || card?.detailPath || card?.subjectId;
  if (!identifier) return "/";
  const params = new URLSearchParams({ source: card.animeSlug ? "anime" : "movie" });
  if (card.subjectId) params.set("id", card.subjectId);
  if (options.season !== undefined) params.set("season", options.season);
  if (options.episode !== undefined) params.set("episode", options.episode);
  if (options.language) params.set("lang", options.language);
  return `/watch/${encodeURIComponent(identifier)}?${params}`;
}

export { CONFIG };
