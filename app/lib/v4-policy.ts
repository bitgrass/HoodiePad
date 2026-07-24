import { getAddress, keccak256, stringToHex, type Address } from "viem";
import product from "../../config/hoodiepad-v2.json";
import curve from "../../config/hoodie-v4-curve-v1.json";
import packageManifest from "../../package.json";

export const WAD = BigInt(product.fees.wad);
export const V4_LP_FEE = product.market.lpFee;
export const V4_TICK_SPACING = product.market.tickSpacing;
export const V4_DYNAMIC_FEE_FLAG = product.market.dynamicFeeFlag;
export const V4_TARGET_OPENING_FDV_USD = BigInt(product.market.targetOpeningFdvUsd);
export const V4_TOTAL_SUPPLY = BigInt(product.token.totalSupplyTokens) * 10n ** 18n;
export const V4_TOKENS_TO_SELL = BigInt(product.token.tokensToSell) * 10n ** 18n;
export const V4_MAX_WALLET = BigInt(product.token.maxWalletTokens) * 10n ** 18n;
export const DECLARED_DOPPLER_SDK_VERSION =
  packageManifest.dependencies["@whetstone-research/doppler-sdk"];

export type V4Beneficiary = {
  beneficiary: Address;
  shares: bigint;
};

export function getV4Beneficiaries(
  creator: Address,
  airlockOwner: Address,
): V4Beneficiary[] {
  const beneficiaries = [
    {
      beneficiary: getAddress(creator),
      shares: BigInt(product.fees.creator),
    },
    {
      beneficiary: getAddress(product.contracts.hoodieEcosystemSafe),
      shares: BigInt(product.fees.hoodieEcosystem),
    },
    {
      beneficiary: getAddress(airlockOwner),
      shares: BigInt(product.fees.doppler),
    },
  ];

  const addresses = new Set(
    beneficiaries.map(({ beneficiary }) => beneficiary.toLowerCase()),
  );
  if (addresses.size !== beneficiaries.length) {
    throw new Error("V4 fee beneficiary addresses must be distinct");
  }
  if (
    beneficiaries.reduce((total, beneficiary) => total + beneficiary.shares, 0n) !==
    WAD
  ) {
    throw new Error("V4 fee beneficiary shares must total WAD");
  }

  return beneficiaries.sort((first, second) =>
    first.beneficiary.toLowerCase().localeCompare(second.beneficiary.toLowerCase()),
  );
}

export function getHoodieV4Curve() {
  const curves = curve.curves.map((item) => ({
    marketCap: {
      start: item.marketCap.start,
      end: item.marketCap.end,
    },
    numPositions: item.numPositions,
    shares: BigInt(item.shares),
  }));
  if (curves.length === 0) throw new Error("HOODIE V4 curve is empty");
  if (curves[0]?.marketCap.start !== Number(product.market.targetOpeningFdvUsd)) {
    throw new Error("HOODIE V4 curve does not start at the target opening FDV");
  }
  if (curves.reduce((total, item) => total + item.shares, 0n) !== WAD) {
    throw new Error("HOODIE V4 curve shares must total WAD");
  }
  for (let index = 1; index < curves.length; index += 1) {
    const priorEnd = curves[index - 1]?.marketCap.end;
    if (priorEnd === "max" || priorEnd !== curves[index]?.marketCap.start) {
      throw new Error("HOODIE V4 curve ranges must be contiguous");
    }
  }
  if (curves.at(-1)?.marketCap.end !== "max") {
    throw new Error("HOODIE V4 curve must end at max");
  }
  return curves;
}

export function getV4ConfigHash() {
  return keccak256(stringToHex(JSON.stringify({
    marketVersion: product.marketVersion,
    chainId: product.network.chainId,
    contracts: product.contracts,
    hoodieReferencePool: product.hoodieReferencePool,
    token: product.token,
    market: product.market,
    fees: product.fees,
    rehype: product.rehype,
    pricing: product.pricing,
    curve,
    dependencies: product.dependencies,
  })));
}

export function isV4RuntimeSnapshotApproved() {
  return (
    product.runtimeHashSnapshot.status === "approved" &&
    product.runtimeHashSnapshot.observedAtBlock !== null &&
    Object.keys(product.runtimeHashSnapshot.hashes).length > 0
  );
}

export function isExactV4SdkInstalled(
  declaredVersion = DECLARED_DOPPLER_SDK_VERSION,
) {
  return declaredVersion === product.dependencies.dopplerSdk;
}
