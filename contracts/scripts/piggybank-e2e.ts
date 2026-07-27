import { network } from "hardhat";
import { createViemHandleClient } from "@iexec-nox/handle";

// End-to-end M0 validation against ETH Sepolia:
//   1. encrypt a value off-chain via the Nox Handle Gateway
//   2. deposit it into ConfidentialPiggyBank (on-chain, amount hidden)
//   3. read the balance handle and decrypt it off-chain (owner-gated by ACL)
//
// Usage: pnpm hardhat run scripts/piggybank-e2e.ts --network sepolia
// Requires PIGGYBANK_ADDRESS in contracts/.env (see deploy-piggybank.ts).

const DEPOSIT_AMOUNT = 42n;

const piggyBankAddress = process.env.PIGGYBANK_ADDRESS as
  | `0x${string}`
  | undefined;
if (!piggyBankAddress) {
  throw new Error("Set PIGGYBANK_ADDRESS in contracts/.env first");
}

const { viem } = await network.connect();
const [wallet] = await viem.getWalletClients();
if (!wallet) {
  throw new Error(
    "No account configured. Set DEPLOYER_PRIVATE_KEY in contracts/.env"
  );
}
const publicClient = await viem.getPublicClient();
const piggyBank = await viem.getContractAt(
  "ConfidentialPiggyBank",
  piggyBankAddress
);

console.log(`Using account: ${wallet.account.address}`);
console.log(`PiggyBank:     ${piggyBankAddress}`);

// 1. Encrypt the deposit amount off-chain (plaintext goes to the trusted
//    gateway over TLS, never on-chain).
const handleClient = await createViemHandleClient(wallet);
console.log(`\nEncrypting deposit amount (${DEPOSIT_AMOUNT}) via gateway...`);
const { handle, handleProof } = await handleClient.encryptInput(
  DEPOSIT_AMOUNT,
  "uint256",
  piggyBankAddress
);
console.log(`Input handle: ${handle}`);

// 2. Deposit on-chain — the tx calldata contains only the handle + proof.
console.log("\nSending deposit tx...");
const txHash = await piggyBank.write.deposit([
  handle as `0x${string}`,
  handleProof as `0x${string}`,
]);
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
console.log(`Deposit tx mined: ${receipt.transactionHash} (status: ${receipt.status})`);

// 3. Read the (encrypted) balance handle and decrypt it off-chain.
const balanceHandle = await piggyBank.read.balanceHandle();
console.log(`\nOn-chain balance handle: ${balanceHandle}`);
console.log("Decrypting via gateway (EIP-712 signature required)...");
const { value, solidityType } = await handleClient.decrypt(
  balanceHandle as `0x${string}`
);
console.log(`Decrypted balance: ${value} (${solidityType})`);

if (typeof value !== "bigint" || value < DEPOSIT_AMOUNT) {
  throw new Error(
    `Unexpected balance ${value} — expected at least ${DEPOSIT_AMOUNT}`
  );
}
console.log("\n✅ M0 end-to-end validation passed: encrypt → deposit → decrypt");
