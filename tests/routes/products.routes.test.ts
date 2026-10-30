import http, { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Testes das rotas de produtos do BFF Hub.
 *
 * Estratégia: sobe um Core API falso (node:http) em porta efêmera que responde
 * em snake_case (como o Core API real, que usa SNAKE_CASE no Jackson), aponta
 * CORE_API_URL para ele e valida o encaminhamento das rotas novas
 * (stock-movements e image), a validação dos corpos e o repasse de erros.
 */

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const FORBIDDEN_PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const UNREACHABLE_PRODUCT_ID = "33333333-3333-3333-3333-333333333333";

const UPLOAD_URL = "https://storage.example.com/upload?sig=abc";
const PUBLIC_URL = "https://cdn.example.com/produtos/foto.png";
const IMAGE_URL = "https://cdn.example.com/produtos/foto.png";

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
  if (path.startsWith(`/api/hub/products/${UNREACHABLE_PRODUCT_ID}`)) {
    req.socket.destroy();
    return;
  }

  // Simula usuário sem permissão (403) vindo do Core API.
  if (path.startsWith(`/api/hub/products/${FORBIDDEN_PRODUCT_ID}`)) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "Usuário sem permissão." });
    return;
  }

  if (
    method === "GET" &&
    path === `/api/hub/products/${PRODUCT_ID}/stock-movements`
  ) {
    sendJson(res, 200, {
      content: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          operation: "INCREMENT",
          previous_quantity: 2,
          changed_quantity: 10,
          new_quantity: 12,
          reason: "Recebimento de mercadoria",
          performed_by_user_id: "55555555-5555-5555-5555-555555555555",
          created_at: "2026-10-01T12:00:00Z",
        },
      ],
      page: 1,
      size: 5,
      total_elements: 7,
      total_pages: 2,
    });
    return;
  }

  if (
    method === "POST" &&
    path === `/api/hub/products/${PRODUCT_ID}/image-upload-url`
  ) {
    sendJson(res, 200, {
      upload_url: UPLOAD_URL,
      public_url: PUBLIC_URL,
      expires_in: 300,
    });
    return;
  }

  if (method === "PATCH" && path === `/api/hub/products/${PRODUCT_ID}/image`) {
    sendJson(res, 200, {
      id: PRODUCT_ID,
      name: "Arroz Branco 5kg",
      image_url: (body as Record<string, unknown> | null)?.image_url ?? null,
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

describe("GET /api/products/:productId/stock-movements", () => {
  it("encaminha a paginação e devolve a resposta em camelCase", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/products/${PRODUCT_ID}/stock-movements?page=1&size=5`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      content: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          operation: "INCREMENT",
          previousQuantity: 2,
          changedQuantity: 10,
          newQuantity: 12,
          reason: "Recebimento de mercadoria",
          performedByUserId: "55555555-5555-5555-5555-555555555555",
          createdAt: "2026-10-01T12:00:00Z",
        },
      ],
      page: 1,
      size: 5,
      totalElements: 7,
      totalPages: 2,
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("GET");
    expect(forwarded.path).toBe(
      `/api/hub/products/${PRODUCT_ID}/stock-movements`,
    );
    expect(forwarded.query).toContain("page=1");
    expect(forwarded.query).toContain("size=5");
  });

  it("repassa erros do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/products/${FORBIDDEN_PRODUCT_ID}/stock-movements`,
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
      url: `/api/products/${UNREACHABLE_PRODUCT_ID}/stock-movements`,
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("CORE_API_ERROR");
  });
});

describe("PATCH /api/products/:productId/image", () => {
  it("valida o corpo, encaminha em snake_case e devolve em camelCase", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}/image`,
      payload: { imageUrl: IMAGE_URL },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: PRODUCT_ID,
      name: "Arroz Branco 5kg",
      imageUrl: IMAGE_URL,
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("PATCH");
    expect(forwarded.path).toBe(`/api/hub/products/${PRODUCT_ID}/image`);
    expect(forwarded.body).toEqual({ image_url: IMAGE_URL });
  });

  it("retorna 400 quando o imageUrl está ausente", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}/image`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message.imageUrl).toBeDefined();
  });

  it("retorna 400 quando o imageUrl está vazio", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}/image`,
      payload: { imageUrl: "" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("retorna 400 quando o imageUrl excede 1000 caracteres", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${PRODUCT_ID}/image`,
      payload: { imageUrl: `https://cdn.example.com/${"a".repeat(1001)}` },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("repassa erros do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/products/${FORBIDDEN_PRODUCT_ID}/image`,
      payload: { imageUrl: IMAGE_URL },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "FORBIDDEN",
      message: "Usuário sem permissão.",
    });
  });
});

describe("POST /api/products/:productId/image-upload-url", () => {
  it("valida o corpo, encaminha em snake_case e devolve em camelCase", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/products/${PRODUCT_ID}/image-upload-url`,
      payload: { fileName: "foto.png", contentType: "image/png" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      uploadUrl: UPLOAD_URL,
      publicUrl: PUBLIC_URL,
      expiresIn: 300,
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("POST");
    expect(forwarded.path).toBe(
      `/api/hub/products/${PRODUCT_ID}/image-upload-url`,
    );
    expect(forwarded.body).toEqual({
      file_name: "foto.png",
      content_type: "image/png",
    });
  });

  it("retorna 400 quando o fileName está vazio", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/products/${PRODUCT_ID}/image-upload-url`,
      payload: { fileName: "", contentType: "image/png" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message.fileName).toBeDefined();
  });

  it("retorna 400 quando o contentType está ausente", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/products/${PRODUCT_ID}/image-upload-url`,
      payload: { fileName: "foto.png" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(body.message.contentType).toBeDefined();
  });

  it("retorna 400 quando o fileName excede 255 caracteres", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/products/${PRODUCT_ID}/image-upload-url`,
      payload: { fileName: `${"f".repeat(256)}.png`, contentType: "image/png" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});
