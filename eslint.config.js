export default [
  {
    ignores: ["dist/**", "node_modules/**", ".pnpm-store/**", "src/**/*.ts", "src/**/*.tsx", "supabase/**"]
  },
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {}
  }
];
