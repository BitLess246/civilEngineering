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
// Usage, from the repo root:
//   cd webapp
//   PADDLE_ENV=sandbox PADDLE_API_KEY=pdl_sdbx_… npx tsx ../scripts/seed-paddle-catalog.ts
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

// Default to sandbox: the failure mode of guessing wrong in the other
// direction is a live catalog created by accident.
const envName = process.env.PADDLE_ENV === "live" ? "live" : "sandbox";
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
  console.log("\n# supabase secrets set …");
  console.log(
    `BILLING_PRICE_MAP='${CATALOG.flatMap((t) => [
      `${ids[`${t.key}-monthly`]}=${t.key}`,
      `${ids[`${t.key}-annual`]}=${t.key}`,
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
