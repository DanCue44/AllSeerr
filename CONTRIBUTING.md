# Contributing to Allseerr

Allseerr is a fork of [Seerr](https://github.com/seerr-team/seerr) that adds music, books and
audiobooks. Bug reports, ideas and pull requests are welcome at
[DanCue44/Allseerr](https://github.com/DanCue44/Allseerr).

Problems that also happen in plain Seerr are best reported
[upstream](https://github.com/seerr-team/seerr/issues), where they help everyone.

## Before You Start

- Search the [issues](https://github.com/DanCue44/Allseerr/issues) first, and open one before a
  large change so the direction can be agreed before you write the code.
- Keep pull requests focused on one change.
- Security problems go through
  [private vulnerability reporting](https://github.com/DanCue44/Allseerr/security/advisories/new),
  never public issues. See [SECURITY.md](SECURITY.md).

## Development

You need [Node.js](https://nodejs.org/en/download/) 22, [pnpm](https://pnpm.io/installation) and
[Git](https://git-scm.com/downloads).

```bash
git clone https://github.com/YOUR_USERNAME/Allseerr.git
cd Allseerr
git switch -c your-branch main
pnpm install
pnpm dev
```

Pull requests go to `develop`, the testing branch. Changes move to `main` once they have been
tried there, and releases are tagged from `main`.

## Before Opening a Pull Request

Run these and make sure they pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- Add or update tests for the behavior you change. Tests must not reach the network.
- New UI text goes through `defineMessages`; run `pnpm i18n:extract` to update
  `src/i18n/locale/en.json`.
- API changes need a matching update to `seerr-api.yml`. An invalid spec breaks every API call,
  and `server/apiSpec.test.ts` checks it.
- Prettier formats the code base; the Git hooks run it for you.

## Commits and Pull Request Titles

Commits and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), for example
`fix(music): keep the requested album monitored`. Subjects are lowercase, and the header and each
body line stay within 100 characters. Commitlint checks this in a Git hook.

## Database Migrations

A change to an entity needs two migrations, one for SQLite and one for PostgreSQL. Build and start
the app once on `main` against an empty database of each type, then generate them from your
branch:

```bash
pnpm migration:generate server/migration/sqlite/YourMigrationName
DB_TYPE="postgres" DB_USER=postgres DB_PASS=postgres pnpm migration:generate server/migration/postgres/YourMigrationName
```

## UI Text Style

Allseerr follows Seerr's UI text style:

1. Be concise and clear.
2. Use the Oxford comma where appropriate.
3. Capitalize proper nouns with their official spelling, such as Plex, Lidarr, TMDB or IMDb.
4. Use title case for headings, buttons and form labels.
5. Capitalize the first word of validation messages, dropdown options and form tips, without
   ending punctuation.
6. Write toast messages as complete sentences that end in punctuation.
7. Style extra descriptions for a form field with the `label-tip` CSS class.
