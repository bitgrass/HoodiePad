import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const objects = new Map();
const artworkBucket = {
  async put(key, value, options = {}) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(await new Response(value).arrayBuffer());
    objects.set(key, { bytes, options });
  },
  async head(key) {
    const object = objects.get(key);
    if (!object) return null;
    return { customMetadata: object.options.customMetadata ?? {} };
  },
  async get(key) {
    const object = objects.get(key);
    if (!object) return null;
    return {
      body: object.bytes,
      httpEtag: `"${key.slice(-20)}"`,
      writeHttpMetadata(headers) {
        headers.set("content-type", object.options.httpMetadata?.contentType ?? "application/octet-stream");
      },
    };
  },
};

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  ARTWORK: artworkBucket,
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

async function uploadArtwork(app) {
  const formData = new FormData();
  formData.append("artwork", new File([new Uint8Array([137, 80, 78, 71, 13, 10])], "hoodie.png", { type: "image/png" }));
  const response = await app.fetch(new Request("http://localhost/api/artwork", { method: "POST", body: formData }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
}

test("server-renders the finished HoodiePad home page with the supplied logo", async () => {
  const app = await worker();
  const response = await app.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), env, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /HoodiePad — Launch on Robinhood Chain/);
  assert.match(html, /Launch it\./);
  assert.match(html, /creators keep 80%/i);
  assert.match(html, /hoodie-logo\.jpg/);
  assert.doesNotMatch(html, /_vinext\/image[^\"]*hoodie-logo/);
  assert.doesNotMatch(html, />HOODIEPAD</);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("freezes the V1 economic, wallet, and Safe invariants", async () => {
  const product = JSON.parse(await readFile(new URL("../config/hoodiepad-v1.json", import.meta.url), "utf8"));
  const shares = BigInt(product.fees.creator) + BigInt(product.fees.hoodieEcosystem) + BigInt(product.fees.doppler);
  assert.equal(shares, BigInt(product.fees.wad));
  assert.equal(product.fees.creator, "800000000000000000");
  assert.equal(product.fees.hoodieEcosystem, "150000000000000000");
  assert.equal(product.fees.doppler, "50000000000000000");
  assert.equal(product.network.chainId, 4663);
  assert.equal(product.contracts.hoodie, "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3");
  assert.equal(product.contracts.hoodieEcosystemSafe, "0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7");
  assert.equal(product.contracts.weth, "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73");
  assert.equal(product.hoodieReferencePool.poolId, "0x590eb1069a71fe72e3470f094c324513da3691987868a2b355fd8f29713d889b");
  assert.equal(product.hoodieReferencePool.currency0, product.contracts.weth);
  assert.equal(product.hoodieReferencePool.currency1, product.contracts.hoodie);
  assert.equal(product.runtimeHashSnapshot.chainId, 4663);
  assert.equal(product.runtimeHashSnapshot.observedAtBlock, "17157669");
  assert.deepEqual(
    Object.keys(product.runtimeHashSnapshot.hashes).sort(),
    [
      "airlock",
      "dopplerERC20V1Factory",
      "hoodie",
      "lockableV3Initializer",
      "noOpGovernanceFactory",
      "noOpMigrator",
      "uniswapUniversalRouter",
      "uniswapV4PoolManager",
      "uniswapV4StateView",
    ].sort(),
  );
  for (const hash of Object.values(product.runtimeHashSnapshot.hashes)) {
    assert.match(hash, /^0x[a-f0-9]{64}$/);
  }
  assert.equal(product.token.totalSupplyTokens, "1000000000");
  assert.equal(product.token.tokensToSell, product.token.totalSupplyTokens);
  assert.equal(product.token.maxWalletTokens, "20000000");
  assert.equal(product.token.maxWalletDurationSeconds, 86400);
  assert.equal(product.pool.mechanism, "doppler-lockable-v3");
  assert.equal(product.pool.migration, "noOp");
  assert.equal(product.pool.governance, "noOp");
  assert.equal(product.pool.curveStatus, "fork-calibration-required");
});

test("accepts a token artwork file and serves the immutable uploaded object", async () => {
  const app = await worker();
  const uploaded = await uploadArtwork(app);
  assert.match(uploaded.key, /^token-artwork\/[a-f0-9]{64}\.png$/);
  assert.match(uploaded.url, /^http:\/\/localhost\/api\/artwork\?key=/);

  const response = await app.fetch(new Request(uploaded.url), env, ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control") ?? "", /immutable/);
});

test("prepares a connected-wallet launch draft but fails closed on protocol blockers", async () => {
  const app = await worker();
  const uploaded = await uploadArtwork(app);
  const response = await app.fetch(new Request("http://localhost/api/launch/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Hoodie Hug",
      symbol: "HUG",
      description: "",
      artworkKey: uploaded.key,
      artworkUrl: uploaded.url,
      artworkSha256: uploaded.sha256,
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
  assert.equal(payload.config.creatorFeeRecipient, "0x1111111111111111111111111111111111111111");
  assert.equal(payload.config.ecosystemFeeRecipient, "0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7");
  assert.equal(payload.simulation.status, "unavailable");
  assert.equal(payload.chainStatus.available, false);
  assert.match(payload.metadata.key, /^token-metadata\/[a-f0-9]{64}\.json$/);
  assert.match(payload.metadata.url, /^http:\/\/localhost\/api\/metadata\?key=/);
  assert.ok(payload.blockers.includes("Calibrate and snapshot the Robinhood V3 curve on a mainnet fork."));
  assert.ok(payload.blockers.includes("Record external launch-adapter review approval."));
  assert.ok(payload.blockers.includes("Live Robinhood RPC verification is unavailable."));
  assert.ok(payload.blockers.includes("Mainnet broadcast is disabled by policy."));
  assert.ok(!payload.blockers.some((blocker) => blocker.includes("ecosystem Safe")));
  assert.equal(payload.calibration.status, "pending");
  assert.equal(payload.calibration.approved, false);
  assert.equal(payload.deployment, null);

  const metadataResponse = await app.fetch(new Request(payload.metadata.url), env, ctx);
  assert.equal(metadataResponse.status, 200);
  assert.equal(metadataResponse.headers.get("content-type"), "application/json");
  assert.match(metadataResponse.headers.get("cache-control") ?? "", /immutable/);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.name, "Hoodie Hug");
  assert.equal(metadata.symbol, "HUG");
  assert.equal(metadata.properties.chain_id, 4663);
  assert.equal(metadata.properties.canonical_numeraire, "0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3");
});

test("rejects a creator wallet that duplicates the ecosystem beneficiary", async () => {
  const app = await worker();
  const uploaded = await uploadArtwork(app);
  const response = await app.fetch(new Request("http://localhost/api/launch/prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Conflicting Hoodie",
      symbol: "NOPE",
      description: "",
      artworkKey: uploaded.key,
      artworkUrl: uploaded.url,
      artworkSha256: uploaded.sha256,
      payoutWallet: "0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7",
    }),
  }), env, ctx);

  assert.equal(response.status, 422);
  const payload = await response.json();
  assert.match(payload.error, /different from the HOODIE ecosystem Safe/);
});
