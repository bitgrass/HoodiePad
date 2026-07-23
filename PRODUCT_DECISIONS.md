# HoodiePad V1 product decisions

This file is authoritative for HoodiePad V1. Changes to a frozen value require a new ADR and fresh Robinhood fork tests.

## Product

| Decision | V1 value |
| --- | --- |
| Network | Robinhood Chain mainnet |
| Chain ID | `4663` |
| Canonical quote token | HOODIE |
| HOODIE address | `0xC72c01AAB5f5678dc1d6f5C6d2B417d91D402Ba3` |
| HOODIE ecosystem Safe | `0xAB10Efe787DB2ef3700b94578aeC68b98e0446A7` |
| Launch mechanism | Doppler Lockable Uniswap V3 static auction |
| Why not Multicurve | Doppler SDK `1.0.28` does not expose a canonical Robinhood V4 Multicurve initializer |
| Token template | `DopplerERC20V1` |
| Total supply | `1,000,000,000` tokens, 18 decimals |
| Market allocation | 100% |
| Creator token allocation | 0% |
| Creator initial buy | Disabled |
| Pool fee | 1% (`10000`) |
| Canonical V3 token ordering | Child token is `token0`; HOODIE is `token1` |
| V3 tick price | HOODIE per child token |
| Creator fee share | 80% (`0.80e18`) |
| HOODIE ecosystem share | 15% (`0.15e18`) |
| Doppler fee share | 5% (`0.05e18`) |
| Rehype | Not used |
| Migration | NoOp |
| NoOp migration pool lock | `0xdeaDDeADDEaDdeaDdEAddEADDEAdDeadDEADDEaD` |
| Governance | NoOp |
| Maximum wallet | 2% of supply (`20,000,000` tokens) |
| Maximum-wallet duration | 24 hours |
| Balance-limit controller | Zero address |
| Launch surcharge | None |
| Graduation | UI milestone only; never migrates |
| Token artwork | Creator uploads JPG, PNG, or WebP; HoodiePad stores it in managed object storage |
| Token description | Optional, maximum 280 characters |
| Creator fee recipient | Connected MetaMask account; not independently editable |
| Production signer | Connected MetaMask account; no server-side deployment key |
| Deployment authorization | Exact simulation, passing fork report, external review or explicit owner risk waiver, policy switch, then explicit MetaMask confirmation |
| Metadata | HoodiePad generates the immutable production metadata URI |
| Market registry | Canonical Airlock `Create` events, then full HoodiePad invariant validation |
| Market chart | Canonical V3 `Swap` events; no generated price series |
| In-app trading | Exact-input Doppler V3 quote, exact-amount Permit2 approval, simulated Universal Router swap, connected MetaMask confirmation |
| Base | Out of scope |

## Required launch blockers

Mainnet broadcasting stays disabled until all of these are true:

1. The locked V3 tick range has passed buy, sell, fee-claim, max-wallet, and token-ordering tests on a current Robinhood fork.
2. Every canonical Doppler dependency has non-empty bytecode and the expected runtime hash.
3. The live Airlock owner resolves to the 5% beneficiary used by the launch.
4. An external reviewer signs off on the launch adapter and operational runbook,
   or the owner records an explicit risk waiver while keeping that missing review
   visible in release output.

## Runtime hash snapshot

The first successful read-only Robinhood `Airlock.create` simulation observed
and recorded the canonical dependency runtime hashes at block `17157669`.
Every later preparation and simulation must match that approved snapshot
exactly. Any missing bytecode or hash change blocks simulation and mainnet
broadcast until a reviewed ADR updates the snapshot.

## User promise

> Launch a fixed-supply token market on Robinhood Chain, paired with HOODIE. No presale, no free creator allocation, no migration. Creators receive 80% of canonical-pool trading fees.
