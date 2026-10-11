---
title: Newsletter
description: A weekly email listing what was recently added.
sidebar_position: 3
---

# Newsletter

AllSeerr can email your users a **Recently Added** newsletter: a list of the movies and series that became available since the last one, with posters and links to their pages.

## Turning it on

The newsletter is sent by the email agent, so set up [email notifications](/using-seerr/notifications/email) first. Then, in **Settings &rarr; Notifications &rarr; Email**:

- **Enable Recently Added Newsletter**: turns it on. It is off by default.
- **Newsletter Day** and **Newsletter Time**: when it is sent each week. The default is Sunday at 9:00, in the server's time zone (the `TZ` variable of the container).
- **Include 4K Media in Newsletter**: also list titles that became available in 4K.
- **Send Test Newsletter**: sends one to your own email address with the saved settings. If nothing new arrived since the last newsletter, the test uses the most recently added titles instead.

The schedule also shows as the **Recently Added Newsletter** job in **Settings &rarr; Jobs & Cache**, where you can run it right away.

## Who gets it

Every user with a valid email address gets it, unless they turned it off. When nothing was added since the last newsletter, none is sent.

Users can stop it in their profile under **Settings &rarr; Notifications &rarr; Email** by unchecking **Recently Added Newsletter**. Every newsletter also tells them where to do that.
