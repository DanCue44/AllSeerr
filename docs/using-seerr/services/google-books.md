---
title: Google Books API Key
description: Check whether books have ebook editions.
sidebar_position: 6
---

# Google Books API Key

OpenLibrary, where AllSeerr gets its book details, does not reliably say whether a book exists as an ebook. With a Google Books API key, AllSeerr asks Google Books whether a book has an ebook edition, so users are not left waiting on ebooks that were never published.

The key is optional. Without it, AllSeerr does not contact Google at all, and ebook editions are simply not checked. Audiobook editions are checked in the public Audible catalog and need no key.

## Creating a key

1. Sign in to the [Google Cloud Console](https://console.cloud.google.com) with any Google account.
2. Create a project (for example `AllSeerr`) or pick an existing one.
3. Open **APIs & Services &rarr; Library**, search for **Books API** and click **Enable**.
4. Open **APIs & Services &rarr; Credentials**, click **Create Credentials &rarr; API key** and copy the key.

No billing account is needed. The Books API has a free daily quota, and AllSeerr keeps the answers for a while, so a normal server stays well within it.

## Restricting the key

Restrict the key so it is useless for anything else if it ever leaks:

1. In **APIs & Services &rarr; Credentials**, click the key to edit it.
2. Under **API restrictions**, choose **Restrict key** and select only **Books API**.
3. Optionally, under **Application restrictions**, choose **IP addresses** and enter your server's public IP address. Skip this if your public IP changes often.
4. Click **Save**. Changes can take a few minutes to apply.

## Adding the key to AllSeerr

Paste the key into **Settings &rarr; General &rarr; Google Books API Key**, use the test button next to it to check that Google accepts it, and save.
