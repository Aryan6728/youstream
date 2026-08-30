# YouStream — Confidential Payroll Streaming on Nox

---

## 1. What we are building

**YouStream** is a confidential payroll & salary-streaming dApp built for the **iExec WTF Hackathon (Summer Edition)**. It integrates **Nox** — iExec's confidential smart contract layer (TEE-based, Intel TDX) — on top of **Sablier** (existing open-source streaming protocol on Sepolia).

**Core value proposition:** An employer can run on-chain payroll where **salary amounts and balances are fully encrypted**. Recipients and stream existence are public (Nox provides confidentiality, not anonymity), but *how much* anyone earns is hidden from everyone except the parties involved. The underlying public protocol (Sablier / ERC-20) is **not modified** — privacy is layered on top via Nox, preserving composability. This is exactly what the hackathon judges want.

**Deployment target: ETH Sepolia (mandatory).**

---

## 2. Hackathon constraints (hard requirements)

- Deployed and working end-to-end on **ETH Sepolia** — no mock data anywhere in the final demo path.
- Public GitHub repo with: complete open-source code, README (install + usage), full setup/deploy docs, and a **`feedback.md`** documenting our real experience with iExec/Nox tools (bugs hit, DX friction, suggestions). Maintain `feedback.md` continuously during development — log every real issue as it happens.
- Functional frontend (judged on UX: user-friendly and intuitive).
- Max 4-minute demo video (script it near the end; the "public explorer shows nothing, employee decrypts their own salary" moment is the money shot).
- Judging: creativity, end-to-end functionality without mocks, Sepolia deployment, feedback.md, video, cleanliness of Nox integration, UX.

---

## 3. Nox — what Claude Code must know

Docs: https://docs.noxprotocol.io/getting-started/welcome (⚠️ docs are marked "under development" — expect gaps; when the docs are ambiguous, check the npm packages / starter code, and flag open questions rather than guessing silently).

Key resources:
- Hello World tutorial (confidential PiggyBank): https://docs.noxprotocol.io/getting-started/hello-world
- Solidity library reference: https://docs.noxprotocol.io/references/solidity-library/getting-started
- JS SDK reference: https://docs.noxprotocol.io/references/js-sdk/getting-started
- ERC-7984 confidential token + ERC20→ERC7984 wrapper guides: https://docs.noxprotocol.io/guides/build-confidential-tokens/intro
- Handle access management (ACL): https://docs.noxprotocol.io/guides/manage-handle-access/intro
- npm org: https://www.npmjs.com/org/iexec-nox
- Hardhat guide: https://docs.noxprotocol.io/guides/build-confidential-smart-contracts/hardhat
- Confidential contracts wizard: https://cdefi-wizard.iex.ec/
- Discord support: https://discord.gg/RXYHBJceMe

### Programming model (from the docs)

- Solidity package: `@iexec-nox/nox-protocol-contracts` — import like:
  `import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";`
- Encrypted values are stored on-chain as 32-byte **handles** (`euint256` etc.) pointing to off-chain encrypted data. Plaintext never touches the chain.
- User inputs: encrypt off-chain with the JS SDK (`encryptInput`), pass `(externalEuint256 inputHandle, bytes inputProof)` into the contract, convert with `Nox.fromExternal(inputHandle, inputProof)`.
- Arithmetic: `Nox.add / Nox.sub` (wrapping!) — **use `Nox.safeAdd` / `Nox.safeSub` + `Nox.select()`** in production paths so overflow/underflow is handled without leaking information. Plain `require(amount <= balance)` does NOT work on encrypted values.
- Encrypted state must be explicitly initialized: `balance = Nox.toEuint256(0);` in the constructor (no default zero).
- Reading values: no public Solidity getters for plaintext — off-chain `decrypt()` via JS SDK, gated by on-chain ACL.

### ⚠️ #1 known footgun (docs call this out explicitly)

After **every** operation that produces a new handle, grant permissions **before the function returns**:
- `Nox.allowThis(handle)` — lets the contract reuse the handle in future txs
- `Nox.allow(handle, user)` — lets that address decrypt off-chain

Transient access is cleared at end-of-tx. Forgetting this makes handles permanently inaccessible next transaction. Treat missing allow/allowThis as a blocking bug in code review. Every state-mutating function must end with the appropriate grants.

### Solidity version
`^0.8.27` per the Hello World tutorial.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Vite + React)           │
│  wagmi/viem + Nox JS SDK (encryptInput / decrypt)    │
│  Employer dashboard │ Employee view │ Public explorer │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│              Contracts (ETH Sepolia)                 │
│                                                      │
│  cUSD (ERC-7984 wrapper over a Sepolia ERC-20)       │
│        ▲ wrap/unwrap                                 │
│  YouStreamCore — encrypted payroll accounting        │
│        │ periodic batch settlement                   │
│  Sablier (existing, untouched) — public settlement   │
└─────────────────────────────────────────────────────┘
```

### 4.1 Contract layer (Hardhat project, `contracts/`)

**A. `cUSDWrapper` (ERC-7984 confidential token)**
- Follow the docs' ERC20→ERC7984 wrapper guide. Wraps a standard Sepolia test ERC-20 (deploy our own simple `TestUSD` ERC-20 for the demo so faucets aren't a dependency).
- Wrap: deposit N public tokens → receive confidential balance. Unwrap: reverse.
- Balances hidden; transfers hide amounts.

**B. `YouStreamCore` — the heart of the project**

State (per stream):
- `employer` (address, public)
- `employee` (address, public)
- `startTime`, `endTime` (public — timing is not secret, amounts are)
- `totalAmount` (`euint256`, encrypted)
- `withdrawn` (`euint256`, encrypted)
- `active` (bool)

Functions:
- `createStream(address employee, uint64 start, uint64 end, externalEuint256 amountHandle, bytes proof)` — employer funds with cUSD (confidential transfer in), stores encrypted total. Grant ACL: allowThis + allow(employer) + allow(employee) on the amount handles so both parties (and only they) can decrypt.
- `withdraw(uint256 streamId)` — employee pulls vested portion. Vested fraction is computed from public timestamps (elapsed/duration), applied to the encrypted total using Nox arithmetic. Use `safeSub` + `select` so a failed/over-withdraw doesn't revert in a way that leaks balance info.
- `cancelStream(uint256 streamId)` — employer cancels; encrypted remaining balance returns to employer, vested part stays claimable by employee.
- `batchCreate(...)` — payroll batch: one tx, many employees. This is a demo differentiator ("run payroll for the whole team, all salaries hidden").
- View helpers return **handles only** (never plaintext); decryption happens client-side via SDK + ACL.

**C. Sablier integration (`SablierSettlement` or a module inside Core)**
- Purpose: prove composability with an unmodified public protocol — key judging criterion.
- Mechanism: employer (or anyone) can trigger `settleToSablier(streamId aggregate)` — unwraps an **aggregate** batch of cUSD back to public ERC-20 and creates real Sablier lockup-linear streams for final distribution. Because settlement is batched/aggregated, individual salary amounts remain unlinkable even though Sablier itself is public.
- Use Sablier V2 lockup-linear contracts already deployed on Sepolia (look up current addresses from official Sablier docs — do NOT hardcode from memory; verify at build time).
- Sablier contracts are consumed via their interfaces only — zero modification.
- If Sablier Sepolia integration turns out to be blocked by something outside our control, fallback: settle unwrapped batches directly via the wrapper with a clear privacy-batching writeup. But try Sablier first — it's the composability story.

**Testing:** Hardhat tests for all flows. If Nox primitives can't run in a local Hardhat network (likely — TEE co-processor), structure tests in two tiers: (1) pure-logic tests with the Nox calls isolated behind a thin internal API, (2) scripted integration tests that run against Sepolia. Document how to run both.

### 4.2 Frontend (`frontend/`, Vite + React + TypeScript)

Stack: wagmi + viem, RainbowKit (or ConnectKit) for wallet, TanStack Query, Tailwind. Nox JS SDK (`@iexec-nox/...` — check npm org for exact package name) for `encryptInput` / `decrypt`.

Three views:
1. **Employer dashboard** — create single stream or batch payroll (CSV upload → encrypted amounts), see own streams, cancel, trigger Sablier settlement. Amounts entered in plaintext in the UI, encrypted client-side before the tx.
2. **Employee view** — connect wallet → see your streams → decrypt *your own* amounts (this only works for you, ACL-enforced) → withdraw vested funds. Show a live "vested so far" figure computed client-side after decryption.
3. **Public explorer** — anyone can see streams exist (addresses + timing) but every amount shows as an encrypted handle / 🔒. This view exists purely to demo the privacy guarantee in the video.

UX bar: this is a judged criterion. Loading states, tx progress toasts, error handling, empty states, mobile-responsive. Clean and minimal beats flashy. No dead buttons.

### 4.3 Backend

Keep it minimal. Prefer **no custom backend**: read chain state directly via viem + events. If event indexing gets painful, add a tiny Node/Express (or Hono) indexer with SQLite — but only if genuinely needed. Hosting: Vercel (frontend) + Railway/Render if an indexer exists.

---

## 5. Repo structure

```
youstream/
├── CLAUDE.md              ← this file
├── README.md              ← install, usage, deploy (judged deliverable)
├── feedback.md            ← living log of iExec/Nox DX feedback (judged deliverable)
├── contracts/             ← Hardhat project
│   ├── contracts/
│   │   ├── TestUSD.sol
│   │   ├── CUSDWrapper.sol
│   │   ├── YouStreamCore.sol
│   │   └── SablierSettlement.sol
│   ├── test/
│   ├── scripts/deploy.ts
│   └── hardhat.config.ts
├── frontend/              ← Vite + React + TS
└── docs/                  ← architecture notes, demo video script
```

---

## 6. Build order (keep each milestone shippable)

1. **M0 — Environment**: Hardhat project compiles with `@iexec-nox/nox-protocol-contracts` installed; reproduce the docs' ConfidentialPiggyBank and deploy it to Sepolia to validate the full toolchain (this de-risks everything). Log any friction in feedback.md.
2. **M1 — Tokens**: TestUSD + CUSDWrapper deployed to Sepolia; wrap/unwrap works; balance decrypts client-side via a throwaway script.
3. **M2 — Core streams**: YouStreamCore create/withdraw/cancel with encrypted amounts, correct ACL grants everywhere, deployed + scripted end-to-end test on Sepolia.
4. **M3 — Frontend**: all three views wired to Sepolia, full flow works in the browser.
5. **M4 — Sablier settlement**: batch settlement to real Sablier streams on Sepolia.
6. **M5 — Polish**: batch payroll UX, README/docs, feedback.md finalized, deploy frontend, record 4-min video.

If time runs short, M4 (Sablier) can degrade to the documented fallback, but M0–M3 + polish are non-negotiable.

---

## 7. Environment & conventions

- Dev machine: Windows 11 + WSL2 Ubuntu. All commands assume WSL.
- Node LTS, pnpm preferred (Nox's own repos use pnpm).
- Secrets in `.env` (never committed): `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`. Add `.env.example`.
- Solidity `^0.8.27`, TypeScript strict mode.
- Security mindset: the author is a smart contract auditor — write it like it will be audited. Checks-effects-interactions, reentrancy guards on withdraw/settle, explicit access control, no information leaks via revert paths on encrypted comparisons (use `select`, don't branch-and-revert on secret data).
- Commit style: conventional commits, small commits per milestone step.
- **Every Nox pain point → feedback.md immediately** (it's a judged deliverable and easy points).

## 8. Open questions to resolve during M0 (ask Discord if blocked)

- Exact npm package names/versions for the JS SDK (check https://www.npmjs.com/org/iexec-nox).
- Whether Nox ops run in local Hardhat network or only against Sepolia + Nox infra (shapes the test strategy).
- Current Sablier V2 Sepolia deployment addresses (verify from official Sablier docs at build time).
- Nox hardhat starter repo link from the hackathon doc 404s (`nox-hardhat-starter`) — the plugin repo exists (`nox-hardhat-plugin`, v0.1.0); ask on Discord for the correct starter.
