import product from "../config/hoodiepad-v2.json";
import {
  DECLARED_DOPPLER_SDK_VERSION,
  getHoodieV4Curve,
  isExactV4SdkInstalled,
} from "../app/lib/v4-policy";

process.stdout.write("Mode                         DISPOSABLE ROBINHOOD V4 FORK\n");
process.stdout.write(`Required Doppler SDK         ${product.dependencies.dopplerSdk}\n`);
process.stdout.write(`Declared Doppler SDK         ${DECLARED_DOPPLER_SDK_VERSION}\n`);

if (!isExactV4SdkInstalled()) {
  throw new Error(
    `V4 calibration stopped before forking: install exact ` +
    `@whetstone-research/doppler-sdk@${product.dependencies.dopplerSdk}.`,
  );
}

getHoodieV4Curve();

if (product.hoodieReferencePool.poolKey === null) {
  throw new Error(
    "V4 calibration stopped: discover and verify the complete HOODIE/WETH " +
    "PoolKey against the pinned PoolId before executing a launch.",
  );
}

throw new Error(
  "V4 calibration execution is intentionally incomplete. Do not approve " +
  "mainnet until every required V4 fork check is implemented and passes.",
);
