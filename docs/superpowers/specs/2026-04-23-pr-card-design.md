# PR Card Design

Date: 2026-04-23
Scope: Right-side header PR status card for the current workspace branch
Status: Approved for implementation

## Goal

Show the GitHub pull request associated with the current workspace branch in the top-right header, with a single-click action to open the PR in GitHub.

This feature is intentionally narrow. It does not include AI review execution, PR comments, CI checks, or a full checks center.

## User Outcome

- When a workspace branch has an open PR, the user sees a compact PR card in the header.
- The card shows the PR number, title, and a small status summary.
- Clicking `Open` opens the PR URL.
- If there is no PR, the header shows a quiet empty state instead of failing loudly.

## Recommended Approach

Use the local `gh` CLI on the backend to resolve the current branch's open PR.

Why this approach:

- Reuses the user's existing GitHub authentication on the machine.
- Matches Conductor's reported approach for branch-linked PR checks.
- Avoids adding GitHub OAuth or token management to the frontend.
- Keeps the API surface small and the first version low-risk.

Alternatives considered:

- Direct GitHub REST API from the backend. Rejected for v1 because it adds token management and repo resolution complexity.
- Frontend-only link construction. Rejected because it cannot reliably resolve PR state.

## Architecture

### Backend

Add a new endpoint:

- `GET /api/github/current-pr?session=&window=`

Backend flow:

1. Resolve the workspace root using the existing workspace/session resolver.
2. Resolve the current git branch from that workspace.
3. Run `gh pr list --head <branch> --state open --json ...` in the repo.
4. Parse the result and return either:
   - a normalized PR payload
   - a `no_pr` state
   - a `gh_unavailable` state
   - an `error` state

The response should be normalized rather than passing raw `gh` output through to the client.

### Frontend

Add header-level PR state owned by `App.tsx`, similar to other top-level connection and status state.

UI placement:

- Render the PR card in `Header.tsx` on the right side, near notifications/settings.

UI content:

- PR badge: `PR #123`
- Title: single-line truncation
- Status label
- `Open` button

The header should remain compact. Long titles must truncate without growing the bar indefinitely.

## Data Model

Frontend/backend normalized PR payload:

```ts
type CurrentPrState =
  | { kind: 'ready'; number: number; title: string; url: string; status: 'draft' | 'approved' | 'changes_requested' | 'review_required' | 'open'; extraCount: number }
  | { kind: 'no_pr' }
  | { kind: 'gh_unavailable'; message?: string }
  | { kind: 'error'; message: string }
```

Status mapping rules:

- draft PR -> `draft`
- review decision approved -> `approved`
- review decision changes requested -> `changes_requested`
- open PR with no approval -> `review_required`
- fallback open state -> `open`

If multiple open PRs match the branch, return the first one plus `extraCount`.

## Interaction Flow

1. User switches workspace or branch.
2. Frontend requests current PR for the active workspace.
3. Header updates into one of the supported states.
4. If a PR exists, user clicks `Open`.
5. Frontend opens the GitHub PR URL in a new browser tab/window.

Refresh triggers for v1:

- initial load
- active workspace change
- branch change after git refresh

No polling in v1.

## States and Errors

Supported UI states:

- loading
- ready
- no PR
- gh unavailable
- transient error

Error-handling rules:

- Missing `gh` or unauthenticated `gh` should not create a global toast by default.
- The card should degrade quietly into `gh unavailable`.
- Unexpected backend failure should show a compact error state, not break the header layout.

## Out of Scope

- AI review button
- Automatic PR comments
- Checks tab
- GitHub Actions/deployments/comments aggregation
- PR creation
- Multiple-PR picker UI

These can be layered on top of the same backend branch-to-PR resolution later.

## Testing

Backend:

- branch with one open PR
- branch with no open PR
- branch with multiple open PRs
- `gh` not installed or auth unavailable
- malformed `gh` output or command failure

Frontend:

- header renders ready state correctly
- long title truncation
- open button calls `window.open` with PR URL
- no PR state renders quietly
- unavailable/error state does not break the header layout

Manual verification:

- switch between sessions with and without PRs
- switch branches in the same session and confirm card updates

## Implementation Notes

- Keep all GitHub-specific command execution inside a dedicated backend service module, not inside the handler.
- Do not make the header responsible for fetching; it should remain presentational.
- Reuse existing workspace context plumbing rather than introducing new global state.
