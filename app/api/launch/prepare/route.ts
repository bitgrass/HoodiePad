import { getAirlockOwner } from "@whetstone-research/doppler-sdk/evm";
import type { Address } from "viem";
import product from "../../../../config/hoodiepad-v2.json";
import {
  getV4CalibrationReport,
  isV4CalibrationApproved,
} from "../../../lib/v4-calibration";
import {
  DECLARED_DOPPLER_SDK_VERSION,
  getV4ConfigHash,
  isExactV4SdkInstalled,
  isV4RuntimeSnapshotApproved,
} from "../../../lib/v4-policy";
import { createRobinhoodPublicClient } from "../../../lib/protocol";
import { getReleasePolicy } from "../../../lib/release-policy";
import {
  headStoredObject,
  ObjectStorageUnavailableError,
  putStoredObject,
} from "../../../lib/object-storage";

type LaunchDraft = {
  name?: unknown;
  symbol?: unknown;
  description?: unknown;
  artworkKey?: unknown;
  artworkUrl?: unknown;
  artworkSha256?: unknown;
  website?: unknown;
  xUrl?: unknown;
  payoutWallet?: unknown;
};

type V4ChainStatus = {
  available: boolean;
  checkedAt: string;
  error?: string;
  chainId?: number;
  blockNumber?: string;
  airlockOwner?: Address;
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const artworkKeyPattern = /^token-artwork\/[a-f0-9]{64}\.(jpg|png|webp)$/;

function isText(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function isOptionalText(value: unknown, max: number) {
  return value === undefined || (typeof value === "string" && value.trim().length <= max);
}

function safeError(error: unknown) {
  if (!(error instanceof Error)) return "Unknown Robinhood RPC error";
  return error.message
    .split("\n")[0]
    .trim()
    .replace(/https?:\/\/[^\s]+/g, "[redacted RPC]");
}

async function checksum(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function readV4ChainStatus(): Promise<V4ChainStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const client = createRobinhoodPublicClient();
    const [chainId, blockNumber, airlockOwner] = await Promise.all([
      client.getChainId(),
      client.getBlockNumber(),
      getAirlockOwner(client),
    ]);
    if (chainId !== product.network.chainId) {
      throw new Error(`RPC returned chain ${chainId}; expected ${product.network.chainId}`);
    }
    return {
      available: true,
      checkedAt,
      chainId,
      blockNumber: blockNumber.toString(),
      airlockOwner,
    };
  } catch (error) {
    return {
      available: false,
      checkedAt,
      error: safeError(error),
    };
  }
}

async function storeMetadata(request: Request, launch: {
  name: string;
  symbol: string;
  description: string;
  artworkUrl: string;
  artworkSha256: string;
  website: string;
  xUrl: string;
}) {
  const metadata = {
    name: launch.name,
    symbol: launch.symbol,
    description: launch.description,
    image: launch.artworkUrl,
    external_url: launch.website || undefined,
    properties: {
      x_url: launch.xUrl || undefined,
      artwork_sha256: launch.artworkSha256,
      launchpad: "HoodiePad",
      chain_id: product.network.chainId,
      canonical_numeraire: product.contracts.hoodie,
      market_version: product.marketVersion,
      curve_version: product.market.curveVersion,
      target_opening_fdv_usd: product.market.targetOpeningFdvUsd,
      market_allocation_bps: 10_000,
    },
  };
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const digest = (await checksum(metadata)).slice(2);
  const key = `token-metadata/${digest}.json`;
  await putStoredObject(key, encoded, {
    contentType: "application/json",
    cacheControl: "public, max-age=31536000, immutable",
    customMetadata: { sha256: digest },
  });
  const url = new URL("/api/metadata", request.url);
  url.searchParams.set("key", key);
  return { key, url: url.toString(), sha256: digest };
}

export async function POST(request: Request) {
  let body: LaunchDraft;
  try {
    body = (await request.json()) as LaunchDraft;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "";
  const artworkKey = typeof body.artworkKey === "string" ? body.artworkKey : "";
  const artworkUrl = typeof body.artworkUrl === "string" ? body.artworkUrl : "";
  const artworkSha256 = typeof body.artworkSha256 === "string" ? body.artworkSha256 : "";
  let artworkUrlIsValid = false;
  try {
    const parsedArtworkUrl = new URL(artworkUrl);
    artworkUrlIsValid =
      parsedArtworkUrl.pathname === "/api/artwork" &&
      parsedArtworkUrl.searchParams.get("key") === artworkKey;
  } catch {
    artworkUrlIsValid = false;
  }

  if (
    !isText(body.name, 2, 40) ||
    !/^[A-Z0-9]{2,10}$/.test(symbol) ||
    !isOptionalText(body.description, 280) ||
    typeof body.payoutWallet !== "string" ||
    !addressPattern.test(body.payoutWallet) ||
    !artworkKeyPattern.test(artworkKey) ||
    !/^[a-f0-9]{64}$/.test(artworkSha256) ||
    !artworkKey.includes(artworkSha256) ||
    !artworkUrlIsValid
  ) {
    return Response.json({ error: "Launch draft failed validation" }, { status: 422 });
  }

  if (body.payoutWallet.toLowerCase() === product.contracts.hoodieEcosystemSafe.toLowerCase()) {
    return Response.json(
      { error: "The connected creator wallet must be different from the HOODIE ecosystem Safe." },
      { status: 422 },
    );
  }

  let artworkObject;
  try {
    artworkObject = await headStoredObject(artworkKey);
  } catch (error) {
    if (error instanceof ObjectStorageUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
  if (!artworkObject || artworkObject.customMetadata?.sha256 !== artworkSha256) {
    return Response.json({ error: "Uploaded artwork could not be verified" }, { status: 422 });
  }

  const normalized = {
    marketVersion: product.marketVersion,
    name: String(body.name).trim(),
    symbol,
    description: typeof body.description === "string" ? body.description.trim() : "",
    artwork: { key: artworkKey, url: artworkUrl, sha256: artworkSha256 },
    website: typeof body.website === "string" ? body.website.trim() : "",
    xUrl: typeof body.xUrl === "string" ? body.xUrl.trim() : "",
    creatorFeeRecipient: body.payoutWallet,
    ecosystemFeeRecipient: product.contracts.hoodieEcosystemSafe,
    chainId: product.network.chainId,
    numeraire: product.contracts.hoodie,
    supply: product.token.totalSupplyTokens,
    tokensToSell: product.token.tokensToSell,
    maxWallet: product.token.maxWalletTokens,
    maxWalletDurationSeconds: product.token.maxWalletDurationSeconds,
    targetOpeningFdvUsd: product.market.targetOpeningFdvUsd,
    activeLpFee: product.market.lpFee,
    rehypeFee: product.rehype.startFee,
    feeShares: product.fees,
    mechanism: product.market.mechanism,
    migration: product.market.migration,
    governance: product.market.governance,
    curveVersion: product.market.curveVersion,
    configHash: getV4ConfigHash(),
  };

  let metadata;
  try {
    metadata = await storeMetadata(request, {
      name: normalized.name,
      symbol,
      description: normalized.description,
      artworkUrl,
      artworkSha256,
      website: normalized.website,
      xUrl: normalized.xUrl,
    });
  } catch (error) {
    if (error instanceof ObjectStorageUnavailableError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const launchVersionConfigured =
    process.env.HOODIEPAD_LAUNCH_VERSION?.trim().toLowerCase() === "v2";
  const calibrationReport = getV4CalibrationReport();
  const calibrationApproved = isV4CalibrationApproved(calibrationReport);
  const releasePolicy = getReleasePolicy();
  const chainStatus = await readV4ChainStatus();
  const blockers = [
    ...(!launchVersionConfigured
      ? ["Set HOODIEPAD_LAUNCH_VERSION=v2. Legacy V3 launches are disabled."]
      : []),
    ...(!isExactV4SdkInstalled()
      ? [`Install and lock exact Doppler SDK ${product.dependencies.dopplerSdk}; package.json declares ${DECLARED_DOPPLER_SDK_VERSION}.`]
      : []),
    ...(!isV4RuntimeSnapshotApproved()
      ? ["Review and approve the V4 runtime bytecode snapshot."]
      : []),
    ...(product.hoodieReferencePool.poolKey === null
      ? ["Discover and verify the complete HOODIE/WETH V4 PoolKey."]
      : []),
    ...(!calibrationApproved
      ? ["Complete every HoodiePad V2 Robinhood fork calibration check."]
      : []),
    ...(!releasePolicy.externalReviewApproved
      ? ["Record independent external review approval for HoodiePad V2."]
      : []),
    ...(!chainStatus.available
      ? ["Live Robinhood RPC verification is unavailable."]
      : []),
    ...(!releasePolicy.broadcastEnabled
      ? ["Mainnet broadcast remains disabled by policy."]
      : []),
    "V4 launch calldata remains disabled until the isolated fork launch, swaps, and fee claims pass.",
  ];

  return Response.json({
    checksum: await checksum(normalized),
    preparedAt: new Date().toISOString(),
    productionReady: false,
    blockers,
    config: normalized,
    metadata,
    calibration: {
      status: calibrationReport.status,
      forkBlock: calibrationReport.forkBlock,
      approved: calibrationApproved,
    },
    chainStatus,
    simulation: {
      status: "unavailable",
      error: "V4 simulation is fail-closed until the complete calibration gate passes.",
    },
    deployment: null,
  });
}
