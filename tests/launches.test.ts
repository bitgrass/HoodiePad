import assert from "node:assert/strict";
import test from "node:test";
import type { createRobinhoodPublicClient } from "../app/lib/protocol";
import { readMarketAnalytics } from "../app/lib/launches";

const pool = "0x0927b2751E1C75A9621a4b0da0071DA139252137";
const transactionHash =
  "0x7fc372b0b2832714c5184a9ac4cb72e70d68167254c4fb65a9e4343c04a73734";

test("indexes every canonical swap from the token launch block", async () => {
  const requestedRanges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const launchBlock = 17_636_756n;
  const swapBlock = 17_636_800n;
  const fakeClient = {
    async getBlockNumber() {
      return 17_650_000n;
    },
    async getContractEvents(input: { fromBlock: bigint; toBlock: bigint }) {
      requestedRanges.push({
        fromBlock: input.fromBlock,
        toBlock: input.toBlock,
      });
      if (input.fromBlock <= swapBlock && input.toBlock >= swapBlock) {
        return [{
          args: {
            amount0: -11_110_009n * 10n ** 18n,
            amount1: 1_111_111n * 10n ** 18n,
            tick: -20_548,
          },
          blockNumber: swapBlock,
          transactionHash,
          logIndex: 3,
        }];
      }
      return [];
    },
    async getBlock({ blockNumber }: { blockNumber: bigint }) {
      assert.equal(blockNumber, swapBlock);
      return { timestamp: 1_785_000_000n };
    },
  } as unknown as ReturnType<typeof createRobinhoodPublicClient>;

  const analytics = await readMarketAnalytics(
    {
      pool,
      decimals: 18,
      hoodiePerToken: "0.128",
    },
    fakeClient,
    launchBlock,
  );

  assert.equal(requestedRanges[0]?.fromBlock, launchBlock);
  assert.equal(analytics.swapCount, 1);
  assert.equal(analytics.hoodieVolumeRaw, (1_111_111n * 10n ** 18n).toString());
  assert.equal(analytics.hoodieFeeVolumeRaw, analytics.hoodieVolumeRaw);
  assert.equal(analytics.points[0]?.blockNumber, swapBlock.toString());
  assert.equal(analytics.points[0]?.timestamp, 1_785_000_000);
  assert.equal(analytics.daily[0]?.swaps, 1);
});
