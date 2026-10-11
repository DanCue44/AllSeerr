---
title: LazyLibrarian (Legacy)
description: Request books through LazyLibrarian.
sidebar_position: 3
---

# LazyLibrarian (Legacy)

AllSeerr can send book requests to [LazyLibrarian](https://lazylibrarian.gitlab.io) instead of [Chaptarr](/using-seerr/services/chaptarr). It is kept for existing setups. New setups should use Chaptarr.

:::warning LazyLibrarian has fewer features than Chaptarr
Approved book removals cannot delete files, because LazyLibrarian has no way to do that through its API. The book only stops being searched for, and its file stays on disk until it is deleted in LazyLibrarian, which may then find it again. Chaptarr deletes the files and tracks ebooks and audiobooks separately.
:::

## Adding the server

Go to **Settings &rarr; Services** and click **Configure LazyLibrarian**.

| Setting | What to enter |
|---|---|
| **Hostname or IP Address** | The address AllSeerr can reach LazyLibrarian on, for example `192.168.1.10`. |
| **Port** | LazyLibrarian's port, `5299` by default. |
| **Use SSL** | Only if LazyLibrarian is served over HTTPS. |
| **URL Base** | Only if LazyLibrarian runs under a web root (`http_root` in its config), for example `/lazylibrarian`. |
| **API Key** | LazyLibrarian: **Config &rarr; Interface &rarr; API**. Use the full API key. The read-only key cannot request books. |
| **External URL** | Optional, for links on book pages when the hostname is not reachable from outside your network. |

Click **Test**, then **Save**.

## How requests work

An approved request finds the book in LazyLibrarian (by the OpenLibrary work id, or by title and author), adds it if needed, then queues and searches the requested format (`eBook` or `AudioBook`). LazyLibrarian should be set up with a download client and providers for both formats.

The **LazyLibrarian Scan** job (every 30 minutes by default, **Settings &rarr; Jobs & Cache**) marks a format as available when LazyLibrarian reports it as Open or Have, and as processing while it is Wanted or Snatched.

If both LazyLibrarian and Chaptarr are configured, choose which one book requests go to in **Settings &rarr; Services**.

## Moving to Chaptarr

Add a Chaptarr server (see [Chaptarr](/using-seerr/services/chaptarr)), choose Chaptarr as the book service, and let the Chaptarr scan link the books it already has. Then remove LazyLibrarian from **Settings &rarr; Services**.
