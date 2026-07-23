import product from "../../../../config/hoodiepad-v1.json";
import {
  getCalibrationReport,
  isCalibrationReportApproved,
} from "../../../lib/calibration";
import { readChainStatus, simulateLaunch } from "../../../lib/protocol";
import { getReleasePolicy } from "../../../lib/release-policy";
import { getRuntimeEnv } from "../../../runtime-env";
import type { Address } from "viem";

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

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const artworkKeyPattern = /^token-artwork\/[a-f0-9]{64}\.(jpg|png|webp)$/;

function isText(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function isOptionalText(value: unknown, max: number) {
  return value === undefined || (typeof value === "string" && value.trim().length <= max);
}

async function checksum(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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
    },
  };
  const encoded = new TextEncoder().encode(JSON.stringify(metadata));
  const digest = (await checksum(metadata)).slice(2);
  const key = `token-metadata/${digest}.json`;
  await getRuntimeEnv().ARTWORK.put(key, encoded, {
    httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=31536000, immutable" },
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

  const artworkObject = await getRuntimeEnv().ARTWORK.head(artworkKey);
  if (!artworkObject || artworkObject.customMetadata?.sha256 !== artworkSha256) {
    return Response.json({ error: "Uploaded artwork could not be verified" }, { status: 422 });
  }

  const ecosystemSafe = product.contracts.hoodieEcosystemSafe;
  const safeConfigured = addressPattern.test(ecosystemSafe) && !/^0x0{40}$/i.test(ecosystemSafe);
  const calibrationReport = getCalibrationReport();
  const curveCalibrated = isCalibrationReportApproved(calibrationReport);
  const releasePolicy = getReleasePolicy();

  const normalized = {
    name: String(body.name).trim(),
    symbol,
    description: typeof body.description === "string" ? body.description.trim() : "",
    artwork: { key: artworkKey, url: artworkUrl, sha256: artworkSha256 },
    website: typeof body.website === "string" ? body.website.trim() : "",
    xUrl: typeof body.xUrl === "string" ? body.xUrl.trim() : "",
    creatorFeeRecipient: body.payoutWallet,
    ecosystemFeeRecipient: ecosystemSafe,
    chainId: product.network.chainId,
    numeraire: product.contracts.hoodie,
    supply: product.token.totalSupplyTokens,
    maxWallet: product.token.maxWalletTokens,
    maxWalletDurationSeconds: product.token.maxWalletDurationSeconds,
    poolFee: product.pool.fee,
    feeShares: product.fees,
    mechanism: product.pool.mechanism,
    migration: product.pool.migration,
    governance: product.pool.governance,
  };

  const metadata = await storeMetadata(request, {
    name: normalized.name,
    symbol,
    description: normalized.description,
    artworkUrl,
    artworkSha256,
    website: normalized.website,
    xUrl: normalized.xUrl,
  });
  const chainStatus = await readChainStatus();
  const simulation = chainStatus.available
    ? await simulateLaunch({
        name: normalized.name,
        symbol,
        tokenURI: metadata.url,
        creator: normalized.creatorFeeRecipient as Address,
        chainStatus,
      })
    : { status: "unavailable" as const, error: chainStatus.error };

  const blockers = [
    ...(!safeConfigured ? ["Configure the HOODIE ecosystem Safe."] : []),
    ...(!curveCalibrated ? ["Calibrate and snapshot the Robinhood V3 curve on a mainnet fork."] : []),
    ...(!releasePolicy.reviewGateApproved
      ? ["Record external review approval or an explicit owner risk waiver."]
      : []),
    ...(!chainStatus.available ? ["Live Robinhood RPC verification is unavailable."] : []),
    ...(chainStatus.available && simulation.status !== "simulated"
      ? ["Canonical Doppler launch simulation did not complete."]
      : []),
    ...(!releasePolicy.broadcastEnabled ? ["Mainnet broadcast is disabled by policy."] : []),
  ];
  const productionReady = blockers.length === 0;
  const publicSimulation = { ...simulation, calldata: undefined };
  const deployment =
    productionReady &&
    simulation.status === "simulated" &&
    simulation.calldata &&
    simulation.airlock &&
    simulation.gasEstimate
      ? {
          chainId: product.network.chainId,
          from: normalized.creatorFeeRecipient,
          to: simulation.airlock,
          data: simulation.calldata,
          gasLimit: (BigInt(simulation.gasEstimate) * 120n / 100n).toString(),
          predictedToken: simulation.asset,
          predictedPool: simulation.pool,
          validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }
      : null;

  return Response.json({
    checksum: await checksum(normalized),
    preparedAt: new Date().toISOString(),
    productionReady,
    blockers,
    config: normalized,
    metadata,
    calibration: {
      status: calibrationReport.status,
      forkBlock: calibrationReport.forkBlock,
      approved: curveCalibrated,
    },
    chainStatus,
    simulation: publicSimulation,
    deployment,
  });
}
