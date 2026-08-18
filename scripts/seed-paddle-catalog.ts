// ─────────────────────────────────────────────────────────────────────────
// SEED THE PADDLE CATALOG — run once per environment (sandbox, then live).
//
// Creates the two paid products and their four prices. The amounts here are
// the SAME NUMBERS as webapp/src/lib/plans.ts, stated in cents because that is
// Paddle's unit; a test in plans.test.ts pins the dollar side, and this header
// is the reminder that the pair has to be edited together.
//
// USD, not PHP: Paddle's 33 payment currencies do not include the Philippine
// peso. USD is the base price, and Paddle converts it to a buyer's local
// currency at checkout (Paddle > Business account > Currencies).
//
// Usage:
//   cd webapp
//   NODE_PATH=./node_modules PADDLE_ENV=sandbox PADDLE_API_KEY=pdl_sdbx_… \
//     npx tsx ../scripts/seed-paddle-catalog.ts
//
// NODE_PATH IS NOT OPTIONAL, and `cd webapp` alone does not stand in for it.
// The SDK is a dependency of `webapp`, but this file lives in `scripts/`, and
// Node resolves an import by walking up from the IMPORTING FILE's directory —
// `scripts/`, then the repo root — never from the working directory. Neither
// has a `node_modules`, so without NODE_PATH the run dies on
// `Cannot find module '@paddle/paddle-node-sdk'`. The `cd` is still needed for
// a different reason: it is what lets `npx` find the local `tsx` binary.
//
// It fails at import, before the first API call, so a forgotten NODE_PATH
// costs a re-run and creates nothing.
//
// PowerShell:
//   cd webapp
//   $env:NODE_PATH="./node_modules"; $env:PADDLE_ENV="sandbox"; $env:PADDLE_API_KEY="pdl_sdbx_…"
//   npx tsx ../scripts/seed-paddle-catalog.ts
//
// The API key needs product.write and price.write scopes:
//   sandbox  https://sandbox-vendors.paddle.com/authentication-v2
//   live     https://vendors.paddle.com/authentication-v2
//
// RE-RUNNING CREATES DUPLICATES. Paddle has no upsert for products, and this
// script deliberately does not invent one — check the dashboard first. Seeding
// a second Pro product is how a price id in BILLING_PRICE_MAP ends up pointing
// at a product nobody is actually being sold.
// ─────────────────────────────────────────────────────────────────────────
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const apiKey = process.env.PADDLE_API_KEY;
if (!apiKey) {
  console.error("PADDLE_API_KEY is not set.");
  process.exit(1);
}

// ACCEPTS BOTH "live" AND "production", because the rest of the system says
// "production" and this script used to accept only "live".
//
// That mismatch was a trap with a cutover-day fuse on it. `docs/Billing.md`
// and the Edge Functions both use PADDLE_ENV=production; running the
// documented seed command with a live API key therefore fell through to
// SANDBOX here, pointing the SDK at the sandbox API while carrying a
// `pdl_live_…` key. It fails rather than creating anything by accident — but
// it fails in the one hour where nobody wants to be debugging vocabulary.
//
// Still defaults to sandbox on anything unrecognised: guessing wrong in the
// other direction creates a live catalog by accident, and re-running is how
// duplicate products appear.
const wanted = (process.env.PADDLE_ENV ?? "").trim().toLowerCase();
const envName = wanted === "live" || wanted === "production" ? "live" : "sandbox";
const paddle = new Paddle(apiKey, {
  environment: envName === "live" ? Environment.production : Environment.sandbox,
});

/** Amounts in cents (USD): $19.00 → "1900". Mirrors plans.ts. */
const CATALOG = [
  {
    key: "pro",
    name: "Pro",
    description: "The 3D Model Space and the tools built on it.",
    monthly: "1900",
    annual: "20500",
  },
  {
    key: "max",
    name: "Max",
    description: "Everything, including the nonlinear and dynamic solvers.",
    monthly: "4900",
    annual: "52900",
  },
] as const;

async function seed() {
  const ids: Record<string, string> = {};

  for (const tier of CATALOG) {
    const product = await paddle.products.create({
      name: tier.name,
      taxCategory: "saas",
      description: tier.description,
    });
    ids[`${tier.key}-product`] = product.id;
    console.log(`Created product ${tier.name}: ${product.id}`);

    for (const [period, amount, interval] of [
      ["monthly", tier.monthly, "month"],
      ["annual", tier.annual, "year"],
    ] as const) {
      const price = await paddle.prices.create({
        productId: product.id,
        description: `${tier.name} ${period} USD`,
        unitPrice: { amount, currencyCode: "USD" },
        billingCycle: { interval, frequency: 1 },
      });
      ids[`${tier.key}-${period}`] = price.id;
      console.log(`  ${period}: ${price.id} (${amount} cents)`);
    }
  }

  console.log(`\n=== CATALOG IDs (${envName}) ===`);
  console.log(JSON.stringify(ids, null, 2));

  // The two configuration strings these ids feed, printed ready to paste —
  // the webhook's price map is the thing that turns a payment into a plan, and
  // hand-transcribing eight ids is where that goes wrong.
  // WITH THE `:period` SUFFIX. The webhook ignores it, but
  // `billing-change-plan` reads it to tell an upgrade from a downgrade, and
  // without it a move between two periods of the SAME plan has planDelta 0 and
  // periodDelta 0 — which falls to the downgrade branch. Pro monthly → Pro
  // annual would then be deferred to the next billing period instead of being
  // charged immediately, which is the wrong answer for the customer and for
  // the business. This line used to print the bare `pri_x=pro` form, so the
  // output was paste-ready and quietly wrong.
  console.log("\n# supabase secrets set …");
  console.log(
    `BILLING_PRICE_MAP='${CATALOG.flatMap((t) => [
      `${ids[`${t.key}-monthly`]}=${t.key}:monthly`,
      `${ids[`${t.key}-annual`]}=${t.key}:annual`,
    ]).join(",")}'`,
  );
  console.log("\n# webapp/.env");
  for (const t of CATALOG) {
    console.log(`VITE_PADDLE_PRICE_${t.key.toUpperCase()}_MONTHLY=${ids[`${t.key}-monthly`]}`);
    console.log(`VITE_PADDLE_PRICE_${t.key.toUpperCase()}_ANNUAL=${ids[`${t.key}-annual`]}`);
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
