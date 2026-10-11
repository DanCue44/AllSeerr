---
title: Audiobookshelf
description: Link available books to your Audiobookshelf server.
sidebar_position: 4
---

# Audiobookshelf

[Audiobookshelf](https://www.audiobookshelf.org) is a self-hosted server for audiobooks and ebooks. AllSeerr does not download anything through it. It only links to it: once a book is available, its page shows **Read in Audiobookshelf** and **Listen in Audiobookshelf** buttons.

## Settings

Go to **Settings &rarr; Services** and click **Configure Audiobookshelf**.

| Setting | What to enter |
|---|---|
| **Audiobookshelf URL** | The public address of your Audiobookshelf server, as your users open it, for example `https://audiobooks.example.com`. No trailing slash. |
| **API Key** | Optional, see below. With a key, **Test** lists your libraries to pick from, and the buttons open the book itself instead of a title search. |
| **Audiobook Library** | Optional. The library your audiobooks are in. Without a library, the buttons open the Audiobookshelf home page. |
| **Ebook Library** | Optional. The library your ebooks are in, when they are kept apart from the audiobooks. Choose **Same as the audiobook library** if both formats live in one library. |

Without an API key, you can still enter the library IDs by hand. A library ID is the UUID in the address bar when you open the library in Audiobookshelf, for example `https://audiobooks.example.com/library/3f2b6c1e-8d4a-4b7e-9c2f-1a5d7e9b0c34`.

## A read-only user and API key

The API key is only used by the AllSeerr server to list libraries and find books. It is never sent to users. Still, give it as little access as possible by creating a dedicated user:

1. In Audiobookshelf, open **Settings &rarr; Users** and click **Add User**.
2. Name it, for example `allseerr`, set the account type to **User**, and give it a password.
3. Turn off the permissions it does not need: **Can Download**, **Can Update**, **Can Delete** and **Can Upload**.
4. Give it access to the ebook and audiobook libraries (or all libraries), then save.
5. Open the new user in **Settings &rarr; Users** and copy its **API Token**. (Newer Audiobookshelf versions can also create a key under **Settings &rarr; API Keys**; assign it to this user.)
6. Paste the token into **API Key** in AllSeerr, click **Test**, pick the libraries and save.

## How links are matched

With an API key, AllSeerr looks for the book in the chosen library by title, author and edition, and links straight to it. When it cannot find a match (or no key is set), the button opens a title search in the library instead.

Ebook links use the **Ebook Library**, and audiobook links use the **Audiobook Library**.
