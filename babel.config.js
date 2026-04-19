/**
 * When Babel runs from repo root, `@` must resolve to `mobile/src` (same as mobile/babel + monorepo cwd).
 */
const path = require("path");
const mobileBabel = require("./mobile/babel.config.js");

module.exports = function (api) {
  const config = mobileBabel(api);
  for (const plugin of config.plugins) {
    if (
      Array.isArray(plugin) &&
      plugin[0] === "module-resolver" &&
      plugin[1]?.alias &&
      typeof plugin[1].alias["@"] === "string"
    ) {
      plugin[1].alias["@"] = path.join(__dirname, "mobile", "src");
      break;
    }
  }
  return config;
};
