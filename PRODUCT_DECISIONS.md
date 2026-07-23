# HoodiePad V1 product decisions

This file is authoritative for HoodiePad V1. Changes to a frozen value require a new ADR and fresh Robinhood fork tests.

## Product

| Decision | V1 value |
| --- | --- |
| Network | Robinhood Chain mainnet |
| Chain ID | `4663` |
| Canonical quote token | HOODIE |
| HOODIE address | `0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3` |
| Launch mechanism | Doppler Lockable Uniswap V3 static auction |
| Why not Multicurve | Doppler SDK `1.0.28` does not expose a canonical Robinhood V4 Multicurve initializer |
| Token template | `DopplerERC20V1` |
| Total supply | `1,000,000,000` tokens, 18 decimals |
| Market allocation | 100% |
| Creator token allocation | 0% |
| Creator initial buy | Disabled |
| Pool fee | 1% (`10000`) |
| Creator fee share | 80% (`0.80e18`) |
| HOODIE ecosystem share | 15% (`0.15e18`) |
| Doppler fee share | 5% (`0.05e18`) |
| Rehype | Not used |
| Migration | NoOp |
| Governance | NoOp |
| Maximum wallet | 2% of supply (`20,000,000` tokens) |
| Maximum-wallet duration | 24 hours |
| Balance-limit controller | Zero address |
| Launch surcharge | None |
| Graduation | UI milestone only; never migrates |
| Metadata | Immutable IPFS URI in production |
| Base | Out of scope |

## Required launch blockers

Mainnet broadcasting stays disabled until all of these are true:

1. `HOODIEPAD_ECOSYSTEM_SAFE` is a non-zero Robinhood Safe controlled by the project.
2. The locked V3 tick range has passed buy, sell, fee-claim, max-wallet, and token-ordering tests on a current Robinhood fork.
3. Every canonical Doppler dependency has non-empty bytecode and the expected runtime hash.
4. The live Airlock owner resolves to the 5% beneficiary used by the launch.
5. An external reviewer signs off on the launch adapter and operational runbook.

## User promise

> Launch a fixed-supply token market on Robinhood Chain, paired with HOODIE. No presale, no free creator allocation, no migration. Creators receive 80% of canonical-pool trading fees.

