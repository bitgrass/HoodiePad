import Link from "next/link";
import { AppShell } from "../components/AppShell";

const rules = [
  ["Network", "Robinhood Chain · 4663"],
  ["Pair", "Every official token / HOODIE"],
  ["Supply", "1,000,000,000 · fixed"],
  ["Market allocation", "100%"],
  ["Creator allocation", "0%"],
  ["Pool fee", "1%"],
  ["Fee beneficiaries", "80% / 15% / 5%"],
  ["Max wallet", "2% for 24 hours"],
  ["Migration", "None"],
  ["Governance", "None"],
];

export default function AboutPage() {
  return (
    <AppShell>
      <section className="page-hero section-frame compact-hero">
        <p className="eyebrow"><span /> Read it before you launch it</p>
        <h1>Simple rules. Onchain consequences.</h1>
        <p>HoodiePad removes protocol knobs from the creation form and makes the defaults visible.</p>
      </section>
      <section className="rules-layout section-frame">
        <div className="rules-list">
          {rules.map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        <aside className="protocol-note">
          <span className="status-chip amber">V1 protocol status</span>
          <h2>Lockable V3 first.</h2>
          <p>
            The pinned Doppler SDK supports Robinhood&apos;s Lockable Uniswap V3 path.
            Standard V4 Multicurve remains disabled until a canonical Robinhood
            initializer is published, whitelisted, and fork-tested.
          </p>
          <p>
            Production broadcast also requires the HOODIE ecosystem Safe and a
            calibrated, snapshotted curve.
          </p>
          <Link className="button button-dark" href="/launch">Open launch studio ↗</Link>
        </aside>
      </section>
      <section className="disclosure-section section-frame">
        <h2>What the 80% claim means</h2>
        <p>
          Creators receive 80% of fees collected by the canonical CHILD/HOODIE pool.
          Claims can contain both the child token and HOODIE. ETH routes may cross an
          additional HOODIE/WETH market with separate fees and price impact.
        </p>
        <p>
          A wallet cap is not Sybil protection, locked liquidity is not a price floor,
          and graduation is not an endorsement.
        </p>
      </section>
    </AppShell>
  );
}

