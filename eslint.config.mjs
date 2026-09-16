import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "prisma/**",
      "sentry.*.config.ts",
      "**/*.d.ts",
    ],
  },
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-unused-vars": "off",
      "no-empty": "warn",
      "no-case-declarations": "warn",
      "prefer-const": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["load-tests/**/*.js"],
    languageOptions: {
      globals: {
        __ENV: "readonly",
        __VU: "readonly",
      },
    },
  },
  {
    files: ["public/audio-worklet-processor.js"],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
      },
    },
  },
  {
    // Phase 0 establishes a no-error lint baseline without rewriting the live
    // interview path. These two pre-existing violations are tracked as warnings
    // until T2/T3/T11 touch the files under golden-path coverage.
    files: [
      "components/interview/VoiceInterviewRoom.tsx",
      "hooks/useVoiceInterview.ts",
    ],
    rules: {
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-useless-catch": "warn",
    },
  },
];
