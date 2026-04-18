# Vybe — Project Manifest

Living map for humans and agents. Update when routes, ownership, or design contracts change.

## Repos layout
| Area | Path | Role |
|------|------|------|
| Mobile app | `mobile/` | Expo Router, React Native, primary product UI |
| Backend | `backend/` | Hono API — `EXPO_PUBLIC_BACKEND_URL` / `BACKEND_URL` |
| Workspace | `CLAUDE.md` | High-level env and agent hints |

## Source of truth — Home
**File:** `mobile/src/app/(app)/(tabs)/index.tsx`

This screen defines the default “Vybe” home experience: greeting, hero modules, discovery rows, and navigation entry points. When adding feeds, carousels, or global entry behavior, **extend or mirror patterns here** so behavior stays consistent.

## Shadow Sexy aesthetic
| Role | Guidance |
|------|-----------|
| Structure | Deep black base, layered depth (blur, gradients, subtle texture) |
| Borders | **Deep navy** — `#0B1726` family |
| Warm accent | **Neon amber** — hero glows, focus rings, subtle radiance |
| Action accent | **Magenta** — primary buttons, pulses, high-intent CTAs |
| Reference implementations | Email OTP (`mobile/src/app/verify-otp.tsx`), onboarding vybe grid (`mobile/src/app/onboarding.tsx`) |

Token file: `mobile/src/theme/vybeTokens.ts` — add named entries for Shadow Sexy as components converge.

## Now Playing — Hero Zoom (Option C)
**File:** `mobile/src/components/NowPlayingSheet.tsx`

- **Mode:** `ANIMATION_MODE === 'zoom'` (Option C: hero-style scale + translate from mini-player origin).
- **Top gap:** `SHEET_TOP_GAP = 80` — open sheet clears the status area by **80px** below the safe top inset.

Do not change these without an explicit product/design ticket.

## Routing reminder
- Expo Router: `mobile/src/app/` — file paths = routes.
- Auth stack vs app stack: `mobile/src/app/_layout.tsx` (`RootLayoutNav`).

## Commit protocol (agents)
1. Never bulk-delete directories without a **prior** commit.
2. After a **successful UI pass**: stage and commit with  
   `git commit -m "AGENT: [Task] State Saved"`.

## Current mission
*Replace this line with the active task (e.g. “Reconstruct genre selection and wire selections to Home filters”).*

**Last updated:** 2026-04-17
