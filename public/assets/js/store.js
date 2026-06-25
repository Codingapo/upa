const KEYS = {
  watchlist: "supaplay_watchlist_v1",
  continueWatching: "supaplay_continue_v1",
  preferences: "supaplay_preferences_v1"
};

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private browsing or restricted webviews.
  }
}

function safeCard(card) {
  if (!card || typeof card !== "object") return null;
  return {
    key: card.key || `${card.provider || "item"}:${card.animeSlug || card.detailPath || card.subjectId || card.name}`,
    provider: card.provider || (card.animeSlug ? "animapo" : "moviebox"),
    source: card.source || card.contentType || (card.animeSlug ? "anime" : "video"),
    contentType: card.contentType || card.source || (card.animeSlug ? "anime" : "video"),
    format: card.format || "",
    name: card.name || card.title || "Untitled",
    title: card.title || card.name || "Untitled",
    poster: card.poster || "",
    backdrop: card.backdrop || "",
    description: card.description || "",
    genres: Array.isArray(card.genres) ? card.genres : [],
    year: card.year || null,
    rating: card.rating ?? null,
    animeSlug: card.animeSlug || null,
    detailPath: card.detailPath || null,
    subjectId: card.subjectId || null,
    subjectType: card.subjectType || null,
    sub: card.sub ?? null,
    dub: card.dub ?? null,
    episodes: card.episodes ?? null,
    adultContent: Boolean(card.adultContent)
  };
}

export function getWatchlist() {
  return read(KEYS.watchlist, []).filter(Boolean);
}

export function isSaved(cardOrKey) {
  const key = typeof cardOrKey === "string" ? cardOrKey : safeCard(cardOrKey)?.key;
  return Boolean(key && getWatchlist().some((item) => item.key === key));
}

export function toggleWatchlist(card) {
  const normalized = safeCard(card);
  if (!normalized) return { saved: false, items: getWatchlist() };
  const items = getWatchlist();
  const index = items.findIndex((item) => item.key === normalized.key);
  let saved;
  if (index >= 0) {
    items.splice(index, 1);
    saved = false;
  } else {
    items.unshift({ ...normalized, savedAt: Date.now() });
    saved = true;
  }
  write(KEYS.watchlist, items.slice(0, 300));
  return { saved, items };
}

export function getContinueWatching() {
  return read(KEYS.continueWatching, [])
    .filter(Boolean)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

export function saveProgress(card, progress = {}) {
  const normalized = safeCard(card);
  if (!normalized) return;
  const items = getContinueWatching();
  const index = items.findIndex((item) => item.key === normalized.key);
  const duration = Number(progress.duration || 0);
  const currentTime = Number(progress.currentTime || 0);
  const percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : Number(progress.percent || 0);
  const entry = {
    ...normalized,
    season: Number(progress.season ?? 0),
    episode: Number(progress.episode ?? 0),
    language: progress.language === "dub" ? "dub" : "sub",
    currentTime,
    duration,
    percent: Number.isFinite(percent) ? percent : 0,
    updatedAt: Date.now()
  };
  if (index >= 0) items.splice(index, 1);
  if (entry.percent < 98) items.unshift(entry);
  write(KEYS.continueWatching, items.slice(0, 80));
}

export function removeProgress(key) {
  write(KEYS.continueWatching, getContinueWatching().filter((item) => item.key !== key));
}

export function getPreferences() {
  return {
    autoplay: true,
    autoSkip: true,
    preferredLanguage: "sub",
    ...read(KEYS.preferences, {})
  };
}

export function setPreferences(patch) {
  const value = { ...getPreferences(), ...(patch || {}) };
  write(KEYS.preferences, value);
  return value;
}

export { safeCard };
