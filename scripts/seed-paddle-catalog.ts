// Run once to create the sandbox product catalog.
// Prerequisites:
//   1. cd webapp && npm install @paddle/paddle-node-sdk
//   2. Set PADDLE_API_KEY to a sandbox key from
//      https://sandbox-vendors.paddle.com/authentication-v2
//      (needs product.write and price.write permission scopes)
//   3. npx tsx ../scripts/seed-paddle-catalog.ts  (from the webapp dir)
//      OR from repo root: cd webapp && npx tsx ../scripts/seed-paddle-catalog.ts

import { Environment, Paddle } from "@paddle/paddle-node-sdk";

if (!process.env.PADDLE_API_KEY) {
  console.error("PADDLE_API_KEY is not set.");
  process.exit(1);
}

const paddle = new Paddle(process.env.PADDLE_API_KEY, {
  environment: Environment.sandbox,
});

// Amounts in cents (USD). $19.00 → "1900", $199.00 → "19900", etc.

async function seed() {
  // ── Pro ──────────────────────────────────────────────────────────────────
  const pro = await paddle.products.create({
    name: "Pro",
    taxCategory: "saas",
    description: "The 3D Model Space and the tools built on it.",
  });
  console.log("Created product Pro:", pro.id);

  const proMonthly = await paddle.prices.create({
    productId: pro.id,
    description: "Pro monthly USD",
    unitPrice: { amount: "1900", currencyCode: "USD" },
    billingCycle: { interval: "month", frequency: 1 },
  });
  console.log("Created Pro monthly:", proMonthly.id);

  const proAnnual = await paddle.prices.create({
    productId: pro.id,
    description: "Pro annual USD",
    unitPrice: { amount: "19900", currencyCode: "USD" },
    billingCycle: { interval: "year", frequency: 1 },
  });
  console.log("Created Pro annual:", proAnnual.id);

  // ── Max ──────────────────────────────────────────────────────────────────
  const max = await paddle.products.create({
    name: "Max",
    taxCategory: "saas",
    description: "Everything, including the nonlinear and dynamic solvers.",
  });
  console.log("Created product Max:", max.id);

  const maxMonthly = await paddle.prices.create({
    productId: max.id,
    description: "Max monthly USD",
    unitPrice: { amount: "4900", currencyCode: "USD" },
    billingCycle: { interval: "month", frequency: 1 },
  });
  console.log("Created Max monthly:", maxMonthly.id);

  const maxAnnual = await paddle.prices.create({
    productId: max.id,
    description: "Max annual USD",
    unitPrice: { amount: "52900", currencyCode: "USD" },
    billingCycle: { interval: "year", frequency: 1 },
  });
  console.log("Created Max annual:", maxAnnual.id);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n=== CATALOG IDs (sandbox) ===");
  console.log(
    JSON.stringify(
      {
        "pro-product": pro.id,
        "pro-monthly": proMonthly.id,
        "pro-annual": proAnnual.id,
        "max-product": max.id,
        "max-monthly": maxMonthly.id,
        "max-annual": maxAnnual.id,
      },
      null,
      2,
    ),
  );
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
