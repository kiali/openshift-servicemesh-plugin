---
format_version: 1
---

# API Conventions — OpenShift Service Mesh Console Plugin (OSSMC)

## Overview

OSSMC consumes the Kiali REST API via Axios. API client code lives in `plugin/src/kiali/services/Api.ts` with URL builders in `plugin/src/kiali/config/Config.ts`. Since this is vendored code, reviewers should focus on OSSMC-specific API usage in `plugin/src/openshift/`.

## HTTP Client

- **Library**: Axios
- **Request builder**: `newRequest()` in `Api.ts` — all API calls should use this to ensure consistent headers and proxy routing
- **Content-Type**: `application/json` for standard calls; `application/x-www-form-urlencoded` for login
- **Standard headers**: `Kiali-UI: true`, `X-Auth-Type-Kiali-UI` (from config), conditional `X-CSRFToken` for non-GET requests

## URL Structure

- URLs are resource-oriented, built from `config.api.urls` in `Config.ts` (starts line 99)
- Pattern: `api/namespaces/{namespace}/{resource}` (e.g., `api/namespaces/${ns}/apps`, `api/istio/config`)
- Cluster selection via optional `clusterName` query param through `ClusterParam` / `QueryParams` utilities

## Proxy Routing

- All requests route through the OpenShift Console service proxy (`API_PROXY` prefix)
- New API endpoints must use this proxy path, not direct backend URLs

## Error Handling

- Centralized via `getErrorString()` / `getErrorDetail()` in `Api.ts` (lines 1334–1361)
- These extract user-facing messages from `ApiError` objects
- New API calls should use these helpers for consistent error messaging

## Mock / Dev API

- **MSW** (Mock Service Worker) handlers composed in `plugin/src/kiali/mocks/handlers.ts`
- **Express mock server** bridges MSW handlers for local dev (`plugin/mock-server/server.ts`)
- When adding new API calls, corresponding MSW handlers should be added for mock-server support

## Review Focus Areas

When reviewing API-related changes in `plugin/src/openshift/`:
1. Verify new calls use `newRequest()` or existing API functions from `Api.ts`
2. Verify URLs follow the `api/namespaces/{ns}/...` pattern
3. Verify error handling uses `getErrorString` / `getErrorDetail`
4. Check that new endpoints are added to the mock handlers if applicable
5. Verify `ClusterParam` is used for multi-cluster-aware calls

## Changelog

| Date | Change | Trigger |
|------|--------|---------|
| 2026-04-21 | Initial generation | /code-reviewer:setup |
