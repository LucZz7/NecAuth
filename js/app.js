/* NecAuth v4 - premium single-box authenticator.
   Generate / Verify tabs, quick tools, saved accounts.
   Everything runs on-device; saved keys live only in this browser. */
(function () {
  "use strict";
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };
  var PERIOD = 30;
  var STORAGE_KEY = "necauth_vault_v1";
  var CIRC = 326.7;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) { regs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    if (window.caches) caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }
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
  function showError(msg) {
    var el = $("errorText");
    el.textContent = msg;
    el.classList.remove("show");
    void el.offsetWidth;
    if (msg) el.classList.add("show");
  }

  /* ----- Tabs ----- */
  function setTab(verify) {
    document.querySelector(".tabs").classList.toggle("verify", verify);
    $("tabGenerate").classList.toggle("active", !verify);
    $("tabVerify").classList.toggle("active", verify);
    $("panelGenerate").classList.toggle("hidden", verify);
    $("panelVerify").classList.toggle("hidden", !verify);
  }
  $("tabGenerate").addEventListener("click", function () { setTab(false); });
  $("tabVerify").addEventListener("click", function () { setTab(true); });

  /* ----- Digits segment ----- */
  var digits = 6;
  document.querySelectorAll(".seg-btn").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".seg-btn").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      digits = parseInt(b.getAttribute("data-digits"), 10);
      currentPeriodKey = null;
      updateCode();
    });
  });

  /* ----- Generator ----- */
  var currentSecret = null;
  var currentPeriodKey = null;

  async function updateCode() {
    if (!currentSecret) return;
    var remain = T.secondsRemaining(PERIOD);
    $("secondsLeft").textContent = remain;
    $("ringFg").style.strokeDashoffset = (CIRC * (1 - remain / PERIOD)).toFixed(1);
    var periodKey = Math.floor(Date.now() / 1000 / PERIOD);
    if (periodKey === currentPeriodKey) return;
    currentPeriodKey = periodKey;
    try {
      var code = await T.totp(currentSecret, { digits: digits, period: PERIOD });
      var el = $("codeText");
      el.textContent = groupCode(code);
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    } catch (e) {}
  }

  async function generateFrom(rawSecret) {
    if (!rawSecret || !rawSecret.trim()) { showError("Pehle apni 2FA secret key daalo."); return false; }
    try {
      var secret = T.normalizeSecret(rawSecret);
      T.base32Decode(secret);
      currentSecret = secret;
      currentPeriodKey = null;
      showError("");
      $("resultBox").classList.add("show");
      $("saveRow").classList.remove("hidden");
      await updateCode();
      return true;
    } catch (err) {
      currentSecret = null;
      $("resultBox").classList.remove("show");
      showError("Ye secret key valid nahi hai. Sahi Base32 key daalo.");
      return false;
    }
  }

  $("generateBtn").addEventListener("click", function () { generateFrom($("secretInput").value); });
  $("secretInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); generateFrom($("secretInput").value); } });
  setInterval(updateCode, 500);

  $("codeText").addEventListener("click", async function () {
    if (!currentSecret) return;
    var text = $("codeText").textContent;
    if (!text || text.indexOf("-") >= 0) return;
    try { await navigator.clipboard.writeText(text); toast("Code copied: " + text); }
    catch (e) { toast("Copy failed on this browser."); }
  });

  /* ----- Tools ----- */
  $("pasteBtn").addEventListener("click", async function () {
    try {
      var text = await navigator.clipboard.readText();
      if (text) { $("secretInput").value = text.trim(); toast("Pasted."); }
      else toast("Clipboard khaali hai.");
    } catch (e) { toast("Paste permission nahi mili."); }
  });
  $("otpToggle").addEventListener("click", function () { $("otpRow").classList.toggle("hidden"); });
  $("otpImportBtn").addEventListener("click", async function () {
    try {
      var entry = T.parseOtpauth($("otpauthInput").value);
      $("secretInput").value = entry.secret;
      if (entry.digits === 8) document.querySelector('[data-digits="8"]').click();
      var ok = await generateFrom(entry.secret);
      if (ok) {
        $("saveName").value = entry.issuer !== "Account" ? entry.issuer : entry.account;
        toast("Imported: " + entry.issuer);
      }
    } catch (err) { showError("Ye otpauth link valid nahi hai."); }
  });
  $("randomBtn").addEventListener("click", async function () {
    var secret = T.generateSecret(20);
    $("secretInput").value = secret;
    await generateFrom(secret);
    toast("New secret ready - ise apne app me set karo.");
  });
  $("clearBtn").addEventListener("click", function () {
    $("secretInput").value = "";
    $("otpauthInput").value = "";
    currentSecret = null;
    currentPeriodKey = null;
    $("resultBox").classList.remove("show");
    showError("");
  });

  /* ----- Verify ----- */
  $("verifyBtn").addEventListener("click", async function () {
    var el = $("verifyResult");
    function show(ok, html) {
      el.className = "verify-result show " + (ok ? "ok" : "err");
      el.innerHTML = html;
    }
    try {
      var ok = await T.verify($("verifySecret").value, $("verifyCode").value, { digits: ($("verifyCode").value.replace(/\s/g, "").length || 6), period: PERIOD, window: 1 });
      if (ok) show(true, '<svg><use href="#i-check"/></svg> Valid code');
      else show(false, '<svg><use href="#i-x"/></svg> Invalid code');
    } catch (err) { show(false, '<svg><use href="#i-x"/></svg> Invalid secret key'); }
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
      return '<div class="saved-item">' +
        '<div class="avatar">' + esc((a.issuer || "A").trim().charAt(0).toUpperCase() || "A") + '</div>' +
        '<div class="si-main"><div class="si-name">' + esc(a.issuer) + '</div>' +
        '<div class="si-code" data-saved-code="' + a.id + '" title="Tap to copy">' + esc(cached ? groupCode(cached.code) : "--- ---") + '</div></div>' +
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
          savedCache[a.id] = { periodKey: periodKey, code: code };
        } catch (e) { savedCache[a.id] = { periodKey: periodKey, code: "ERROR" }; }
      }
      var el = document.querySelector('[data-saved-code="' + a.id + '"]');
      if (el && savedCache[a.id]) el.textContent = groupCode(savedCache[a.id].code);
      var rem = document.querySelector('[data-saved-remain="' + a.id + '"]');
      if (rem) rem.textContent = T.secondsRemaining(a.period || 30) + "s";
    }
  }
  $("saveBtn").addEventListener("click", function () {
    if (!currentSecret) return;
    var name = $("saveName").value.trim() || "Account";
    var list = loadVault();
    list.unshift({ id: uid(), issuer: name, account: "", secret: currentSecret, digits: digits, period: PERIOD, createdAt: Date.now() });
    saveVault(list);
    $("saveName").value = "";
    $("saveRow").classList.add("hidden");
    renderSaved();
    refreshSaved();
    toast("Saved: " + name);
  });
  $("savedList").addEventListener("click", async function (e) {
    var codeEl = e.target.closest("[data-saved-code]");
    var copyBtn = e.target.closest("[data-saved-copy]");
    var delBtn = e.target.closest("[data-saved-del]");
    var id = codeEl ? codeEl.getAttribute("data-saved-code") : copyBtn ? copyBtn.getAttribute("data-saved-copy") : delBtn ? delBtn.getAttribute("data-saved-del") : null;
    if (!id) return;
    if (delBtn) {
      saveVault(loadVault().filter(function (a) { return a.id !== id; }));
      delete savedCache[id];
      renderSaved();
      toast("Deleted.");
      return;
    }
    var cached = savedCache[id];
    if (cached && cached.code && cached.code !== "ERROR") {
      try { await navigator.clipboard.writeText(groupCode(cached.code)); toast("Code copied: " + groupCode(cached.code)); }
      catch (err) { toast("Copy failed on this browser."); }
    }
  });

  renderSaved();
  refreshSaved();
  setInterval(refreshSaved, 1000);
})();
