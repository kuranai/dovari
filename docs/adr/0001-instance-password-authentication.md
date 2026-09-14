# ADR 0001: Instance password authentication

- Status: Accepted
- Date: 2026-09-14

## Context

Dovari version 1 is a single-owner, single-workspace application. Cloudflare Access provided a
strong authentication boundary, but every installation required a separate Zero Trust
application, policy, team domain, audience value, and second deployment. That made the supported
installation materially more complicated than the Deploy-to-Cloudflare product goal.

## Decision

Dovari authenticates the owner with one `DOVARI_PASSWORD` Worker secret collected by the
Deploy-to-Cloudflare flow. The application owns its login page and stores only hashes of random,
opaque session tokens in D1. Sessions expire after 30 days and are bound to the current Cloudflare
Worker version, so every deployment or password change invalidates existing sessions.

Cloudflare Access JWT validation, its production variables, the local authentication bypass, and
GitHub OAuth are not supported authentication modes. Access may still be placed in front of an
installation as an independent additional boundary, which results in two logins.

## Consequences

- A standard installation needs no Zero Trust or external identity-provider configuration.
- Dovari must provide session persistence, login throttling, logout, and a public login route.
- There is one shared owner identity and no password reset, users, roles, invitations, or MFA.
- The password is changed only in Cloudflare. A new Worker version signs out every device.
- Missing or invalid password configuration keeps private routes fail-closed.
