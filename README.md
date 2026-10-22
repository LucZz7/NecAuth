# NecAuth - Professional Two-Factor Authentication Website

Red / Black / White glassmorphism TOTP authenticator by **NECXY DEVELOPER**.
Real RFC 6238 codes, a working verifier, a full login + 2FA demo, and a
Buy Info section wired to the developer on Telegram.

## Run it

Open `index.html` in any browser, or host the whole folder on any static
host (GitHub Pages, Netlify, Vercel, Render static, your own server).
No build step, no backend needed for the authenticator itself.

For the best experience serve it over HTTPS or localhost so the
clipboard, Web Crypto and PWA features are all available.

## Structure

```
index.html          Main page (all sections)
css/style.css       Red / black / white glassmorphism design system
js/config.js        BACKEND CONFIG - owner identity in one place
js/totp.js          TOTP core: Base32, HMAC-SHA-1 HOTP/TOTP, verify, otpauth
js/app.js           Vault UI, live codes, tools, login demo, backup
assets/icons/       Favicon (SVG shield)
manifest.json       PWA manifest (installable)
sw.js               Service worker for offline use
```

## Owner / Telegram configuration

The owner username lives in ONE place: `js/config.js`

```js
owner: {
  telegramUsername: "@i_necxy",
  telegramUrl: "https://t.me/i_necxy",
  ...
}
```

The header Telegram button (icon in the top bar), every Telegram link,
the Buy Info card and the footer credit all read from this config and
open https://t.me/i_necxy when tapped.

## Features

- Add accounts by secret key (Base32) or otpauth:// link import
- Live 6/7/8-digit TOTP codes, 30s / 60s periods, countdown rings, tap to copy
- Code verifier tool (the same check a real login server performs)
- Secret generator with otpauth link + QR code for enrolling your own app
- Device time check (TOTP depends on an accurate clock)
- Full login + 2FA demo: enroll, then log in with password + live code
- Vault backup export / import as JSON, search, edit, delete
- PWA: installable, works offline

## Security model

Secret keys are stored only in the visitor's own browser local storage
and every code is computed on-device with Web Crypto. Secrets are never
sent to a server. Anyone deploying this for real users should explain
the same to them, and users should keep a private backup of their keys.

Note: the login demo is a front-end demonstration of the real TOTP
verification flow. A production login system must verify the password
and the TOTP code on a server with its own database - contact the
developer via the Buy Info section for that integration.

## Credits

Developed by NECXY DEVELOPER - Telegram @i_necxy - Channel
t.me/necxydeveloper - Instagram @i_necxy - YouTube VOID NECX (@voidnecx)
