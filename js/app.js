/* NecAuth - single-box TOTP generator (v3)
   Enter a secret key, press Generate, get a live code.
   The code auto-refreshes every 30 seconds. Nothing is stored or uploaded. */
(function () {
  "use strict";
  var T = window.NecTOTP;
  var $ = function (id) { return document.getElementById(id); };
  var PERIOD = 30;
  var currentSecret = null;
  var currentPeriodKey = null;
  var timer = null;

  // Remove any old service worker + caches from previous versions,
  // so the new clean site is what everyone actually sees.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    }).catch(function () {});
    if (window.caches) {
      caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
  }

  function showError(msg) {
    var el = $("errorText");
    el.textContent = msg;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }
  function clearError() { $("errorText").classList.remove("show"); }

  function groupCode(code) { return code.slice(0, 3) + " " + code.slice(3); }

  async function updateCode() {
    if (!currentSecret) return;
    var periodKey = Math.floor(Date.now() / 1000 / PERIOD);
    var remain = T.secondsRemaining(PERIOD);
    $("secondsLeft").textContent = remain;
    $("timeBar").style.width = (remain / PERIOD) * 100 + "%";
    if (periodKey === currentPeriodKey) return;
    currentPeriodKey = periodKey;
    try {
      var code = await T.totp(currentSecret, { digits: 6, period: PERIOD });
      var el = $("codeText");
      el.textContent = groupCode(code);
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    } catch (e) { /* keep last code on screen */ }
  }

  $("authForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var raw = $("secretInput").value;
    if (!raw.trim()) { showError("Pehle apni 2FA secret key daalo."); return; }
    try {
      var secret = T.normalizeSecret(raw);
      T.base32Decode(secret); // throws if the key is not valid Base32
      currentSecret = secret;
      currentPeriodKey = null;
      clearError();
      $("resultBox").classList.add("show");
      await updateCode();
      if (timer) clearInterval(timer);
      timer = setInterval(updateCode, 500);
    } catch (err) {
      currentSecret = null;
      $("resultBox").classList.remove("show");
      showError("Ye secret key valid nahi hai. Sahi Base32 key daalo.");
    }
  });

  $("codeText").addEventListener("click", async function () {
    if (!currentSecret) return;
    var text = $("codeText").textContent;
    if (!text || text.indexOf("-") >= 0) return;
    try { await navigator.clipboard.writeText(text); toast("Code copied: " + text); }
    catch (e) { toast("Copy failed on this browser."); }
  });
})();
