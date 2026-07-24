import {
  airlockAbi,
  uniswapV3PoolAbi,
} from "@whetstone-research/doppler-sdk/evm";
import {
  formatUnits,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import product from "../../config/hoodiepad-v1.json";
import {
  readHoodiePadMarket,
  type HoodiePadMarket,
} from "./market";
import { createRobinhoodPublicClient } from "./protocol";

type RobinhoodClient = ReturnType<typeof createRobinhoodPublicClient>;

export type MarketSwapPoint = {
  blockNumber: string;
  transactionHash: Hex;
  logIndex: number;
  timestamp: number;
  price: number;
  hoodieVolumeRaw: string;
  hoodieFeeVolumeRaw: string;
  childVolumeRaw: string;
};

export type MarketDailyActivity = {
  date: string;
  swaps: number;
  hoodieVolumeRaw: string;
  hoodieFeeVolumeRaw: string;
};

export type MarketAnalytics = {
  points: MarketSwapPoint[];
  swapCount: number;
  swapCount24h: number;
  hoodieVolumeRaw: string;
  hoodieVolume24hRaw: string;
  hoodieFeeVolumeRaw: string;
  hoodieFeeVolume24hRaw: string;
  hoodieVolume: string;
  hoodieVolume24h: string;
  changePercent: number | null;
  daily: MarketDailyActivity[];
};

export type HoodiePadLaunch = HoodiePadMarket & {
  creator: Address;
  launchBlock: string;
  launchTimestamp: number;
  launchTransactionHash: Hex;
  analytics: MarketAnalytics;
};

export type HoodiePadMarketSummary = {
  address: string;
  symbol: string;
  name: string;
  creator: string;
  price: string;
  volume: string;
  change: string;
  imageUrl?: string;
  active: boolean;
  launchBlock: string;
  tone: "green" | "peach" | "blue" | "violet";
};

type DecodedChainEvent = {
  args: unknown;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  logIndex: number | null;
};

const launchStartBlock = BigInt(product.discovery.launchStartBlock);
const logChunkSize = BigInt(product.discovery.logChunkSize);
let cachedLaunches:
  | { expiresAt: number; promise: Promise<HoodiePadLaunch[]> }
  | undefined;

function absolute(value: bigint) {
  return value < 0n ? -value : value;
}

function compactAmount(raw: bigint, decimals = 18) {
  const value = Number(formatUnits(raw, decimals));
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 4,
  }).format(value);
}

async function readEventChunks(
  client: RobinhoodClient,
  input: {
    address: Address;
    abi: typeof airlockAbi | typeof uniswapV3PoolAbi;
    eventName: "Create" | "Swap";
    fromBlock: bigint;
    toBlock: bigint;
    args?: Record<string, Address>;
  },
) {
  const events: DecodedChainEvent[] = [];
  for (
    let fromBlock = input.fromBlock;
    fromBlock <= input.toBlock;
    fromBlock += logChunkSize
  ) {
    const toBlock =
      fromBlock + logChunkSize - 1n < input.toBlock
        ? fromBlock + logChunkSize - 1n
        : input.toBlock;
    const chunk = await client.getContractEvents({
      address: input.address,
      abi: input.abi,
      eventName: input.eventName,
      args: input.args,
      fromBlock,
      toBlock,
    } as Parameters<RobinhoodClient["getContractEvents"]>[0]);
    events.push(...chunk as unknown as DecodedChainEvent[]);
  }
  return events;
}

export async function readMarketAnalytics(
  market: Pick<HoodiePadMarket, "pool" | "decimals" | "hoodiePerToken">,
  client = createRobinhoodPublicClient(),
  fromBlock = launchStartBlock,
): Promise<MarketAnalytics> {
  const latestBlock = await client.getBlockNumber();
  const logs = await readEventChunks(client, {
    address: market.pool,
    abi: uniswapV3PoolAbi,
    eventName: "Swap",
    fromBlock,
    toBlock: latestBlock,
  });

  const decodedPoints = logs
    .map((log) => {
      const args = log.args as {
        amount0?: bigint;
        amount1?: bigint;
        tick?: number;
      };
      if (
        log.blockNumber === null ||
        !log.transactionHash ||
        args.amount0 === undefined ||
        args.amount1 === undefined ||
        args.tick === undefined
      ) {
        return null;
      }
      return {
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
        logIndex: log.logIndex ?? 0,
        timestamp: 0,
        price: Math.pow(1.0001, Number(args.tick)),
        hoodieVolumeRaw: absolute(args.amount1).toString(),
        hoodieFeeVolumeRaw: args.amount1 > 0n ? args.amount1.toString() : "0",
        childVolumeRaw: absolute(args.amount0).toString(),
      } satisfies MarketSwapPoint;
    })
    .filter((point): point is MarketSwapPoint => point !== null)
    .sort((first, second) => {
      const blockDifference =
        BigInt(first.blockNumber) - BigInt(second.blockNumber);
      return blockDifference === 0n
        ? first.logIndex - second.logIndex
        : blockDifference < 0n ? -1 : 1;
    });

  const uniqueBlocks = [...new Set(decodedPoints.map((point) => point.blockNumber))];
  const timestamps = new Map<string, number>();
  await Promise.all(uniqueBlocks.map(async (blockNumber) => {
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    timestamps.set(blockNumber, Number(block.timestamp));
  }));
  const points = decodedPoints.map((point) => ({
    ...point,
    timestamp: timestamps.get(point.blockNumber) ?? 0,
  }));

  const hoodieVolumeRaw = points.reduce(
    (total, point) => total + BigInt(point.hoodieVolumeRaw),
    0n,
  );
  const hoodieFeeVolumeRaw = points.reduce(
    (total, point) => total + BigInt(point.hoodieFeeVolumeRaw),
    0n,
  );
  const latestTimestamp = Math.max(
    Math.floor(Date.now() / 1000),
    ...points.map((point) => point.timestamp),
  );
  const cutoff24h = latestTimestamp - 24 * 60 * 60;
  const points24h = points.filter((point) => point.timestamp >= cutoff24h);
  const hoodieVolume24hRaw = points24h.reduce(
    (total, point) => total + BigInt(point.hoodieVolumeRaw),
    0n,
  );
  const hoodieFeeVolume24hRaw = points24h.reduce(
    (total, point) => total + BigInt(point.hoodieFeeVolumeRaw),
    0n,
  );
  const dailyActivity = new Map<string, {
    swaps: number;
    hoodieVolumeRaw: bigint;
    hoodieFeeVolumeRaw: bigint;
  }>();
  for (const point of points) {
    const date = new Date(point.timestamp * 1000).toISOString().slice(0, 10);
    const current = dailyActivity.get(date) ?? {
      swaps: 0,
      hoodieVolumeRaw: 0n,
      hoodieFeeVolumeRaw: 0n,
    };
    current.swaps += 1;
    current.hoodieVolumeRaw += BigInt(point.hoodieVolumeRaw);
    current.hoodieFeeVolumeRaw += BigInt(point.hoodieFeeVolumeRaw);
    dailyActivity.set(date, current);
  }
  const firstPrice = points[0]?.price;
  const latestPrice =
    points.at(-1)?.price ??
    (market.hoodiePerToken === "Unavailable"
      ? undefined
      : Number(market.hoodiePerToken.replaceAll(",", "")));
  const changePercent =
    firstPrice && latestPrice
      ? ((latestPrice / firstPrice) - 1) * 100
      : null;

  return {
    points: points.slice(-200),
    swapCount: points.length,
    swapCount24h: points24h.length,
    hoodieVolumeRaw: hoodieVolumeRaw.toString(),
    hoodieVolume24hRaw: hoodieVolume24hRaw.toString(),
    hoodieFeeVolumeRaw: hoodieFeeVolumeRaw.toString(),
    hoodieFeeVolume24hRaw: hoodieFeeVolume24hRaw.toString(),
    hoodieVolume: compactAmount(hoodieVolumeRaw),
    hoodieVolume24h: compactAmount(hoodieVolume24hRaw),
    changePercent,
    daily: [...dailyActivity.entries()]
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([date, activity]) => ({
        date,
        swaps: activity.swaps,
        hoodieVolumeRaw: activity.hoodieVolumeRaw.toString(),
        hoodieFeeVolumeRaw: activity.hoodieFeeVolumeRaw.toString(),
      })),
  };
}

async function loadHoodiePadLaunches(
  client = createRobinhoodPublicClient(),
): Promise<HoodiePadLaunch[]> {
  const latestBlock = await client.getBlockNumber();
  const logs = await readEventChunks(client, {
    address: getAddress(product.contracts.airlock),
    abi: airlockAbi,
    eventName: "Create",
    args: { numeraire: getAddress(product.contracts.hoodie) },
    fromBlock: launchStartBlock,
    toBlock: latestBlock,
  });

  const candidates = await Promise.allSettled(
    logs.map(async (log) => {
      const args = log.args as {
        asset?: Address;
        numeraire?: Address;
        poolOrHook?: Address;
      };
      if (
        !args.asset ||
        !args.numeraire ||
        !args.poolOrHook ||
        log.blockNumber === null ||
        !log.transactionHash
      ) {
        throw new Error("Incomplete Airlock Create event");
      }
      const [market, receipt, launchBlock] = await Promise.all([
        readHoodiePadMarket(args.asset, client),
        client.getTransactionReceipt({ hash: log.transactionHash }),
        client.getBlock({ blockNumber: log.blockNumber }),
      ]);
      if (!market.official || market.pool.toLowerCase() !== args.poolOrHook.toLowerCase()) {
        throw new Error("Create event is not an official HoodiePad market");
      }
      const analytics = await readMarketAnalytics(market, client, log.blockNumber);
      return {
        ...market,
        creator: getAddress(receipt.from),
        launchBlock: log.blockNumber.toString(),
        launchTimestamp: Number(launchBlock.timestamp),
        launchTransactionHash: log.transactionHash,
        analytics,
      } satisfies HoodiePadLaunch;
    }),
  );

  return candidates
    .filter(
      (candidate): candidate is PromiseFulfilledResult<HoodiePadLaunch> =>
        candidate.status === "fulfilled",
    )
    .map((candidate) => candidate.value)
    .sort((first, second) =>
      BigInt(first.launchBlock) > BigInt(second.launchBlock) ? -1 : 1,
    );
}

export function readHoodiePadLaunches() {
  const now = Date.now();
  if (cachedLaunches && cachedLaunches.expiresAt > now) {
    return cachedLaunches.promise;
  }
  const promise = loadHoodiePadLaunches().catch((error) => {
    cachedLaunches = undefined;
    throw error;
  });
  cachedLaunches = {
    expiresAt: now + product.discovery.refreshSeconds * 1000,
    promise,
  };
  return promise;
}

export function formatMarketChange(changePercent: number | null) {
  if (changePercent === null || !Number.isFinite(changePercent)) return "New";
  const prefix = changePercent > 0 ? "+" : "";
  return `${prefix}${changePercent.toFixed(2)}%`;
}

export function summarizeHoodiePadLaunches(
  launches: HoodiePadLaunch[],
): HoodiePadMarketSummary[] {
  const tones: HoodiePadMarketSummary["tone"][] = ["green", "peach", "blue", "violet"];
  return launches.map((market, index) => ({
    address: market.address,
    symbol: market.symbol,
    name: market.name,
    creator: market.creator,
    price: market.hoodiePerToken,
    volume: `${market.analytics.hoodieVolume} HOODIE`,
    change: formatMarketChange(market.analytics.changePercent),
    imageUrl: market.imageUrl,
    active: market.hasSwapActivity,
    launchBlock: market.launchBlock,
    tone: tones[index % tones.length],
  }));
}
