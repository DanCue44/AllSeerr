---
title: Removal Requests
description: Let users ask for titles to be removed, with approval.
sidebar_position: 4
---

# Removal Requests

Users can ask for an available title to be **removed from the server**, for example after they finished watching a series. An admin reviews the request and, on approval, Allseerr removes the title and its files.

## Asking for a removal

Any user who can request media (movies, series, music or books) can open an available title and choose **Request Removal**. They can add an optional reason, such as "We finished watching it". For books, they choose which format to remove: the ebook, the audiobook or both. For titles with a 4K copy, there is a separate **Request 4K Removal**.

Only one removal request per title can be open at a time. Users can cancel their own pending removal request.

## Reviewing removals

Users with **Manage Requests** find pending removals under **Requests &rarr; Removal Requests**, with the requester and the reason.

- **Approve and Remove** removes the title and its files from the service that holds it, then marks it as deleted in Allseerr:
  - movies from Radarr, series from Sonarr,
  - albums from Lidarr (the artist is removed too when nothing else of theirs is monitored),
  - books from Chaptarr, only the chosen formats.
- **Decline** keeps the title. You can give a reason.

If the removal fails, the request shows **Removal Failed**, and approving it again retries.

:::note LazyLibrarian
LazyLibrarian cannot delete files through its API. An approved book removal only stops LazyLibrarian from searching for the book, and the file stays on disk until you delete it in LazyLibrarian. [Chaptarr](/using-seerr/services/chaptarr) does delete the files.
:::

## Notifications

There are three notification types for removals: **Removal Pending Approval** (for admins), **Removal Approved** and **Removal Declined** (for the requester). Turn them on per agent in **Settings &rarr; Notifications**, and users can choose them in their own notification settings.
