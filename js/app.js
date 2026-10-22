/* NecAuth v5 - generator only. Straight code display, premium copy animation.
   No verify, no extra tools. Saved accounts stay on this device only. */
(function () {
  "use strict";
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };
  var PERIOD = 30;
  var STORAGE_KEY = "necauth_vault_v1";

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) { regs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    if (window.caches) caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function plainCode(code) { return code; }
  function groupCode(code) {
    if (code.length === 6) return code.slice(0, 3) + " " + code.slice(3);
    if (code.length === 8) return code.slice(0, 4) + " " + code.slice(4);
    return code;
  }
  // Render a code as staggered animated digits
  function digitHTML(code) {
    var grouped = groupCode(code);
    var out = "";
    for (var i = 0; i < grouped.length; i++) {
      var ch = grouped[i];
      if (ch === " ") out += '<span class="sp"></span>';
      else out += '<span class="d" style="animation-delay:' + (i * 45) + 'ms">' + ch + "</span>";
    }
    return out;
  }
  function showError(msg) {
    var el = $("errorText");
    el.textContent = msg;
    el.classList.remove("show");
    void el.offsetWidth;
    if (msg) el.classList.add("show");
  }

  /* Premium copy feedback: card glow + sweep + Copied overlay */
  function copyFeedback(cardEl, rawCode, groupedText) {
    return navigator.clipboard.writeText(groupedText).then(function () {
      cardEl.classList.add("copied");
      setTimeout(function () { cardEl.classList.remove("copied"); }, 1450);
    }).catch(function () {
      cardEl.classList.add("copied");
      setTimeout(function () { cardEl.classList.remove("copied"); }, 1450);
    });
  }

  /* ----- Generator ----- */
  var currentSecret = null;
  var currentPeriodKey = null;
  var currentCode = "";

  async function updateCode() {
    if (!currentSecret) return;
    var remain = T.secondsRemaining(PERIOD);
    $("secondsLeft").textContent = remain;
    $("timeBar").style.width = (remain / PERIOD) * 100 + "%";
    var periodKey = Math.floor(Date.now() / 1000 / PERIOD);
    if (periodKey === currentPeriodKey) return;
    currentPeriodKey = periodKey;
    try {
      currentCode = await T.totp(currentSecret, { digits: 6, period: PERIOD });
      $("codeText").innerHTML = digitHTML(currentCode);
    } catch (e) {}
  }

  async function generate() {
    var raw = $("secretInput").value;
    if (!raw.trim()) { showError("Pehle apni 2FA secret key daalo."); return; }
    try {
      var secret = T.normalizeSecret(raw);
      T.base32Decode(secret);
      currentSecret = secret;
      currentPeriodKey = null;
      showError("");
      $("resultBox").classList.add("show");
      $("saveRow").classList.remove("hidden");
      await updateCode();
    } catch (err) {
      currentSecret = null;
      $("resultBox").classList.remove("show");
      showError("Ye secret key valid nahi hai. Sahi Base32 key daalo.");
    }
  }

  $("generateBtn").addEventListener("click", generate);
  $("secretInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); generate(); } });
  setInterval(updateCode, 500);

  $("pasteBtn").addEventListener("click", async function () {
    try {
      var text = await navigator.clipboard.readText();
      if (text) { $("secretInput").value = text.trim(); generate(); }
    } catch (e) { $("secretInput").focus(); }
  });

  $("codeCard").addEventListener("click", function () {
    if (!currentSecret || !currentCode) return;
    copyFeedback($("codeCard"), currentCode, groupCode(currentCode));
  });

  /* ----- Saved accounts ----- */
  function loadVault() {
    try {
      var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveVault(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var savedCache = {};
  function renderSaved() {
    var list = loadVault();
    $("savedSection").classList.toggle("hidden", !list.length);
    $("savedCount").textContent = list.length ? "(" + list.length + ")" : "";
    $("savedList").innerHTML = list.map(function (a) {
      var cached = savedCache[a.id];
      return '<div class="saved-item" data-saved-item="' + a.id + '">' +
        '<div class="avatar">' + esc((a.issuer || "A").trim().charAt(0).toUpperCase() || "A") + '</div>' +
        '<div class="si-main"><div class="si-name">' + esc(a.issuer) + '</div>' +
        '<div class="si-code" data-saved-code="' + a.id + '" title="Tap to copy">' + (cached ? digitHTML(cached.code) : "--- ---") + '</div></div>' +
        '<span class="si-time" data-saved-remain="' + a.id + '">' + T.secondsRemaining(a.period || 30) + 's</span>' +
        '<button class="mini-btn" data-saved-copy="' + a.id + '" title="Copy" aria-label="Copy code"><svg><use href="#i-copy"/></svg></button>' +
        '<button class="mini-btn" data-saved-del="' + a.id + '" title="Delete" aria-label="Delete account"><svg><use href="#i-trash"/></svg></button>' +
        '</div>';
    }).join("");
  }
  async function refreshSaved() {
    var list = loadVault();
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var periodKey = Math.floor(Date.now() / 1000 / (a.period || 30));
      var cached = savedCache[a.id];
      if (!cached || cached.periodKey !== periodKey) {
        try {
          var code = await T.totp(a.secret, { digits: a.digits || 6, period: a.period || 30 });
          var changed = !cached || cached.code !== code;
          savedCache[a.id] = { periodKey: periodKey, code: code };
          var el = document.querySelector('[data-saved-code="' + a.id + '"]');
          if (el && changed) el.innerHTML = digitHTML(code);
        } catch (e) { savedCache[a.id] = { periodKey: periodKey, code: "ERROR" }; }
      }
      var rem = document.querySelector('[data-saved-remain="' + a.id + '"]');
      if (rem) rem.textContent = T.secondsRemaining(a.period || 30) + "s";
    }
  }
  $("saveBtn").addEventListener("click", function () {
    if (!currentSecret) return;
    var name = $("saveName").value.trim() || "Account";
    var list = loadVault();
    list.unshift({ id: uid(), issuer: name, account: "", secret: currentSecret, digits: 6, period: PERIOD, createdAt: Date.now() });
    saveVault(list);
    $("saveName").value = "";
    $("saveRow").classList.add("hidden");
    renderSaved();
    refreshSaved();
  });
  $("savedList").addEventListener("click", async function (e) {
    var delBtn = e.target.closest("[data-saved-del]");
    if (delBtn) {
      var delId = delBtn.getAttribute("data-saved-del");
      saveVault(loadVault().filter(function (a) { return a.id !== delId; }));
      delete savedCache[delId];
      renderSaved();
      return;
    }
    var copyEl = e.target.closest("[data-saved-copy],[data-saved-code]");
    if (!copyEl) return;
    var id = copyEl.getAttribute("data-saved-copy") || copyEl.getAttribute("data-saved-code");
    var cached = savedCache[id];
    if (!cached || !cached.code || cached.code === "ERROR") return;
    var item = document.querySelector('[data-saved-item="' + id + '"]');
    if (item) copyFeedback(item, cached.code, groupCode(cached.code));
  });

  renderSaved();
  refreshSaved();
  setInterval(refreshSaved, 1000);
})();
