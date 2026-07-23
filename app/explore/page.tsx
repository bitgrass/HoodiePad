import { AppShell } from "../components/AppShell";
import { MarketCard } from "../components/MarketCard";
import { previewMarkets } from "../data";

export default function ExplorePage() {
  return (
    <AppShell>
      <section className="page-hero section-frame compact-hero">
        <p className="eyebrow"><span /> Canonical CHILD / HOODIE markets</p>
        <h1>Find your next hood.</h1>
        <p>Every official market below launches with the same fixed rules.</p>
      </section>
      <section className="explore-toolbar section-frame">
        <label className="search-field">
          <span>⌕</span>
          <input aria-label="Search tokens" placeholder="Search name, ticker, or contract" />
        </label>
        <div className="filter-pills" aria-label="Market filters">
          <button className="is-active" type="button">Trending</button>
          <button type="button">New</button>
          <button type="button">Graduated</button>
        </div>
      </section>
      <section className="market-section section-frame explore-markets">
        <div className="market-grid">
          {previewMarkets.map((market) => <MarketCard key={market.address} {...market} />)}
        </div>
        <div className="empty-state-row">
          <span>Interface preview</span>
          <p>Live markets will be sourced from the HoodiePad launch event indexer.</p>
        </div>
      </section>
    </AppShell>
  );
}

