import {
  DopplerSDK,
  getAddresses,
} from "@whetstone-research/doppler-sdk/evm";
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import product from "../../config/hoodiepad-v1.json";
import { readHoodiePadMarket } from "./market";
import {
  createRobinhoodPublicClient,
  ROBINHOOD_CHAIN_ID,
} from "./protocol";

const erc20Abi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
]);
const swapRouter02Abi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);

export type SwapSide = "buy" | "sell";

export type PreparedWalletTransaction = {
  kind: "token-approval" | "swap";
  label: string;
  from: Address;
  to: Address;
  data: Hex;
  gasLimit?: string;
  value: "0x0";
};

export type PreparedSwap = {
  token: Address;
  pool: Address;
  side: SwapSide;
  inputToken: Address;
  outputToken: Address;
  inputSymbol: string;
  outputSymbol: string;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string;
  amountOutFormatted: string;
  minimumOut: string;
  minimumOutFormatted: string;
  slippageBps: number;
  priceImpactTicks: number;
  priceImpactPercent: number | null;
  inputBalanceFormatted: string;
  approvalTransactions: PreparedWalletTransaction[];
  swapTransaction: PreparedWalletTransaction | null;
  simulationPassed: boolean;
  expiresAt: string;
};

export class SwapPreparationError extends Error {
  code: "MAX_WALLET" | "TRADE_SIZE" | "QUOTE_UNAVAILABLE";
  maximumAmount?: string;
  inputSymbol?: string;

  constructor(
    message: string,
    input: {
      code: SwapPreparationError["code"];
      maximumAmount?: string;
      inputSymbol?: string;
    },
  ) {
    super(message);
    this.name = "SwapPreparationError";
    this.code = input.code;
    this.maximumAmount = input.maximumAmount;
    this.inputSymbol = input.inputSymbol;
  }
}

function isQuoterRevert(error: unknown) {
  return error instanceof Error &&
    error.message.toLowerCase().includes("revert");
}

function formattedMaximumInput(raw: bigint) {
  const conservative = raw * 995n / 1_000n;
  return formatUnits(conservative > 0n ? conservative : raw, 18);
}

export function estimateMaxInputAtSpot(input: {
  childBalance: bigint;
  maxBalance: bigint;
  hoodiePerToken: string;
}) {
  if (input.childBalance >= input.maxBalance) return 0n;
  const normalizedPrice = input.hoodiePerToken.replaceAll(",", "");
  if (normalizedPrice === "Unavailable") return null;
  try {
    const price = parseUnits(normalizedPrice, 18);
    return (input.maxBalance - input.childBalance) * price / 10n ** 18n;
  } catch {
    return null;
  }
}

export function encodeV3ExactInputSwap(input: {
  recipient: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minimumOut: bigint;
  fee: number;
  deadline: bigint;
}) {
  const exactInput = encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [{
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      fee: input.fee,
      recipient: input.recipient,
      amountIn: input.amountIn,
      amountOutMinimum: input.minimumOut,
      sqrtPriceLimitX96: 0n,
    }],
  });
  return encodeFunctionData({
    abi: swapRouter02Abi,
    functionName: "multicall",
    args: [input.deadline, [exactInput]],
  });
}

export async function prepareHoodiePadSwap(input: {
  token: string;
  account: string;
  side: SwapSide;
  amount: string;
  slippageBps: number;
}): Promise<PreparedSwap> {
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  if (input.side !== "buy" && input.side !== "sell") {
    throw new Error("Choose buy or sell");
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,18})?$/.test(input.amount.trim())) {
    throw new Error("Enter a valid token amount");
  }
  if (!Number.isInteger(input.slippageBps) || input.slippageBps < 25 || input.slippageBps > 500) {
    throw new Error("Slippage must be between 0.25% and 5%");
  }

  const client = createRobinhoodPublicClient();
  const market = await readHoodiePadMarket(token, client);
  if (!market.official) throw new Error("This is not an official HoodiePad market");

  const hoodie = getAddress(product.contracts.hoodie);
  const inputToken = input.side === "buy" ? hoodie : token;
  const outputToken = input.side === "buy" ? token : hoodie;
  const inputSymbol = input.side === "buy" ? "HOODIE" : market.symbol;
  const outputSymbol = input.side === "buy" ? market.symbol : "HOODIE";
  const amountIn = parseUnits(input.amount, 18);
  if (amountIn <= 0n || amountIn > 2n ** 160n - 1n) {
    throw new Error("Swap amount is outside the supported range");
  }

  const addresses = getAddresses(ROBINHOOD_CHAIN_ID);
  const swapRouter = getAddress(product.contracts.uniswapSwapRouter02);
  if (
    addresses.v3Quoter.toLowerCase() !== product.contracts.uniswapV3Quoter.toLowerCase()
  ) {
    throw new Error("Pinned swap dependency addresses do not match the HoodiePad configuration");
  }

  const sdk = new DopplerSDK({
    publicClient: client,
    chainId: ROBINHOOD_CHAIN_ID,
  });
  const [inputBalance, childBalance, tokenAllowance] =
    await Promise.all([
      client.readContract({
        address: inputToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      client.readContract({
        address: inputToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, swapRouter],
      }),
    ]);

  if (inputBalance < amountIn) {
    throw new Error(`Insufficient ${inputSymbol} balance`);
  }

  if (input.side === "buy" && market.balanceLimitActive) {
    const spotMaximum = estimateMaxInputAtSpot({
      childBalance,
      maxBalance: BigInt(market.maxBalanceRaw),
      hoodiePerToken: market.hoodiePerToken,
    });
    if (spotMaximum !== null && amountIn > spotMaximum) {
      const maximumAmount = formattedMaximumInput(spotMaximum);
      throw new SwapPreparationError(
        spotMaximum === 0n
          ? "This wallet has reached the active 2% maximum-wallet limit."
          : `This buy would exceed the active 2% maximum-wallet limit. Try at most about ${maximumAmount} HOODIE.`,
        {
          code: "MAX_WALLET",
          maximumAmount: spotMaximum > 0n ? maximumAmount : undefined,
          inputSymbol,
        },
      );
    }
  }

  const quoteExactInput = (candidateAmount: bigint) =>
    sdk.quoter.quoteExactInputV3({
      tokenIn: inputToken,
      tokenOut: outputToken,
      amountIn: candidateAmount,
      fee: product.pool.fee,
    });

  let quote: Awaited<ReturnType<typeof quoteExactInput>>;
  try {
    quote = await quoteExactInput(amountIn);
  } catch (error) {
    if (!isQuoterRevert(error)) throw error;

    let quoteableAmount = amountIn / 2n;
    let quoteable = false;
    for (let attempt = 0; attempt < 10 && quoteableAmount > 0n; attempt += 1) {
      try {
        await quoteExactInput(quoteableAmount);
        quoteable = true;
        break;
      } catch (probeError) {
        if (!isQuoterRevert(probeError)) throw probeError;
        quoteableAmount /= 2n;
      }
    }
    if (!quoteable || quoteableAmount <= 0n) {
      throw new SwapPreparationError(
        "The canonical pool cannot quote this trade right now. Try a smaller amount or use the Uniswap pool link.",
        { code: "QUOTE_UNAVAILABLE", inputSymbol },
      );
    }

    let lower = quoteableAmount;
    let upper = amountIn;
    for (let attempt = 0; attempt < 8 && upper - lower > 1n; attempt += 1) {
      const candidate = (lower + upper) / 2n;
      try {
        await quoteExactInput(candidate);
        lower = candidate;
      } catch (probeError) {
        if (!isQuoterRevert(probeError)) throw probeError;
        upper = candidate;
      }
    }
    const maximumAmount = formattedMaximumInput(lower);
    throw new SwapPreparationError(
      `This trade reaches the available curve boundary. Try at most about ${maximumAmount} ${inputSymbol}.`,
      {
        code: "TRADE_SIZE",
        maximumAmount,
        inputSymbol,
      },
    );
  }

  if (
    input.side === "buy" &&
    market.balanceLimitActive &&
    childBalance + quote.amountOut > BigInt(market.maxBalanceRaw)
  ) {
    const remaining = BigInt(market.maxBalanceRaw) - childBalance;
    const maximumRaw = remaining > 0n
      ? amountIn * remaining / quote.amountOut
      : 0n;
    const maximumAmount = formattedMaximumInput(maximumRaw);
    throw new SwapPreparationError(
      maximumRaw === 0n
        ? "This wallet has reached the active 2% maximum-wallet limit."
        : `This buy would exceed the active 2% maximum-wallet limit. Try at most about ${maximumAmount} HOODIE.`,
      {
        code: "MAX_WALLET",
        maximumAmount: maximumRaw > 0n ? maximumAmount : undefined,
        inputSymbol,
      },
    );
  }

  const minimumOut =
    quote.amountOut * BigInt(10_000 - input.slippageBps) / 10_000n;
  const inputValue = Number(formatUnits(amountIn, 18));
  const outputValue = Number(formatUnits(quote.amountOut, 18));
  const spotPrice = Number(market.hoodiePerToken.replaceAll(",", ""));
  const executionPrice = input.side === "buy"
    ? inputValue / outputValue
    : outputValue / inputValue;
  const priceImpactPercent =
    Number.isFinite(executionPrice) && Number.isFinite(spotPrice) && spotPrice > 0
      ? Math.abs((executionPrice / spotPrice) - 1) * 100
      : null;
  const now = Math.floor(Date.now() / 1000);
  const deadline = BigInt(now + 20 * 60);
  const approvalTransactions: PreparedWalletTransaction[] = [];

  if (tokenAllowance < amountIn) {
    approvalTransactions.push({
      kind: "token-approval",
      label: `Approve exact ${inputSymbol} input`,
      from: account,
      to: inputToken,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [swapRouter, amountIn],
      }),
      value: "0x0",
    });
  }

  const swapData = encodeV3ExactInputSwap({
    recipient: account,
    tokenIn: inputToken,
    tokenOut: outputToken,
    amountIn,
    minimumOut,
    fee: product.pool.fee,
    deadline,
  });
  let swapTransaction: PreparedWalletTransaction | null = null;
  if (approvalTransactions.length === 0) {
    let gasEstimate: bigint;
    try {
      gasEstimate = await client.estimateGas({
        account,
        to: swapRouter,
        data: swapData,
      });
    } catch {
      throw new SwapPreparationError(
        "The direct Uniswap V3 swap did not simulate. Try a smaller amount or use the canonical pool link.",
        { code: "QUOTE_UNAVAILABLE", inputSymbol },
      );
    }
    swapTransaction = {
      kind: "swap",
      label: `Swap ${inputSymbol} for ${outputSymbol}`,
      from: account,
      to: swapRouter,
      data: swapData,
      gasLimit: (gasEstimate * 120n / 100n).toString(),
      value: "0x0",
    };
  }

  return {
    token,
    pool: market.pool,
    side: input.side,
    inputToken,
    outputToken,
    inputSymbol,
    outputSymbol,
    amountIn: amountIn.toString(),
    amountInFormatted: formatUnits(amountIn, 18),
    amountOut: quote.amountOut.toString(),
    amountOutFormatted: formatUnits(quote.amountOut, 18),
    minimumOut: minimumOut.toString(),
    minimumOutFormatted: formatUnits(minimumOut, 18),
    slippageBps: input.slippageBps,
    priceImpactTicks: quote.initializedTicksCrossed,
    priceImpactPercent,
    inputBalanceFormatted: formatUnits(inputBalance, 18),
    approvalTransactions,
    swapTransaction,
    simulationPassed: swapTransaction !== null,
    expiresAt: new Date(Number(deadline) * 1000).toISOString(),
  };
}
