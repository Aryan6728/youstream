import { network } from "hardhat";

// Deploys ConfidentialPiggyBank to the network selected with --network.
// Usage: pnpm hardhat run scripts/deploy-piggybank.ts --network sepolia
const { viem } = await network.connect();

const [deployer] = await viem.getWalletClients();
if (!deployer) {
  throw new Error(
    "No deployer account configured. Set DEPLOYER_PRIVATE_KEY in contracts/.env"
  );
}
console.log(`Deploying ConfidentialPiggyBank from ${deployer.account.address}...`);

const piggyBank = await viem.deployContract("ConfidentialPiggyBank");

console.log(`ConfidentialPiggyBank deployed at: ${piggyBank.address}`);
console.log(`Owner: ${await piggyBank.read.owner()}`);
console.log(`\nNext: set PIGGYBANK_ADDRESS=${piggyBank.address} in contracts/.env`);
console.log("Then run: pnpm hardhat run scripts/piggybank-e2e.ts --network sepolia");
