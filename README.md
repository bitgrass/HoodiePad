# HoodiePad

HoodiePad is a creator-first token launchpad for Robinhood Chain. Official markets pair every child token with HOODIE and use a fixed, transparent launch policy.

## V1 promise

- One billion fixed tokens, all allocated to the market.
- Canonical `CHILD/HOODIE` pair.
- 1% pool fee: 80% creator, 15% HOODIE ecosystem, 5% Doppler.
- 2% maximum wallet for the first 24 hours.
- No creator allocation, presale, initial creator buy, governance, or migration.
- Doppler Lockable Uniswap V3 until canonical Robinhood Multicurve support exists.
- MetaMask connection on Robinhood Chain; the connected account is the creator fee recipient.
- Direct JPG, PNG, or WebP artwork uploads backed by managed object storage.
- Fixed ecosystem Safe: `0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7`.

## Local preview

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run typecheck
npm run build
npm test
```

## Robinhood fork calibration

The calibration command launches a disposable local Anvil fork, creates the
exact HoodiePad V1 market, performs buys and a sell, proves the 2% wallet limit
before and after expiry, claims fees, checks the 80/15/5 split, verifies token
ordering, and proves the locked pool cannot migrate.

Configure `Alchemy_API_KEY` in `.env.local`, then run:

```bash
npm run calibrate:robinhood
```

A successful run replaces `config/hoodie-curve-calibration.json` with the
block-pinned passing report used by the application release gate.

## Live Robinhood verification

The app reads the supplied HOODIE/WETH Uniswap V4 pool through the canonical
Robinhood StateView, verifies bytecode at every protocol dependency, resolves
the current Airlock owner, derives a candidate HOODIE-denominated V3 curve, and
simulates `Airlock.create` without broadcasting.

Configure `.env.local`, then run:

```bash
npm run verify:robinhood
```

`HOODIEPAD_SIMULATION_CREATOR` is optional. When omitted, the read-only CLI uses
a fixed dummy EOA that is different from every fee beneficiary. The web launch
flow uses the connected MetaMask account.

The verification command contains no write path and never uses a deployment
private key.

## Production gate

Check every gate with:

```bash
npm run verify:release
```

The API returns deployment calldata only when the calibration report passes,
the live dependency hashes match, the exact launch simulates, the review gate
is satisfied by external approval or an explicit owner risk waiver, and
`HOODIEPAD_BROADCAST_ENABLED=true`.

Mainnet submission is never performed by server tooling. The connected creator
must confirm the exact `Airlock.create` transaction in MetaMask. Prepared
transactions expire after ten minutes so the 24-hour wallet-limit window begins
close to the actual launch time.

Never store a private key in this repository. Use a human-controlled wallet or Safe for approved production actions.

For the external-review evidence, activation gates, MetaMask canary, onchain
checks, and kill switch, follow
[`docs/runbooks/mainnet-canary.md`](docs/runbooks/mainnet-canary.md).
