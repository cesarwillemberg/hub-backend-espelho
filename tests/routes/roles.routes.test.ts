import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const state = vi.hoisted(() => ({ options: null as unknown, call: null as unknown }));
vi.mock("../../src/services/coreApiClient", () => ({
  createCoreApiClient: (options: unknown) => {
    state.options = options;
    return { get: vi.fn(async (path: string, config?: unknown) => { state.call = { path, config }; return { status: 200, data: { roles: [{ id: "role-1", name: "ADMIN", system_role: false }] } }; }) };
  },
}));

import { buildApp } from "../../src/app";
let app: FastifyInstance;
beforeEach(async () => { process.env.JWT_SECRET ??= "roles-test-secret"; state.options = null; state.call = null; app = await buildApp(); });
afterEach(async () => { await app.close(); });

describe("GET /api/roles", () => {
  it("solicita roles sem permissões e usa o tenant da sessão", async () => {
    const token = app.jwt.sign({ tenant_slug: "market-one" });
    const res = await app.inject({ method: "GET", url: "/api/roles", headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ roles: [{ id: "role-1", name: "ADMIN", systemRole: false }] });
    expect(state.options).toMatchObject({ accessToken: token, tenantSlug: "market-one" });
    expect(state.call).toEqual({ path: "/api/hub/roles", config: { params: { includePermissions: false } } });
  });
});
