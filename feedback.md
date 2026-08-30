# iExec / Nox — Developer Experience Feedback

Living log of real issues, friction, and suggestions encountered while building YouStream. Newest entries at the bottom. Versions used: `@iexec-nox/nox-protocol-contracts@0.2.4`, `@iexec-nox/nox-confidential-contracts@0.2.2`, `@iexec-nox/handle@0.1.0-beta.13`, `@iexec-nox/nox-hardhat-plugin@0.1.0`, Hardhat 3.11.1.

---

## M0 — Environment & toolchain validation (2026-07-27)

### 1. Solidity version requirements are inconsistent across docs and packages
- The Hello World tutorial targets `^0.8.27`.
- `Nox.sol` in `nox-protocol-contracts@0.2.4` requires `pragma solidity ^0.8.35` — a contract following the tutorial's pragma will not compile against the current package.
- The `nox-hardhat-plugin` README example pins `solidity: "0.8.29"`, which also cannot compile `Nox.sol` (`^0.8.35`).

**Suggestion:** state the minimum solc version in one place (package README) and keep tutorial/plugin examples in CI so they break when the pragma is bumped.

### 2. `@iexec-nox/handle` README understates network support
The README says built-in defaults exist only for Arbitrum Sepolia (421614) and that any other chain needs a full config override. The shipped code (`dist/*/config/networks.js`) actually includes ETH Sepolia (11155111) defaults too (gateway `https://gateway-testnets.noxprotocol.dev`, subgraph, NoxCompute `0x24ef36…f77bf`). Since ETH Sepolia is the hackathon's mandatory target, this stale README is likely to mislead participants into writing unnecessary override plumbing.

### 4. ACL semantics for decryption are only discoverable in the contract source
Docs describe `Nox.allow(handle, user)` as "lets that address decrypt off-chain", while the JS SDK's `decrypt()` actually checks `isViewer(handle, user)` on-chain before contacting the gateway. These agree only because `ACL.sol` counts `allow()`-granted accounts (admins) as viewers. There is also a separate, weaker `addViewer()` role (decrypt-only, no compute/re-grant rights) that the guides barely mention — it is exactly what you want for third-party read access (e.g. an auditor), so it deserves documentation.

### 5. Trivial encryption (`Nox.toEuint256(0)`) produces a *public* handle
Constructor initialization like `balance = Nox.toEuint256(0)` yields a public (plaintext-wrapped) handle; `allow`/`allowThis` silently skip it. Consequence: an observer can tell a fresh piggy bank/stream has "never been funded" until the first confidential operation replaces the handle. Not a bug — but a privacy nuance worth an explicit docs callout, since payroll-style apps may want to fund at creation time to avoid a distinguishable "empty" state.

### 6. `encryptInput` type support is much narrower than the advertised type union
The SDK types accept the full Solidity type universe (`address`, `bytesN`, all int widths…), and README examples even demonstrate encrypting an `address` and `bytes4` — but the protocol currently implements only `bool`, `uint16`, `uint256`, `int16`, `int256` (the README warns about this in one place while showing unsupported examples in another). Runtime failure is the only way to find out; a typed subset would surface this at compile time.

### 7. Local end-to-end testing requires the full Docker off-chain stack
`nox-hardhat-plugin` spins up KMS, ingestor, runner, gateway, NATS and S3 via docker-compose and only hooks the `test` task. There is no lightweight mock of `NoxCompute` for pure-logic unit tests, and no documented way to use the stack from `hardhat run` scripts. We therefore split tests into (a) pure-logic tests around the Nox call sites and (b) scripted integration tests against Sepolia.

### 8. (Environment-specific, not a Nox bug) compiler downloads
Our CI sandbox blocks `binaries.soliditylang.org`; Hardhat 3's `solidity.path` option pointed at the npm `solc` wasm build (`SOLC_PATH` in our `hardhat.config.ts`) is a clean offline workaround. Noted here in case other hackathon teams hit restricted networks.
