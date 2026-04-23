# PR Card Implementation Plan

Date: 2026-04-23
Feature: Header PR status card

## Phase 1: Backend

1. Add GitHub PR response types to the backend models and frontend shared types.
2. Implement a backend service that:
   - resolves the current branch for a workspace
   - runs `gh pr list` for that branch
   - normalizes result states into `ready`, `no_pr`, `gh_unavailable`, or `error`
3. Add a new handler and route:
   - `GET /api/github/current-pr`

## Phase 2: Frontend State

1. Add shared frontend types and API client for current PR lookup.
2. In `App.tsx`, add top-level `currentPr` state.
3. Refresh PR data when:
   - app loads
   - active workspace changes
   - branch state refreshes

## Phase 3: Header UI

1. Extend `Header` props for PR card data and `Open` action.
2. Render compact PR states in the header:
   - loading
   - ready
   - no PR
   - unavailable
   - error
3. Keep layout compact with title truncation and a narrow status label.

## Phase 4: Verification

1. Run backend-targeted tests if available.
2. Build backend after Rust changes and restart the dev server on port `1235`.
3. Run frontend build or typecheck and report unrelated blockers if present.
4. Manually verify the new API with `gh` and a local request if possible.
