import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import {
  getCalibrationConfigHash,
  isCalibrationReportApproved,
  REQUIRED_CALIBRATION_CHECKS,
} from "../app/lib/calibration";
import {
  deriveHoodieCurve,
  deriveHoodieCurveForOrdering,
  getBeneficiaryConflict,
  runtimeHashMatches,
} from "../app/lib/protocol";
import { getReleasePolicy } from "../app/lib/release-policy";
import {
  checkObjectStorage,
  getStoredObject,
  headStoredObject,
  putStoredObject,
} from "../app/lib/object-storage";

test("derives the HOODIE curve for Doppler's child-token0 ordering", () => {
  const curve = deriveHoodieCurve(198_200);
  assert.deepEqual(curve, {
    startTick: -26_800,
    endTick: 23_200,
    referenceTick: 198_200,
    tickSpacing: 200,
    status: "calibrated",
  });
});

test("inverts and swaps the tick range when token ordering changes", () => {
  const childToken0 = deriveHoodieCurveForOrdering(
    198_200,
    "child-token0-hoodie-token1",
  );
  const hoodieToken0 = deriveHoodieCurveForOrdering(
    198_200,
    "hoodie-token0-child-token1",
  );

  assert.deepEqual(
    [childToken0.startTick, childToken0.endTick],
    [-hoodieToken0.endTick, -hoodieToken0.startTick],
  );
  assert.deepEqual(
    [childToken0.startTick, childToken0.endTick],
    [-26_800, 23_200],
  );
  assert.deepEqual(
    [hoodieToken0.startTick, hoodieToken0.endTick],
    [-23_200, 26_800],
  );
});

test("always aligns candidate ticks to the 1% V3 tick spacing", () => {
  for (const referenceTick of [197_901, 198_000, 198_199, 198_401]) {
    const curve = deriveHoodieCurve(referenceTick);
    assert.equal(Math.abs(curve.startTick % curve.tickSpacing), 0);
    assert.equal(Math.abs(curve.endTick % curve.tickSpacing), 0);
    assert.ok(curve.startTick < curve.endTick);
    assert.equal(curve.endTick - curve.startTick, 50_000);
  }
});

test("rejects creator wallets that duplicate a fixed fee beneficiary", () => {
  const ecosystemSafe = "0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7";
  const protocolOwner = "0xEDeAa06E2eB42A5c19ce27c6cfFb36fd4fE1eDa8";
  const creator = "0x1111111111111111111111111111111111111111";

  assert.match(getBeneficiaryConflict(ecosystemSafe) ?? "", /ecosystem Safe/);
  assert.match(getBeneficiaryConflict(protocolOwner, protocolOwner) ?? "", /protocol beneficiary/);
  assert.equal(getBeneficiaryConflict(creator, protocolOwner), undefined);
});

test("matches runtime hashes case-insensitively and fails closed when absent", () => {
  const hash = "0xf10f86b05965a827a332e6c73086f18026fbe3917f4bffbec3f938b3b5397b56" as const;
  assert.equal(runtimeHashMatches(hash, hash), true);
  assert.equal(
    runtimeHashMatches(hash.toUpperCase().replace("0X", "0x") as `0x${string}`, hash),
    true,
  );
  assert.equal(runtimeHashMatches(undefined, hash), false);
  assert.equal(runtimeHashMatches(`0x${"0".repeat(64)}`, hash), false);
});

test("requires a matching, complete fork-calibration report", () => {
  const passedReport = {
    version: 1,
    status: "passed" as const,
    chainId: 4663,
    forkBlock: "17170000",
    referenceTick: 201_200,
    startTick: -23_800,
    endTick: 26_200,
    configHash: getCalibrationConfigHash(),
    completedAt: "2026-07-23T10:00:00.000Z",
    checks: REQUIRED_CALIBRATION_CHECKS.map((name) => ({ name, passed: true })),
  };

  assert.equal(isCalibrationReportApproved(passedReport), true);
  assert.equal(
    isCalibrationReportApproved({ ...passedReport, configHash: `0x${"0".repeat(64)}` }),
    false,
  );
  assert.equal(
    isCalibrationReportApproved({
      ...passedReport,
      checks: passedReport.checks.filter((check) => check.name !== "sell"),
    }),
    false,
  );
});

test("records an owner waiver without mislabeling it as external review", () => {
  const policy = getReleasePolicy({
    HOODIEPAD_EXTERNAL_REVIEW_APPROVED: "false",
    HOODIEPAD_OWNER_RISK_WAIVER: "true",
    HOODIEPAD_BROADCAST_ENABLED: "true",
  });

  assert.equal(policy.externalReviewApproved, false);
  assert.equal(policy.ownerRiskWaiver, true);
  assert.equal(policy.reviewGateApproved, true);
  assert.equal(policy.reviewGateLabel, "OWNER WAIVER");
  assert.equal(policy.broadcastEnabled, true);
});

test("persists immutable uploads in the Railway filesystem storage backend", async (context) => {
  const storageRoot = await mkdtemp(join(tmpdir(), "hoodiepad-storage-"));
  const resolvedTemporaryRoot = resolve(tmpdir());
  assert.ok(resolve(storageRoot).startsWith(`${resolvedTemporaryRoot}${sep}`));

  const originalStorageDir = process.env.HOODIEPAD_STORAGE_DIR;
  const originalVolumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  process.env.HOODIEPAD_STORAGE_DIR = storageRoot;
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;

  context.after(async () => {
    if (originalStorageDir === undefined) delete process.env.HOODIEPAD_STORAGE_DIR;
    else process.env.HOODIEPAD_STORAGE_DIR = originalStorageDir;
    if (originalVolumePath === undefined) delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    else process.env.RAILWAY_VOLUME_MOUNT_PATH = originalVolumePath;
    await rm(storageRoot, { recursive: true, force: true });
  });

  const digest = "a".repeat(64);
  const key = `token-artwork/${digest}.png`;
  const payload = new Uint8Array([137, 80, 78, 71, 13, 10]);

  assert.deepEqual(await checkObjectStorage(), {
    ready: true,
    backend: "filesystem",
  });

  await putStoredObject(key, payload, {
    contentType: "image/png",
    customMetadata: { sha256: digest },
  });
  // Content-addressed objects are idempotent and never overwritten.
  await putStoredObject(key, payload, {
    contentType: "image/png",
    customMetadata: { sha256: digest },
  });

  const head = await headStoredObject(key);
  assert.equal(head?.customMetadata.sha256, digest);

  const object = await getStoredObject(key);
  assert.equal(object?.contentType, "image/png");
  assert.match(object?.cacheControl ?? "", /immutable/);
  assert.equal(object?.etag, `"${digest}"`);
  assert.deepEqual(
    new Uint8Array(await new Response(object?.body).arrayBuffer()),
    payload,
  );
});

test("keeps Railway clean installs compatible with the pinned Doppler peer", async () => {
  const npmConfig = await readFile(new URL("../.npmrc", import.meta.url), "utf8");
  const railway = JSON.parse(
    await readFile(new URL("../railway.json", import.meta.url), "utf8"),
  );

  assert.match(npmConfig, /^legacy-peer-deps=true$/m);
  assert.equal(railway.build.builder, "RAILPACK");
  assert.equal(railway.build.buildCommand, "npm run build");
  assert.equal(railway.deploy.startCommand, "npm run start");
  assert.equal(railway.deploy.healthcheckPath, "/api/health");
});
