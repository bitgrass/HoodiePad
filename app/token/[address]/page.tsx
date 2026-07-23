import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { previewMarkets } from "../../data";

export default async function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const market = previewMarkets.find((item) => item.address.toLowerCase() === address.toLowerCase()) ?? previewMarkets[0];

  return (
    <AppShell>
      <section className="token-head section-frame">
        <Link href="/explore">← All markets</Link>
        <div className="token-identity">
          <div className={`token-avatar large tone-${market.tone}`}>{market.symbol.slice(0, 2)}</div>
          <div><p>${market.symbol} / HOODIE</p><h1>{market.name}</h1><code>{address.slice(0, 8)}…{address.slice(-6)}</code></div>
          <span className="status-chip">Market forming</span>
        </div>
      </section>
      <section className="token-layout section-frame">
        <div className="chart-panel">
          <div className="price-row"><div><span>Current price</span><strong>{market.price} HOODIE</strong></div><span className={market.change.startsWith("-") ? "change-down" : "change-up"}>{market.change}</span></div>
          <div className="mock-chart" aria-label="Preview market chart"><span className="chart-watermark">PREVIEW</span><div className="chart-curve" /></div>
          <div className="token-stat-row"><div><span>24h volume</span><strong>{market.volume}</strong></div><div><span>Creator share</span><strong>80%</strong></div><div><span>Pool fee</span><strong>1%</strong></div><div><span>Max wallet</span><strong>2% · 24h</strong></div></div>
        </div>
        <aside className="trade-panel">
          <div className="trade-tabs"><button className="is-active" type="button">Buy</button><button type="button">Sell</button></div>
          <label><span>You pay</span><div><input placeholder="0.00" inputMode="decimal" /><strong>HOODIE</strong></div></label>
          <button className="swap-arrow" type="button" aria-label="Swap direction">↓</button>
          <label><span>You receive</span><div><input placeholder="0.00" inputMode="decimal" readOnly /><strong>{market.symbol}</strong></div></label>
          <div className="trade-details"><span>Route</span><strong>HOODIE → {market.symbol}</strong><span>Pool fee</span><strong>1.00%</strong><span>Price impact</span><strong>—</strong></div>
          <button className="button button-primary full-width" type="button">Connect wallet</button>
          <p className="trade-warning">Preview market only. Live trading activates after the verified indexer and router integration ship.</p>
        </aside>
      </section>
      <section className="market-info section-frame"><h2>Market rules</h2><div><span>Canonical quote</span><strong>HOODIE</strong><span>Supply</span><strong>1,000,000,000</strong><span>Migration</span><strong>None</strong><span>Creator allocation</span><strong>0%</strong></div></section>
    </AppShell>
  );
}

