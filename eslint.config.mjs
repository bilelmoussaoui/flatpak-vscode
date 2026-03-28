import { defineConfig } from "eslint/config";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import stylistic from '@stylistic/eslint-plugin'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    files: ["src/**/*.ts"],

    extends: compat.extends(
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
    ),

    plugins: {
      "@typescript-eslint": typescriptEslint,
      "@stylistic": stylistic,
    },

    languageOptions: {
        globals: {
            ...globals.node,
        },

        parser: tsParser,
        ecmaVersion: 5,
        sourceType: "commonjs",

        parserOptions: {
            project: true,
        },
    },

    rules: {
        "@typescript-eslint/naming-convention": "warn",
        "@typescript-eslint/no-unnecessary-condition": "warn",
        "@typescript-eslint/prefer-promise-reject-errors": "warn",
        "@stylistic/semi": ["warn", "never"],
        "@stylistic/quotes": ["warn", "single"],
        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        "no-path-concat": "warn",
    },
}]);
