// Variáveis de ambiente mínimas para construir a aplicação Fastify em testes.
// A URL do Core API é definida pelos próprios testes (servidor falso em porta
// efêmera) antes da importação da aplicação.
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "segredo-de-teste-somente-para-vitest-32chars";
process.env.NODE_ENV = "test";
