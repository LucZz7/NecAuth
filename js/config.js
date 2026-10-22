/* NecAuth - Site Configuration (Backend Config)
   Owner / developer identity lives here in one place.
   Change these values and the whole site updates - header,
   Buy Info section, footer and contact buttons included. */
window.NECAUTH_CONFIG = {
  siteName: "NecAuth",
  tagline: "Two-Factor Authentication",
  owner: {
    developerName: "NECXY DEVELOPER",
    telegramUsername: "@i_necxy",
    telegramUrl: "https://t.me/i_necxy",
    telegramChannelUrl: "https://t.me/necxydeveloper",
    instagramUsername: "@i_necxy",
    instagramUrl: "https://instagram.com/i_necxy",
    youtubeName: "VOID NECX",
    youtubeUrl: "https://youtube.com/@voidnecx"
  },
  totp: {
    period: 30,
    digits: 6,
    algorithm: "SHA-1",
    verifyWindow: 1
  },
  storageKey: "necauth_vault_v1",
  demoLoginKey: "necauth_demo_login_v1"
};
