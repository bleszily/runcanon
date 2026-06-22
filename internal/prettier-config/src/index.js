/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  useTabs: false,
  trailingComma: "es5",
  printWidth: 120,
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: ["<BUILTIN_MODULES>", "", "^(?!@skillsmith|\\.|~|@/).+", "", "^@runcanon/(.*)$", "", "^~/", "", "^[./]"],
  importOrderParserPlugins: ["typescript"],
};
