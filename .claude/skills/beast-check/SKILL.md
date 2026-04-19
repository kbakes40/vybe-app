---
name: beast-check
description: Full system check for vybe-app — git working-tree status, latest Xcode build freshness for the 'vibecode' scheme, and Railway backend health. Use when the user asks "/beast-check", "status check", or wants a one-shot readiness report before pushing or building.
---

# /beast-check — vybe-app readiness report

Run all three checks in parallel (single message, three Bash tool calls), then render a single compact report. Do not stop on the first failure — collect all three results and show them together.

## 1. Git working-tree status

```bash
cd /Users/kevinbaker/Developer/vybe-app && git status --short && echo "---" && git log -1 --oneline && echo "---" && git rev-parse --abbrev-ref HEAD
```

Report:
- Branch name
- Latest commit (short hash + subject)
- Count of modified / staged / untracked files (or "clean" if none)

## 2. Xcode build status — 'vibecode' scheme

The 'vibecode' target builds to `~/Library/Developer/Xcode/DerivedData/vibecode-*/Build/Products/Debug-iphoneos/vibecode.app`. Check whether a recent build exists and verify its signing.

```bash
APP=$(ls -td ~/Library/Developer/Xcode/DerivedData/vibecode-*/Build/Products/Debug-iphoneos/vibecode.app 2>/dev/null | head -1)
if [ -z "$APP" ]; then echo "NO BUILD FOUND"; exit 0; fi
echo "Path: $APP"
stat -f "Built: %Sm" "$APP"
codesign -dv "$APP" 2>&1 | grep -E 'Identifier|TeamIdentifier|Authority=Apple' | head -3
```

Report:
- Age of the build in minutes/hours (fresh < 30 min, warm < 6 h, stale > 6 h, MISSING if none)
- Code-signing Team ID (should be `FCXP585VH2`)
- Bundle identifier (should be `com.vibecode.vybe`)

## 3. Railway backend health — audio pipeline

Hit `/health` with timing, and confirm the audio route is reachable. The backend URL is `https://vybe-app-production.up.railway.app` (from `mobile/.env`; re-read if it changes).

```bash
URL=https://vybe-app-production.up.railway.app
curl -sS -o /tmp/beast-health.json -w 'health:%{http_code} %{time_total}s\n' --max-time 8 "$URL/health"
cat /tmp/beast-health.json 2>/dev/null; echo
curl -sS -o /dev/null -w 'audio:%{http_code} %{time_total}s\n' --max-time 8 -I "$URL/api/soundcloud/audio-info"
```

Report:
- `/health` status + latency (green if 200 + <1s, yellow 1–3s, red >3s or non-200)
- `/api/soundcloud/audio-info` reachable (any 2xx/4xx is fine — it proves the audio routes are routing; only 5xx or timeout is bad)
- Note on 256kbps: the backend's default audio quality selector is "best available" for yt-dlp pipelines (see `backend/src/routes/soundcloud.ts:1493`). If the user specifically wants to verify bitrate, add a second probe hitting a known track's `/audio?quality=high` endpoint and inspect the `Content-Type` header.

## Output format

Render a three-row table:

```
┌──────────────┬────────┬─────────────────────────────┐
│ Check        │ Status │ Detail                      │
├──────────────┼────────┼─────────────────────────────┤
│ Git          │ ✅/⚠️   │ branch, N changes           │
│ Xcode build  │ ✅/⚠️   │ age, team, bundle id        │
│ Railway      │ ✅/⚠️   │ /health code, latency       │
└──────────────┴────────┴─────────────────────────────┘
```

Follow with one sentence summarizing whether the repo is ready to push, build, or debug. No trailing narrative.

## Notes

- Read-only. Never stages/commits/pushes git state, never triggers an Xcode build, never writes to the backend.
- If Railway times out, do not retry — just mark red and move on.
- CLAUDE.md for this project says "System manages git and dev server" — this skill only *observes* state, consistent with that rule.
