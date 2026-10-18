import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    files: ["app/api/webhook/route.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": ["warn", {
        allowList: ["GITHUB_WEBHOOK_SECRET"],
      }],
    },
  },
  {
    files: ["app/api/callback/route.ts", "tests/onboarding.test.mjs"],
    rules: {
      "turbo/no-undeclared-env-vars": ["warn", {
        allowList: ["GITHUB_CLIENT_SECRET"],
      }],
    },
  },
];
