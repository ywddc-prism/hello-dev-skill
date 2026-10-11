#!/bin/bash
# Hello Dev - Memory Integration Check
# Usage: bash scripts/check-memory-integration.sh
# Purpose: Verify evidence pipeline is being used in recent tasks

set -e

cd "$(dirname "$0")/.."

echo "=== Memory Integration Check ==="
echo

# Check 1: Snapshot existence
echo "1. Snapshot Check:"
SNAPSHOT_COUNT=$(node scripts/memory.js show 2>/dev/null | python3 -c "import json, sys; d=json.load(sys.stdin); print(len(d.get('snapshots', [])))" 2>/dev/null || echo "0")
if [ "$SNAPSHOT_COUNT" -gt 0 ]; then
    echo "   [OK] Found $SNAPSHOT_COUNT snapshot(s)"
else
    echo "   [WARN] No snapshots found - Bootstrap recall not executed"
fi
echo

# Check 2: Evidence pipeline health
echo "2. Evidence Pipeline Health:"
python3 << 'PYTHON'
import json
try:
    with open('.hello-dev/memory.json') as f:
        d = json.load(f)
    total = len(d['entries'])
    adopted = sum(1 for e in d['entries'] if e.get('adopted'))
    outcomes = sum(1 for e in d['entries'] if e.get('outcomes'))
    
    print(f"   Total entries: {total}")
    print(f"   Adopted: {adopted} ({adopted*100//total if total > 0 else 0}%)")
    print(f"   Outcomes: {outcomes} ({outcomes*100//total if total > 0 else 0}%)")
    
    if adopted == 0:
        print("   [WARN] No adoptions - evidence pipeline not closed")
    elif adopted * 100 // total < 20:
        print("   [WARN] Low adoption rate - evidence pipeline underutilized")
    else:
        print("   [OK] Evidence pipeline active")
except Exception as e:
    print(f"   [ERROR] Cannot read memory.json: {e}")
PYTHON
echo

# Check 3: Review stage integration
echo "3. Review Stage Integration:"
if grep -q "Memory Integration Check" modules/stages/review.md 2>/dev/null; then
    echo "   [OK] review.md contains memory integration check"
else
    echo "   [WARN] review.md missing memory integration check"
fi
echo

# Check 4: Stage docs memory discoverability
echo "4. Stage Docs Memory Discoverability:"
for stage in bootstrap implementation testing ship; do
    if grep -q "snapshot\|recall\|adopt\|outcome" "modules/stages/${stage}.md" 2>/dev/null; then
        echo "   [OK] ${stage}.md mentions memory operations"
    else
        echo "   [WARN] ${stage}.md missing memory operations"
    fi
done
echo

echo "=== Check Complete ==="
