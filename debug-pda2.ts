import { Connection, PublicKey } from '@solana/web3.js';
import { PDAHelpers } from './src/core/pda-helpers.js';
import { PROGRAM_ID } from './src/core/programs.js';
import { RootConfig, RegistryConfig } from './src/core/borsh-schemas.js';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com');

  console.log('Program ID:', PROGRAM_ID.toBase58());

  // Check RootConfig
  const [rootConfigPda] = PDAHelpers.getRootConfigPDA();
  console.log('\nRootConfig PDA:', rootConfigPda.toBase58());

  const rootInfo = await connection.getAccountInfo(rootConfigPda);
  if (rootInfo) {
    const rootConfig = RootConfig.deserialize(rootInfo.data);
    const baseRegistry = rootConfig.getCurrentBaseRegistryPublicKey();
    console.log('current_base_registry:', baseRegistry.toBase58());

    // HYPOTHESIS: current_base_registry IS the RegistryConfig PDA directly
    // Not a collection to derive from!
    console.log('\nFetching current_base_registry as RegistryConfig directly...');
    const registryInfo = await connection.getAccountInfo(baseRegistry);
    if (registryInfo) {
      console.log('Account found! Length:', registryInfo.data.length);
      console.log('Owner:', registryInfo.owner.toBase58());
      console.log('Expected program:', PROGRAM_ID.toBase58());

      try {
        const registryConfig = RegistryConfig.deserialize(registryInfo.data);
        console.log('\nRegistryConfig parsed successfully!');
        console.log('  collection:', registryConfig.getCollectionPublicKey().toBase58());
        console.log('  authority:', registryConfig.getAuthorityPublicKey().toBase58());
        console.log('  registry_type:', registryConfig.registry_type);
        console.log('  bump:', registryConfig.bump);

        // Now that we have the real collection, let's verify the PDA derivation
        const realCollection = registryConfig.getCollectionPublicKey();
        const [derivedPda] = PDAHelpers.getRegistryConfigPDA(realCollection);
        console.log('\nDerived PDA from collection:', derivedPda.toBase58());
        console.log('Matches current_base_registry?', derivedPda.equals(baseRegistry));
      } catch (e) {
        console.error('Failed to parse as RegistryConfig:', e);
      }
    } else {
      console.log('Account NOT found');
    }
  }
}

main().catch(console.error);
