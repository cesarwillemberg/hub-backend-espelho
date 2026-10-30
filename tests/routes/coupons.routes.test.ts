import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(), options: {} as { accessToken?: string; tenantSlug?: string } }));
vi.mock("../../src/services/coreApiClient", () => ({ createCoreApiClient: (options: { accessToken?: string; tenantSlug?: string }) => { mocks.options = options; return mocks; } }));

let app: FastifyInstance;
beforeAll(async () => { const { buildApp } = await import("../../src/app"); app = await buildApp(); });
afterAll(async () => { await app.close(); });
beforeEach(() => vi.clearAllMocks());

const id = "11111111-1111-4111-8111-111111111111";
const payload = { code: "boasvindas10", name: "Boas-vindas", type: "PERCENTAGE", discountValue: 10, usageLimit: 25 };

describe("/api/coupons", () => {
  it("encaminha os filtros e mantém os campos camelCase do Core", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { content: [{ usage_count: 4 }], total_pages: 1 } });
    const response = await app.inject({ method: "GET", url: "/api/coupons?page=1&size=10&active=true&type=PERCENTAGE&search=boas" });
    expect(response.statusCode).toBe(200);
    expect(response.json().content[0].usageCount).toBe(4);
    expect(response.json().totalPages).toBe(1);
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/coupons", { params: { page: 1, size: 10, active: "true", type: "PERCENTAGE", search: "boas" } });
  });

  it("remove somente o prefixo Bearer antes de encaminhar o token", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { content: [] } });
    const response = await app.inject({ method: "GET", url: "/api/coupons", headers: { authorization: "Bearer access-token" } });
    expect(response.statusCode).toBe(200);
    expect(mocks.options.accessToken).toBe("access-token");
  });

  it("normaliza o código e cria sem alterar o contrato camelCase", async () => {
    mocks.post.mockResolvedValue({ status: 201, data: { id, code: "BOASVINDAS10", discount_value: 10 } });
    const response = await app.inject({ method: "POST", url: "/api/coupons", payload });
    expect(response.statusCode).toBe(201);
    expect(response.json().discountValue).toBe(10);
    expect(mocks.post).toHaveBeenCalledWith("/api/hub/coupons", { code: "BOASVINDAS10", name: "Boas-vindas", type: "PERCENTAGE", discount_value: 10, usage_limit: 25 });
  });

  it("aceita e encaminha como null os campos opcionais sem limite", async () => {
    const optionalFields = { minimumOrderValue: null, usageLimit: null, perCustomerLimit: null };
    mocks.post.mockResolvedValue({ status: 201, data: { id } });
    const response = await app.inject({ method: "POST", url: "/api/coupons", payload: { ...payload, discountValue: 2, ...optionalFields } });
    expect(response.statusCode).toBe(201);
    expect(mocks.post).toHaveBeenCalledWith("/api/hub/coupons", {
      code: "BOASVINDAS10", name: "Boas-vindas", type: "PERCENTAGE", discount_value: 2,
      minimum_order_value: null, usage_limit: null, per_customer_limit: null,
    });
  });

  it("rejeita filtros, UUIDs e regras condicionais inválidos sem chamar o Core", async () => {
    const badQuery = await app.inject({ method: "GET", url: "/api/coupons?size=101" });
    const badId = await app.inject({ method: "GET", url: "/api/coupons/not-a-uuid" });
    const badCoupon = await app.inject({ method: "POST", url: "/api/coupons", payload: { ...payload, discountValue: 101 } });
    expect([badQuery.statusCode, badId.statusCode, badCoupon.statusCode]).toEqual([400, 400, 400]);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("encaminha detalhe, edição, status e preserva conflitos do Core", async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { id, per_customer_limit: 1 } });
    mocks.put.mockResolvedValue({ status: 200, data: { id, name: "Atualizado" } });
    mocks.patch.mockResolvedValue({ status: 200, data: { id, active: false } });
    mocks.delete.mockRejectedValue({ status: 409, data: { error: "COUPON_CODE_EXISTS", message: "Código duplicado." } });
    expect((await app.inject({ method: "GET", url: `/api/coupons/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: "PUT", url: `/api/coupons/${id}`, payload })).statusCode).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(`/api/hub/coupons/${id}`, { code: "BOASVINDAS10", name: "Boas-vindas", type: "PERCENTAGE", discount_value: 10, usage_limit: 25 });
    expect((await app.inject({ method: "PATCH", url: `/api/coupons/${id}/status`, payload: { active: false } })).statusCode).toBe(200);
    const deleted = await app.inject({ method: "DELETE", url: `/api/coupons/${id}` });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json().message).toBe("Código duplicado.");
  });

  it("responde 204 sem serializar o corpo vazio do Core", async () => {
    mocks.delete.mockResolvedValue({ status: 204, data: "" });
    const response = await app.inject({ method: "DELETE", url: `/api/coupons/${id}` });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
});
