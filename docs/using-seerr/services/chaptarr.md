---
title: Chaptarr (Books and Audiobooks)
description: Request ebooks and audiobooks through Chaptarr.
sidebar_position: 2
---

# Chaptarr (Books and Audiobooks)

Chaptarr is a fork of Readarr that keeps ebooks and audiobooks as separate books. AllSeerr uses it to fetch both formats. Adding a Chaptarr server turns on books in AllSeerr: the Books space in the navigation, book and author pages, books in search and the book rows on the home page.

In AllSeerr a book is **one title with two formats**. Users choose **Ebook**, **Audiobook** or **Both** when requesting, and each format has its own status, approval and notifications. Book metadata (search, covers, authors, subjects) comes from [OpenLibrary](https://openlibrary.org), so no API key is needed.

:::tip
Chaptarr is the recommended book service. [LazyLibrarian](/using-seerr/services/lazylibrarian) still works as a legacy option, but it cannot delete files on removal and does not track the two formats as well.
:::

## Prepare Chaptarr first

AllSeerr adds authors and books to Chaptarr, but Chaptarr does the searching and downloading. Set it up so it works on its own before connecting AllSeerr.

### Root folders

Create **two root folders** in Chaptarr (**Settings &rarr; Media Management**), one for ebooks and one for audiobooks, for example:

- `/books/ebooks`
- `/books/audiobooks`

Keeping them apart lets your reader and your audiobook player (such as [Audiobookshelf](/using-seerr/services/audiobookshelf)) each watch their own folder.

### Quality and metadata profiles

Chaptarr has separate quality profiles and metadata profiles for ebooks and audiobooks. Check that you have at least one of each for each format you want to offer.

### Download client and category

Add your download client under **Settings &rarr; Download Clients** and give Chaptarr its **own category** (for example `books`, or `ebooks` and `audiobooks` if your client supports two). A dedicated category keeps book downloads away from Radarr, Sonarr and Lidarr, which would otherwise try to import them.

### Indexers through Prowlarr

The easiest way to give Chaptarr indexers is [Prowlarr](https://prowlarr.com). In Prowlarr, go to **Settings &rarr; Apps**, add Chaptarr with its address and API key, and sync. As Chaptarr is a Readarr fork, use Prowlarr's Readarr application type if your Prowlarr version has no Chaptarr entry. Make sure your indexers have book and audiobook categories enabled.

## Adding the server

Go to **Settings &rarr; Services** and click **Add Chaptarr Server**.

| Setting | What to enter |
|---|---|
| **Default Server** | Check this for the server book requests go to. One Chaptarr server must be the default. |
| **Server Name** | Any name, for example `Chaptarr`. |
| **Hostname or IP Address** | The address AllSeerr can reach Chaptarr on, for example `192.168.1.10`. |
| **Port** | The port Chaptarr listens on (see **Settings &rarr; General** in Chaptarr). |
| **Use SSL** | Only if Chaptarr is served over HTTPS. |
| **API Key** | Chaptarr: **Settings &rarr; General &rarr; Security &rarr; API Key**. |
| **URL Base** | Only if you set a URL Base in Chaptarr (**Settings &rarr; General &rarr; Host**), for example `/chaptarr`. |

Click **Test** to load the profiles, folders and tags. The form then has an **Ebooks** section and an **Audiobooks** section. For each format, pick a **Quality Profile**, **Metadata Profile** and **Root Folder**, or leave all three empty if this server should not handle that format. At least one format must be filled in.

The other options work like they do for Radarr and Sonarr: **Tags**, **Tag Requests**, **External URL**, **Enable Scan** (recommended) and **Enable Automatic Search**.

:::note
Other Readarr compatible servers can be added here too. Readarr keeps only one copy of each book, so pick the same settings for both formats if you want to request both from it.
:::

## What happens on a request

When a book request is approved, AllSeerr:

1. Adds the author to Chaptarr if needed, with only the requested book monitored, and turns on monitoring for the requested format on that author (Chaptarr only grabs a format automatically when the author is monitored for it).
2. Links the book Chaptarr already has, or adds it.
3. Starts a search if **Enable Automatic Search** is on.

The **Chaptarr Scan** job (**Settings &rarr; Jobs & Cache**) links books Chaptarr already has, marks each format as available or processing, and resets a format Chaptarr clearly no longer has. Download progress is shown separately for the ebook and the audiobook.

Admins can also search again, grab a specific release or replace a file from the manage panel of a book, and from issues. Approved [removal requests](/using-seerr/features/removal-requests) delete the requested format's files in Chaptarr.

## Language

Set the default language for book requests in **Settings &rarr; General &rarr; Book Language**. Users can pick their own language in their profile settings, and managers can pick another one when requesting. **Any Language** downloads whichever language is found.

To keep downloads in the chosen language, AllSeerr manages a tag and a release profile in Chaptarr for each language:

- Tags are named `allseerr-lang-<code>`, for example `allseerr-lang-en` or `allseerr-lang-es`, and are put on the authors AllSeerr adds.
- Each tag has a release profile. For English, releases that name another language are rejected. For other languages, releases must name the language.

Do not rename these tags. You can leave the release profiles alone; AllSeerr updates them when needed.

## Other book settings

In **Settings &rarr; General**:

- **Default Book Format**: the format preselected in the request dialog (Ebook, Audiobook or Both).
- **Google Books API Key**: lets AllSeerr check whether a book has an ebook edition. See [Google Books](/using-seerr/services/google-books).
- When both Chaptarr and LazyLibrarian are configured, choose which one book requests go to in **Settings &rarr; Services**.

Audiobook editions are checked in the public Audible catalog, which also gives narrators and length. The Audible store follows your **Discover Region**.

## Who can request books

Books have their own **Request Books** permission. Book requests are approved automatically for users with **Auto-Approve**. Book request limits can be set per user, like movie and series limits.
