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
];
