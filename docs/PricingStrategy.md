# Pricing Strategy

> **This document is the original plan, and the shipped prices no longer match
> it.** What is actually implemented, in `webapp/src/lib/plans.ts`:
>
> | Shipped tier | Monthly | Annual | Notes |
> |---|---|---|---|
> | Guest | — | — | 5 runs of each calculator, no account |
> | Free | ₱0 | ₱0 | same calculators, 3 saved projects |
> | Pro | ₱1,399 | ₱15,099 | 3D Model Space ≤400 members, pipeline, optimiser, estimating, reports |
> | Max | ₱2,999 | ₱32,399 | + nonlinear/dynamic solvers, scheduling, no size limit |
>
> Three differences worth a decision rather than a drift:
>
> - **Professional was ₱499; Pro ships at ₱1,399.** Roughly 3× the planned
>   price. Deliberate or not, it is the number on the page.
> - **Enterprise was ₱2,999 for team accounts and shared projects.** Max ships
>   at the same price but sells *nonlinear analysis*, not teams. Team accounts
>   and shared projects do not exist yet, so if Enterprise is still wanted it is
>   a fifth tier, not a rename of Max.
> - **Educational licences are not implemented.** No free-for-universities path
>   exists in the plan model.

---

# Free Tier

Target:

Students

Features:

- 3 Projects
- Basic Design Modules
- Watermarked Reports

Price:

FREE

---

# Professional Tier

Target:

Licensed Engineers

Features:

- Unlimited Projects
- Full Structural Analysis
- Response Spectrum
- Modal Analysis
- PDF Reports

Price:

PHP 499/month

---

# Enterprise Tier

Target:

Companies

Features:

- Team Accounts
- Shared Projects
- Priority Support

Price:

PHP 2,999/month

---

# Educational Licenses

Universities:

FREE

Purpose:

Long-Term User Acquisition