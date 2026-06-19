---
format_version: 1
---

# Security Posture — OpenShift Service Mesh Console Plugin (OSSMC)

## Overview

OSSMC is a frontend-only OpenShift Console dynamic plugin. Server-side enforcement (RBAC, authentication, input validation) lives in the **Kiali backend API**. This document covers the security-relevant patterns within the plugin's TypeScript code.

## CSRF Protection

- Non-GET requests include an `X-CSRFToken` header parsed from the `csrf-token` cookie
- Implementation: `getCSRFToken()` in `plugin/src/kiali/types/Auth.ts` (lines 43–55)
- Header injection: `getHeaders()` in `plugin/src/kiali/services/Api.ts` (lines 128–142)
- Reviewers should verify that new mutating API calls use the standard `newRequest()` helper, which includes CSRF automatically

## Authentication

- Auth strategies defined via `AuthStrategy` enum in `plugin/src/kiali/types/Auth.ts`
- Session shape: `SessionInfo` type with username and expiration
- Login flow: `login()` (POST with optional `basicAuth`), `logout()`, `getAuthInfo()`, `extendSession()` in `Api.ts`
- Login thunks in `plugin/src/kiali/actions/LoginThunkActions.ts` handle `AuthResult` branching and error dispatch

## OpenShift Console Proxy

- API calls are routed through the OpenShift Console service proxy rather than directly to the Kiali backend
- `API_PROXY` constant prefixes URLs so the browser talks to the console proxy
- Implementation: `plugin/src/kiali/services/Api.ts` (lines 110–116, 158–164)
- Reviewers should verify that new API endpoints use the proxy path, not direct backend URLs

## Authorization (UI-Level)

- Backend exposes Istio/Kubernetes permissions; UI uses `canCreate` / `canUpdate` / `canDelete` from `plugin/src/kiali/types/Permissions.ts`
- `serverConfig.deployment.viewOnlyMode` gates write operations
- `getIstioPermissions` in `Api.ts` fetches permissions from the backend
- Reviewers should verify that new write operations check permissions before rendering action buttons

## Input Handling

- No global client-side validator — form-level validation in wizards (e.g., hostname validation in `K8sRequestRouting.tsx`)
- Graph/Mesh find language parsing normalizes user strings (e.g., `prepareValue` in `MeshFind.tsx`)
- Server-side validation is the primary enforcement layer (Kiali API, Kubernetes API)

## Review Focus Areas

When reviewing security-related changes:
1. Verify new mutating calls use `newRequest()` (ensures CSRF header)
2. Verify new API endpoints route through the console proxy
3. Verify write operations check `canCreate`/`canUpdate`/`canDelete` permissions
4. Be cautious of any code that constructs URLs from user input without sanitization

## Changelog

| Date | Change | Trigger |
|------|--------|---------|
| 2026-04-21 | Initial generation | /code-reviewer:setup |
