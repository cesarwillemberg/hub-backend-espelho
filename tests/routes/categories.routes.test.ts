import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), createClient: vi.fn() }));
vi.mock("../../src/services/coreApiClient", () => ({
  createCoreApiClient: (options: unknown) => {
    mocks.createClient(options);
    return { get: mocks.get, post: mocks.post, put: mocks.put, delete: mocks.delete };
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

beforeEach(() => vi.clearAllMocks());

describe("/api/categories", () => {
  it("encaminha paginação e filtros da listagem", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { content: [], page: 1, size: 10, total_elements: 0, total_pages: 0 } });
    const response = await app.inject({ method: "GET", url: "/api/categories?page=1&size=10&search=mercearia&active=false" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ content: [], page: 1, size: 10, totalElements: 0, totalPages: 0 });
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/categories", { params: { page: "1", size: "10", search: "mercearia", active: "false" } });
  });

  it("valida e encaminha criação em snake_case, aceitando opcionais nulos", async () => {
    mocks.post.mockResolvedValue({ status: 201, data: { id: "cat-1", name: "Mercearia", description: null, active: true, canonical_category: null } });
    const response = await app.inject({ method: "POST", url: "/api/categories", payload: { name: "Mercearia", description: null, canonicalKey: null, active: true } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "cat-1", name: "Mercearia", description: null, active: true, canonicalCategory: null });
    expect(mocks.post).toHaveBeenCalledWith("/api/hub/categories", { name: "Mercearia", description: null, canonical_key: null, active: true });
  });

  it("rejeita nome inválido antes de chamar o Core API", async () => {
    const response = await app.inject({ method: "POST", url: "/api/categories", payload: { name: "" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("encaminha PUT completo e DELETE preservando os erros do Core API", async () => {
    mocks.put.mockResolvedValue({ status: 200, data: { id: "cat-1", name: "Mercearia 2", active: true } });
    const updated = await app.inject({ method: "PUT", url: "/api/categories/cat-1", payload: { name: "Mercearia 2", description: "", canonicalKey: null, active: true } });
    expect(updated.statusCode).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith("/api/hub/categories/cat-1", { name: "Mercearia 2", description: "", canonical_key: null, active: true });

    mocks.delete.mockRejectedValue({ status: 403, data: { error: "FORBIDDEN", message: "Sem permissão." } });
    const removed = await app.inject({ method: "DELETE", url: "/api/categories/cat-1" });
    expect(removed.statusCode).toBe(403);
    expect(removed.json()).toEqual({ error: "FORBIDDEN", message: "Sem permissão." });
  });
});
