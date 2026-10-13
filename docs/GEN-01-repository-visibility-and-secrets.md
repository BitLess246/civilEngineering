# GEN-01 — Repository Visibility and Secret Hygiene

**Priority:** High security hygiene  
**Area:** GitHub repository access and connected services

## Observation

The repository was identified as public during the earlier audit. Public visibility may be intentional, but it exposes source code and repository history to anyone. If private source code is intended, visibility should be changed only after checking development and deployment integrations.

## Risks to assess

- Secrets accidentally committed in current files or historical commits.
- Internal implementation details, environment variable names, deployment configuration, or infrastructure assumptions exposed publicly.
- Collaborators, CI workflows, Claude Code, and Vercel integrations losing access or behaving differently after a visibility change.
- Treating deletion of a secret from the latest commit as sufficient even if it remains in Git history.

## Recommended actions

1. Decide explicitly whether the repository is intended to be public or private.
2. Before changing visibility, confirm that the GitHub account/app used by Claude Code and the Vercel Git integration can access a private repository.
3. Review current files, commit history, workflow logs, and deployment configuration for secrets.
4. If a secret was exposed, revoke/rotate it; do not rely only on deleting the file or rewriting history.
5. Review collaborator and GitHub App access, branch protections, and repository permissions.
6. After any visibility change, verify preview deployments, production deployments, and CI workflows.

## Acceptance criteria

- Repository visibility matches the owner's explicit intent.
- Any potentially exposed credentials are rotated and no longer trusted.
- Required integrations are tested after the change.
- Access is limited to the minimum required set of users and applications.
