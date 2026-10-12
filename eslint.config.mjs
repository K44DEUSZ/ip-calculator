import js from "@eslint/js";
import parser from "@typescript-eslint/parser";
export default [
  { ignores: ["dist/**", "node_modules/**", ".bot/**"] },
  {
    files: ["**/*.mjs", "src/**/*.ts"],
    languageOptions: {
      parser,
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Uint32Array: "readonly",
        globalThis: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: { ...js.configs.recommended.rules, "no-unused-vars": "off", "no-undef": "off" },
  },
];
