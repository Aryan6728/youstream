# YouStream — Confidential Payroll Streaming on Nox

Confidential payroll & salary-streaming dApp for the **iExec WTF Hackathon (Summer Edition)**, built on **Nox** (iExec's TEE-based confidential smart contract layer) with **Sablier** composability, deployed on **ETH Sepolia*

**Core idea:** on-chain payroll where salary amounts and balances are fully encrypted. Stream existence and parties are public; *amounts* are decryptable only by the employer and the employee, enforced by Nox's on-chain ACL.

See [`CLAUDE.md`](./CLAUDE.md) for the full project brief and [`feedback.md`](./feedback.md) for our running iExec/Nox DX log (judged deliverable).

## Status

| Milestone | Description | Status |
|---|---|---|
| M0 | Toolchain validation: Hardhat + Nox compiles, ConfidentialPiggyBank + Sepolia deploy scripts | ✅ code complete — deploy run pending (see below) |
| M1 | TestUSD + cUSD wrapper (ERC-7984) | ⏳ |
| M2 | YouStreamCore encrypted streams | ⏳ |
| M3 | Frontend (employer / employee / explorer) | ⏳ |
| M4 | Sablier batch settlement | ⏳ |
| M5 | Polish, docs, demo video | ⏳ |

## Repo structure

```
youstream/
├── CLAUDE.md            # project brief
├── feedback.md          # living iExec/Nox DX feedback log (judged)
├── contracts/           # Hardhat 3 project (Solidity 0.8.35)
│   ├── contracts/ConfidentialPiggyBank.sol   # M0 toolchain-validation contract
│   ├── scripts/deploy-piggybank.ts
│   ├── scripts/piggybank-e2e.ts              # encrypt → deposit → decrypt on Sepolia
│   └── hardhat.config.ts
├── frontend/            # Vite + React (from M3)
└── docs/                # architecture notes (see docs/nox-notes.md)
```

## Prerequisites

- Node.js ≥ 22, pnpm ≥ 10
- A funded ETH Sepolia account (faucet ETH for gas)

## Install & compile

```bash
cd contracts
pnpm install
pnpm hardhat compile
```

Hardhat downloads solc 0.8.35 automatically. On a network-restricted machine, use the wasm compiler shipped via npm instead:

```bash
SOLC_PATH="$(pwd)/node_modules/solc/soljson.js" pnpm hardhat compile
```

## M0: deploy & validate the toolchain on Sepolia

1. Configure secrets:

   ```bash
   cd contracts
   cp .env.example .env
   # fill in SEPOLIA_RPC_URL and DEPLOYER_PRIVATE_KEY
   ```

2. Deploy the piggy bank:

   ```bash
   pnpm hardhat run scripts/deploy-piggybank.ts --network sepolia
   ```

3. Put the printed address into `.env` as `PIGGYBANK_ADDRESS`, then run the end-to-end check (encrypts 42 off-chain via the Nox Handle Gateway, deposits it, reads the encrypted handle back and decrypts it — only works for the owner, enforced by on-chain ACL):

   ```bash
   pnpm hardhat run scripts/piggybank-e2e.ts --network sepolia
   ```

   Expected final output: `✅ M0 end-to-end validation passed: encrypt → deposit → decrypt`

## Key Nox facts (validated against the packages, v0.2.4)

- Import: `@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol`; Solidity pragma must satisfy `^0.8.35`.
- ETH Sepolia (`11155111`) is supported out of the box: NoxCompute at `0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF`, with built-in gateway/subgraph defaults in `@iexec-nox/handle`.
- After every operation producing a new handle, grant `Nox.allowThis(h)` + `Nox.allow(h, user)` **before returning** — transient access dies at end-of-tx.
- Off-chain `decrypt()` is gated by on-chain `isViewer`, which is true for accounts granted via `allow` (admins) or `addViewer` (view-only).

More detail in [`docs/nox-notes.md`](./docs/nox-notes.md)
