// eslint.config.js (Flat Config)
import eslint from "@eslint/js";
import globals from "globals";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  eslint.configs.recommended,
  {
    env: { browser: true },
    files: ["src/*.js"],
    ignores: ["**/dist/**", "**/node_modules/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  prettierRecommended,
];
