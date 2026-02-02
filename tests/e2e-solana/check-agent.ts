import { SolanaSDK } from "../../dist/index.js";
import { IndexerClient } from "../../dist/core/indexer-client.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";

async function check() {
  const keyData = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keyData));

  const sdk = new SolanaSDK({
    cluster: "devnet",
    rpcUrl: "http://127.0.0.1:8899",
    signer,
    indexerUrl: "http://127.0.0.1:3001/rest/v1",
    indexerApiKey: "test-key",
  });

  const indexer = new IndexerClient({
    baseUrl: "http://127.0.0.1:3001/rest/v1",
    apiKey: "test-key",
  });

  const asset = new PublicKey("F9qnkL8kodEzvnRiehYfe8X3V34CtovBALPRURT5CdTk");
  const assetStr = asset.toBase58();

  // Load agent on-chain
  console.log("Loading agent...");
  const agent = await sdk.loadAgent(asset);
  if (!agent) {
    console.log("Agent not found on-chain!");
    return;
  }

  console.log("\nOn-chain agent data:");
  console.log("  feedback_count:", agent.feedback_count?.toString());
  console.log("  feedback_digest:", Buffer.from(agent.feedback_digest || []).toString("hex").slice(0, 40) + "...");

  // Test indexer methods directly
  console.log("\nTesting indexer methods...");

  const digestResult = await indexer.getLastFeedbackDigest(assetStr);
  console.log("getLastFeedbackDigest result:", digestResult);

  const countResult = await indexer.getCount("feedbacks", { asset: `eq.${assetStr}` });
  console.log("getCount result:", countResult);

  // Now verify integrity
  console.log("\nVerifying integrity...");
  const integrityResult = await sdk.verifyIntegrity(asset);
  console.log("Status:", integrityResult.status);
  console.log("Valid:", integrityResult.valid);
  console.log("Feedback chain:", integrityResult.chains.feedback);
  if (integrityResult.error) {
    console.log("Error:", integrityResult.error);
  }
}

check().catch(console.error);
