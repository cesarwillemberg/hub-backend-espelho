import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../src/services/coreApiClient", () => ({
  createCoreApiClient: () => mocks,
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

const validPayload = {
  name: "Oferta de verão",
  type: "PERCENTAGE",
  scope: "PRODUCTS",
  discountValue: 15,
  productIds: ["22222222-2222-4222-8222-222222222222"],
};

describe("/api/promotions", () => {
  it("encaminha os filtros e converte a listagem para camelCase", async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: { content: [{ discount_value: 15, items_count: 2 }], total_elements: 1 },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/promotions?page=2&size=20&active=true&type=PERCENTAGE&scope=PRODUCTS&search=verão",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ content: [{ discountValue: 15, itemsCount: 2 }], totalElements: 1 });
    expect(mocks.get).toHaveBeenCalledWith("/api/hub/promotions", {
      params: { page: "2", size: "20", active: "true", type: "PERCENTAGE", scope: "PRODUCTS", search: "verão" },
    });
  });

  it("converte a criação para snake_case", async () => {
    mocks.post.mockResolvedValue({ status: 201, data: { id: "promo-1", discount_value: 15 } });

    const response = await app.inject({ method: "POST", url: "/api/promotions", payload: validPayload });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "promo-1", discountValue: 15 });
    expect(mocks.post).toHaveBeenCalledWith("/api/hub/promotions", {
      name: "Oferta de verão",
      type: "PERCENTAGE",
      scope: "PRODUCTS",
      discount_value: 15,
      product_ids: validPayload.productIds,
    });
  });

  it("rejeita percentuais acima de 100 e alvos incompatíveis antes do Core API", async () => {
    const percentage = await app.inject({
      method: "POST",
      url: "/api/promotions",
      payload: { ...validPayload, discountValue: 101 },
    });
    const mixedTargets = await app.inject({
      method: "POST",
      url: "/api/promotions",
      payload: {
        ...validPayload,
        categoryIds: ["33333333-3333-4333-8333-333333333333"],
      },
    });

    expect(percentage.statusCode).toBe(400);
    expect(mixedTargets.statusCode).toBe(400);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("atualiza, altera status e propaga falha ao excluir", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    mocks.put.mockResolvedValue({ status: 200, data: { id, name: "Atualizada" } });
    mocks.patch.mockResolvedValue({ status: 200, data: { id, active: false } });
    mocks.delete.mockRejectedValue({ status: 409, data: { error: "PROMOTION_IN_USE", message: "Promoção em uso." } });

    const updated = await app.inject({ method: "PUT", url: `/api/promotions/${id}`, payload: validPayload });
    const status = await app.inject({ method: "PATCH", url: `/api/promotions/${id}/status`, payload: { active: false } });
    const removed = await app.inject({ method: "DELETE", url: `/api/promotions/${id}` });

    expect(updated.statusCode).toBe(200);
    expect(mocks.put).toHaveBeenCalledWith(`/api/hub/promotions/${id}`, expect.objectContaining({ discount_value: 15 }));
    expect(status.statusCode).toBe(200);
    expect(mocks.patch).toHaveBeenCalledWith(`/api/hub/promotions/${id}/status`, { active: false });
    expect(removed.statusCode).toBe(409);
    expect(removed.json()).toEqual({ error: "PROMOTION_IN_USE", message: "Promoção em uso." });
  });
});
