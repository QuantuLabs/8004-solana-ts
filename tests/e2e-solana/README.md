# Solana SDK E2E Tests

Tests end-to-end complets du SDK Solana contre devnet.

## ⚠️ Note Importante

Ces tests **NE SONT PAS** dans le repo git. Ils sont dans `/tmp/solana-e2e-tests/` pour des tests locaux uniquement.

## Fichiers de Tests

### 1. e2e-full-flow.test.ts
Test du cycle de vie complet d'un agent:
- ✅ Enregistrement agent
- ✅ Mise à jour métadonnées
- ✅ Donner feedback
- ✅ Lire réputation
- ✅ Ajouter réponse
- ✅ Demander validation
- ✅ Répondre validation
- ✅ Révoquer feedback
- ✅ Requêtes multi-agents

**Scénario**: Crée un agent, lui donne du feedback, ajoute une réponse, valide, et révoque.

### 2. e2e-error-scenarios.test.ts
Test des cas d'erreur et edge cases:
- ❌ Entités non-existantes
- ❌ Erreurs de permission (read-only SDK)
- ❌ Inputs invalides
- ❌ Edge cases (URIs longs, caractères spéciaux)
- ❌ Erreurs réseau
- ⚡ Opérations concurrentes

### 3. e2e-performance.test.ts
Test de performance et scalabilité:
- ⏱️  Temps de réponse
- ⚡ Opérations batch
- 📊 Grands datasets
- 🚀 Cache et throughput
- 💾 Efficacité mémoire

## Prérequis

```bash
# 1. Variable d'environnement avec clé privée Solana
export SOLANA_PRIVATE_KEY='[1,2,3,...]'  # Uint8Array en JSON

# 2. Balance SOL sur devnet
# Obtenir des SOL devnet: https://faucet.solana.com/

# 3. Programmes déployés sur devnet
# Les program IDs doivent correspondre à ceux dans src/solana/programs.ts
```

## Exécution

### Tous les tests E2E
```bash
cd /Users/true/Documents/Pipeline/CasterCorp/agent0-ts-solana
npm test /tmp/solana-e2e-tests
```

### Test spécifique
```bash
# Cycle complet
npm test /tmp/solana-e2e-tests/e2e-full-flow.test.ts

# Scénarios d'erreur
npm test /tmp/solana-e2e-tests/e2e-error-scenarios.test.ts

# Performance
npm test /tmp/solana-e2e-tests/e2e-performance.test.ts
```

### Avec output détaillé
```bash
npm test /tmp/solana-e2e-tests -- --verbose
```

## Résultats Attendus

### e2e-full-flow.test.ts
```
✅ Agent registered with ID: 123
✅ Agent loaded successfully
✅ Metadata set
✅ URI updated
✅ Feedback given with index: 0
✅ Feedback loaded (score: 85)
✅ Reputation summary (average: 85, total: 1)
✅ Response appended
✅ Response count: 1
✅ Validation requested (nonce: 0)
✅ Validation response sent
✅ Feedback revoked
✅ Revoked feedback excluded from default listing
```

### e2e-error-scenarios.test.ts
```
✅ Non-existent entities return null/empty
✅ Read-only SDK throws on write operations
✅ Invalid inputs rejected
✅ Edge cases handled gracefully
✅ Network errors caught
✅ Concurrent operations work
```

### e2e-performance.test.ts
```
⏱️  loadAgent: ~500ms
⏱️  getSummary: ~200ms (cached)
⏱️  5 agents in parallel: ~1500ms
⏱️  Read all feedbacks: ~800ms
⏱️  Throughput: ~5 req/sec sequential
⏱️  Throughput: ~20 req/sec parallel
```

## Coûts Estimés (Devnet)

Chaque test e2e-full-flow consomme environ:
- Register agent: ~0.001 SOL
- Set metadata: ~0.0005 SOL
- Set URI: ~0.0005 SOL
- Give feedback: ~0.002 SOL
- Append response: ~0.001 SOL
- Request validation: ~0.001 SOL
- Respond validation: ~0.0005 SOL
- Revoke feedback: ~0.0005 SOL

**Total par run**: ~0.007 SOL (~$0.0007 à $0.10/SOL)

Sur devnet c'est gratuit (faucet), mais gardez ces chiffres en tête pour mainnet.

## Timeouts

Tests configurés avec timeouts généreux pour devnet:
- Opérations read: 30s
- Opérations write: 60s
- Tests performance: 60s

Si devnet est lent, augmentez les timeouts.

## Debugging

### Voir les logs détaillés
```bash
ANCHOR_LOG=true npm test /tmp/solana-e2e-tests/e2e-full-flow.test.ts
```

### Explorer les transactions
Copiez les signatures de transaction des logs et consultez:
- https://explorer.solana.com/?cluster=devnet

### Vérifier les comptes
```bash
solana account <PUBKEY> --url devnet
```

## Maintenance

Ces tests E2E:
- ✅ Testent contre devnet réel
- ✅ Créent de vraies transactions
- ✅ Coûtent du SOL (devnet gratuit)
- ❌ Ne sont PAS dans git
- ❌ Ne sont PAS dans CI/CD
- ⚠️  Peuvent échouer si devnet est down

Pour CI/CD, utilisez les tests d'intégration dans `tests/solana/integration.test.ts` qui sont plus légers.

## Nettoyage

Les tests créent des agents et feedbacks sur devnet. Pas besoin de nettoyage spécial car:
1. C'est devnet (test network)
2. Les données sont utiles pour tester les read functions
3. Les comptes peuvent être fermés manuellement si besoin

## Tips

1. **Balance faible?** → https://faucet.solana.com/
2. **Devnet lent?** → Augmentez les timeouts
3. **RPC rate limit?** → Utilisez votre propre RPC URL
4. **Tests flaky?** → Ajoutez des delays entre opérations

## Questions Fréquentes

**Q: Pourquoi ne pas les commiter dans git?**
A: Ce sont de vrais tests contre devnet qui coûtent du SOL et prennent du temps. Pas adaptés pour CI/CD.

**Q: Comment les exécuter en CI/CD?**
A: Ne les exécutez pas en CI/CD. Utilisez les tests d'intégration mock dans `tests/solana/`.

**Q: Puis-je les exécuter contre mainnet?**
A: Oui mais attention aux coûts! Changez `createDevnetSDK()` en `createMainnetSDK()`.

**Q: Combien de temps prennent-ils?**
A: Environ 5-10 minutes pour tout exécuter, selon la vitesse de devnet.
