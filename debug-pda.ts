import { Connection, PublicKey } from '@solana/web3.js';
import { PDAHelpers } from './src/core/pda-helpers.js';
import { PROGRAM_ID } from './src/core/programs.js';
import { RootConfig, RegistryConfig } from './src/core/borsh-schemas.js';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com');

  console.log('Program ID:', PROGRAM_ID.toBase58());

  // Check RootConfig
  const [rootConfigPda, rootBump] = PDAHelpers.getRootConfigPDA();
  console.log('\nRootConfig PDA:', rootConfigPda.toBase58(), 'bump:', rootBump);

  const rootInfo = await connection.getAccountInfo(rootConfigPda);
  if (rootInfo) {
    console.log('RootConfig data length:', rootInfo.data.length);
    try {
      const rootConfig = RootConfig.deserialize(rootInfo.data);
      console.log('RootConfig parsed successfully');
      console.log('  authority:', rootConfig.getAuthorityPublicKey().toBase58());
      console.log('  current_base_registry:', rootConfig.getCurrentBaseRegistryPublicKey().toBase58());

      // Now check the registry config for this base registry
      const baseRegistry = rootConfig.getCurrentBaseRegistryPublicKey();
      const [registryConfigPda, registryBump] = PDAHelpers.getRegistryConfigPDA(baseRegistry);
      console.log('\nRegistryConfig PDA:', registryConfigPda.toBase58(), 'bump:', registryBump);

      const registryInfo = await connection.getAccountInfo(registryConfigPda);
      if (registryInfo) {
        console.log('RegistryConfig data length:', registryInfo.data.length);
        try {
          const registryConfig = RegistryConfig.deserialize(registryInfo.data);
          console.log('RegistryConfig parsed successfully');
          console.log('  collection:', registryConfig.getCollectionPublicKey().toBase58());
          console.log('  authority:', registryConfig.getAuthorityPublicKey().toBase58());
        } catch (e) {
          console.error('Failed to parse RegistryConfig:', e);
        }
      } else {
        console.log('RegistryConfig NOT FOUND');

        // Try with the collection directly (maybe it's the collection pubkey, not a registry pubkey)
        console.log('\nTrying collection pubkey directly as PDA seed...');
        const manualPda = PublicKey.findProgramAddressSync(
          [Buffer.from('registry_config'), baseRegistry.toBuffer()],
          PROGRAM_ID
        );
        console.log('Manual PDA:', manualPda[0].toBase58());
        const manualInfo = await connection.getAccountInfo(manualPda[0]);
        console.log('Manual PDA exists:', !!manualInfo);
      }
    } catch (e) {
      console.error('Failed to parse RootConfig:', e);
    }
  } else {
    console.log('RootConfig NOT FOUND');
  }
}

main().catch(console.error);
