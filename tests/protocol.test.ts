import assert from "node:assert/strict";
import test from "node:test";
import {
  getCalibrationConfigHash,
  isCalibrationReportApproved,
  REQUIRED_CALIBRATION_CHECKS,
} from "../app/lib/calibration";
import {
  deriveHoodieCurve,
  getBeneficiaryConflict,
  runtimeHashMatches,
} from "../app/lib/protocol";

test("derives the HOODIE curve by translating the reviewed WETH reference ticks", () => {
  const curve = deriveHoodieCurve(198_200);
  assert.deepEqual(curve, {
    startTick: -23_200,
    endTick: 26_800,
    referenceTick: 198_200,
    tickSpacing: 200,
    status: "fork-calibration-required",
  });
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
    startTick: -26_200,
    endTick: 23_800,
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
