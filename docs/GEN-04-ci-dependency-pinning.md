# GEN-04 — Pin CI Actions and Tooling to Immutable Versions

**Priority:** Medium–High  
**Area:** GitHub Actions and Supabase CLI usage in CI

## Observation

The earlier audit recommended pinning GitHub Actions and the Supabase CLI to immutable, reviewed versions rather than relying on mutable tags or unbounded/latest versions.

## Risks

- A mutable action tag can point to different code over time.
- Unexpected CLI changes may break deployments or alter behavior.
- Broad workflow permissions can magnify the impact of a compromised dependency.

## Recommended actions

1. Pin third-party GitHub Actions to full commit SHAs where practical.
2. Use Dependabot or another controlled update process to propose reviewed version changes.
3. Pin the Supabase CLI to a known version compatible with the project.
4. Apply least-privilege `permissions` to each workflow.
5. Avoid exposing deployment secrets to workflows triggered by untrusted pull requests.
6. Review artifact handling, cache usage, and third-party action provenance.
7. Test workflow updates in a branch before allowing production deployment.

## Acceptance criteria

- Workflow dependencies are immutable or version-pinned under a documented policy.
- Updates are deliberate and reviewable.
- Workflow permissions are minimal.
- Untrusted pull-request code cannot access production secrets.
