import product from "../config/hoodiepad-v2.json";
import {
  getV4CalibrationConfigHash,
  getV4CalibrationReport,
  isV4CalibrationApproved,
} from "../app/lib/v4-calibration";
import {
  DECLARED_DOPPLER_SDK_VERSION,
  getHoodieV4Curve,
  isExactV4SdkInstalled,
  isV4RuntimeSnapshotApproved,
} from "../app/lib/v4-policy";

function line(label: string, value: unknown) {
  process.stdout.write(`${label.padEnd(28)} ${String(value)}\n`);
}

const calibration = getV4CalibrationReport();
const curve = getHoodieV4Curve();
const blockers = [
  ...(!isExactV4SdkInstalled()
    ? [`Install exact Doppler SDK ${product.dependencies.dopplerSdk}; package.json declares ${DECLARED_DOPPLER_SDK_VERSION}.`]
    : []),
  ...(!isV4RuntimeSnapshotApproved()
    ? ["The V4 runtime-hash snapshot is not explicitly approved."]
    : []),
  ...(product.hoodieReferencePool.poolKey === null
    ? ["The complete HOODIE/WETH V4 PoolKey has not been pinned and verified."]
    : []),
  ...(!isV4CalibrationApproved(calibration)
    ? ["The HoodiePad V2 Robinhood fork calibration has not passed."]
    : []),
];

line("Mode", "READ-ONLY V4 CHECK");
line("Market version", product.marketVersion);
line("Declared Doppler SDK", DECLARED_DOPPLER_SDK_VERSION);
line("Required Doppler SDK", product.dependencies.dopplerSdk);
line("Curve regions", curve.length);
line("Calibration status", calibration.status.toUpperCase());
line("Calibration config", calibration.configHash === getV4CalibrationConfigHash()
  ? "MATCH"
  : "MISMATCH");
line("Runtime snapshot", product.runtimeHashSnapshot.status);
line("Reference PoolKey", product.hoodieReferencePool.poolKey ? "PINNED" : "MISSING");
line("V4 verification", blockers.length === 0 ? "PASSED" : "BLOCKED");
for (const blocker of blockers) line("Blocker", blocker);
if (blockers.length > 0) process.exitCode = 1;
