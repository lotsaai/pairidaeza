# ADR-002: Separate the web UI server from the bearer-token API

## Status

Accepted.

## Date

2026-11-11

## Context

Pairidaeza has browser, desktop, and mobile clients. All use real Zitadel authentication, while non-user application data remains mocked.

Browser login, cookies, and server-side sessions are different concerns from API bearer-token validation. Combining them obscures which component owns credentials and makes native authentication depend on browser-specific behavior.

Slipstream provides the relevant precedent. Its Rust frontend owns the browser session and calls a separate API with the user's access token. Its `sctl` client obtains an access token through its own browser-based OAuth flow and calls the same API directly.

## Decision

### Crate ownership

| Crate | Responsibility |
| --- | --- |
| `webui` | A separate Axum server that serves the browser application, owns browser authentication and sessions, and calls the API on the user's behalf. |
| `pairidaezad` | The API, bearer-token authentication, application authorization, and application data. It does not own browser login redirects or session cookies. |
| `protocol` | Shared API contracts, validation, and OpenAPI-compatible JSON Schema. It does not own authentication implementations. |

This split does not choose deployment hostnames, ports, or reverse-proxy configuration.

### Browser authentication

The `webui` server uses `axum-login`, `tower-sessions`, and the existing PostgreSQL session-store integration.

It owns the Zitadel authorization redirect, callback, token exchange, token refresh, and local logout. Provider tokens stay on the server. The browser carries an opaque session-ID cookie configured as HttpOnly, Secure, and SameSite. Cookie-authenticated state-changing requests require CSRF protection.

The `webui` server attaches the user's Zitadel access token when it calls `pairidaezad`. It does not duplicate API business logic or mint a replacement application JWT.

The session store remains a separate integration. Do not convert it to sqlc-generated application persistence. The sqlc and isolated PostgreSQL test-context pattern applies to our own application data code.

### Native and mobile authentication

Desktop and mobile clients perform Authorization Code with PKCE through the system browser or an OS authentication session that follows RFC 8252. Embedded login webviews are not used.

Each client receives an authorization code through its platform callback, exchanges the code with Zitadel, and calls `pairidaezad` with the resulting access token in `Authorization: Bearer`.

These clients own their tokens and refresh lifecycle. They do not use the `webui` session cookie, and JWT bearer authentication does not require a per-login application session in the API. This decision adds no platform-specific secure-storage requirement.

### Token purpose and validation

Use Zitadel-issued JWT **access tokens** as API credentials. JWT is the token format, access token is its purpose, and bearer describes how the credential is presented. An ID token is not an API bearer credential.

The API validates signatures against Zitadel's public JWKS and checks the configured issuer, API audience, expiry, required claims, and allowed algorithms. Authentication precedes application authorization. Application identity uses the verified issuer and subject, not an unverified profile field such as email.

Bearer authentication needs no application-session lookup merely to establish token validity. The API can still read user records and authorization data.

Zitadel application settings must issue the required JWT access tokens with the API audience and approved signing algorithm. Discovery metadata alone does not prove those settings are configured. No application signing key or certificate is required to verify Zitadel tokens.

### Library boundaries

Use the `oauth2` crate for server-side OAuth operations. Do not hand-roll OAuth or OIDC protocol types. OIDC-specific metadata, ID-token verification, and UserInfo processing must also use library-provided types and validation.

Vendor the relevant `axum-jwt-auth` source into `pairidaezad` under `axumext/jwtauth` and maintain it locally. Record the upstream revision and preserve its MIT copyright and permission notice. Do not copy example keys or certificates. Keep dependencies on current stable releases.

The vendored module owns Axum bearer extraction and JWT validation. It does not replace `oauth2`, implement login, or manage browser sessions. Do not introduce Limes.

### Distinct kinds of state

- OAuth `state`, the PKCE verifier, and the OIDC nonce are temporary login-transaction data.
- The `webui` application session connects a browser's opaque session ID to server-held authentication data.
- Zitadel's browser session belongs to the identity provider.
- An application user record persists identity and application data independently of a login session.

None of these becomes another merely because an access token is a JWT.

## Alternatives considered

- **A combined browser and API server.** Rejected for this design because it mixes cookie-session ownership with the bearer-token API used by native clients.
- **A browser application that holds tokens and calls the API directly.** A valid OAuth architecture, but not the chosen model. The server-backed `webui` keeps provider tokens outside browser application code.
- **Hand-written OAuth or application-issued replacement JWTs.** Rejected because they add protocol and credential-lifecycle responsibilities that the selected libraries and Zitadel already cover.
- **An unchanged JWT middleware dependency.** Vendoring gives us control over dependency compatibility and subsequent changes. It also makes security maintenance our responsibility.

## Consequences and limits

The API has one bearer-token authentication boundary for calls from `webui`, desktop, and mobile. Browser-specific session handling stays in `webui`.

Local JWT validation does not immediately observe provider-side revocation. A previously issued token can remain usable until expiry. Invalidating a `webui` session does not prove that a copied access token or Zitadel session has been invalidated. Introspection provides a different revocation and availability tradeoff and is not implied by this local-validation model.

We own the vendored module's security fixes, dependency updates, JWKS refresh behavior, and key-rotation verification.

This ADR records the accepted target architecture. It does not assert that the servers, login flows, token validation, or platform integrations are implemented or verified.

## References

- Local Slipstream source, `server/crates/frontend/src/service/auth.rs`, `server/crates/frontend/src/server.rs`, `server/crates/sctl/src/auth/user_flow.rs`, and `server/crates/slipstream-api/src/client.rs`.
- [Zitadel application and token settings](https://zitadel.com/docs/guides/manage/console/applications-overview#token-settings).
- [Zitadel token, introspection, revocation, and JWKS endpoints](https://zitadel.com/docs/apis/openidoauth/endpoints).
- [axum-jwt-auth source and license](https://github.com/cmackenzie1/axum-jwt-auth).
