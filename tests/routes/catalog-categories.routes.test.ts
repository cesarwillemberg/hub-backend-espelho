import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({ get: vi.fn(), createClient: vi.fn() }));
vi.mock("../../src/services/coreApiClient", () => ({
  createCoreApiClient: (options: unknown) => {
    mocks.createClient(options);
    return { get: mocks.get };
  },
}));

let app: FastifyInstance;

beforeAll(async () => {
  const { buildApp } = await import("../../src/app");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/catalog-categories", () => {
  it("encaminha token e tenant, convertendo a resposta para camelCase", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: [
      { id: "11111111-1111-1111-1111-111111111111", key: "hortifruti", name: "Hortifrúti", sort_order: 1, active: false },
    ] });
    const token = app.jwt.sign({ tenant_slug: "mercado-teste" });
    const response = await app.inject({ method: "GET", url: "/api/catalog-categories", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: "11111111-1111-1111-1111-111111111111", key: "hortifruti", name: "Hortifrúti", sortOrder: 1, active: false }]);
    expect(mocks.createClient).toHaveBeenCalledWith({ accessToken: token, tenantSlug: "mercado-teste" });
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/catalog-categories");
  });

  it("preserva a resposta de autenticação do Core API", async () => {
    mocks.get.mockRejectedValue({ status: 401, data: { error: "UNAUTHORIZED", message: "Sessão expirada." } });
    const response = await app.inject({ method: "GET", url: "/api/catalog-categories" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED", message: "Sessão expirada." });
  });

  it("preserva os erros de permissão do Core API", async () => {
    mocks.get.mockRejectedValue({ status: 403, data: { error: "FORBIDDEN", message: "Usuário sem permissão." } });
    const token = app.jwt.sign({ tenant_slug: "mercado-teste" });
    const response = await app.inject({ method: "GET", url: "/api/catalog-categories", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "FORBIDDEN", message: "Usuário sem permissão." });
  });
});
