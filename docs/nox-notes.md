# Nox programming model — notes derived from the packages (M0)

Since the docs site is marked "under development", these notes were validated directly against the published npm packages and are the source of truth for this repo.

Packages (pinned in `contracts/package.json`):

| Package | Version | Purpose |
|---|---|---|
| `@iexec-nox/nox-protocol-contracts` | 0.2.4 | `Nox.sol` Solidity SDK library + `NoxCompute` interface |
| `@iexec-nox/nox-confidential-contracts` | 0.2.2 | ERC-7984 confidential token + ERC20→ERC7984 wrapper (for M1) |
| `@iexec-nox/handle` | 0.1.0-beta.13 | JS SDK: `encryptInput` / `decrypt` / `publicDecrypt` / `viewACL` (ethers & viem) |
| `@iexec-nox/nox-hardhat-plugin` | 0.1.0 | Hardhat 3 plugin: local NoxCompute + Docker off-chain stack for `hardhat test` |
| `encrypted-types` | 0.0.4 | `euint256`, `ebool`, `externalEuint256`, … (bytes32 user types) |

## Chain support (baked into `Nox.sol` + SDK defaults)

| Chain | NoxCompute | SDK defaults |
|---|---|---|
| ETH Sepolia (11155111) | `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF` | gateway `https://gateway-testnets.noxprotocol.dev`, subgraph `https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/...` |
| Arbitrum Sepolia (421614) | `0xd464B198f06756a1d00be223634b85E0a731c229` | ✔ |
| Hardhat local (31337) | `0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685` (injected by plugin) | via plugin |

Solidity: **`^0.8.35`** required by `Nox.sol` (0.8.35 pinned in this repo).

## Core flow

1. **Client-side encrypt:** `handleClient.encryptInput(value, "uint256", contractAddr)` → `{ handle, handleProof }`. Plaintext goes to the trusted gateway over TLS; only the 32-byte handle touches the chain.
2. **On-chain ingest:** contract receives `(externalEuint256 h, bytes proof)`, converts via `Nox.fromExternal(h, proof)` (validates proof against gateway + `msg.sender`).
3. **Compute:** `Nox.add/sub/mul/div` (wrapping), `Nox.safeAdd/safeSub/safeMul/safeDiv` returning `(ebool ok, result)`, `Nox.select(cond, a, b)`, comparisons `eq/ne/lt/le/gt/ge` returning `ebool`. Types: `euint16`, `euint256`, `eint16`, `eint256`, `ebool` only.
4. **High-level atomic ops** (used by ERC-7984): `Nox.transfer(fromBal, toBal, amount)`, `Nox.mint(bal, amount, supply)`, `Nox.burn(bal, amount, supply)` — each returns `(ebool success, …newHandles)` and fails *encrypted* (no revert, no info leak).
5. **Client-side decrypt:** `handleClient.decrypt(handle)` — checks `isViewer(handle, user)` on-chain, then EIP-712 auth to the gateway, ECIES/RSA envelope back to the browser.

## ACL model (from `ACL.sol`)

- `allow(handle, account)` → account becomes **admin**: can use the handle in computations, re-grant, and decrypt (admins pass `isViewer`).
- `allowThis(handle)` → admin grant to the contract itself (needed to reuse a stored handle in a later tx).
- `allowTransient` → current-tx only; **all fresh handles start transient-only. Missing `allow/allowThis` before return = handle permanently unusable next tx.** This is the #1 footgun.
- `addViewer(handle, account)` → **view-only** role: may decrypt, cannot compute or re-grant. Ideal for auditors/read-only parties.
- `allowPublicDecryption(handle)` → anyone may decrypt (used for intentional reveals, e.g. Sablier settlement amounts).
- Trivial encryption (`Nox.toEuint256(0)`) yields a **public handle**: ACL calls skip it silently and everyone can "decrypt" it. Fresh zero-initialized state is therefore publicly known to be zero until the first real operation.
- Granting requires the granter itself to be allowed on the handle (`onlyAllowed` modifier), and ACL mutations on public handles revert (`notPublicHandle`) at the NoxCompute level — the `Nox` library wrappers skip public handles before calling.

## Canonical state-update pattern (from `ERC7984Base._updateWithRawPrimitives`)

```solidity
(ebool ok, euint256 newBal) = Nox.safeSub(balance, amount);
newBal = Nox.select(ok, newBal, balance);   // keep old balance on underflow — no revert, no leak
Nox.allowThis(newBal);
Nox.allow(newBal, holder);
balance = newBal;
```

## Testing strategy consequences

- Local `hardhat test` e2e needs the plugin + Docker off-chain stack (KMS, gateway, runner, NATS, S3).
- Without Docker: pure-logic unit tests around the Nox call sites + scripted integration runs against Sepolia (`contracts/scripts/*-e2e.ts`).

## M0 environment caveats (this workspace)

The remote sandbox blocks all non-npm egress (Nox docs site, gateway, Sepolia RPCs, solc binaries). Consequences:

- Compile validated with the npm wasm solc via `SOLC_PATH` (see README).
- `deploy-piggybank.ts` / `piggybank-e2e.ts` are written and typechecked but must be **run from a normal dev machine** (WSL per project conventions) with `.env` populated — the e2e script needs the Handle Gateway, which is unreachable from the sandbox.
