/* NecAuth - App Logic
   Vault, live code rendering, tools, login demo and Buy Info wiring.
   Owner identity is read from js/config.js (the backend config) and
   applied to the header, Buy Info card and footer automatically. */
(function () {
  "use strict";

  var CFG = window.NECAUTH_CONFIG;
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };

  /* ----- Owner identity from config ----- */
  document.querySelectorAll("[data-owner-telegram]").forEach(function (el) {
    el.textContent = CFG.owner.telegramUsername;
  });
  document.querySelectorAll("[data-telegram-link]").forEach(function (el) {
    el.setAttribute("href", CFG.owner.telegramUrl);
  });
  $("headerTelegramBtn").setAttribute("href", CFG.owner.telegramUrl);

  /* ----- Mobile menu ----- */
  $("menuBtn").addEventListener("click", function () { $("mainNav").classList.toggle("open"); });
  $("mainNav").addEventListener("click", function (e) {
    if (e.target.tagName === "A") $("mainNav").classList.remove("open");
  });

  /* ----- Toast ----- */
  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  /* ----- Vault storage ----- */
  function loadVault() {
    try {
      var raw = localStorage.getItem(CFG.storageKey);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveVault(list) { localStorage.setItem(CFG.storageKey, JSON.stringify(list)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function groupCode(code) {
    if (code.length === 6) return code.slice(0, 3) + " " + code.slice(3);
    if (code.length === 8) return code.slice(0, 4) + " " + code.slice(4);
    return code;
  }

  /* ----- Rendering accounts ----- */
  var codeCache = {}; // id -> {periodKey, code}
  function render() {
    var list = loadVault();
    var q = ($("searchInput").value || "").trim().toLowerCase();
    var filtered = list.filter(function (a) {
      return !q || (a.issuer + " " + a.account).toLowerCase().indexOf(q) >= 0;
    });
    $("accountCount").textContent = list.length ? "(" + list.length + ")" : "";
    $("emptyState").style.display = filtered.length ? "none" : "block";
    var html = filtered.map(function (a) {
      var cached = codeCache[a.id];
      var codeText = cached ? groupCode(cached.code) : "--- ---";
      var remain = T.secondsRemaining(a.period || 30);
      var total = a.period || 30;
      var pct = Math.max(0, Math.min(100, (remain / total) * 100));
      var circ = 2 * Math.PI * 22;
      var dash = (pct / 100) * circ;
      var initial = esc((a.issuer || "A").trim().charAt(0).toUpperCase() || "A");
      return '' +
      '<article class="account" data-id="' + a.id + '">' +
        '<div class="avatar">' + initial + '</div>' +
        '<div class="acc-main">' +
          '<div class="acc-issuer">' + esc(a.issuer) + '</div>' +
          '<div class="acc-name">' + esc(a.account) + '</div>' +
          '<div class="code" data-code-for="' + a.id + '" title="Tap to copy">' + esc(codeText) + '</div>' +
        '</div>' +
        '<div class="ring" title="Seconds left in this period">' +
          '<svg width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/>' +
          '<circle data-ring-for="' + a.id + '" cx="26" cy="26" r="22" fill="none" stroke="#ff3b3b" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"/></svg>' +
          '<b data-remain-for="' + a.id + '">' + remain + '</b>' +
        '</div>' +
        '<div class="acc-actions">' +
          '<button class="mini-btn" data-action="copy" data-id="' + a.id + '" title="Copy code" aria-label="Copy code"><svg><use href="#i-copy"/></svg></button>' +
          '<button class="mini-btn" data-action="edit" data-id="' + a.id + '" title="Edit account" aria-label="Edit account"><svg><use href="#i-edit"/></svg></button>' +
          '<button class="mini-btn danger" data-action="delete" data-id="' + a.id + '" title="Delete account" aria-label="Delete account"><svg><use href="#i-trash"/></svg></button>' +
        '</div>' +
      '</article>';
    }).join("");
    $("accountsList").innerHTML = html;
  }

  async function refreshCodes(force) {
    var list = loadVault();
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var periodKey = Math.floor(Date.now() / 1000 / (a.period || 30));
      var cached = codeCache[a.id];
      if (!force && cached && cached.periodKey === periodKey) continue;
      try {
        var code = await T.totp(a.secret, { digits: a.digits || 6, period: a.period || 30 });
        codeCache[a.id] = { periodKey: periodKey, code: code };
      } catch (e) {
        codeCache[a.id] = { periodKey: periodKey, code: "ERROR" };
      }
    }
    // Update DOM in place for codes + rings without a full re-render
    list.forEach(function (a) {
      var codeEl = document.querySelector('[data-code-for="' + a.id + '"]');
      if (codeEl && codeCache[a.id]) codeEl.textContent = groupCode(codeCache[a.id].code);
      var remain = T.secondsRemaining(a.period || 30);
      var total = a.period || 30;
      var circ = 2 * Math.PI * 22;
      var ring = document.querySelector('[data-ring-for="' + a.id + '"]');
      if (ring) ring.setAttribute("stroke-dasharray", ((remain / total) * circ).toFixed(1) + " " + circ.toFixed(1));
      var rem = document.querySelector('[data-remain-for="' + a.id + '"]');
      if (rem) rem.textContent = remain;
    });
  }

  /* ----- Add account ----- */
  function addAccount(entry) {
    var secret = T.normalizeSecret(entry.secret);
    T.base32Decode(secret); // throws on invalid key
    var list = loadVault();
    list.unshift({
      id: uid(),
      issuer: String(entry.issuer || "Account").trim(),
      account: String(entry.account || "").trim(),
      secret: secret,
      digits: entry.digits || 6,
      period: entry.period || 30,
      createdAt: Date.now()
    });
    saveVault(list);
    render();
    refreshCodes(true);
  }

  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    try {
      addAccount({
        issuer: $("issuerInput").value,
        account: $("accountInput").value,
        secret: $("secretInput").value,
        digits: parseInt($("digitsInput").value, 10),
        period: parseInt($("periodInput").value, 10)
      });
      e.target.reset();
      $("digitsInput").value = "6"; $("periodInput").value = "30";
      toast("Account added. Live codes are running.");
    } catch (err) { toast(err.message || "Invalid secret key."); }
  });

  $("importOtpauthBtn").addEventListener("click", function () {
    try {
      var entry = T.parseOtpauth($("otpauthInput").value);
      addAccount(entry);
      $("otpauthInput").value = "";
      toast("Imported: " + entry.issuer + " account added.");
    } catch (err) { toast(err.message || "Invalid otpauth link."); }
  });

  $("searchInput").addEventListener("input", function () { render(); refreshCodes(false); });

  /* ----- Account actions (copy / edit / delete) ----- */
  var pendingDeleteId = null;
  $("accountsList").addEventListener("click", async function (e) {
    var codeEl = e.target.closest("[data-code-for]");
    if (codeEl) {
      var cached = codeCache[codeEl.getAttribute("data-code-for")];
      if (cached && cached.code && cached.code !== "ERROR") {
        try { await navigator.clipboard.writeText(groupCode(cached.code)); toast("Code copied: " + groupCode(cached.code)); }
        catch (err) { toast("Copy failed on this browser."); }
      }
      return;
    }
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var list = loadVault();
    var entry = list.find(function (a) { return a.id === id; });
    if (!entry) return;
    var action = btn.getAttribute("data-action");
    if (action === "copy") {
      var c = codeCache[id];
      if (c && c.code && c.code !== "ERROR") {
        try { await navigator.clipboard.writeText(groupCode(c.code)); toast("Code copied: " + groupCode(c.code)); }
        catch (err) { toast("Copy failed on this browser."); }
      } else toast("Code is not ready yet.");
    } else if (action === "edit") {
      $("editId").value = entry.id;
      $("editIssuer").value = entry.issuer;
      $("editAccount").value = entry.account;
      $("editSecret").value = entry.secret;
      $("editBackdrop").classList.add("open");
    } else if (action === "delete") {
      pendingDeleteId = id;
      $("deleteText").textContent = "Delete " + entry.issuer + " (" + entry.account + ")? Its secret key will be removed from this device permanently.";
      $("deleteBackdrop").classList.add("open");
    }
  });

  $("editCancel").addEventListener("click", function () { $("editBackdrop").classList.remove("open"); });
  $("editForm").addEventListener("submit", function (e) {
    e.preventDefault();
    try {
      var secret = T.normalizeSecret($("editSecret").value);
      T.base32Decode(secret);
      var list = loadVault().map(function (a) {
        if (a.id !== $("editId").value) return a;
        return Object.assign({}, a, {
          issuer: $("editIssuer").value.trim(),
          account: $("editAccount").value.trim(),
          secret: secret
        });
      });
      saveVault(list);
      delete codeCache[$("editId").value];
      $("editBackdrop").classList.remove("open");
      render(); refreshCodes(true);
      toast("Account updated.");
    } catch (err) { toast(err.message || "Invalid secret key."); }
  });

  $("deleteCancel").addEventListener("click", function () { $("deleteBackdrop").classList.remove("open"); });
  $("deleteConfirm").addEventListener("click", function () {
    if (pendingDeleteId) {
      saveVault(loadVault().filter(function (a) { return a.id !== pendingDeleteId; }));
      delete codeCache[pendingDeleteId];
      pendingDeleteId = null;
    }
    $("deleteBackdrop").classList.remove("open");
    render(); refreshCodes(true);
    toast("Account deleted.");
  });

  document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
    bd.addEventListener("click", function (e) { if (e.target === bd) bd.classList.remove("open"); });
  });

  /* ----- Backup export / import ----- */
  $("exportBtn").addEventListener("click", function () {
    var data = { app: "NecAuth", version: 1, exportedAt: new Date().toISOString(), accounts: loadVault() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "necauth-backup.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Backup downloaded. Keep this file private - it contains secret keys.");
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    var file = $("importFile").files[0];
    if (!file) return;
    file.text().then(function (text) {
      try {
        var parsed = JSON.parse(text);
        var incoming = Array.isArray(parsed) ? parsed : parsed.accounts;
        if (!Array.isArray(incoming)) throw new Error("No accounts found in this file.");
        var clean = [];
        incoming.forEach(function (a) {
          var secret = T.normalizeSecret(a.secret);
          T.base32Decode(secret);
          clean.push({
            id: uid(), issuer: String(a.issuer || "Account"), account: String(a.account || ""),
            secret: secret, digits: a.digits || 6, period: a.period || 30, createdAt: Date.now()
          });
        });
        saveVault(clean.concat(loadVault()));
        render(); refreshCodes(true);
        toast(clean.length + " account(s) imported.");
      } catch (err) { toast("Import failed: " + (err.message || "invalid file")); }
      $("importFile").value = "";
    });
  });

  /* ----- Verify tool ----- */
  function showResult(el, ok, html) {
    el.className = "result show " + (ok ? "ok" : "err");
    el.innerHTML = html;
  }
  $("verifyBtn").addEventListener("click", async function () {
    var el = $("verifyResult");
    try {
      var ok = await T.verify($("verifySecret").value, $("verifyCode").value, {
        digits: 6, period: 30, window: CFG.totp.verifyWindow
      });
      if (ok) showResult(el, true, "<b>Valid code.</b> This secret and code match - a real login would accept it now (plus one step before and after, for clock drift).");
      else showResult(el, false, "<b>Invalid code.</b> The code does not match this secret in the current time window. Check the key, the code and your device clock.");
    } catch (err) { showResult(el, false, "<b>Error:</b> " + esc(err.message || "invalid secret")); }
  });

  /* ----- Generate secret + QR ----- */
  $("genBtn").addEventListener("click", function () {
    var issuer = ($("genIssuer").value || "NecAuth").trim();
    var account = ($("genAccount").value || "user").trim();
    var secret = T.generateSecret(20);
    var entry = { issuer: issuer, account: account, secret: secret, digits: 6, period: 30 };
    var url = T.buildOtpauthUrl(entry);
    showResult($("genResult"), true,
      "<b>New secret generated.</b><br>Secret: <span class='mono'>" + esc(secret) + "</span><br>otpauth link: <span class='mono'>" + esc(url) + "</span>");
    $("qrUrl").textContent = url;
    $("qrBox").classList.add("show");
    var target = $("qrTarget");
    target.innerHTML = "";
    try {
      if (typeof qrcode !== "undefined") {
        var qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        target.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 8, scalable: true });
        var svg = target.querySelector("svg");
        if (svg) { svg.setAttribute("width", "180"); svg.setAttribute("height", "180"); }
      } else {
        target.textContent = "QR library is offline. Use the otpauth link above - it carries the same data.";
      }
    } catch (err) {
      target.textContent = "QR could not be drawn. Use the otpauth link above - it carries the same data.";
    }
  });

  /* ----- Login demo ----- */
  $("enrollBtn").addEventListener("click", function () {
    var secret = T.generateSecret(20);
    var demo = { username: "demo", password: "demo1234", secret: secret };
    localStorage.setItem(CFG.demoLoginKey, JSON.stringify(demo));
    try { addAccount({ issuer: "NecAuth Demo", account: "demo", secret: secret, digits: 6, period: 30 }); } catch (e) {}
    showResult($("enrollResult"), true,
      "<b>Demo account enrolled.</b> A 'NecAuth Demo' account was added to your vault above. Now use its current code in Step 2 with username <span class='mono'>demo</span> and password <span class='mono'>demo1234</span>.");
    toast("Demo enrolled. Scroll to the vault for its live code.");
  });

  $("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var el = $("loginResult");
    var raw = localStorage.getItem(CFG.demoLoginKey);
    if (!raw) { showResult(el, false, "<b>Not enrolled yet.</b> Run Step 1 first so a demo secret exists to verify against."); return; }
    var demo = JSON.parse(raw);
    if ($("loginUser").value.trim() !== demo.username || $("loginPass").value !== demo.password) {
      showResult(el, false, "<b>Login failed.</b> Username or password is incorrect. 2FA was not checked - exactly like a real server, the password gate comes first.");
      return;
    }
    try {
      var ok = await T.verify(demo.secret, $("loginCode").value, { digits: 6, period: 30, window: CFG.totp.verifyWindow });
      if (ok) showResult(el, true, "<b>Login successful.</b> Password verified, then the TOTP code verified against the enrolled secret. This is a complete, real two-factor login flow.");
      else showResult(el, false, "<b>2FA failed.</b> Password was correct, but the authenticator code did not match. Get the fresh NecAuth Demo code from the vault and try again.");
    } catch (err) { showResult(el, false, "<b>Error:</b> " + esc(err.message || "verification failed")); }
  });

  /* ----- Clock ----- */
  function tickClock() {
    var now = new Date();
    $("deviceClock").textContent = now.toLocaleTimeString("en-GB");
    $("periodLeft").textContent = T.secondsRemaining(30);
  }

  /* ----- Boot + timers ----- */
  render();
  refreshCodes(true);
  tickClock();
  setInterval(function () { refreshCodes(false); tickClock(); }, 1000);

  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
