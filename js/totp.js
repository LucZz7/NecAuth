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

  /* Pure-JS SHA-1 + HMAC-SHA-1 fallback. Web Crypto (crypto.subtle) only
     exists in secure contexts (HTTPS / localhost); on plain HTTP, file://
     or restricted webviews it is undefined and code generation would
     silently fail. This fallback keeps keys working everywhere. */
  function sha1Js(input) {
    var ml = input.length;
    var paddedLen = (((ml + 8) >> 6) + 1) << 6;
    var buf = new Uint8Array(paddedLen);
    buf.set(input);
    buf[ml] = 0x80;
    var dv = new DataView(buf.buffer);
    dv.setUint32(paddedLen - 4, (ml * 8) >>> 0, false);
    dv.setUint32(paddedLen - 8, Math.floor(ml / 536870912), false);
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    var w = new Int32Array(80);
    for (var chunk = 0; chunk < paddedLen; chunk += 64) {
      var i, x;
      for (i = 0; i < 16; i++) w[i] = dv.getInt32(chunk + i * 4, false);
      for (i = 16; i < 80; i++) { x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        var tmp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp;
      }
      h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
    }
    var out = new Uint8Array(20);
    var odv = new DataView(out.buffer);
    odv.setInt32(0, h0, false); odv.setInt32(4, h1, false); odv.setInt32(8, h2, false); odv.setInt32(12, h3, false); odv.setInt32(16, h4, false);
    return out;
  }

  function hmacSha1Js(keyBytes, msgBytes) {
    var key = keyBytes.length > 64 ? sha1Js(keyBytes) : keyBytes;
    var block = new Uint8Array(64);
    block.set(key);
    var ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
    var inner = new Uint8Array(64 + msgBytes.length);
    inner.set(ipad); inner.set(msgBytes, 64);
    var innerHash = sha1Js(inner);
    var outer = new Uint8Array(64 + innerHash.length);
    outer.set(opad); outer.set(innerHash, 64);
    return sha1Js(outer);
  }

  async function hotp(secretBase32, counter, digits, algorithm) {
    var keyBytes = base32Decode(secretBase32);
    var msg = counterBytes(counter);
    var algo = String(algorithm || "SHA1").toUpperCase().replace(/-/g, "");
    var sig;
    if (global.crypto && crypto.subtle && crypto.subtle.importKey) {
      var hashName = algo === "SHA256" ? "SHA-256" : algo === "SHA512" ? "SHA-512" : "SHA-1";
      var key = await crypto.subtle.importKey(
        "raw", keyBytes, { name: "HMAC", hash: hashName }, false, ["sign"]
      );
      sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
    } else {
      if (algo !== "SHA1") throw new Error("This key needs the secure (HTTPS) version of this page.");
      sig = hmacSha1Js(keyBytes, msg);
    }
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
    return hotp(secretBase32, counter, opts.digits || 6, opts.algorithm);
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
      var expected = await hotp(secretBase32, counter + w, digits, opts.algorithm);
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
      period: parseInt(params.get("period") || "30", 10) || 30,
      algorithm: String(params.get("algorithm") || "SHA1").toUpperCase()
    };
  }

  function buildOtpauthUrl(entry) {
    var label = encodeURIComponent(entry.issuer + ":" + entry.account);
    var p = new URLSearchParams({
      secret: normalizeSecret(entry.secret),
      issuer: entry.issuer,
      algorithm: String(entry.algorithm || "SHA1").toUpperCase(),
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
