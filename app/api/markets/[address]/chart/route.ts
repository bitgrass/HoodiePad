import { getAddress } from "viem";
import product from "../../../../../config/hoodiepad-v1.json";
import { readMarketAnalytics } from "../../../../lib/launches";
import { readHoodiePadMarket } from "../../../../lib/market";

export const revalidate = 0;

export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> },
) {
  try {
    const { address: rawAddress } = await context.params;
    const address = getAddress(rawAddress);
    const market = await readHoodiePadMarket(address);
    if (!market.official) {
      return Response.json({ error: "This is not an official HoodiePad market" }, { status: 404 });
    }
    const analytics = await readMarketAnalytics(market);
    return Response.json(
      {
        token: market.address,
        pool: market.pool,
        currentPrice: market.hoodiePerToken,
        points: analytics.points,
        swapCount: analytics.swapCount,
        hoodieVolume: analytics.hoodieVolume,
        changePercent: analytics.changePercent,
        latestBlock: analytics.points.at(-1)?.blockNumber ?? null,
      },
      {
        headers: {
          "Cache-Control": `public, max-age=0, s-maxage=${product.discovery.refreshSeconds}, stale-while-revalidate=30`,
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Live market chart data is temporarily unavailable" },
      { status: 503 },
    );
  }
}
