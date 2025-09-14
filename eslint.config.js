// eslint.config.js (Flat Config)
import js from "@eslint/js";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  js.configs.recommended,
  {
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
    rules: {
      "no-unused-vars": "warn",
    },
  },

  // Run Prettier as an ESLint rule + disable conflicting ESLint rules:
  // Keep these LAST so they can override others.
  prettierRecommended, // enables `prettier/prettier`
  eslintConfigPrettier, // disables conflicting ESLint formatting rules
];
