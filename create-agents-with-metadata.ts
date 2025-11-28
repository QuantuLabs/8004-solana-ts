import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SolanaSDK } from './src/core/sdk-solana.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Script pour créer plusieurs agents avec métadonnées sur devnet
 * Teste les limites de transaction (metadata count, transaction size)
 */
async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  Création d\'agents avec métadonnées sur Devnet');
  console.log('='.repeat(80) + '\n');

  // Charger le keypair depuis ~/.config/solana/id.json
  const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`🔑 Signer: ${signer.publicKey.toBase58()}\n`);

  // Initialiser le SDK avec le signer
  const sdk = new SolanaSDK({
    cluster: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    signer,
  });
  console.log('✅ SDK initialisé\n');

  // Test 1: Agent avec peu de métadonnées (devrait passer)
  console.log('📝 Test 1: Agent avec 3 métadonnées...');
  try {
    const result1 = await sdk.registerAgent(
      'https://example.com/agent-light.json',
      [
        { key: 'name', value: 'LightAgent' },
        { key: 'version', value: '1.0' },
        { key: 'type', value: 'assistant' },
      ]
    );
    console.log(`✅ Agent créé: ID=${result1.agentId}, Mint=${result1.agentMint}`);
    console.log(`   Transaction: ${result1.signature}\n`);
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}\n`);
  }

  // Test 2: Agent avec métadonnées moyennes (devrait passer)
  console.log('📝 Test 2: Agent avec 6 métadonnées...');
  try {
    const result2 = await sdk.registerAgent(
      'https://example.com/agent-medium.json',
      [
        { key: 'name', value: 'MediumAgent' },
        { key: 'version', value: '2.0.1' },
        { key: 'type', value: 'customer_support' },
        { key: 'language', value: 'en,fr,es' },
        { key: 'capabilities', value: 'chat,voice,email' },
        { key: 'status', value: 'active' },
      ]
    );
    console.log(`✅ Agent créé: ID=${result2.agentId}, Mint=${result2.agentMint}`);
    console.log(`   Transaction: ${result2.signature}\n`);
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}\n`);
  }

  // Test 3: Agent avec le maximum de métadonnées (10) et des valeurs longues
  console.log('📝 Test 3: Agent avec 10 métadonnées (maximum, valeurs longues)...');
  try {
    const result3 = await sdk.registerAgent(
      'https://example.com/agent-heavy.json',
      [
        { key: 'name', value: 'HeavyAgent_With_Long_Name_For_Testing_Purposes' },
        { key: 'version', value: '3.5.2-beta.1' },
        { key: 'type', value: 'advanced_ai_assistant' },
        { key: 'language', value: 'en,fr,es,de,it,pt,ru,zh,ja,ko' },
        { key: 'capabilities', value: 'natural_language_processing,computer_vision,speech_recognition,text_to_speech' },
        { key: 'model', value: 'gpt-4-turbo-2024-04-09' },
        { key: 'provider', value: 'OpenAI_Azure_Anthropic_Cohere' },
        { key: 'description', value: 'A highly capable AI agent designed for complex multi-modal interactions and advanced reasoning tasks' },
        { key: 'documentation', value: 'https://docs.example.com/agents/heavy-agent/v3.5.2/comprehensive-guide.html' },
        { key: 'contact', value: 'support@example.com,admin@example.com' },
      ]
    );
    console.log(`✅ Agent créé: ID=${result3.agentId}, Mint=${result3.agentMint}`);
    console.log(`   Transaction: ${result3.signature}\n`);
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    if (error.message.includes('too large') || error.message.includes('Transaction too large')) {
      console.error(`   ⚠️  LIMITE ATTEINTE: Transaction trop grosse avec 10 métadonnées longues\n`);
    } else {
      console.error(`   Détails: ${error}\n`);
    }
  }

  // Test 4: Agent avec 10 métadonnées mais des valeurs plus courtes
  console.log('📝 Test 4: Agent avec 10 métadonnées (valeurs courtes)...');
  try {
    const result4 = await sdk.registerAgent(
      'https://example.com/agent-max.json',
      [
        { key: 'name', value: 'MaxAgent' },
        { key: 'v', value: '1.0' },
        { key: 'type', value: 'bot' },
        { key: 'lang', value: 'en' },
        { key: 'cap', value: 'chat' },
        { key: 'model', value: 'gpt4' },
        { key: 'provider', value: 'openai' },
        { key: 'desc', value: 'AI agent' },
        { key: 'docs', value: 'http://ex.co' },
        { key: 'email', value: 'a@b.com' },
      ]
    );
    console.log(`✅ Agent créé: ID=${result4.agentId}, Mint=${result4.agentMint}`);
    console.log(`   Transaction: ${result4.signature}\n`);
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}\n`);
  }

  // Test 5: Agent avec métadonnées aux limites des contraintes (key 32 bytes, value 256 bytes)
  console.log('📝 Test 5: Agent avec métadonnées aux limites (key=32B, value=256B)...');
  try {
    const maxKey = 'k'.repeat(32); // Maximum key length
    const maxValue = 'v'.repeat(256); // Maximum value length

    const result5 = await sdk.registerAgent(
      'https://example.com/agent-limits.json',
      [
        { key: maxKey, value: maxValue },
        { key: 'normal_key', value: 'normal_value' },
      ]
    );
    console.log(`✅ Agent créé: ID=${result5.agentId}, Mint=${result5.agentMint}`);
    console.log(`   Transaction: ${result5.signature}\n`);
  } catch (error: any) {
    console.error(`❌ Erreur: ${error.message}`);
    if (error.message.includes('too large') || error.message.includes('Transaction too large')) {
      console.error(`   ⚠️  LIMITE ATTEINTE: Transaction trop grosse avec métadonnées aux limites max\n`);
    } else {
      console.error(`   Détails: ${error}\n`);
    }
  }

  console.log('='.repeat(80));
  console.log('  Tests terminés');
  console.log('='.repeat(80) + '\n');
}

main().catch(console.error);
