import Link from "next/link";
import product from "../../../config/hoodiepad-v1.json";
import { AppShell } from "../../components/AppShell";
import { MarketChart } from "../../components/MarketChart";
import { SwapPanel } from "../../components/SwapPanel";
import { readHoodiePadMarket, type HoodiePadMarket } from "../../lib/market";

export const revalidate = 0;

const transactionHashPattern = /^0x[a-fA-F0-9]{64}$/;

function shorten(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function grouped(value: string) {
  const [whole, fraction] = value.split(".");
  const result = BigInt(whole).toLocaleString("en-US");
  return fraction ? `${result}.${fraction}` : result;
}

function limitEndLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1000));
}

function MarketUnavailable({ address, message }: { address: string; message: string }) {
  return (
    <AppShell>
      <section className="token-head section-frame">
        <Link href="/explore">← All markets</Link>
        <div className="token-unavailable">
          <span>MARKET LOOKUP</span>
          <h1>Token details unavailable.</h1>
          <p>{message}</p>
          <code>{address}</code>
          <a
            href={`${product.network.explorerUrl}/address/${address}`}
            target="_blank"
            rel="noreferrer"
          >
            Check the address on Blockscout ↗
          </a>
        </div>
      </section>
    </AppShell>
  );
}

export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ tx?: string }>;
}) {
  const [{ address }, query] = await Promise.all([params, searchParams]);
  let market: HoodiePadMarket;
  try {
    market = await readHoodiePadMarket(address);
  } catch (error) {
    const missingContract =
      error instanceof Error && error.message === "No token contract exists at this address";
    return (
      <MarketUnavailable
        address={address}
        message={missingContract
          ? error.message
          : "HoodiePad could not read this market from Robinhood Chain. Try again shortly or verify the address on Blockscout."}
      />
    );
  }

  const transactionHash =
    typeof query.tx === "string" && transactionHashPattern.test(query.tx)
      ? query.tx
      : "";
  const explorerToken = `${product.network.explorerUrl}/token/${market.address}`;
  const explorerPool = `${product.network.explorerUrl}/address/${market.pool}`;
  const uniswapPool = `https://app.uniswap.org/explore/pools/robinhood/${market.pool}`;

  return (
    <AppShell>
      <section className="token-head section-frame">
        <Link href="/explore">← All markets</Link>
        {transactionHash && (
          <div className="launch-confirmed-banner">
            <strong>Launch confirmed on Robinhood Chain.</strong>
            <a
              href={`${product.network.explorerUrl}/tx/${transactionHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction ↗
            </a>
          </div>
        )}
        <div className="token-identity">
          <div
            className={`token-avatar large${market.imageUrl ? " has-artwork" : ""}`}
            style={
              market.imageUrl
                ? { backgroundImage: `url("${market.imageUrl.replaceAll('"', "%22")}")` }
                : undefined
            }
          >
            {market.imageUrl ? "" : market.symbol.slice(0, 2)}
          </div>
          <div>
            <p>${market.symbol} / HOODIE</p>
            <h1>{market.name}</h1>
            <a href={explorerToken} target="_blank" rel="noreferrer">
              <code>{shorten(market.address)}</code> ↗
            </a>
          </div>
          <span className={`status-chip${market.official && market.hasSwapActivity ? "" : " is-warning"}`}>
            {!market.official
              ? "Unverified configuration"
              : market.hasSwapActivity
                ? "Market active"
                : "Pool ready · awaiting first trade"}
          </span>
        </div>
        {market.official && !market.hasSwapActivity && (
          <div className="market-activation-banner">
            <div>
              <strong>The pool is funded and ready; it has not traded yet.</strong>
              <p>
                Token search and market indexers may not discover a new pool until its first
                swap. Use the canonical pool link for the first trade.
              </p>
            </div>
            <a href={uniswapPool} target="_blank" rel="noreferrer">
              Open canonical pool ↗
            </a>
          </div>
        )}
        {market.description && <p className="token-description">{market.description}</p>}
        {(market.websiteUrl || market.xUrl) && (
          <div className="token-links">
            {market.websiteUrl && <a href={market.websiteUrl} target="_blank" rel="noreferrer">Website ↗</a>}
            {market.xUrl && <a href={market.xUrl} target="_blank" rel="noreferrer">X / Twitter ↗</a>}
          </div>
        )}
      </section>

      <section className="token-layout section-frame">
        <div className="chart-panel">
          <div className="price-row">
            <div>
              <span>Onchain spot price</span>
              <strong>{market.hoodiePerToken} HOODIE</strong>
            </div>
            <span className="live-chain-chip">
              {market.hasSwapActivity ? "ACTIVE · ONCHAIN" : "POOL READY"}
            </span>
          </div>
          <MarketChart token={market.address} initialPrice={market.hoodiePerToken} />
          <div className="chart-pool-links">
            <a href={explorerPool} target="_blank" rel="noreferrer">
              Pool {shorten(market.pool)} ↗
            </a>
            <span>Live Swap events · Robinhood Chain</span>
          </div>
          <div className="token-stat-row">
            <div><span>Swap history</span><strong>{market.hasSwapActivity ? "Detected" : "None yet"}</strong></div>
            <div><span>Creator share</span><strong>80%</strong></div>
            <div><span>Pool fee</span><strong>{(market.poolFee / 10_000).toFixed(2)}%</strong></div>
            <div><span>Max wallet</span><strong>{market.balanceLimitActive ? "Active" : "Expired"}</strong></div>
          </div>
        </div>

        <SwapPanel token={market.address} symbol={market.symbol} poolUrl={uniswapPool} />
      </section>

      <section className="market-info section-frame">
        <h2>Market rules</h2>
        <div>
          <span>Canonical quote</span><strong>HOODIE</strong>
          <span>Supply</span><strong>{grouped(market.totalSupply)}</strong>
          <span>Migration</span><strong>None</strong>
          <span>Creator allocation</span><strong>0%</strong>
          <span>Maximum wallet</span><strong>{grouped(market.maxBalance)}</strong>
          <span>Limit expiry</span><strong>{limitEndLabel(market.balanceLimitEnd)} UTC</strong>
          <span>Token ordering</span><strong>CHILD / HOODIE</strong>
          <span>Chain</span><strong>Robinhood · 4663</strong>
        </div>
      </section>
    </AppShell>
  );
}
