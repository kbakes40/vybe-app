/**
 * Repo-root Metro: delegate to the real Expo app in `mobile/`.
 * Keeps `npx expo start` / Metro from the monorepo root working when tooling uses cwd=root.
 */
module.exports = require("./mobile/metro.config.js");
