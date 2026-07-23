import {
  DopplerSDK,
  getAddresses,
} from "@whetstone-research/doppler-sdk/evm";
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
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
const permit2Abi = parseAbi([
  "function allowance(address owner,address token,address spender) view returns (uint160 amount,uint48 expiration,uint48 nonce)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
]);
const universalRouterAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);

export type SwapSide = "buy" | "sell";

export type PreparedWalletTransaction = {
  kind: "token-approval" | "permit2-approval" | "swap";
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

export function encodeV3ExactInputSwap(input: {
  recipient: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minimumOut: bigint;
  fee: number;
  deadline: bigint;
}) {
  const path = encodePacked(
    ["address", "uint24", "address"],
    [input.tokenIn, input.fee, input.tokenOut],
  );
  const commandInput = encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes" },
      { type: "bool" },
    ],
    [input.recipient, input.amountIn, input.minimumOut, path, true],
  );
  return encodeFunctionData({
    abi: universalRouterAbi,
    functionName: "execute",
    args: ["0x00", [commandInput], input.deadline],
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
  const universalRouter = getAddress(product.contracts.uniswapUniversalRouter);
  const permit2 = getAddress(product.contracts.permit2);
  if (
    addresses.v3Quoter.toLowerCase() !== product.contracts.uniswapV3Quoter.toLowerCase() ||
    addresses.universalRouter.toLowerCase() !== universalRouter.toLowerCase() ||
    addresses.permit2.toLowerCase() !== permit2.toLowerCase()
  ) {
    throw new Error("Pinned swap dependency addresses do not match the HoodiePad configuration");
  }

  const sdk = new DopplerSDK({
    publicClient: client,
    chainId: ROBINHOOD_CHAIN_ID,
  });
  const [quote, inputBalance, childBalance, tokenAllowance, permitAllowance] =
    await Promise.all([
      sdk.quoter.quoteExactInputV3({
        tokenIn: inputToken,
        tokenOut: outputToken,
        amountIn,
        fee: product.pool.fee,
      }),
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
        args: [account, permit2],
      }),
      client.readContract({
        address: permit2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [account, inputToken, universalRouter],
      }),
    ]);

  if (inputBalance < amountIn) {
    throw new Error(`Insufficient ${inputSymbol} balance`);
  }
  if (
    input.side === "buy" &&
    market.balanceLimitActive &&
    childBalance + quote.amountOut > BigInt(market.maxBalanceRaw)
  ) {
    throw new Error("This buy would exceed the active 2% maximum-wallet limit");
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
  const permitExpiration = now + 30 * 60;
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
        args: [permit2, amountIn],
      }),
      value: "0x0",
    });
  }
  if (permitAllowance[0] < amountIn || Number(permitAllowance[1]) < now + 20 * 60) {
    approvalTransactions.push({
      kind: "permit2-approval",
      label: `Authorize exact ${inputSymbol} input for this swap`,
      from: account,
      to: permit2,
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: "approve",
        args: [inputToken, universalRouter, amountIn, permitExpiration],
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
    const gasEstimate = await client.estimateGas({
      account,
      to: universalRouter,
      data: swapData,
    });
    swapTransaction = {
      kind: "swap",
      label: `Swap ${inputSymbol} for ${outputSymbol}`,
      from: account,
      to: universalRouter,
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
