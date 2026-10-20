# Allseerr roadmap

Allseerr is a fork of [Seerr](https://github.com/seerr-team/seerr) (MIT) that extends it from movies and series to **music**, **books** and **audiobooks**, and adds a **subtitles** panel backed by Bazarr. The goal is that every new feature looks and behaves like the existing movie and series features, and that Allseerr keeps up with Seerr.

This page lists what is done, what is planned, and how Allseerr stays in step with Seerr. Ideas and bug reports are welcome at [github.com/DanCue44/Allseerr/issues](https://github.com/DanCue44/Allseerr/issues).

## Done

### Music (Lidarr)

- Lidarr servers in **Settings > Services**, with quality and metadata profiles, root folders, tags and override rules.
- Albums identified by MusicBrainz release group, with album and artist pages, square album cards and music in search.
- Metadata from MusicBrainz, Cover Art Archive, TheAudioDB and ListenBrainz: artist summaries, popular albums, new releases, popular artists, genre shelves and similar artists.
- Album requests that add the artist to Lidarr with only the requested album monitored, and discography requests from the artist page.
- Availability from the Lidarr scan and from Plex, Jellyfin and Emby music libraries, download progress from the Lidarr queue, and resetting albums Lidarr no longer has.
- The **Request Music** permission, music request limits, watchlist, blocklist, favorites, issues and removal requests for albums, following artists, and notifications for all agents.

### Books and audiobooks (Chaptarr, LazyLibrarian)

- One title with two formats: an ebook and an audiobook request are two requests on one title, each with its own status, approval, decline, completion and notifications.
- Metadata from OpenLibrary: search, works, authors, subjects, trending lists and covers.
- Chaptarr servers with separate profiles and root folders per format, the author's format monitoring turned on for requests, and a per-language tag and release profile to keep downloads in the chosen language.
- The Chaptarr scan, per-format download progress, resetting formats Chaptarr no longer has, and admin release actions (search, grab a specific release, replace a file).
- LazyLibrarian as a legacy book service.
- Ebook existence through Google Books (with an API key), audiobook existence, narrators and length from the Audible catalog.
- Audiobookshelf settings with separate ebook and audiobook libraries, and Read and Listen links that open the book itself.
- The **Request Books** permission, book request limits, a default book format, book language per server and per user, following authors, an Upcoming books section, and custom book subject rows on the home page.

### Subtitles (Bazarr)

- Bazarr settings and a subtitles panel on movie and series pages: downloaded, wanted and missing languages, and requesting a language per movie or episode.

### Interface

- **Ambient**, a redesigned interface, as the default, with the classic interface still available.
- A For You home, a space each for movies, series, music and books, one search across everything with category pills, a Library and a release calendar.
- A guided tour for first-time users.
- Custom application name, logo and accent color, with generated icons and iOS launch screens.

### Requested features from Seerr issues

- Blocking requests for titles on chosen subscription services.
- Removal requests with approval, including users removing media they requested.
- Single-episode, future-seasons-only and current-season-only series requests.
- Notifications for new episodes of ongoing seasons, and for everyone who had a title on their watchlist.
- Personal API keys, decline reasons, per-user age rating limits, auto-approve rules and filtering requests by requester.
- Browsing what is already available, collections and favorites, and remembered discover and request filters.
- A weekly Recently Added newsletter email.
- Plex connections that understand reverse proxies and Cloudflare, and alerts when a library scan keeps failing.

## Planned

- **Dedicated permissions per media type and format.** Seerr's permission bitmask is full, so music and books use the general **Auto-Approve** permission for automatic approval. Separate Auto-Approve Music, Auto-Approve Books and per-format book permissions need a second permissions column or a small permission table.
- **Book request limits per format**, if there is demand for them.
- **Screenshots and more documentation** for the new features.
- **Translations** of the new strings. Allseerr strings fall back to English where a translation is missing.

Larger ideas are tracked as issues. Open one if there is something you would like to see.

## Staying in step with Seerr

- Allseerr merges Seerr's `develop` branch regularly (at least monthly), so Seerr's fixes, security updates and translations keep flowing into Allseerr.
- Allseerr code lives in **new files and folders** wherever possible (for example `server/api/servarr/lidarr.ts`, `server/api/servarr/chaptarr.ts`, `server/api/bazarr`, `src/components/BookDetails`). Changes to Seerr's own files are kept small and additive (an extra `case`, an extra route) so merges stay cheap.
- Music follows Seerr's own music support preview where it fits, so that a future Seerr music release can be merged with as little friction as possible.
- Database changes come as one migration per database, in `server/migration/sqlite` and `server/migration/postgres`. A database migrated by Allseerr cannot be used by Seerr again.

## Versioning

An Allseerr version is the Seerr release it is based on plus an Allseerr revision: `3.5.0.1`, `3.5.0.2`, and back to `.1` when moving to a new Seerr release (`3.5.1.1`). Both numbers live in `allseerr.json`, not in `package.json`, so merges from Seerr never conflict on them.

## Contributing

Allseerr follows Seerr's conventions:

- Conventional Commits (`feat(music): ...`, `fix(books): ...`), pnpm, ESLint and Prettier through the Husky hooks.
- `pnpm i18n:extract` after changing interface strings, with `defineMessages('components.X')`.
- Server tests next to the code (`*.test.ts`).
- Every new API route documented in `seerr-api.yml`. Requests are validated against it, and undocumented routes are rejected.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setting up a development environment.
