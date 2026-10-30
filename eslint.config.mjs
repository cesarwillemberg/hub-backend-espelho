// @ts-check
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // O código existente do BFF usa `err: any` nos handlers que repassam
      // erros do Core API; a regra é desligada para manter o estilo atual.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
