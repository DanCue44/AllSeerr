---
title: Bazarr (Subtitles)
description: Show subtitle status and request subtitle languages through Bazarr.
sidebar_position: 5
---

# Bazarr (Subtitles)

With a [Bazarr](https://www.bazarr.media) server connected, movie and series pages get a **Subtitles** panel that lists the languages that are:

- **downloaded**, whether embedded in the video file or as a separate file, and whether they are forced or for the hearing impaired,
- **wanted**, from the item's Bazarr language profile,
- **missing**.

Users can also **request a subtitle language** from the languages enabled in Bazarr. Allseerr asks Bazarr to search for it and download it. For series, subtitles are shown and requested per episode.

## Before you start

Bazarr has to be connected to the **same Radarr and Sonarr servers** Allseerr uses, and Allseerr's Radarr and Sonarr scans should be enabled. Allseerr finds an item in Bazarr by its Radarr or Sonarr id, so titles that are not in your default (non-4K) Radarr or Sonarr do not get a subtitles panel.

## Settings

Go to **Settings &rarr; Services** and click **Configure Bazarr**.

| Setting | What to enter |
|---|---|
| **Hostname or IP Address** | The address Allseerr can reach Bazarr on, for example `192.168.1.10`. |
| **Port** | Bazarr's port, `6767` by default. |
| **Use SSL** | Only if Bazarr is served over HTTPS. |
| **URL Base** | Only if Bazarr runs under a base URL (**Settings &rarr; General &rarr; Base URL** in Bazarr), for example `/bazarr`. |
| **API Key** | Bazarr: **Settings &rarr; General &rarr; Security**. |
| **External URL** | Optional, for links to Bazarr when the hostname is not reachable from outside your network. |

Click **Test**, then **Save**.

## Who can request subtitles

Any user with the **Request** permission can request a subtitle language. Bazarr does the actual search with the providers you set up in Bazarr, so a request may find nothing if no provider has that language.
