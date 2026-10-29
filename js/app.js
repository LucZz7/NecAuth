/* NecAuth v10 - generator only. Straight code display, premium copy animation.
   Key handling: paste button fetches the key from the clipboard (with an
   on-screen hint if the browser blocks it), any paste into the box
   auto-generates, and full otpauth:// links are understood. All
   user-facing text is 100% English. Saved accounts stay on this device. */
(function () {
  "use strict";
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };
  var PERIOD = 30;
  var STORAGE_KEY = "necauth_vault_v1";

  /* PWA: register the service worker so the site is installable and offline-ready */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }

  /* Install App button: uses the browser install prompt (PWA, not an APK file) */
  (function () {
    var deferredPrompt = null;
    var btn = $("installBtn");
    if (!btn) return;
    function isStandalone() {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }
    function setInstalled() {
      $("installLabel").textContent = "App Installed";
      btn.classList.add("installed");
      $("installHint").classList.add("hidden");
    }
    if (isStandalone()) setInstalled();
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      setInstalled();
    });
    btn.addEventListener("click", async function () {
      if (isStandalone()) { setInstalled(); return; }
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try {
          var choice = await deferredPrompt.userChoice;
          if (choice && choice.outcome === "accepted") setInstalled();
        } catch (e) {}
        deferredPrompt = null;
        return;
      }
      var hint = $("installHint");
      var isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      hint.textContent = isiOS
        ? "iPhone: Share button dabao, phir 'Add to Home Screen' chuno - NecAuth app icon ban jayega."
        : "Chrome menu (3 dots) me jao aur 'Install app' ya 'Add to Home Screen' chuno - NecAuth app install ho jayegi.";
      hint.classList.toggle("hidden");
    });
  })();

  /* Tap animation: wherever the finger/cursor lands on screen, a small
     red ring + dot bursts at that exact tap point and fades out.
     Nothing else animates on tap; no background animation runs on its own. */
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var fx = document.createElement("span");
    fx.className = "tap-fx";
    fx.style.left = e.clientX + "px";
    fx.style.top = e.clientY + "px";
    document.body.appendChild(fx);
    setTimeout(function () { fx.remove(); }, 500);
  });

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

  /* Premium copy feedback: soft glow + shine sweep + small corner icon
     morphs to a check with a tiny Copied chip. Nothing big in the center. */
  function flashCopied(cardEl, btnEl) {
    cardEl.classList.add("copied");
    var useEl = btnEl ? btnEl.querySelector("use") : null;
    var oldHref = useEl ? useEl.getAttribute("href") : null;
    if (useEl) useEl.setAttribute("href", "#i-check");
    setTimeout(function () {
      cardEl.classList.remove("copied");
      if (useEl && oldHref) useEl.setAttribute("href", oldHref);
    }, 1400);
  }
  function copyFeedback(cardEl, rawCode, groupedText, btnEl) {
    return navigator.clipboard.writeText(groupedText)
      .then(function () { flashCopied(cardEl, btnEl); })
      .catch(function () { flashCopied(cardEl, btnEl); });
  }

  /* ----- Generator ----- */
  var currentSecret = null;
  var currentPeriodKey = null;
  var currentCode = "";
  var currentDigits = 6;
  var currentPeriod = PERIOD;
  var currentAlgorithm = "SHA1";

  async function updateCode() {
    if (!currentSecret) return;
    $("timeChip").textContent = new Date().toLocaleTimeString("en-GB");
    var remain = T.secondsRemaining(currentPeriod);
    $("secondsLeft").textContent = remain;
    $("timeBar").style.width = (remain / currentPeriod) * 100 + "%";
    var periodKey = Math.floor(Date.now() / 1000 / currentPeriod);
    if (periodKey === currentPeriodKey) return;
    currentPeriodKey = periodKey;
    try {
      currentCode = await T.totp(currentSecret, { digits: currentDigits, period: currentPeriod, algorithm: currentAlgorithm });
      $("codeText").innerHTML = digitHTML(currentCode);
    } catch (e) {}
  }

  async function generate() {
    var raw = $("secretInput").value.trim();
    if (!raw) { showError("Enter your 2FA secret key first."); return; }
    try {
      var digits = 6, period = PERIOD, algorithm = "SHA1";
      if (/^otpauth:\/\//i.test(raw)) {
        var parsed = T.parseOtpauth(raw);
        currentSecret = parsed.secret;
        digits = parsed.digits;
        period = parsed.period;
        algorithm = parsed.algorithm || "SHA1";
        $("secretInput").value = parsed.secret;
        var label = (parsed.issuer && parsed.issuer !== "Account") ? parsed.issuer : (parsed.account || "");
        if (label && !$("saveName").value) $("saveName").value = label;
      } else {
        currentSecret = T.normalizeSecret(raw);
      }
      T.base32Decode(currentSecret);
      currentDigits = digits;
      currentPeriod = period;
      currentAlgorithm = algorithm;
      currentPeriodKey = null;
      currentCode = "";
      showError("");
      $("qrPanel").classList.add("hidden");
      $("resultBox").classList.add("show");
      $("saveRow").classList.remove("hidden");
      await updateCode();
      if (!currentCode) showError("Could not generate a code from this key. Check the key and try again.");
    } catch (err) {
      currentSecret = null;
      $("resultBox").classList.remove("show");
      showError(/^otpauth:\/\//i.test(raw)
        ? "This otpauth link could not be read. Paste only the secret key."
        : "This secret key is not valid. Enter a correct Base32 secret key.");
    }
  }

  $("generateBtn").addEventListener("click", generate);
  $("secretInput").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); generate(); } });
  setInterval(updateCode, 500);

  /* Fetch the key from the clipboard. Some browsers/webviews block
     clipboard reads; then focus the box and say exactly what to do
     instead of failing silently. */
  $("pasteBtn").addEventListener("click", async function () {
    var text = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (e) { text = ""; }
    if (text && text.trim()) {
      $("secretInput").value = text.trim();
      showError("");
      generate();
    } else {
      $("secretInput").focus();
      showError("Could not fetch the key automatically. Long-press the box and tap Paste.");
    }
  });

  /* Any paste into the key box (button or long-press) fetches the key
     and generates the code right away. */
  $("secretInput").addEventListener("paste", function () {
    setTimeout(generate, 0);
  });

  $("codeCard").addEventListener("click", function () {
    if (!currentSecret || !currentCode) return;
    copyFeedback($("codeCard"), currentCode, groupCode(currentCode), $("copyBtn"));
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
          var code = await T.totp(a.secret, { digits: a.digits || 6, period: a.period || 30, algorithm: a.algorithm || "SHA1" });
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
    list.unshift({ id: uid(), issuer: name, account: "", secret: currentSecret, digits: currentDigits, period: currentPeriod, algorithm: currentAlgorithm, createdAt: Date.now() });
    saveVault(list);
    $("saveName").value = "";
    $("saveRow").classList.add("hidden");
    renderSaved();
    refreshSaved();
  });
  /* QR for the current key */
  $("qrBtn").addEventListener("click", function () {
    if (!currentSecret) return;
    var panel = $("qrPanel");
    if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
    var name = $("saveName").value.trim() || "NecAuth";
    var url = T.buildOtpauthUrl({ issuer: "NecAuth", account: name, secret: currentSecret, digits: currentDigits, period: currentPeriod, algorithm: currentAlgorithm });
    var target = $("qrTarget");
    target.innerHTML = "";
    try {
      if (typeof qrcode !== "undefined") {
        var qr = qrcode(0, "M");
        qr.addData(url);
        qr.make();
        target.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 6, scalable: true });
        var svg = target.querySelector("svg");
        if (svg) { svg.setAttribute("width", "168"); svg.setAttribute("height", "168"); }
      } else target.textContent = "QR unavailable offline";
    } catch (err) { target.textContent = "QR unavailable"; }
    panel.classList.remove("hidden");
  });

  /* Backup export / import */
  $("exportBtn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ app: "NecAuth", version: 7, exportedAt: new Date().toISOString(), accounts: loadVault() }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "necauth-backup.json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function () {
    var file = $("importFile").files[0];
    if (!file) return;
    file.text().then(function (text) {
      try {
        var parsed = JSON.parse(text);
        var incoming = Array.isArray(parsed) ? parsed : parsed.accounts;
        if (!Array.isArray(incoming)) throw new Error("bad file");
        var clean = incoming.map(function (a) {
          var secret = T.normalizeSecret(a.secret);
          T.base32Decode(secret);
          return { id: uid(), issuer: String(a.issuer || "Account"), account: String(a.account || ""), secret: secret, digits: a.digits || 6, period: a.period || 30, createdAt: Date.now() };
        });
        saveVault(clean.concat(loadVault()));
        renderSaved();
        refreshSaved();
      } catch (err) {}
      $("importFile").value = "";
    });
  });

  /* Delete with confirmation + slide-out animation */
  var pendingDeleteId = null;
  $("deleteCancel").addEventListener("click", function () { $("deleteBackdrop").classList.remove("open"); pendingDeleteId = null; });
  $("deleteBackdrop").addEventListener("click", function (e) { if (e.target === $("deleteBackdrop")) { $("deleteBackdrop").classList.remove("open"); pendingDeleteId = null; } });
  $("deleteConfirm").addEventListener("click", function () {
    var id = pendingDeleteId;
    $("deleteBackdrop").classList.remove("open");
    pendingDeleteId = null;
    if (!id) return;
    var item = document.querySelector('[data-saved-item="' + id + '"]');
    function doRemove() {
      saveVault(loadVault().filter(function (a) { return a.id !== id; }));
      delete savedCache[id];
      renderSaved();
    }
    if (item) { item.classList.add("removing"); setTimeout(doRemove, 370); }
    else doRemove();
  });

  $("savedList").addEventListener("click", async function (e) {
    var delBtn = e.target.closest("[data-saved-del]");
    if (delBtn) {
      pendingDeleteId = delBtn.getAttribute("data-saved-del");
      var entry = loadVault().find(function (a) { return a.id === pendingDeleteId; });
      $("deleteText").textContent = entry
        ? "Delete " + entry.issuer + "? Its secret key will be permanently removed from this device."
        : "This will remove the account and its secret key from this device.";
      $("deleteBackdrop").classList.add("open");
      return;
    }
    var copyEl = e.target.closest("[data-saved-copy],[data-saved-code]");
    if (!copyEl) return;
    var id = copyEl.getAttribute("data-saved-copy") || copyEl.getAttribute("data-saved-code");
    var cached = savedCache[id];
    if (!cached || !cached.code || cached.code === "ERROR") return;
    var item = document.querySelector('[data-saved-item="' + id + '"]');
    var btn = document.querySelector('[data-saved-copy="' + id + '"]');
    if (item) copyFeedback(item, cached.code, groupCode(cached.code), btn);
  });

  renderSaved();
  refreshSaved();
  setInterval(refreshSaved, 1000);
})();
