import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        process: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        HTMLElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLInputElement: "readonly",
        KeyboardEvent: "readonly",
        MouseEvent: "readonly",
        MediaQueryListEvent: "readonly",
        MediaQueryList: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        File: "readonly",
        DataTransfer: "readonly",
        DataTransferItem: "readonly",
        FileSystemEntry: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Uint8Array: "readonly",
        TextEncoder: "readonly",
        // React JSX runtime
        React: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      react: react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      // TanStack Virtual 和 React Hook Form 与 React Compiler 存在已知兼容性问题
      "react-hooks/incompatible-library": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  prettier,
  {
    ignores: ["node_modules/", "dist/", "src-tauri/target/"],
  },
];
