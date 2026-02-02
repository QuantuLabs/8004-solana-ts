import { SolanaSDK } from "../../dist/index.js";
import { Keypair, Connection } from "@solana/web3.js";
import * as fs from "fs";

async function main() {
  const keyData = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keyData));
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  // Airdrop if needed
  const balance = await connection.getBalance(signer.publicKey);
  if (balance < 5e9) {
    console.log("Airdropping SOL...");
    const sig = await connection.requestAirdrop(signer.publicKey, 10e9);
    await connection.confirmTransaction(sig);
  }

  const sdk = new SolanaSDK({
    cluster: "devnet",
    rpcUrl: "http://127.0.0.1:8899",
    signer,
    indexerUrl: "http://127.0.0.1:3001/rest/v1",
    indexerApiKey: "test-key",
  });

  // Create fresh agent
  console.log("Creating new agent...");
  const result = await sdk.registerAgent("ipfs://fresh_test_" + Date.now());
  const asset = result.asset!;
  console.log("Agent:", asset.toBase58());

  // Init ATOM stats
  console.log("Initializing ATOM stats...");
  await sdk.initializeAtomStats(asset);

  // Give 15 feedbacks
  console.log("Giving 15 feedbacks...");
  for (let i = 0; i < 15; i++) {
    await sdk.giveFeedback(asset, { value: 80 + i, tag1: "integrity", tag2: "test" });
    process.stdout.write(".");
  }
  console.log("\nDone! Asset:", asset.toBase58());
}

main().catch(console.error);
