# Railway production deployment

This runbook deploys HoodiePad's Node production server from the public
`bitgrass/HoodiePad` repository. It does not use or require a server-side
private key. Mainnet launch transactions are prepared by the server, simulated,
and signed by the connected MetaMask account.

## 1. Create the Railway service

1. Create a new Railway project from `https://github.com/bitgrass/HoodiePad`.
2. Select the `main` branch and repository root.
3. Keep the checked-in `railway.json` as the service configuration source.
4. Generate a Railway public domain after the first successful deployment.

Railpack installs the locked dependencies and then runs `npm run build`;
Railway starts the resulting Vinext server with `npm run start`. The server
reads Railway's injected `PORT` and binds to `0.0.0.0`.

The checked-in `.npmrc` enables npm's legacy peer resolver because the pinned
Doppler SDK `1.0.28` declares an optional React 18 peer while the pinned Vinext
runtime requires React `19.2.6`. This does not change either dependency version;
it tells clean `npm ci` installs to honor the reviewed `package-lock.json`.

## 2. Attach persistent storage

Before the first deploy:

1. Add a Railway Volume to the HoodiePad web service.
2. Mount it at `/data`.
3. Do not manually create `RAILWAY_VOLUME_MOUNT_PATH`; Railway supplies it.

HoodiePad stores immutable, content-addressed artwork and token metadata under
`$RAILWAY_VOLUME_MOUNT_PATH/hoodiepad`. The `/api/health` check returns `503`
until this storage is mounted and writable, preventing an incomplete
deployment from becoming active.

Use one web replica while the Volume backend is active. Schedule Railway Volume
backups before opening public launches. A later horizontal-scaling release
should move the same storage adapter to a shared object-storage bucket.

## 3. Configure production variables

Add these variables to the Railway service. Keep secrets in Railway; never
commit an `.env` file.

| Variable | Production value | Secret |
| --- | --- | --- |
| `NODE_ENV` | `production` | No |
| `VINEXT_TRUST_PROXY` | `1` | No |
| `VINEXT_TRUSTED_HOSTS` | `${{RAILWAY_PUBLIC_DOMAIN}}` | No |
| `Alchemy_API_KEY` | The Robinhood Alchemy API key | Yes |
| `HOODIEPAD_EXTERNAL_REVIEW_APPROVED` | `false` until an external review is recorded | No |
| `HOODIEPAD_OWNER_RISK_WAIVER` | `true` for the currently approved owner waiver | No |
| `HOODIEPAD_BROADCAST_ENABLED` | `true` to return simulated MetaMask deployment calldata | No |

Do not set `PORT`; Railway injects it. Do not set `EVM_RH_PK` or any other
private key. The production server has no signing path.

`ROBINHOOD_RPC_URL` is optional. When it is absent, HoodiePad derives the
Robinhood Alchemy endpoint from `Alchemy_API_KEY`. If it is configured, it
overrides the Alchemy endpoint.

`VINEXT_TRUST_PROXY=1` lets the server honor Railway's forwarded HTTPS protocol
when it creates immutable artwork and metadata URLs.
`VINEXT_TRUSTED_HOSTS=${{RAILWAY_PUBLIC_DOMAIN}}` permits Vinext to use only
Railway's own forwarded public hostname and protects generated URLs against
host-header poisoning.

## 4. Verify the deployment

Before pushing a release, run the Railway-style production smoke test:

```bash
npm run verify:railway
```

It builds the app, starts the production server with Railway's runtime
variables, verifies the storage-backed health endpoint, uploads and reads an
immutable image, and confirms forwarded HTTPS URLs.

After Railway reports the service active:

```text
GET https://<your-domain>/api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "hoodiepad",
  "storage": "filesystem"
}
```

Then complete these checks:

1. Open the app and connect MetaMask.
2. Confirm the wallet switches to Robinhood Chain `4663`.
3. Upload a JPG, PNG, or WebP no larger than 750 KB and reload its returned
   artwork URL. HoodiePad keeps this limit below Railway's observed request
   ceiling so the platform does not reject the request before the app receives it.
4. Complete the launch form and confirm live simulation succeeds.
5. Check that the review gate is labeled `OWNER WAIVER`, not external review.
6. Run the mainnet canary in `docs/runbooks/mainnet-canary.md` with a
   human-confirmed MetaMask transaction.
7. Confirm the launch UI changes from submitted to confirmed, then opens the
   real `/token/<address>?tx=<hash>` page. Check that its token, pool, supply,
   fee, lock status, and metadata match Blockscout.
8. A newly initialized single-sided pool can be traded immediately through its
   canonical Uniswap pool URL, but token search and DEX indexers may not list it
   until the first swap. HoodiePad labels this state `Pool ready` and changes it
   to `Market active` after cumulative V3 fee growth proves a swap occurred.
9. Open `/explore` and confirm the launch appears from the live Airlock event
   registry. The production RPC must support chunked historical `eth_getLogs`
   requests beginning at block `17630000`.
10. Open the token page, enter a small HOODIE amount, and confirm that the
    in-app quote loads. For a canary wallet, complete the exact-amount ERC-20
    and Permit2 approvals, wait for HoodiePad to re-simulate, and then confirm
    the Universal Router swap in MetaMask. Confirm the chart updates after the
    swap is final.

## 5. Rollback and operations

- Turn off launch preparation immediately by setting
  `HOODIEPAD_BROADCAST_ENABLED=false`.
- Roll back application code with Railway's deployment history.
- Never delete or detach the Volume while published metadata URLs reference it.
- Restore stored artwork and metadata from a Railway Volume backup if needed.
- Monitor Railway logs for `413` upload responses and `503` responses from
  metadata, chain confirmation, or health endpoints.

An attached Railway Volume prevents the old and new deployment from mounting
the same data simultaneously, so brief deployment downtime is expected. Plan
updates during low-traffic periods.
