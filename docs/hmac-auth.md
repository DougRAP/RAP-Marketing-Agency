# HMAC Auth Contract — RAP Fulfillment Bridge

Server-to-server authentication between Netlify Functions (BFF layer at
`thedesignerplan.com`) and the Spring Boot fulfillment engine (at
`designerplan.io`). Both sides hold a single shared secret today; the
protocol leaves room for multi-key rotation later (per Q1 decision
2026-05-22 — start with one key, rotation is a future enhancement).

The user JWT issued by Supabase Auth NEVER crosses this boundary. The
BFF validates the user JWT, then makes its own signed call here using
the bridge secret.

---

## Headers (all required on every request)

| Header | Format | Purpose |
|---|---|---|
| `X-RAP-Signature` | hex-encoded HMAC-SHA256 (64 chars) | Authenticates the request body + key fields |
| `X-RAP-Timestamp` | ISO 8601 UTC, e.g. `2026-05-22T14:30:00Z` | Prevents replay attacks |
| `X-RAP-Key-Id` | short identifier, e.g. `netlify-prod` | Identifies which shared secret was used |

Requests missing any of these three headers return **401** with body
`{ "code": "missing_signature_headers" }`.

---

## Signing string

The string fed into HMAC-SHA256 is exactly four lines joined by `\n`
(LF, not CRLF):

```
<HTTP_METHOD>
<PATH_AND_QUERY>
<TIMESTAMP>
<BODY_HASH>
```

Where:

- `HTTP_METHOD` is uppercase: `GET`, `POST`, `PUT`, `DELETE`.
- `PATH_AND_QUERY` is the request path including the query string,
  starting with `/`. For example `/v1/checkout` or
  `/v1/partner/abc-123/dashboard?limit=20`. Do NOT include the scheme
  or host.
- `TIMESTAMP` is the exact value of the `X-RAP-Timestamp` header.
- `BODY_HASH` is the lowercase hex SHA-256 of the raw request body
  bytes. For requests with no body (e.g. `GET`), use the SHA-256 of an
  empty string: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The HMAC key is the shared secret bound to `X-RAP-Key-Id`.

---

## Validation (engine side)

The engine's `HmacAuthFilter` (Wave B.4) runs before every controller
matching `/api/v1/**`:

1. Read the three `X-RAP-*` headers. If any are missing → 401.
2. Look up the secret bound to `X-RAP-Key-Id` in the engine's
   in-memory key map. If unknown key ID → 401.
3. Parse `X-RAP-Timestamp`. If outside **±300 seconds** of server
   clock → 401. (Tolerance accounts for clock skew without enabling
   replay-after-leak.)
4. Re-compute the expected signature from the request's method, path,
   timestamp, and body. Compare with `X-RAP-Signature` using a
   constant-time string comparator (`MessageDigest.isEqual` in
   Java, `crypto.timingSafeEqual` in Node).
5. If equal → request proceeds. If not → 401 with body
   `{ "code": "invalid_signature" }`.

Failed validations are logged with: timestamp, source IP, requested
path, key ID claimed (so we can detect probing or a misconfigured
caller). The actual signature value is **never logged**.

---

## Secret distribution

One env var on each side. Same value:

```bash
# Netlify (designer-plan-site env vars dashboard)
RAP_BRIDGE_HMAC_SECRET=<base64 of 32 random bytes>

# Spring Boot (Rackspace Tomcat $CATALINA_BASE/conf/setenv.sh)
export RAP_BRIDGE_HMAC_SECRET=<same value>
```

Generate the secret once with:

```bash
openssl rand -base64 32
```

Both sides also need the key ID:

```bash
# Netlify
RAP_BRIDGE_HMAC_KEY_ID=netlify-prod

# Spring Boot (application.yml or env)
rap.bridge.hmac.key-id=netlify-prod
```

The engine's config maps `netlify-prod` → secret env var. Multiple keys
can be configured simultaneously (just bind more env vars to more key
IDs) — this is what enables zero-downtime rotation when we need it.

---

## Key rotation (future, not for go-live)

When time comes:

1. Generate a new secret. Bind to a new key ID, e.g. `netlify-2026-q3`.
2. Add the new key + secret to the engine's config alongside the old
   one. Both are now valid.
3. Update Netlify's env var to send the new key ID. Redeploy Netlify.
4. Verify traffic is flowing under the new key ID in engine logs.
5. Remove the old key from engine config. Redeploy engine.

No traffic interruption because the engine accepts both keys during
the overlap window.

---

## Reference implementation — Node.js (Netlify Function side)

```js
// netlify/functions/_hmac.js
const crypto = require('crypto');

const EMPTY_BODY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function signRequest({ method, pathAndQuery, body }) {
  const secret = process.env.RAP_BRIDGE_HMAC_SECRET;
  const keyId  = process.env.RAP_BRIDGE_HMAC_KEY_ID;
  if (!secret || !keyId) {
    throw new Error('RAP_BRIDGE_HMAC_SECRET / KEY_ID not configured');
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const bodyStr = typeof body === 'string'
    ? body
    : (body ? JSON.stringify(body) : '');
  const bodyHash = bodyStr
    ? crypto.createHash('sha256').update(bodyStr, 'utf8').digest('hex')
    : EMPTY_BODY_SHA256;

  const signingString = [
    method.toUpperCase(),
    pathAndQuery,
    timestamp,
    bodyHash
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingString, 'utf8')
    .digest('hex');

  return {
    headers: {
      'X-RAP-Signature': signature,
      'X-RAP-Timestamp': timestamp,
      'X-RAP-Key-Id': keyId
    },
    body: bodyStr
  };
}

module.exports = { signRequest };
```

Used by a BFF Netlify Function:

```js
// netlify/functions/cart-checkout.js (Wave C.9)
const fetch = require('node-fetch');
const { signRequest } = require('./_hmac');

exports.handler = async (event) => {
  const body = { /* ...validated client payload... */ };
  const signed = signRequest({
    method: 'POST',
    pathAndQuery: '/v1/checkout',
    body
  });

  const resp = await fetch('https://designerplan.io/api/v1/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...signed.headers
    },
    body: signed.body
  });

  // ...translate engine response back to the browser
};
```

---

## Reference implementation — Java (Spring Boot side)

```java
// HmacAuthFilter.java
package io.designerplan.api.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.security.MessageDigest;
import java.time.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.web.filter.OncePerRequestFilter;

public class HmacAuthFilter extends OncePerRequestFilter {

  private static final String EMPTY_BODY_SHA256 =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  private static final long MAX_SKEW_SECONDS = 300;

  private final HmacKeyStore keyStore; // injects: Map<keyId, secret>

  public HmacAuthFilter(HmacKeyStore keyStore) {
    this.keyStore = keyStore;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest req,
                                  HttpServletResponse res,
                                  FilterChain chain)
      throws ServletException, IOException {

    String signature = req.getHeader("X-RAP-Signature");
    String timestamp = req.getHeader("X-RAP-Timestamp");
    String keyId     = req.getHeader("X-RAP-Key-Id");

    if (signature == null || timestamp == null || keyId == null) {
      reject(res, "missing_signature_headers"); return;
    }

    String secret = keyStore.get(keyId);
    if (secret == null) { reject(res, "unknown_key_id"); return; }

    // Timestamp skew
    try {
      Instant ts = Instant.parse(timestamp);
      long skew = Math.abs(Duration.between(ts, Instant.now()).getSeconds());
      if (skew > MAX_SKEW_SECONDS) {
        reject(res, "timestamp_skew"); return;
      }
    } catch (DateTimeParseException e) {
      reject(res, "bad_timestamp"); return;
    }

    // Capture body for hashing (use CachedBodyHttpServletRequest wrapper)
    CachedBodyHttpServletRequest wrapped =
      new CachedBodyHttpServletRequest(req);
    byte[] bodyBytes = wrapped.getBodyBytes();
    String bodyHash = bodyBytes.length == 0
      ? EMPTY_BODY_SHA256
      : hex(sha256(bodyBytes));

    String pathAndQuery = req.getRequestURI()
      + (req.getQueryString() != null ? "?" + req.getQueryString() : "");

    String signingString = String.join("\n",
      req.getMethod().toUpperCase(),
      pathAndQuery,
      timestamp,
      bodyHash
    );

    String expected = hmacSha256Hex(secret, signingString);
    if (!constantTimeEquals(expected, signature)) {
      reject(res, "invalid_signature"); return;
    }

    chain.doFilter(wrapped, res);
  }

  private static boolean constantTimeEquals(String a, String b) {
    return MessageDigest.isEqual(a.getBytes(), b.getBytes());
  }

  private static String hmacSha256Hex(String secret, String data) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(), "HmacSHA256"));
      return hex(mac.doFinal(data.getBytes()));
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  // ... helpers: sha256, hex, reject(res, code)
}
```

The `HmacKeyStore` reads from Spring config:

```yaml
# application.yml
rap:
  bridge:
    hmac:
      keys:
        netlify-prod: ${RAP_BRIDGE_HMAC_SECRET}
        # Future rotation:
        # netlify-2026-q3: ${RAP_BRIDGE_HMAC_SECRET_2026Q3}
```

---

## Why this design

- **Signature covers the full request shape** (method, path, query,
  timestamp, body). An attacker who captures a signed request cannot
  alter any part of it.
- **Timestamp prevents replay.** Even a captured signature is useless
  after 5 minutes.
- **Key ID supports rotation** without protocol changes. Today we
  ship with one key; the wire format already accommodates many.
- **No state on either side.** The engine doesn't need to track which
  signatures it has seen. Pure stateless validation.
- **Symmetric** — same algorithm in both directions. If the engine
  ever needs to call back into Netlify (e.g., webhooks from Spring
  Boot), the same `signRequest` works.

---

## What NOT to do

- Do not log the signature value. It is useless without the secret but
  best practice is to treat it as sensitive.
- Do not log the body of failed requests by default. Bodies can
  contain customer PII. Log only the path, key ID, and failure code.
- Do not return verbose details (like "signature does not match X")
  on 401. Return only the failure code. Helps avoid leaking which
  field varied.
- Do not parse the timestamp leniently. Reject anything that isn't
  ISO 8601 UTC with `Z` suffix. Other formats invite ambiguity.

---

## Open questions left to execution

- Header name `X-RAP-` prefix is reserved for this protocol. Confirm
  no existing usage in either codebase before Wave B starts.
- Body hashing: confirm that Netlify's `event.body` matches the exact
  bytes the engine reads. Empty-string special case (`EMPTY_BODY_SHA256`)
  is per spec but watch for trailing newlines in some HTTP stacks.

These will be validated empirically during Wave B.4 implementation.
