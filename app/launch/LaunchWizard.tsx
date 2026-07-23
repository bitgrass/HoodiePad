"use client";

import { FormEvent, useMemo, useState } from "react";

type Draft = {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  website: string;
  xUrl: string;
  payoutWallet: string;
};

type PreparedLaunch = {
  checksum: string;
  preparedAt: string;
  productionReady: boolean;
  blockers: string[];
};

const initialDraft: Draft = {
  name: "",
  symbol: "",
  description: "",
  imageUrl: "",
  website: "",
  xUrl: "",
  payoutWallet: "",
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export function LaunchWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(initialDraft);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "preparing" | "error">("idle");
  const [prepared, setPrepared] = useState<PreparedLaunch | null>(null);

  const validMetadata = useMemo(
    () =>
      draft.name.trim().length >= 2 &&
      /^[A-Za-z0-9]{2,10}$/.test(draft.symbol) &&
      draft.description.trim().length >= 20,
    [draft],
  );
  const validWallet = addressPattern.test(draft.payoutWallet);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setPrepared(null);
    setDraft((current) => ({
      ...current,
      [key]: key === "symbol" ? String(value).toUpperCase() : value,
    }));
  }

  async function prepareLaunch(event: FormEvent) {
    event.preventDefault();
    if (!validMetadata || !validWallet || !agreed) return;
    setStatus("preparing");
    setPrepared(null);
    try {
      const response = await fetch("/api/launch/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error("Preparation failed");
      setPrepared((await response.json()) as PreparedLaunch);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="launch-studio">
      <aside className="launch-steps" aria-label="Launch progress">
        {[
          [1, "Token details", "Name the thing"],
          [2, "Creator wallet", "Route the 80%"],
          [3, "Review launch", "Know what you sign"],
        ].map(([number, label, hint]) => (
          <button
            className={step === number ? "is-active" : step > number ? "is-done" : ""}
            key={number}
            onClick={() => {
              const next = Number(number);
              if (next === 1 || (next === 2 && validMetadata) || (next === 3 && validMetadata && validWallet)) setStep(next);
            }}
            type="button"
          >
            <span>{step > number ? "✓" : number}</span>
            <div><strong>{label}</strong><small>{hint}</small></div>
          </button>
        ))}
        <div className="fixed-rule-mini">
          <span>Fixed by HoodiePad</span>
          <p>1B supply · 1% fee · HOODIE pair · no migration</p>
        </div>
      </aside>

      <form className="launch-form" onSubmit={prepareLaunch}>
        {step === 1 && (
          <div className="form-step">
            <p className="step-kicker">Step 1 of 3</p>
            <h2>Give the hood a name.</h2>
            <p className="form-intro">Metadata is public and immutable once the token launches.</p>
            <div className="field-grid two-columns">
              <label>
                <span>Token name</span>
                <input value={draft.name} onChange={(e) => update("name", e.target.value)} maxLength={40} placeholder="Hoodie Hug" />
              </label>
              <label>
                <span>Ticker</span>
                <div className="ticker-input"><i>$</i><input value={draft.symbol} onChange={(e) => update("symbol", e.target.value.replace(/[^A-Za-z0-9]/g, ""))} maxLength={10} placeholder="HUG" /></div>
              </label>
            </div>
            <label>
              <span>Description <small>{draft.description.length}/280</small></span>
              <textarea value={draft.description} onChange={(e) => update("description", e.target.value)} maxLength={280} placeholder="Tell the hood what this token is about. Links belong in the fields below." />
            </label>
            <label>
              <span>Artwork URL <em>IPFS or HTTPS</em></span>
              <input value={draft.imageUrl} onChange={(e) => update("imageUrl", e.target.value)} inputMode="url" placeholder="ipfs://…" />
            </label>
            <div className="field-grid two-columns">
              <label><span>Website <em>Optional</em></span><input value={draft.website} onChange={(e) => update("website", e.target.value)} inputMode="url" placeholder="https://" /></label>
              <label><span>X / Twitter <em>Optional</em></span><input value={draft.xUrl} onChange={(e) => update("xUrl", e.target.value)} inputMode="url" placeholder="https://x.com/" /></label>
            </div>
            <div className="form-actions">
              <span>{validMetadata ? "Looking sharp." : "Name, ticker, and 20+ character story required."}</span>
              <button className="button button-primary" type="button" disabled={!validMetadata} onClick={() => setStep(2)}>Continue <span>→</span></button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="form-step">
            <p className="step-kicker">Step 2 of 3</p>
            <h2>Where should the 80% go?</h2>
            <p className="form-intro">The creator beneficiary is immutable. Team launches should use a Safe, not one person&apos;s everyday wallet.</p>
            <label className="large-field">
              <span>Creator fee-recipient wallet</span>
              <input value={draft.payoutWallet} onChange={(e) => update("payoutWallet", e.target.value.trim())} placeholder="0x…" spellCheck={false} />
            </label>
            <div className={`address-check ${validWallet ? "valid" : ""}`}>
              <span>{validWallet ? "✓" : "!"}</span>
              <div><strong>{validWallet ? "Valid EVM address" : "A complete 0x address is required"}</strong><p>This address receives 80% of canonical pool fees in both assets.</p></div>
            </div>
            <div className="split-preview compact">
              <div><span>Creator wallet</span><strong>80%</strong></div>
              <div><span>HOODIE ecosystem</span><strong>15%</strong></div>
              <div><span>Doppler</span><strong>5%</strong></div>
            </div>
            <div className="form-actions">
              <button className="back-button" type="button" onClick={() => setStep(1)}>← Back</button>
              <button className="button button-primary" type="button" disabled={!validWallet} onClick={() => setStep(3)}>Review launch <span>→</span></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="form-step review-step">
            <p className="step-kicker">Step 3 of 3</p>
            <h2>Review before the wallet asks.</h2>
            <div className="review-token">
              <div className="review-avatar" style={draft.imageUrl ? { backgroundImage: `url(${draft.imageUrl})` } : undefined}>{draft.imageUrl ? "" : draft.symbol.slice(0, 2)}</div>
              <div><strong>{draft.name}</strong><span>${draft.symbol} · 1,000,000,000 supply</span></div>
              <button type="button" onClick={() => setStep(1)}>Edit</button>
            </div>
            <div className="review-rules">
              <div><span>Network</span><strong>Robinhood Chain</strong></div>
              <div><span>Canonical pair</span><strong>${draft.symbol} / HOODIE</strong></div>
              <div><span>Trading fee</span><strong>1.00%</strong></div>
              <div><span>Creator share</span><strong>80%</strong></div>
              <div><span>Creator allocation</span><strong>0%</strong></div>
              <div><span>Max wallet</span><strong>2% for 24h</strong></div>
              <div><span>Migration</span><strong>None</strong></div>
              <div><span>Mechanism</span><strong>Lockable V3</strong></div>
            </div>
            <label className="confirm-check">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I understand the token, pool, fee beneficiaries, and metadata are irreversible after launch.</span>
            </label>
            <div className="simulation-notice"><span>SIMULATION MODE</span><p>Mainnet broadcast is intentionally disabled until the treasury Safe and calibrated curve pass the release gate.</p></div>
            {prepared && (
              <div className="prepared-card" role="status">
                <div><span>✓</span><strong>Launch draft prepared</strong></div>
                <code>{prepared.checksum}</code>
                <ul>{prepared.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
              </div>
            )}
            {status === "error" && <p className="form-error">Could not prepare this draft. Check the fields and try again.</p>}
            <div className="form-actions">
              <button className="back-button" type="button" onClick={() => setStep(2)}>← Back</button>
              <button className="button button-primary" type="submit" disabled={!agreed || status === "preparing"}>{status === "preparing" ? "Preparing…" : "Prepare simulation"} <span>↗</span></button>
            </div>
          </div>
        )}
      </form>

      <aside className="launch-preview">
        <span className="preview-label">LIVE PREVIEW</span>
        <div className="preview-art" style={draft.imageUrl ? { backgroundImage: `url(${draft.imageUrl})` } : undefined}>
          {!draft.imageUrl && <div className="preview-hood">•‿•</div>}
        </div>
        <h3>{draft.name || "Your token"}</h3>
        <p className="preview-symbol">${draft.symbol || "TICKER"} / HOODIE</p>
        <p>{draft.description || "Your token story will appear here for the hood to inspect."}</p>
        <div className="preview-badges"><span>1B fixed</span><span>80% creator</span><span>No migration</span></div>
      </aside>
    </div>
  );
}

