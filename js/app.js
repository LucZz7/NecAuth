/* NecAuth - App Logic (clean v2)
   Vault + live TOTP codes only. Owner identity comes from js/config.js. */
(function () {
  "use strict";
  var CFG = window.NECAUTH_CONFIG;
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };

  document.querySelectorAll("[data-owner-telegram]").forEach(function (el) { el.textContent = CFG.owner.telegramUsername; });
  document.querySelectorAll("[data-telegram-link]").forEach(function (el) { el.setAttribute("href", CFG.owner.telegramUrl); });
  $("headerTelegramBtn").setAttribute("href", CFG.owner.telegramUrl);

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2400);
  }

  function loadVault() {
    try {
      var list = JSON.parse(localStorage.getItem(CFG.storageKey) || "[]");
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

  var codeCache = {};
  function render() {
    var list = loadVault();
    var q = ($("searchInput").value || "").trim().toLowerCase();
    var filtered = list.filter(function (a) { return !q || (a.issuer + " " + a.account).toLowerCase().indexOf(q) >= 0; });
    $("accountCount").textContent = list.length ? "(" + list.length + ")" : "";
    $("emptyState").style.display = filtered.length ? "none" : "block";
    var circ = (2 * Math.PI * 21).toFixed(1);
    $("accountsList").innerHTML = filtered.map(function (a) {
      var cached = codeCache[a.id];
      var remain = T.secondsRemaining(a.period || 30);
      var dash = ((remain / (a.period || 30)) * 2 * Math.PI * 21).toFixed(1);
      return '<article class="account">' +
        '<div class="avatar">' + esc((a.issuer || "A").trim().charAt(0).toUpperCase() || "A") + '</div>' +
        '<div class="acc-main"><div class="acc-issuer">' + esc(a.issuer) + '</div>' +
        '<div class="acc-name">' + esc(a.account) + '</div>' +
        '<div class="code" data-code-for="' + a.id + '" title="Tap to copy">' + esc(cached ? groupCode(cached.code) : "--- ---") + '</div></div>' +
        '<div class="ring"><svg width="50" height="50"><circle cx="25" cy="25" r="21" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/>' +
        '<circle data-ring data-ring-for="' + a.id + '" cx="25" cy="25" r="21" fill="none" stroke="#ff3b3b" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + circ + '"/></svg>' +
        '<b data-remain-for="' + a.id + '">' + remain + '</b></div>' +
        '<div class="acc-actions">' +
        '<button class="mini-btn" data-action="copy" data-id="' + a.id + '" title="Copy" aria-label="Copy code"><svg><use href="#i-copy"/></svg></button>' +
        '<button class="mini-btn" data-action="edit" data-id="' + a.id + '" title="Edit" aria-label="Edit account"><svg><use href="#i-edit"/></svg></button>' +
        '<button class="mini-btn" data-action="delete" data-id="' + a.id + '" title="Delete" aria-label="Delete account"><svg><use href="#i-trash"/></svg></button>' +
        '</div></article>';
    }).join("");
  }

  async function refreshCodes() {
    var list = loadVault();
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var periodKey = Math.floor(Date.now() / 1000 / (a.period || 30));
      var cached = codeCache[a.id];
      var changed = false;
      if (!cached || cached.periodKey !== periodKey) {
        try {
          var code = await T.totp(a.secret, { digits: a.digits || 6, period: a.period || 30 });
          codeCache[a.id] = { periodKey: periodKey, code: code };
          changed = true;
        } catch (e) { codeCache[a.id] = { periodKey: periodKey, code: "ERROR" }; }
      }
      var codeEl = document.querySelector('[data-code-for="' + a.id + '"]');
      if (codeEl && codeCache[a.id]) {
        var text = groupCode(codeCache[a.id].code);
        if (codeEl.textContent !== text) {
          codeEl.textContent = text;
          if (changed) { codeEl.classList.remove("tick"); void codeEl.offsetWidth; codeEl.classList.add("tick"); }
        }
      }
      var remain = T.secondsRemaining(a.period || 30);
      var ring = document.querySelector('[data-ring-for="' + a.id + '"]');
      if (ring) ring.setAttribute("stroke-dasharray", ((remain / (a.period || 30)) * 2 * Math.PI * 21).toFixed(1) + " " + (2 * Math.PI * 21).toFixed(1));
      var rem = document.querySelector('[data-remain-for="' + a.id + '"]');
      if (rem) rem.textContent = remain;
    }
  }

  function addAccount(entry) {
    var secret = T.normalizeSecret(entry.secret);
    T.base32Decode(secret);
    var list = loadVault();
    list.unshift({
      id: uid(), issuer: String(entry.issuer || "Account").trim(), account: String(entry.account || "").trim(),
      secret: secret, digits: entry.digits || 6, period: entry.period || 30, createdAt: Date.now()
    });
    saveVault(list);
    render();
    refreshCodes();
  }

  $("addForm").addEventListener("submit", function (e) {
    e.preventDefault();
    try {
      addAccount({ issuer: $("issuerInput").value, account: $("accountInput").value, secret: $("secretInput").value });
      e.target.reset();
      toast("Account added.");
    } catch (err) { toast(err.message || "Invalid secret key."); }
  });

  $("importOtpauthBtn").addEventListener("click", function () {
    try {
      var entry = T.parseOtpauth($("otpauthInput").value);
      addAccount(entry);
      $("otpauthInput").value = "";
      toast("Imported: " + entry.issuer);
    } catch (err) { toast(err.message || "Invalid otpauth link."); }
  });

  $("searchInput").addEventListener("input", function () { render(); refreshCodes(); });

  var pendingDeleteId = null;
  async function copyCode(id) {
    var c = codeCache[id];
    if (c && c.code && c.code !== "ERROR") {
      try { await navigator.clipboard.writeText(groupCode(c.code)); toast("Copied: " + groupCode(c.code)); }
      catch (e) { toast("Copy failed on this browser."); }
    } else toast("Code is not ready yet.");
  }

  $("accountsList").addEventListener("click", function (e) {
    var codeEl = e.target.closest("[data-code-for]");
    if (codeEl) { copyCode(codeEl.getAttribute("data-code-for")); return; }
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var entry = loadVault().find(function (a) { return a.id === id; });
    if (!entry) return;
    var action = btn.getAttribute("data-action");
    if (action === "copy") copyCode(id);
    else if (action === "edit") {
      $("editId").value = entry.id; $("editIssuer").value = entry.issuer;
      $("editAccount").value = entry.account; $("editSecret").value = entry.secret;
      $("editBackdrop").classList.add("open");
    } else if (action === "delete") {
      pendingDeleteId = id;
      $("deleteText").textContent = "Delete " + entry.issuer + " (" + entry.account + ")? Its key will be removed from this device.";
      $("deleteBackdrop").classList.add("open");
    }
  });

  $("editCancel").addEventListener("click", function () { $("editBackdrop").classList.remove("open"); });
  $("editForm").addEventListener("submit", function (e) {
    e.preventDefault();
    try {
      var secret = T.normalizeSecret($("editSecret").value);
      T.base32Decode(secret);
      saveVault(loadVault().map(function (a) {
        return a.id !== $("editId").value ? a : Object.assign({}, a, {
          issuer: $("editIssuer").value.trim(), account: $("editAccount").value.trim(), secret: secret
        });
      }));
      delete codeCache[$("editId").value];
      $("editBackdrop").classList.remove("open");
      render(); refreshCodes();
      toast("Saved.");
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
    render(); refreshCodes();
    toast("Deleted.");
  });
  document.querySelectorAll(".modal-backdrop").forEach(function (bd) {
    bd.addEventListener("click", function (e) { if (e.target === bd) bd.classList.remove("open"); });
  });

  $("exportBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ app: "NecAuth", version: 2, exportedAt: new Date().toISOString(), accounts: loadVault() }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "necauth-backup.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Backup downloaded. Keep it private.");
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    var file = $("importFile").files[0];
    if (!file) return;
    file.text().then(function (text) {
      try {
        var parsed = JSON.parse(text);
        var incoming = Array.isArray(parsed) ? parsed : parsed.accounts;
        if (!Array.isArray(incoming)) throw new Error("No accounts in this file.");
        var clean = incoming.map(function (a) {
          var secret = T.normalizeSecret(a.secret);
          T.base32Decode(secret);
          return { id: uid(), issuer: String(a.issuer || "Account"), account: String(a.account || ""), secret: secret, digits: a.digits || 6, period: a.period || 30, createdAt: Date.now() };
        });
        saveVault(clean.concat(loadVault()));
        render(); refreshCodes();
        toast(clean.length + " account(s) imported.");
      } catch (err) { toast("Import failed: " + (err.message || "invalid file")); }
      $("importFile").value = "";
    });
  });

  render();
  refreshCodes();
  setInterval(refreshCodes, 1000);
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
