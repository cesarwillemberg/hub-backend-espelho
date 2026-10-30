import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const state = vi.hoisted(() => ({ lastCall: null as unknown, clients: [] as Array<{ options: unknown; get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }> }));
vi.mock("../../src/services/coreApiClient", () => ({
  createCoreApiClient: (options: unknown) => {
    const client = {
      get: vi.fn(async (path: string, config?: unknown) => { state.lastCall = { method: "GET", path, config }; return { status: 200, data: { content: [{ id: "user-1", name: "Ana", created_at: "2026-01-01" }], page: 2, size: 10, total_elements: 1, total_pages: 1 } }; }),
      post: vi.fn(async (path: string, body?: unknown) => { state.lastCall = { method: "POST", path, body }; return { status: 201, data: { id: "user-1", role_ids: ["role-1"] } }; }),
      patch: vi.fn(async (path: string, body?: unknown) => { state.lastCall = { method: "PATCH", path, body }; return { status: 200, data: { id: "user-1", active: false } }; }),
      delete: vi.fn(async (path: string) => { state.lastCall = { method: "DELETE", path }; return { status: 204, data: "" }; }),
    };
    state.clients.push({ options, ...client });
    return client;
  },
}));

import { buildApp } from "../../src/app";
let app: FastifyInstance;
beforeEach(async () => {
  state.clients.length = 0;
  process.env.JWT_SECRET ??= "users-management-test-secret";
  app = await buildApp();
});
afterEach(async () => { await app.close(); });

function auth() {
  return { authorization: `Bearer ${app.jwt.sign({ tenant_slug: "market-one" })}` };
}

describe("user management BFF routes", () => {
  it("encaminha filtros, token e tenant e converte a página para camelCase", async () => {
    const res = await app.inject({ method: "GET", url: "/api/users?page=2&size=10&search=ana&active=true", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ content: [{ createdAt: "2026-01-01" }], totalElements: 1, totalPages: 1 });
    expect(state.clients[0].options).toMatchObject({ accessToken: expect.any(String), tenantSlug: "market-one" });
    expect(state.lastCall).toMatchObject({ method: "GET", path: "/api/hub/users", config: { params: { page: "2", size: "10", search: "ana", active: "true" } } });
  });

  it("converte o body do cadastro para snake_case e preserva 201", async () => {
    const res = await app.inject({ method: "POST", url: "/api/users", headers: auth(), payload: { name: "Ana", email: "ana@example.com", password: "senha1234", roleIds: ["role-1"] } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: "user-1", roleIds: ["role-1"] });
    expect(state.lastCall).toEqual({ method: "POST", path: "/api/hub/users", body: { name: "Ana", email: "ana@example.com", password: "senha1234", role_ids: ["role-1"] } });
  });

  it("repassa o 204 da remoção sem body", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/users/user-1", headers: auth() });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe("");
    expect(state.lastCall).toEqual({ method: "DELETE", path: "/api/hub/users/user-1" });
  });
});

