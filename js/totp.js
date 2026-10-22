/* NecAuth - TOTP Core (RFC 4226 HOTP + RFC 6238 TOTP)
   Pure Web Crypto implementation. Secrets never leave the device:
   every code is computed locally in the browser, exactly like
   Google Authenticator, Microsoft Authenticator and Authy. */
(function (global) {
  "use strict";

  var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  function normalizeSecret(input) {
    return String(input || "").toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  }

  function base32Decode(input) {
    var clean = normalizeSecret(input);
    if (!clean) throw new Error("Secret key is empty.");
    var bits = 0, value = 0, index = 0;
    var output = new Uint8Array(Math.ceil((clean.length * 5) / 8));
    for (var i = 0; i < clean.length; i++) {
      var idx = BASE32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) throw new Error("Secret key contains an invalid character: " + clean[i]);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output[index++] = (value >>> (bits - 8)) & 0xff;
        bits -= 8;
      }
    }
    return output.slice(0, index);
  }

  function base32Encode(bytes) {
    var bits = 0, value = 0, output = "";
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    while (output.length % 8 !== 0) output += "=";
    return output;
  }

  function generateSecret(byteLength) {
    var len = byteLength || 20;
    var bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return base32Encode(bytes);
  }

  function counterBytes(counter) {
    var buf = new ArrayBuffer(8);
    var view = new DataView(buf);
    view.setUint32(4, counter >>> 0);
    view.setUint32(0, Math.floor(counter / 4294967296));
    return new Uint8Array(buf);
  }

  async function hotp(secretBase32, counter, digits) {
    var keyBytes = base32Decode(secretBase32);
    var key = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );
    var sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter)));
    var offset = sig[sig.length - 1] & 0x0f;
    var binary =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff);
    var code = binary % Math.pow(10, digits || 6);
    return String(code).padStart(digits || 6, "0");
  }

  async function totp(secretBase32, options) {
    var opts = options || {};
    var period = opts.period || 30;
    var timestamp = opts.timestamp != null ? opts.timestamp : Date.now();
    var counter = Math.floor(timestamp / 1000 / period);
    return hotp(secretBase32, counter, opts.digits || 6);
  }

  async function verify(secretBase32, userCode, options) {
    var opts = options || {};
    var period = opts.period || 30;
    var digits = opts.digits || 6;
    var windowSize = opts.window != null ? opts.window : 1;
    var clean = String(userCode || "").replace(/\s/g, "");
    if (!/^\d+$/.test(clean) || clean.length !== digits) return false;
    var counter = Math.floor(Date.now() / 1000 / period);
    for (var w = -windowSize; w <= windowSize; w++) {
      var expected = await hotp(secretBase32, counter + w, digits);
      if (expected === clean) return true;
    }
    return false;
  }

  function secondsRemaining(period) {
    var p = period || 30;
    return p - (Math.floor(Date.now() / 1000) % p);
  }

  function parseOtpauth(uri) {
    var text = String(uri || "").trim();
    if (!text.toLowerCase().startsWith("otpauth://totp/")) {
      throw new Error("This is not a valid otpauth://totp link.");
    }
    var rest = text.slice("otpauth://totp/".length);
    var qIndex = rest.indexOf("?");
    var labelPart = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
    var queryPart = qIndex >= 0 ? rest.slice(qIndex + 1) : "";
    var label = decodeURIComponent(labelPart || "");
    var params = new URLSearchParams(queryPart);
    var secret = params.get("secret");
    if (!secret) throw new Error("No secret found in this otpauth link.");
    var issuer = params.get("issuer") || "";
    var account = label;
    if (label.indexOf(":") >= 0) {
      var parts = label.split(":");
      if (!issuer) issuer = parts[0];
      account = parts.slice(1).join(":");
    }
    return {
      issuer: issuer || "Account",
      account: account || issuer || "Account",
      secret: normalizeSecret(secret),
      digits: parseInt(params.get("digits") || "6", 10) || 6,
      period: parseInt(params.get("period") || "30", 10) || 30
    };
  }

  function buildOtpauthUrl(entry) {
    var label = encodeURIComponent(entry.issuer + ":" + entry.account);
    var p = new URLSearchParams({
      secret: normalizeSecret(entry.secret),
      issuer: entry.issuer,
      algorithm: "SHA1",
      digits: String(entry.digits || 6),
      period: String(entry.period || 30)
    });
    return "otpauth://totp/" + label + "?" + p.toString();
  }

  global.NecTOTP = {
    normalizeSecret: normalizeSecret,
    base32Decode: base32Decode,
    base32Encode: base32Encode,
    generateSecret: generateSecret,
    hotp: hotp,
    totp: totp,
    verify: verify,
    secondsRemaining: secondsRemaining,
    parseOtpauth: parseOtpauth,
    buildOtpauthUrl: buildOtpauthUrl
  };
})(window);
