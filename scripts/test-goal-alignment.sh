#!/usr/bin/env bash
# Verify Goal Alignment: 0% with empty goals, >0% after goals are configured.
set -euo pipefail

SERVER="${RUNCANON_SERVER:-http://127.0.0.1:3000}"
CREDS="${RUNCANON_CONFIG_DIR:-$HOME/.runcanon}/credentials.json"

if [[ ! -f "$CREDS" ]]; then
  echo "Missing $CREDS — run: runcanon login --server $SERVER"
  exit 1
fi

TOKEN=$(python3 -c "import json; print(json.load(open('$CREDS'))['token'])")

read_stats() {
  curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/stats"
}

read_goals() {
  curl -sf -H "Authorization: Bearer $TOKEN" "$SERVER/api/config" \
    | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['config']['goals']))"
}

echo "== Goal Alignment integration test =="
echo "Server: $SERVER"

BASELINE_GOALS=$(read_goals)
BASELINE_ALIGNMENT=$(read_stats | python3 -c "import json,sys; print(json.load(sys.stdin)['goalAlignment'])")
TRAJECTORIES=$(read_stats | python3 -c "import json,sys; print(json.load(sys.stdin)['trajectoryCount'])")

echo "Trajectories: $TRAJECTORIES"
echo "Baseline goals: $BASELINE_GOALS"
echo "Baseline alignment: $BASELINE_ALIGNMENT"

# Temporarily clear goals to assert 0% behavior
curl -sf -X PATCH "$SERVER/api/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"goals":[]}' >/dev/null

EMPTY_ALIGNMENT=$(read_stats | python3 -c "import json,sys; print(json.load(sys.stdin)['goalAlignment'])")
echo "Alignment with empty goals: $EMPTY_ALIGNMENT"

if python3 -c "import sys; sys.exit(0 if float('$EMPTY_ALIGNMENT') == 0 else 1)"; then
  echo "  ✓ Empty goals → 0% alignment"
else
  echo "  ✗ Expected 0% with empty goals, got $EMPTY_ALIGNMENT"
  exit 1
fi

TEST_GOALS='["Automate CVE triage and vulnerability prioritization","Audit dependencies for known security issues","Reduce manual security review with agent skills"]'
curl -sf -X PATCH "$SERVER/api/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"goals\": $TEST_GOALS}" >/dev/null

WITH_GOALS=$(read_stats | python3 -c "import json,sys; print(json.load(sys.stdin)['goalAlignment'])")
echo "Alignment with security goals: $WITH_GOALS"

if python3 -c "import sys; sys.exit(0 if float('$WITH_GOALS') > 0 else 1)"; then
  PCT=$(python3 -c "print(int(float('$WITH_GOALS')*100))")
  echo "  ✓ Configured goals → ${PCT}% alignment"
else
  echo "  ✗ Expected >0% with matching goals, got $WITH_GOALS"
  exit 1
fi

# Restore original goals
curl -sf -X PATCH "$SERVER/api/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"goals\": $BASELINE_GOALS}" >/dev/null

echo ""
echo "All goal alignment checks passed."
