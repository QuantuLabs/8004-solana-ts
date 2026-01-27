#!/bin/bash
# Quick Codex review for recent changes
# Usage:
#   ./scripts/review.sh                    # Review uncommitted changes
#   ./scripts/review.sh --staged           # Review only staged changes
#   ./scripts/review.sh --last             # Review last commit
#   ./scripts/review.sh "custom prompt"    # Custom review focus

PROMPT="${1:-}"

echo "🔍 Codex Review"
echo ""

if [ "$PROMPT" == "--staged" ]; then
  echo "Reviewing staged changes..."
  DIFF=$(git diff --cached)
  codex exec "Review this diff for bugs, type issues, and edge cases. Be concise, list file:line for issues:

$DIFF"

elif [ "$PROMPT" == "--last" ]; then
  echo "Reviewing last commit..."
  DIFF=$(git show --format="" HEAD)
  codex exec "Review this commit diff for bugs, type issues, and edge cases. Be concise, list file:line for issues:

$DIFF"

elif [ -n "$PROMPT" ]; then
  echo "Custom review: $PROMPT"
  DIFF=$(git diff)
  codex exec "$PROMPT

Context - uncommitted changes:
$DIFF"

else
  echo "Reviewing uncommitted changes..."
  codex exec "Review the uncommitted changes in this git repo. Check for:
- Type mismatches (nullable used as non-nullable)
- Missing null checks
- BigInt precision issues
- Error handling gaps

Be concise. List issues as: file:line - description"
fi
