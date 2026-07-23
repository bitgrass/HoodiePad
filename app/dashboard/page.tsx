import Link from "next/link";
import { AppShell } from "../components/AppShell";

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="page-hero section-frame compact-hero">
        <p className="eyebrow"><span /> Creator command center</p>
        <h1>Your hood, your fees.</h1>
        <p>Connect the fee-recipient wallet used at launch to see claimable balances.</p>
      </section>
      <section className="dashboard-grid section-frame">
        <article className="dashboard-card dark-card">
          <span>Claimable HOODIE</span>
          <strong>—</strong>
          <p>Connect the beneficiary wallet to read locked-pool fees.</p>
        </article>
        <article className="dashboard-card">
          <span>Claimable child tokens</span>
          <strong>—</strong>
          <p>Fee claims can contain both assets in the canonical pair.</p>
        </article>
        <article className="dashboard-card">
          <span>Creator markets</span>
          <strong>0</strong>
          <p>No launches found for the connected preview session.</p>
        </article>
      </section>
      <section className="dashboard-empty section-frame">
        <div className="empty-hood" aria-hidden="true">•‿•</div>
        <h2>No fee streams yet.</h2>
        <p>Launch the first fixed-supply market or connect a creator payout wallet.</p>
        <Link className="button button-primary" href="/launch">Launch a token ↗</Link>
      </section>
    </AppShell>
  );
}

