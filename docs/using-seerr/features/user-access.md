---
title: User Access
description: Give people accounts in Audiobookshelf, Kavita and Komga, and let them sign in with Allseerr.
sidebar_position: 6
---

# User Access

**Settings → User Access** manages who can use your book and comic apps. Everyone Allseerr knows (Plex users and local users) is listed, and for each person you can tick Audiobookshelf, Kavita and Komga, choose which libraries they see and set an age limit.

## Connecting the apps

For each app, enter the address Allseerr uses to reach it, the public address people open in a browser, and an admin login (Kavita and Komga) or an admin API key (Audiobookshelf). **Test** checks the connection and loads the library list.

Allseerr never changes admin accounts in the apps.

## Accounts

When you give someone an app, Allseerr links an existing account with the same username or email, or creates one with a generated password. The password is shown once and, if **Email new passwords** is on and email notifications are set up, sent to the person.

Taking an app away locks the account instead of deleting it, so reading progress is kept. Use **Delete account** to delete it from the app.

Audiobookshelf and Kavita turn a locked account off, so it can no longer sign in. Komga has no way to turn an account off: Allseerr removes all of its libraries and its reading and download rights instead, so the person can still sign in to Komga but sees nothing. Use **Delete account** if they must not be able to sign in at all.

The **User Access Sync** job (every 30 minutes) puts libraries, age limits and locks back the way Allseerr has them. It never creates accounts.

## Invites

An invite link lets someone who is not on your Plex server sign in to Allseerr with Plex and get the apps ticked on the invite. Links expire (7 days by default, at most 90) and can be revoked. A person who used an invite can keep signing in with Plex until the invite is revoked.

## Age limits

| Limit | Kavita | Komga | Audiobookshelf |
|---|---|---|---|
| Kids | up to G | up to age 9 | no explicit content |
| Tween | up to Kids to Adults | up to age 12 | no explicit content |
| Teen | up to Mature 15+ | up to age 15 | no explicit content |

Unrated titles are hidden under a limit unless **Show content without an age rating** is ticked for that person. Book requests from someone with a limit go to approval, and books with adult subjects cannot be requested. Admins are never limited.

## Sign in with Allseerr

Allseerr can act as an OpenID Connect provider so people sign in to the apps with their Allseerr (Plex) login. Turn it on under **Sign in with Allseerr**, then add a client for each app. The client secret is shown once.

The issuer is your **Application URL** followed by `/oidc`, for example `https://requests.example.com/oidc`. Set the Application URL in **Settings → General** first.

Only people who have the app ticked can sign in to it.

### Audiobookshelf

In **Settings → Authentication**, turn on **OpenID Connect Authentication**:

- **Issuer URL**: the issuer, then **Auto-populate**
- **Client ID** and **Client Secret**: from Allseerr
- **Match existing users by**: Email
- **Auto Register**: on
- **Group Claim**: `abs_groups`
- **Advanced Permission Claim**: `abs_permissions`

Allseerr registers `/auth/openid/callback` and `/auth/openid/mobile-redirect` on the Audiobookshelf public address.

### Kavita

In **Server Settings → OpenID Connect**:

- **Authority**: the issuer
- **Client ID** and **Client Secret**: from Allseerr
- **Provision accounts**: on
- **Sync user settings**: on

Kavita restarts after saving. Libraries and the age limit are sent at each sign in, so keep the Kavita admin connection set up so Allseerr knows the library names. The redirect is `/signin-oidc` on the Kavita public address.

### Komga

Komga reads OpenID Connect settings from environment variables. Add these to the container and restart it:

```
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_PROVIDER=allseerr
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTID=<client id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTSECRET=<client secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_CLIENTNAME=Allseerr
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_SCOPE=openid,email,profile
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_AUTHORIZATIONGRANTTYPE=authorization_code
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_ALLSEERR_REDIRECTURI={baseUrl}/{action}/oauth2/code/{registrationId}
SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_ALLSEERR_ISSUERURI=<issuer>
SPRING_SECURITY_OAUTH2_CLIENT_PROVIDER_ALLSEERR_USERNAMEATTRIBUTE=sub
KOMGA_OAUTH2ACCOUNTCREATION=true
```

Komga does not read libraries or age limits from the sign in, so the sync job applies them.
