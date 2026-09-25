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
    // T0.5 plane boundary (lib/contracts/planes.ts): media-plane code (the
    // voice relay and any avatar integration) never touches the database
    // directly; it acts under a lease granted by the control plane.
    files: ["relay/**/*.ts", "lib/avatar/**/*.ts", "lib/avatar-*/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*", "@/lib/prisma", "**/lib/prisma", "**/lib/prisma.js"],
              message:
                "Media-plane code must not import Prisma. Obtain state through the control plane (see lib/contracts/planes.ts).",
            },
          ],
        },
      ],
    },
  },
  {
    // T0.5 contracts stay vendor-neutral: they receive a Telemetry instance.
    files: ["lib/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/logger", "**/lib/logger", "@sentry/*", "@opentelemetry/*", "pino", "winston", "@prisma/client", "@/lib/prisma", "**/lib/prisma"],
              message: "Contracts must not import logging, tracing or database vendors; depend on lib/contracts/telemetry.",
            },
          ],
        },
      ],
    },
  },
  {
    // T1: one CSRF strategy. Browser code must call our API through
    // lib/api-client (apiFetch or api.*), which adds x-csrf-token on writes.
    // A raw fetch("/api/…") silently 403s on every mutation.
    files: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.ts", "components/**/*.tsx", "hooks/**/*.ts", "contexts/**/*.tsx"],
    ignores: ["app/api/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.type="Identifier"][callee.name="fetch"] > Literal.arguments[value=/^\\/api(\\/|$|\\?)/]',
          message: "Use apiFetch or api.* from @/lib/api-client for /api requests (adds the CSRF header on writes).",
        },
        {
          selector: 'CallExpression[callee.type="Identifier"][callee.name="fetch"] > TemplateLiteral.arguments > TemplateElement:first-child[value.raw=/^\\/api(\\/|$|\\?)/]',
          message: "Use apiFetch or api.* from @/lib/api-client for /api requests (adds the CSRF header on writes).",
        },
      ],
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
