import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
afterAll(async () => app.close());
beforeEach(() => { mocks.get.mockReset(); mocks.createClient.mockClear(); });

describe("/api/activity-logs", () => {
  it("forwards filters, pagination defaults, token and tenant", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { content: [], page: 0, size: 20, total_elements: 0, total_pages: 0 } });
    const token = app.jwt.sign({ tenant_slug: "mercado-teste" });
    const response = await app.inject({
      method: "GET",
      url: "/api/activity-logs?action=PRODUCT_UPDATED&entity=PRODUCT&entityId=11111111-1111-1111-1111-111111111111&performedByUserId=22222222-2222-2222-2222-222222222222&dateFrom=2026-10-01&dateTo=2026-10-25&search=estoque",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/activity-logs", { params: {
      page: 0, size: 20, action: "PRODUCT_UPDATED", entity: "PRODUCT",
      entityId: "11111111-1111-1111-1111-111111111111",
      performedByUserId: "22222222-2222-2222-2222-222222222222",
      dateFrom: "2026-10-01", dateTo: "2026-10-25", search: "estoque",
    } });
    expect(mocks.createClient).toHaveBeenCalledWith({ accessToken: token, tenantSlug: "mercado-teste" });
    expect(response.body).not.toContain(token);
  });

  it("uses page and size defaults and validates pagination, UUIDs and dates", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: {} });
    await app.inject({ method: "GET", url: "/api/activity-logs" });
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/activity-logs", { params: { page: 0, size: 20 } });
    for (const url of ["?page=-1", "?size=101", "?entityId=nope", "?dateFrom=2026-02-30"]) {
      const response = await app.inject({ method: "GET", url: `/api/activity-logs${url}` });
      expect(response.statusCode).toBe(400);
    }
  });

  it("fetches details by UUID and rejects malformed IDs", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { ip_address: "127.0.0.1" } });
    const id = "11111111-1111-1111-1111-111111111111";
    const response = await app.inject({ method: "GET", url: `/api/activity-logs/${id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ipAddress: "127.0.0.1" });
    expect(mocks.get).toHaveBeenCalledWith(`/api/hub/activity-logs/${id}`);
    expect((await app.inject({ method: "GET", url: "/api/activity-logs/not-a-uuid" })).statusCode).toBe(400);
  });

  it.each([401, 403, 404])("preserves Core API status %i", async (status) => {
    mocks.get.mockRejectedValue({ status, data: { error: "CORE_ERROR", message: "Falha" } });
    const response = await app.inject({ method: "GET", url: "/api/activity-logs" });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({ error: "CORE_ERROR", message: "Falha" });
  });

  it("returns 502 when the Core API is unavailable", async () => {
    mocks.get.mockRejectedValue({ code: "CORE_API_UNAVAILABLE", message: "Core indisponível" });
    const response = await app.inject({ method: "GET", url: "/api/activity-logs" });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: "CORE_API_UNAVAILABLE", message: "Core indisponível" });
  });
});
