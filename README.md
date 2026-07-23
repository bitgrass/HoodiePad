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
npm run build
npm test
```

## Production gate

The current app is a safe preview and launch-draft preparation surface. It never broadcasts a transaction. Before production deployment, calibrate the V3 curve on a current Robinhood mainnet fork, verify canonical dependency bytecode, and complete an external review. See `PRODUCT_DECISIONS.md`.

Never store a private key in this repository. Use a human-controlled wallet or Safe for approved production actions.
