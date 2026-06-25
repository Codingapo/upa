# SupaPlay Website

Production frontend for **https://legal.supaplay.fun**.

The site combines:

- Anime metadata and episodes from `https://api.animapo.fun/api`
- Movies and TV metadata/playback from `https://movie.supaplay.fun`
- The preferred unified smart API at `https://legal.supaplay.fun/api`

The browser requests the same-origin unified API first. If it is unavailable, catalogue pages automatically fall back to the two public provider APIs.

## Included pages

- `/` — mixed home page
- `/browse/movie` — movies and anime films
- `/browse/tv` — live-action TV and anime series
- `/browse/anime` — anime-only catalogue
- `/browse/most-popular` — combined trending catalogue
- `/genre/{slug}` — combined genre results
- `/search?q={keyword}` — searches both providers
- `/detail/{animeSlug}?source=anime`
- `/detail/{detailPath}?source=movie&id={subjectId}`
- `/watch/{identifier}` — anime iframe playback or MovieBox native video
- `/watchlist` — local My List

The site also includes local watch progress, resume playback, anime sub/dub selection, MovieBox quality selection, responsive bottom navigation, SEO metadata, PWA files, and direct-provider fallback.

## Deploy

```bash
unzip supaplay-website.zip
cd supaplay-website
sudo ./deploy.sh
```

The script installs the files under `/var/www/legal.supaplay.fun`, enables the Nginx site, and reloads Nginx. When a certificate does not exist yet, it installs an HTTP configuration first and prints the required Certbot command:

```bash
sudo certbot --nginx -d legal.supaplay.fun
```

The complete production HTTPS configuration is also included as `nginx-legal-supaplay.conf`.

## Smart API configuration

Run the smart API on port `4000` and set:

```env
PORT=4000
ANIME_API_BASE=https://api.animapo.fun
MOVIE_API_BASE=https://movie.supaplay.fun
PUBLIC_BASE_URL=https://legal.supaplay.fun
```

Nginx proxies only `/api/*` to port 4000. Website routes such as `/detail/*` and `/watch/*` remain frontend pages.

## Local preview

No npm packages are required.

```bash
npm start
```

Open `http://localhost:8080`. The local server proxies `/api/*` to `http://127.0.0.1:4000` by default. Change it with:

```bash
API_TARGET=http://127.0.0.1:4008 npm start
```

## Change API addresses

Edit the `window.SUPAPLAY_CONFIG` object near the bottom of `public/index.html`.
