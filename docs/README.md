# Zeta — Previous General Repository Audit

**Project:** Zeta structural engineering web application  
**Repository:** https://github.com/BitLess246/civilEngineering  
**Audit type:** General security, reliability, engineering-report, and validation review  
**Scope note:** These documents capture the findings from the earlier general audit, before the separate 3D frame/FEM solver audit. They are investigation and remediation notes, not a penetration-test report or proof that an issue has been exploited.

## Findings index

| ID | Priority | Finding | Main area |
|---|---|---|---|
| GEN-01 | High / security hygiene | Repository is public; review exposure and transition to private if intended | GitHub repository access |
| GEN-02 | High | API abuse controls may be incomplete without layered rate limits | API routes |
| GEN-03 | High | Guest quota logic can fail open under certain missing-data/error conditions | Quota enforcement |
| GEN-04 | Medium–High | CI dependencies/actions should be pinned to immutable versions | GitHub Actions / Supabase CLI |
| GEN-05 | High | Billing webhook read-check-write flow may race under concurrent delivery | Billing/webhook handling |
| GEN-06 | Medium–High | Engineering reports omit information needed for transparent design review | Calculation reports |
| GEN-07 | High | Independent engineering validation is incomplete across modules and pipelines | Structural calculations |
| GEN-08 | Medium–High | Soil-investigation persistence needs robust save-failure behavior | `soils/store.ts`, `useInvestigation.ts` |

## Recommended remediation order

1. Review repository visibility, commit history, secrets, deployment integrations, and collaborator access.
2. Make quota enforcement resilient to errors and apply rate limits at multiple layers.
3. Make webhook processing idempotent and concurrency-safe.
4. Pin CI dependencies/actions and review permissions.
5. Improve calculation-report traceability and unsupported-check disclosures.
6. Build independent verification and regression coverage for engineering calculations.
7. Ensure soil-investigation edits survive failed saves and the user receives clear feedback.

## Important limitation

This is a record of the earlier source-level audit. Findings should be confirmed against the current branch and deployment configuration before treating them as current defects. No claim is made here that secrets were leaked, an endpoint was abused, a webhook race was exploited, or engineering outputs are necessarily incorrect.
