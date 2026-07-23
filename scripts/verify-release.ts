import type { Address } from "viem";
import {
  getCalibrationConfigHash,
  getCalibrationReport,
  isCalibrationReportApproved,
} from "../app/lib/calibration";
import { readChainStatus, simulateLaunch } from "../app/lib/protocol";
import { getReleasePolicy } from "../app/lib/release-policy";

const DEFAULT_CREATOR = "0x1111111111111111111111111111111111111111";
const creator = (
  process.env.HOODIEPAD_SIMULATION_CREATOR?.trim() || DEFAULT_CREATOR
) as Address;

function line(label: string, value: unknown) {
  process.stdout.write(`${label.padEnd(24)} ${String(value)}\n`);
}

const report = getCalibrationReport();
const calibrationApproved = isCalibrationReportApproved(report);
const releasePolicy = getReleasePolicy();

line("Mode", "READ-ONLY RELEASE CHECK");
line("Calibration", calibrationApproved ? "PASSED" : report.status.toUpperCase());
line("Calibration block", report.forkBlock ?? "not recorded");
line("Calibration config", report.configHash === getCalibrationConfigHash() ? "MATCH" : "MISMATCH");
line("Review gate", releasePolicy.reviewGateLabel);
line("Deployment policy", releasePolicy.broadcastEnabled ? "ENABLED" : "DISABLED");

const chainStatus = await readChainStatus();
line("Robinhood RPC", chainStatus.available ? "CONNECTED" : "UNAVAILABLE");
const dependenciesApproved =
  chainStatus.available &&
  Object.values(chainStatus.dependencies ?? {}).every((dependency) =>
    dependency.matchesExpectedHash);
line("Dependency snapshot", dependenciesApproved ? "VERIFIED" : "FAILED");

const simulation = chainStatus.available
  ? await simulateLaunch({
      name: "HoodiePad Release Check",
      symbol: "HPREL",
      tokenURI: "https://hoodie.fun/hoodiepad-release-check.json",
      creator,
      chainStatus,
    })
  : { status: "unavailable" as const, error: chainStatus.error };
line("Launch simulation", simulation.status.toUpperCase());
if (simulation.status !== "simulated") line("Simulation reason", simulation.error ?? "unknown");

const blockers = [
  ...(!calibrationApproved ? ["Robinhood fork calibration has not passed."] : []),
  ...(!releasePolicy.reviewGateApproved
    ? ["External review approval or an owner risk waiver is missing."]
    : []),
  ...(!releasePolicy.broadcastEnabled ? ["Mainnet deployment policy is disabled."] : []),
  ...(!chainStatus.available ? ["Robinhood RPC is unavailable."] : []),
  ...(!dependenciesApproved ? ["A runtime dependency hash is unverified."] : []),
  ...(simulation.status !== "simulated" ? ["The exact launch transaction did not simulate."] : []),
];

line("Release status", blockers.length === 0 ? "READY FOR METAMASK" : "BLOCKED");
for (const blocker of blockers) line("Blocker", blocker);
if (blockers.length > 0) process.exitCode = 1;
