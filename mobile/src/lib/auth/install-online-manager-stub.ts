// Side-effect module: installs a no-op OnlineManager on better-auth's global
// symbol BEFORE @better-auth/expo loads. Must be imported before any code that
// transitively imports auth-client.ts.
//
// Why this exists: @better-auth/expo's ExpoOnlineManager.setup() calls
// `await import("expo-network")`. Metro compiles that to
// `require(asyncRequireDep, "@expo/metro-config/build/async-require.js")(id)`.
// The Vibecode metro.config.js has a rule that stubs out anything under
// `@expo/metro-config` when imported from `@better-auth/expo` — which
// unintentionally catches the async-require runtime helper. The stub returns
// `{}`, so the runtime call crashes with
//   "require(_dependencyMap[N], '...async-require.js') is not a function (it is Object)"
//
// Pre-installing our own manager means better-auth's `if (!globalThis[kOnlineManager])`
// check fails, our instance wins, and the broken dynamic-import code path
// never runs.

const kOnlineManager = Symbol.for("better-auth:online-manager");
const g = globalThis as any;
if (!g[kOnlineManager]) {
  const stub = {
    listeners: new Set<(online: boolean) => void>(),
    isOnline: true,
    subscribe(listener: (online: boolean) => void) {
      stub.listeners.add(listener);
      return () => {
        stub.listeners.delete(listener);
      };
    },
    setOnline(online: boolean) {
      if (stub.isOnline === online) return;
      stub.isOnline = online;
      stub.listeners.forEach((l) => l(online));
    },
    setup() {
      return () => {};
    },
  };
  g[kOnlineManager] = stub;
}
