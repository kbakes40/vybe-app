# AGENTS.md — Vybe Mobile Source of Truth

> **Purpose.** Keep every AI agent (Cursor, Claude, etc.) from re-inventing code that already exists.
> Before you write anything new, **read this file end-to-end**. If the feature you're about to build
> appears in "Core Services" or "UI Primitives," extend it — don't duplicate it.
>
> Last verified against the tree on: 2026-04-20. Update as things move.

---

## Project Context

Vybe is a React Native / Expo music client. Stack:

- **Expo SDK 53** (React Native 0.79.6, `bun`, not `npm`)
- **Expo Router** file-based routing under `src/app/`
- **Zustand** for local/app state, **React Query** for server state
- **NativeWind + Tailwind v3** for styling
- **expo-audio** (SDK 53 replacement for expo-av) for the primary playback path in `playerStore`
- **Better Auth** (backend) + **@better-auth/expo** (mobile) for auth
- **Backend** lives in `../backend/` (Hono + Prisma, deployed to Railway as `vybe-app-production`)

> _Brand / "Sexy Fire" manifesto:_ **TODO — owner to fill this in.** Leaving the slot so it ships with
> the doc; do not invent brand voice.

Also see the top-level `mobile/CLAUDE.md` for forbidden files, routing conventions, and the styling
rulebook. This file layers on top of that one.

---

## The Fleet — Primary Test Targets

| Device | Model | Role |
|---|---|---|
| **Louis** | iPhone 14 Pro Max | Primary test device. Dynamic Island. |
| **Steve Jobs' Left Toe** | iPhone 15 Pro Max | Secondary test device. Dynamic Island. |

Both devices use iOS 17+ with Dynamic Island. Both run release mode from Xcode (EAS build history is
empty; installs are direct). Use `BuildInfoLine` at the bottom of the Social feed to verify both
phones are on the same git commit + bundle time.

---

## Canonical File Map

**If you're about to create any of these, stop.** Extend the existing file.

### Playback

| Feature | File | Notes |
|---|---|---|
| Primary player store (expo-audio) | `src/stores/playerStore.ts` | Uses `createAudioPlayer` + `addListener(PLAYBACK_STATUS_UPDATE)`. Do NOT re-import `expo-av` here. |
| Playback orchestrator (queues, skip, resolve) | `src/stores/playbackController.ts` | ~2240 lines. This is the "brains." Extend here, don't fork. |
| Playback helpers (YouTube resolve, SoundCloud URLs, error classifier) | `src/lib/audio/playbackService.ts` | |
| Alternate controller (legacy, kept for compat) | `src/lib/audio/PlaybackController.ts` | Don't touch unless you know why. |

### Sources

| Source | File(s) | Notes |
|---|---|---|
| **Navidrome / Subsonic** | `src/lib/subsonic/subsonicClient.ts` | Full client: `ensureSession`, `pingServer`, `subsonicGet<T>`, `buildStreamUrl`, `getCoverArtUrl`, `coverArtUrl` (sync), `getNewestAlbums`, `getRandomSongs`, `getLibraryFeed`, `normalizeSubsonicTrack`, `isLossless`. |
| Navidrome connection state | `src/stores/subsonicStore.ts` | Zustand store. `status: 'unknown' \| 'unconfigured' \| 'connecting' \| 'connected' \| 'offline'`. Logs `[VAULT_STATUS]: …` on every ping. |
| SoundCloud | `src/lib/audio/playbackService.ts` (helpers) + backend routes | Client creds live on backend. Never embed `client_id` in mobile. |
| YouTube / YouTube Music | `src/lib/youtubeResolvePreloadCache.ts` + `playbackService.ts` | Backend resolves; mobile calls `/api/youtube/audio/:id`. |
| Radio-Browser live stations | `src/lib/radioBrowserService.ts` | `getTopStations`, `readTopStationsCache`. |
| Global Radio (NTS, FIP, HÖR, curated) | `src/lib/GlobalRadioClient.ts` | Uses `GLOBAL_RADIO_STATIONS`, `GLOBAL_RADIO_STATION_ORDER`, `GLOBAL_EXPANSION_STATION_ORDER`. |

### UI Primitives

| Primitive | File |
|---|---|
| **Pill** (Dynamic Island) | `src/components/DynamicIsland.tsx` |
| Dynamic Island chrome | `src/components/DynamicIslandChrome.tsx`, `src/components/DynamicIslandTopFade.tsx` |
| Pill ↔ lock-screen sync | `src/components/PillLockSync.tsx` |
| Dock / tab bar | `src/components/navigation/ShadowMachinedTabBar.tsx` + icons in `src/components/navigation/ShadowTabBarIcons.tsx` |
| Post composer | `src/components/social/PostComposer.tsx` |
| Build stamp (version + commit + branch + time) | `src/components/BuildInfoLine.tsx` |
| Library status badge | `src/components/library/LibraryConnectionBadge.tsx` |
| Library Radio section | `src/components/library/LibraryRadioSection.tsx` |
| Library Navidrome section | `src/components/library/LibraryNavidromeSection.tsx` |
| Discover source rail (Navidrome + SoundCloud chips) | `src/components/discover/DiscoverSourceRail.tsx` |

### Native (iOS)

| Thing | File |
|---|---|
| Now Playing / Dynamic Island native module | `mobile/ios/vibecode/VybeNowPlayingActivityModule.swift` + `.m` |
| Download widget | `mobile/ios/VybeDownloadWidget/` |
| Info.plist (URL schemes, background modes, Live Activities) | `mobile/ios/vibecode/Info.plist` |

> **Never run `npx expo prebuild --clean`.** It regenerates `ios/` from `app.json`, which doesn't
> declare these native modules. The Live Activity module, widget, Google OAuth URL scheme, and
> audio background mode would all be deleted.

### Scripts & Build

| Thing | File |
|---|---|
| Build-info generator (git commit + timestamp → `src/constants/buildInfo.generated.ts`) | `mobile/scripts/write-build-info.mjs` |
| npm `prestart`, `preios`, `preandroid` hooks | `mobile/package.json` |

---

## Naming Protocols

**Canonical constants.** These live in `src/constants/machinedTheme.ts`. Do not invent aliases.

| Name | Value | Meaning |
|---|---|---|
| `DOCK_CYAN` | `#00E5FF` | Bottom Doc hairline, active tab, Vybe Discover glow. |
| `VIBRANT_BLUE` | `#00E5FF` | Same token, aliased. Use `DOCK_CYAN` in new code unless you're matching an existing `VIBRANT_BLUE` block. |
| `OLED_BLACK` | `#000000` | |
| `GRAPHITE_GREY` | `#666666` | Muted body text. |

**Canonical track source values.** `TrackSource` union in `src/types/music.ts`:

```
'vybe' | 'youtube' | 'youtube_music' | 'soundcloud' | 'freepd' | 'radio_paradise'
| 'global_radio' | 'navidrome' | 'archive'
```

Do not add new source values without updating this union first.

**Canonical source label on Navidrome cards:** `LIBRARY` (not `VAULT` — the tab was renamed).

---

## Environment Variables

| Var | Used In | Required For |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | mobile | All app API calls |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | mobile | Google Sign-In |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | mobile | Google Sign-In |
| `EXPO_PUBLIC_NAVIDROME_URL` | mobile | Library tab (Subsonic) |
| `EXPO_PUBLIC_NAVIDROME_USER` | mobile | Library tab (Subsonic) |
| `EXPO_PUBLIC_NAVIDROME_PASSWORD` | mobile | Library tab (Subsonic) |

> `EXPO_PUBLIC_*` bakes into the JS bundle. Fine for personal dev builds; not ship-safe for secrets.
> TODO: move Navidrome credentials to `expo-secure-store` behind a Library settings screen.

---

## Architectural Rules

1. **Search before creating.** Before creating any new audio service, store, or UI component, grep
   `src/lib/` and `src/components/` for similar logic. Rename or add props to the existing one.

2. **Never re-bootstrap Navidrome auth.** The salted-token flow (`ensureSession` → `buildParams`
   → `subsonicGet<T>`) is in `src/lib/subsonic/subsonicClient.ts`. Use `pingServer()` for
   connection tests; drive UI via `useSubsonicStore.testConnection()`. Do not invent
   `generateAuthParams` or `testVaultConnection` wrappers.

3. **Don't migrate `expo-av` → `expo-audio` outside `playerStore.ts`.** Six other files still use
   `expo-av` on purpose. The partial migration is deliberate. A full migration requires a
   dedicated task driven by real crash logs.

4. **Don't install new packages** except `@expo-google-fonts/*` or pure JS helpers like `lodash` /
   `dayjs`. See `mobile/CLAUDE.md`. If you think you need one, propose it with reasoning first.

5. **Never run destructive Expo commands** (`npx expo prebuild --clean`, `expo prebuild --platform ios
   --clean`). They delete hand-written native code under `ios/`. See the Native table above.

6. **Never edit `app.json`, `babel.config.js`, `metro.config.js`, `tsconfig.json`, `nativewind-env.d.ts`,
   or `patches/` without user authorization.** Listed in `mobile/CLAUDE.md` as `<forbidden_files>`.

7. **For UI changes, verify in-browser or on-device before reporting done.** Type-checking only
   proves the code compiles, not that the feature works.

8. **Keep `useEffect` deps honest.** Don't put unstable refs in deps just to silence lint — root-
   cause instability (usually a new object from an unmemoized selector). The composer shake bug
   (fixed in `PostComposer.tsx`) was caused by `currentTrack` in the dep array triggering a reset
   during every playback tick. Use a ref for latest-value reads in open-once effects.

---

## Anti-Patterns — Things Agents Have Hallucinated (Do Not Reintroduce)

These have been proposed in prior prompts and rejected. If a future prompt asks for one of them,
push back with the canonical replacement:

| Hallucinated thing | Reality |
|---|---|
| `PILL_CYAN` | Doesn't exist. Use `DOCK_CYAN` (`#00E5FF`). |
| `src/lib/subsonicService.ts` | The canonical file is `src/lib/subsonic/subsonicClient.ts`. Don't create a second one. |
| `generateAuthParams` / `fetchFromVault` / `testVaultConnection` | Use `ensureSession` / `subsonicGet<T>` / `pingServer` / `useSubsonicStore.testConnection`. |
| `EXPO_PUBLIC_NAVIDROME_TOKEN` (precomputed MD5) | Subsonic requires a fresh salt per session — a static token can't work. Use `EXPO_PUBLIC_NAVIDROME_USER` + `EXPO_PUBLIC_NAVIDROME_PASSWORD`. |
| Install `js-md5` | We already have MD5 via `expo-crypto` (native-accelerated). Don't install a JS MD5 to do what the native one already does. |
| "Pro Max requires a -8pt offset for Dynamic Island alignment" | Meaningless. Pro Max renders at the same 3× logical density as other iPhones. If a specific UI element needs a margin tweak, the agent must ask what it's aligning to, not invent a hardware invariant. |
| "`expo-av` was removed in SDK 55 / SDK 54" | On SDK 53, `expo-av` is fully supported. The deprecation banner is informational. Migration to `expo-audio` is optional on SDK 53 and currently partial on purpose (only `playerStore.ts`). |
| "Bypass SoundCloud's metadata mapper for Navidrome" | New sources with their own `TrackSource` value don't go through the SoundCloud mapper. Nothing to bypass. |
| Inject library tracks into Discover `safeMasonryData` at fixed indices | The user has explicitly asked for Library content NOT to pollute Discover. If re-introducing, splice at semantic boundaries, not raw indices. |
| Run `npx expo prebuild --clean` | Destroys hand-written native Swift modules. See Native table. |

---

## Coordination With Backend

- All app routes return `{ data: ... }`. The `api` helper auto-unwraps. See `../backend/CLAUDE.md`.
- Never use `localhost` for backend calls on mobile — use `process.env.EXPO_PUBLIC_BACKEND_URL`.
- CORS / trustedOrigins use string wildcards, not RegExp.
- Test backend endpoints with cURL against `$BACKEND_URL`, not `localhost`.

---

## Before You Write Code

1. Read this file.
2. Grep the target directory for existing logic (`rg -l 'SimilarFeature' src/`).
3. If the feature exists under a different name, extend it.
4. If it doesn't exist, add it to the **Canonical File Map** section of this doc in the same PR.
5. If a prompt tells you to invent something on the **Anti-Patterns** list, push back and point at
   the canonical replacement.

---

## Owner TODOs

- [ ] Fill in **Project Context → "Sexy Fire" aesthetic** (brand voice, design language, spec docs).
- [ ] Add a **SecureStore-backed Library settings screen** so Navidrome credentials don't live in
      `EXPO_PUBLIC_*` env vars.
- [ ] Decide whether to merge `src/stores/playerStore.ts` and `src/stores/playbackController.ts`
      (currently both exist; `playbackController` is the richer one).
- [ ] Delete `src/stores/usePlaybackStore.ts` if it's truly dead (check imports first).
