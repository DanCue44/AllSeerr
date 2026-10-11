---
title: Lidarr (Music)
description: Request albums through Lidarr.
sidebar_position: 1
---

# Lidarr (Music)

Adding a [Lidarr](https://lidarr.audio/) server turns on music in AllSeerr: the Music space in the navigation, album and artist pages, music in search and the music rows on the home page. Users request **albums**; AllSeerr adds the artist to Lidarr if needed and monitors only the albums that were requested.

Music metadata comes from public sources, not from Lidarr: [MusicBrainz](https://musicbrainz.org) for search, albums, track lists and artists, [Cover Art Archive](https://coverartarchive.org) for album covers, [TheAudioDB](https://www.theaudiodb.com) for artist images and biographies, and [ListenBrainz](https://listenbrainz.org) for popular albums, new releases and similar artists. No accounts or API keys are needed for any of them.

## Adding the server

Go to **Settings &rarr; Services** and click **Add Lidarr Server**.

| Setting | What to enter |
|---|---|
| **Default Server** | Check this for the server requests go to. At least one Lidarr server must be the default. |
| **Server Name** | Any name, for example `Lidarr`. |
| **Hostname or IP Address** | The address AllSeerr can reach Lidarr on, for example `192.168.1.10` or `lidarr` on a shared Docker network. |
| **Port** | Lidarr's port, `8686` by default. |
| **Use SSL** | Only if Lidarr is served over HTTPS. |
| **API Key** | Lidarr: **Settings &rarr; General &rarr; Security &rarr; API Key**. |
| **URL Base** | Only if you set a URL Base in Lidarr (**Settings &rarr; General &rarr; Host**), for example `/lidarr`. |

Click **Test** to load Lidarr's profiles, folders and tags, then pick:

- **Quality Profile**, **Metadata Profile** and **Root Folder** for new requests. The metadata profile decides which release types Lidarr keeps for an artist (albums, EPs, singles and so on), so make sure it includes the types users will request.
- **Tags** (optional) to add to every artist AllSeerr sends. **Tag Requests** also adds a tag with the requester's user ID and name.
- **External URL** (optional) for links to Lidarr on album pages when the hostname above is not reachable from outside your network.
- **Enable Scan** (recommended) so AllSeerr knows which albums Lidarr already has.
- **Enable Automatic Search** to have Lidarr search as soon as a request is approved.

Lidarr does not use the 4K split that Radarr and Sonarr have. Add more than one Lidarr server only if you really keep separate music libraries.

## Who can request music

Music has its own **Request Music** permission (**Users &rarr; Edit User &rarr; Permissions**, or the default permissions in **Settings &rarr; Users**). Music requests are approved automatically for users with **Auto-Approve**, or by an auto-approve rule in an override rule on the Lidarr server (**Settings &rarr; Services**). You can set a music request limit per user, the same way as the movie and series limits.

## Availability

- The **Lidarr Scan** job (**Settings &rarr; Jobs & Cache**) marks albums Lidarr has as available and shows download progress from Lidarr's queue. Albums Lidarr clearly no longer has are reset.
- Plex, Jellyfin and Emby music libraries are scanned too. Enable your music libraries in **Settings &rarr; Plex** (or Jellyfin, or Emby) so albums already on your media server show as available. Matching uses MusicBrainz ids, so files tagged with MusicBrainz Picard (or imported through Lidarr) match best.

## What users can do

- Search for albums and artists, browse popular albums, new releases, popular artists and genre shelves in the Music space.
- Request an album, or the whole discography from an artist page.
- See similar artists on an artist page.
- Follow an artist to hear about new releases, add albums to their watchlist or favorites, report issues and ask for an album to be removed.
