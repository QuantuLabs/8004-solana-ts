# Operation Costs

Reference operation costs for current Solana SDK flows.

## Cost Table

| Operation | Cost (SOL) | Lamports | Notes |
|-----------|------------|----------|-------|
| register without ATOM | 0.00924 SOL | 9,240,000 | Register agent only |
| register with ATOM | 0.01404 SOL | 14,040,000 | Register agent + initialize ATOM stats |
| giveFeedback | 0.000010 SOL | 10,000 | TX fee |
| revokeFeedback | 0.000010 SOL | 10,000 | TX fee |
| appendResponse | 0.000005 SOL | 5,000 | TX fee |
| setAgentUri | 0.000061 SOL | 61,000 | URI update |
| setAgentWallet | 0.000010 SOL | 10,000 | Wallet update |
| setMetadataPda create | 0.003207 SOL | 3,207,000 | PDA create + rent |
| deleteMetadataPda | -0.003197 SOL | -3,197,000 | Rent reclaimed |
| enableAtom | 0.000005 SOL | 5,000 | TX fee |
