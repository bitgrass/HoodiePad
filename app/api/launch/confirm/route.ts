import { airlockAbi } from "@whetstone-research/doppler-sdk/evm";
import {
  decodeEventLog,
  getAddress,
  TransactionReceiptNotFoundError,
  type Address,
  type Hex,
} from "viem";
import product from "../../../../config/hoodiepad-v1.json";
import { createRobinhoodPublicClient } from "../../../lib/protocol";

type ConfirmationRequest = {
  transactionHash?: unknown;
  predictedToken?: unknown;
  predictedPool?: unknown;
};

const transactionHashPattern = /^0x[a-fA-F0-9]{64}$/;
const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: Request) {
  let body: ConfirmationRequest;
  try {
    body = (await request.json()) as ConfirmationRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body.transactionHash !== "string" ||
    !transactionHashPattern.test(body.transactionHash) ||
    typeof body.predictedToken !== "string" ||
    !addressPattern.test(body.predictedToken) ||
    typeof body.predictedPool !== "string" ||
    !addressPattern.test(body.predictedPool)
  ) {
    return Response.json({ error: "Invalid deployment confirmation request" }, { status: 422 });
  }

  try {
    const receipt = await createRobinhoodPublicClient().getTransactionReceipt({
      hash: body.transactionHash as Hex,
    });
    if (receipt.status !== "success") {
      return Response.json({ error: "The Robinhood deployment reverted" }, { status: 409 });
    }
    if (!receipt.to || receipt.to.toLowerCase() !== product.contracts.airlock.toLowerCase()) {
      return Response.json({ error: "The transaction did not call the canonical Airlock" }, { status: 409 });
    }

    let confirmed:
      | { token: Address; pool: Address }
      | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== product.contracts.airlock.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: airlockAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "Create") continue;
        const args = decoded.args as {
          asset: Address;
          numeraire: Address;
          poolOrHook: Address;
        };
        if (args.numeraire.toLowerCase() !== product.contracts.hoodie.toLowerCase()) continue;
        confirmed = {
          token: getAddress(args.asset),
          pool: getAddress(args.poolOrHook),
        };
        break;
      } catch {
        // Other Airlock logs are expected in the same receipt.
      }
    }

    if (!confirmed) {
      return Response.json({ error: "No HoodiePad Airlock Create event was found" }, { status: 409 });
    }
    if (
      confirmed.token.toLowerCase() !== body.predictedToken.toLowerCase() ||
      confirmed.pool.toLowerCase() !== body.predictedPool.toLowerCase()
    ) {
      return Response.json(
        { error: "Confirmed token or pool does not match the simulated deployment" },
        { status: 409 },
      );
    }

    return Response.json({
      status: "confirmed",
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      creator: receipt.from,
      token: confirmed.token,
      pool: confirmed.pool,
    });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return Response.json({ status: "confirming" }, { status: 202 });
    }
    return Response.json(
      { error: "Robinhood confirmation is temporarily unavailable" },
      { status: 503 },
    );
  }
}
