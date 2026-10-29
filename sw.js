/* NecAuth service worker - makes the site installable as an app (PWA)
   and usable offline. App-shell files are cached on first visit. */
var CACHE = "necauth-v11";
var ASSETS = [
  "./", "./index.html", "./css/style.css", "./js/totp.js", "./js/app.js",
  "./manifest.json", "./assets/icons/favicon.svg",
  "./assets/icons/icon-192.png", "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png"
];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // third-party scripts stay network-only
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var network = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
