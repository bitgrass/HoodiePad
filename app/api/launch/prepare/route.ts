import product from "../../../../config/hoodiepad-v1.json";

type LaunchDraft = {
  name?: unknown;
  symbol?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  website?: unknown;
  xUrl?: unknown;
  payoutWallet?: unknown;
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function isText(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

async function checksum(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function POST(request: Request) {
  let body: LaunchDraft;
  try {
    body = (await request.json()) as LaunchDraft;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "";
  if (
    !isText(body.name, 2, 40) ||
    !/^[A-Z0-9]{2,10}$/.test(symbol) ||
    !isText(body.description, 20, 280) ||
    typeof body.payoutWallet !== "string" ||
    !addressPattern.test(body.payoutWallet)
  ) {
    return Response.json({ error: "Launch draft failed validation" }, { status: 422 });
  }

  const ecosystemSafe = process.env.HOODIEPAD_ECOSYSTEM_SAFE ?? "";
  const safeConfigured = addressPattern.test(ecosystemSafe) && !/^0x0{40}$/i.test(ecosystemSafe);
  const curveCalibrated = product.pool.curveStatus === "calibrated";
  const broadcastEnabled = process.env.HOODIEPAD_BROADCAST_ENABLED === "true";

  const normalized = {
    name: String(body.name).trim(),
    symbol,
    description: String(body.description).trim(),
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl.trim() : "",
    website: typeof body.website === "string" ? body.website.trim() : "",
    xUrl: typeof body.xUrl === "string" ? body.xUrl.trim() : "",
    payoutWallet: body.payoutWallet,
    chainId: product.network.chainId,
    numeraire: product.contracts.hoodie,
    supply: product.token.totalSupplyTokens,
    maxWallet: product.token.maxWalletTokens,
    maxWalletDurationSeconds: product.token.maxWalletDurationSeconds,
    poolFee: product.pool.fee,
    beneficiaries: product.fees,
    mechanism: product.pool.mechanism,
    migration: product.pool.migration,
    governance: product.pool.governance,
  };

  const blockers = [
    ...(!safeConfigured ? ["Configure the HOODIE ecosystem Safe."] : []),
    ...(!curveCalibrated ? ["Calibrate and snapshot the Robinhood V3 curve on a mainnet fork."] : []),
    ...(!broadcastEnabled ? ["Mainnet broadcast is disabled by policy."] : []),
  ];

  return Response.json({
    checksum: await checksum(normalized),
    preparedAt: new Date().toISOString(),
    productionReady: blockers.length === 0,
    blockers,
    config: normalized,
  });
}

