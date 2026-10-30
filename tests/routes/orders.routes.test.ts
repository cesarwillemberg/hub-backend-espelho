import http, { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Testes das rotas de pedidos do BFF Hub.
 *
 * Estratégia: sobe um Core API falso (node:http) em porta efêmera que responde
 * em snake_case (como o Core API real, que usa SNAKE_CASE no Jackson), aponta
 * CORE_API_URL para ele e valida o encaminhamento da listagem (incluindo
 * dateFrom/dateTo), do detalhe pelo identificador, a conversão do contrato de
 * cancelamento (`cancelReason` → `cancel_reason`) e o repasse de erros.
 */

const ORDER_ID = "99999999-9999-9999-9999-999999999999";
const FORBIDDEN_ORDER_ID = "88888888-8888-8888-8888-888888888888";
const INSUFFICIENT_STOCK_ORDER_ID = "77777777-7777-7777-7777-777777777777";
const UNREACHABLE_ORDER_ID = "66666666-6666-6666-6666-666666666666";

interface CapturedRequest {
  method: string;
  path: string;
  query: string;
  body: Record<string, unknown> | null;
}

const captured: CapturedRequest[] = [];

function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk: Buffer | string) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      if (!raw) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        resolve(null);
      }
    });
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleCoreRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  const [path, query = ""] = url.split("?");
  const body = await readBody(req);
  captured.push({ method, path, query, body });

  // Simula Core API fora do ar: derruba a conexão sem responder.
  if (path.startsWith(`/api/hub/orders/${UNREACHABLE_ORDER_ID}`)) {
    req.socket.destroy();
    return;
  }

  // Simula usuário sem permissão (403) vindo do Core API.
  if (path.startsWith(`/api/hub/orders/${FORBIDDEN_ORDER_ID}`)) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "Usuário sem permissão." });
    return;
  }

  // Simula estoque insuficiente ao avançar PENDING → PREPARING.
  if (
    method === "PATCH" &&
    path === `/api/hub/orders/${INSUFFICIENT_STOCK_ORDER_ID}/status`
  ) {
    sendJson(res, 400, {
      timestamp: "2026-10-25T12:00:00Z",
      status: 400,
      error: "INSUFFICIENT_STOCK",
      message: "Estoque insuficiente para preparar o pedido.",
      path: `/api/hub/orders/${INSUFFICIENT_STOCK_ORDER_ID}/status`,
      fields: null,
      details: [
        {
          product_id: "55555555-5555-5555-5555-555555555555",
          product_name: "Arroz Branco 5kg",
          requested_quantity: 10,
          available_quantity: 3,
        },
      ],
    });
    return;
  }

  if (method === "GET" && path === "/api/hub/orders") {
    // Flags de query para simular falhas da listagem no Core API falso
    // (o BFF encaminha todos os query params recebidos).
    if (query.includes("simulate=forbidden")) {
      sendJson(res, 403, { error: "FORBIDDEN", message: "Usuário sem permissão." });
      return;
    }
    if (query.includes("simulate=unreachable")) {
      req.socket.destroy();
      return;
    }

    sendJson(res, 200, {
      content: [
        {
          id: ORDER_ID,
          order_number: "PED-0001",
          customer_name: "Maria Souza",
          customer_email: "maria@email.com",
          customer_phone: "11999999999",
          status: "PENDING",
          payment_status: "PAID",
          items_count: 2,
          subtotal: 50.0,
          discount_total: 5.0,
          delivery_fee: 8.0,
          total: 53.0,
          created_at: "2026-10-01T10:00:00Z",
          updated_at: "2026-10-01T10:00:00Z",
        },
      ],
      page: 0,
      size: 10,
      total_elements: 1,
      total_pages: 1,
    });
    return;
  }

  if (method === "GET" && path === `/api/hub/orders/${ORDER_ID}`) {
    sendJson(res, 200, {
      id: ORDER_ID,
      order_number: "PED-0001",
      customer: {
        name: "Maria Souza",
        email: "maria@email.com",
        phone: "11999999999",
      },
      status: "PENDING",
      payment_status: "PAID",
      items: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          product_id: "55555555-5555-5555-5555-555555555555",
          product_name: "Arroz 5kg",
          sku: "ARR-5KG",
          quantity: 1,
          unit_price: 29.9,
          total_price: 29.9,
        },
      ],
      subtotal: 50.0,
      discount_total: 5.0,
      delivery_fee: 8.0,
      total: 53.0,
      delivery_address: "Rua A, 123",
      notes: "Entregar no portão",
      cancel_reason: null,
      cancelled_at: null,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    });
    return;
  }

  if (method === "PATCH" && path === `/api/hub/orders/${ORDER_ID}/status`) {
    const status = (body as Record<string, unknown> | null)?.status ?? null;
    const cancelReason =
      (body as Record<string, unknown> | null)?.cancel_reason ?? null;
    sendJson(res, 200, {
      id: ORDER_ID,
      order_number: "PED-0001",
      previous_status: "PENDING",
      status,
      cancel_reason: cancelReason,
      cancelled_at: status === "CANCELLED" ? "2026-10-02T10:00:00Z" : null,
      updated_at: "2026-10-02T10:00:00Z",
    });
    return;
  }

  sendJson(res, 404, {
    error: "NOT_FOUND",
    message: `Rota não mapeada no Core API falso: ${method} ${path}`,
  });
}

let coreServer: http.Server;
let app: FastifyInstance;

beforeAll(async () => {
  coreServer = http.createServer((req, res) => {
    void handleCoreRequest(req, res);
  });
  await new Promise<void>((resolve) => {
    coreServer.listen(0, "127.0.0.1", resolve);
  });
  const address = coreServer.address() as AddressInfo;

  // Define a URL do Core API ANTES de importar a aplicação (env é lido no
  // momento da importação e fica em cache).
  process.env.CORE_API_URL = `http://127.0.0.1:${address.port}`;

  const { buildApp } = await import("../../src/app");
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => {
    coreServer.close(() => resolve());
  });
});

function lastCaptured(): CapturedRequest {
  const last = captured.at(-1);
  if (!last) {
    throw new Error("Nenhuma requisição foi encaminhada ao Core API falso.");
  }
  return last;
}

describe("GET /api/orders", () => {
  it("encaminha paginação, busca, status e período e devolve a resposta em camelCase", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orders?page=0&size=10&status=PENDING&search=maria&dateFrom=2026-10-01&dateTo=2026-10-18",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      content: [
        {
          id: ORDER_ID,
          orderNumber: "PED-0001",
          customerName: "Maria Souza",
          customerEmail: "maria@email.com",
          customerPhone: "11999999999",
          status: "PENDING",
          paymentStatus: "PAID",
          itemsCount: 2,
          subtotal: 50.0,
          discountTotal: 5.0,
          deliveryFee: 8.0,
          total: 53.0,
          createdAt: "2026-10-01T10:00:00Z",
          updatedAt: "2026-10-01T10:00:00Z",
        },
      ],
      page: 0,
      size: 10,
      totalElements: 1,
      totalPages: 1,
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("GET");
    expect(forwarded.path).toBe("/api/hub/orders");
    expect(forwarded.query).toContain("page=0");
    expect(forwarded.query).toContain("size=10");
    expect(forwarded.query).toContain("status=PENDING");
    expect(forwarded.query).toContain("search=maria");
    expect(forwarded.query).toContain("dateFrom=2026-10-01");
    expect(forwarded.query).toContain("dateTo=2026-10-18");
  });

  it("repassa erros do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orders?simulate=forbidden",
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "FORBIDDEN",
      message: "Usuário sem permissão.",
    });
  });

  it("retorna 502 quando o Core API está indisponível", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/orders?simulate=unreachable",
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("CORE_API_ERROR");
  });
});

describe("GET /api/orders/:orderId", () => {
  it("encaminha o identificador e devolve o detalhe em camelCase", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orders/${ORDER_ID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ORDER_ID,
      orderNumber: "PED-0001",
      customer: {
        name: "Maria Souza",
        email: "maria@email.com",
        phone: "11999999999",
      },
      status: "PENDING",
      paymentStatus: "PAID",
      items: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          productId: "55555555-5555-5555-5555-555555555555",
          productName: "Arroz 5kg",
          sku: "ARR-5KG",
          quantity: 1,
          unitPrice: 29.9,
          totalPrice: 29.9,
        },
      ],
      subtotal: 50.0,
      discountTotal: 5.0,
      deliveryFee: 8.0,
      total: 53.0,
      deliveryAddress: "Rua A, 123",
      notes: "Entregar no portão",
      cancelReason: null,
      cancelledAt: null,
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("GET");
    expect(forwarded.path).toBe(`/api/hub/orders/${ORDER_ID}`);
  });

  it("repassa erros do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/orders/${FORBIDDEN_ORDER_ID}`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "FORBIDDEN",
      message: "Usuário sem permissão.",
    });
  });
});

describe("PATCH /api/orders/:orderId/status", () => {
  it("valida o corpo, encaminha em snake_case e devolve em camelCase", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${ORDER_ID}/status`,
      payload: { status: "PREPARING" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: ORDER_ID,
      orderNumber: "PED-0001",
      previousStatus: "PENDING",
      status: "PREPARING",
      cancelReason: null,
      cancelledAt: null,
      updatedAt: "2026-10-02T10:00:00Z",
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("PATCH");
    expect(forwarded.path).toBe(`/api/hub/orders/${ORDER_ID}/status`);
    expect(forwarded.body).toEqual({ status: "PREPARING" });
  });

  it("converte cancelReason (camelCase) em cancel_reason (snake_case) no Core API", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${ORDER_ID}/status`,
      payload: {
        status: "CANCELLED",
        cancelReason: "Cliente desistiu da compra",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("CANCELLED");
    expect(body.cancelReason).toBe("Cliente desistiu da compra");

    const forwarded = lastCaptured();
    expect(forwarded.body).toEqual({
      status: "CANCELLED",
      cancel_reason: "Cliente desistiu da compra",
    });
  });

  it("retorna 400 quando o status está ausente", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${ORDER_ID}/status`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message.status).toBeDefined();
  });

  it("retorna 400 quando o status não é um valor permitido", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${ORDER_ID}/status`,
      payload: { status: "WAITING" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("retorna 400 quando o cancelReason excede 1000 caracteres", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${ORDER_ID}/status`,
      payload: { status: "CANCELLED", cancelReason: "a".repeat(1001) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("repassa erro de estoque insuficiente do Core API com status e mensagem", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${INSUFFICIENT_STOCK_ORDER_ID}/status`,
      payload: { status: "PREPARING" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("INSUFFICIENT_STOCK");
    expect(body.message).toBe("Estoque insuficiente para preparar o pedido.");
  });

  it("repassa erros de permissão do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/orders/${FORBIDDEN_ORDER_ID}/status`,
      payload: { status: "PREPARING" },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "FORBIDDEN",
      message: "Usuário sem permissão.",
    });
  });
});
