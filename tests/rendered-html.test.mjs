import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("server-renders the finished HoodiePad home page", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /HoodiePad — Launch on Robinhood Chain/);
  assert.match(html, /Launch it\./);
  assert.match(html, /creators keep 80%/i);
  assert.match(html, /0xC72c…2Ba3/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("freezes the V1 economic and safety invariants", async () => {
  const product = JSON.parse(await readFile(new URL("../config/hoodiepad-v1.json", import.meta.url), "utf8"));
  const shares = BigInt(product.fees.creator) + BigInt(product.fees.hoodieEcosystem) + BigInt(product.fees.doppler);
  assert.equal(shares, BigInt(product.fees.wad));
  assert.equal(product.fees.creator, "800000000000000000");
  assert.equal(product.fees.hoodieEcosystem, "150000000000000000");
  assert.equal(product.fees.doppler, "50000000000000000");
  assert.equal(product.network.chainId, 4663);
  assert.equal(product.contracts.hoodie, "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3");
  assert.equal(product.token.totalSupplyTokens, "1000000000");
  assert.equal(product.token.tokensToSell, product.token.totalSupplyTokens);
  assert.equal(product.token.maxWalletTokens, "20000000");
  assert.equal(product.token.maxWalletDurationSeconds, 86400);
  assert.equal(product.pool.mechanism, "doppler-lockable-v3");
  assert.equal(product.pool.migration, "noOp");
  assert.equal(product.pool.governance, "noOp");
  assert.equal(product.pool.curveStatus, "fork-calibration-required");
});

test("prepares a launch draft but fails closed on production blockers", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/api/launch/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Hoodie Hug",
      symbol: "HUG",
      description: "A community token for everyone keeping the hood on.",
      imageUrl: "ipfs://bafybeidemo",
      website: "https://example.com",
      xUrl: "https://x.com/example",
      payoutWallet: "0x1111111111111111111111111111111111111111",
    }),
  }), env, ctx);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.productionReady, false);
  assert.match(payload.checksum, /^0x[a-f0-9]{64}$/);
  assert.equal(payload.config.numeraire, "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3");
  assert.ok(payload.blockers.includes("Calibrate and snapshot the Robinhood V3 curve on a mainnet fork."));
  assert.ok(payload.blockers.includes("Mainnet broadcast is disabled by policy."));
});

