import http, { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

/**
 * Testes da rota de permissões por mercado do BFF Hub.
 *
 * Estratégia: sobe um Core API falso (node:http) em porta efêmera que responde
 * em snake_case (como o Core API real, que usa SNAKE_CASE no Jackson), aponta
 * CORE_API_URL para ele e valida o encaminhamento do identificador, do query
 * `id_market` e o repasse de erros.
 */

const USER_ID = "44444444-4444-4444-4444-444444444444";
const MARKET_ID = "11111111-1111-1111-1111-111111111111";
const FORBIDDEN_USER_ID = "22222222-2222-2222-2222-222222222222";

interface CapturedRequest {
  method: string;
  path: string;
  query: string;
}

const captured: CapturedRequest[] = [];

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
  captured.push({ method, path, query });

  // Simula usuário sem users:manage (403) vindo do Core API.
  if (path === `/api/hub/users/${FORBIDDEN_USER_ID}/permissions-by-market`) {
    sendJson(res, 403, { error: "FORBIDDEN", message: "Usuário sem permissão." });
    return;
  }

  if (method === "GET" && path === `/api/hub/users/${USER_ID}/permissions-by-market`) {
    sendJson(res, 200, {
      user_id: USER_ID,
      markets: [
        {
          market_id: MARKET_ID,
          market_name: "Mercado Central",
          tenant_slug: "mercado-central",
          permissions: ["orders:read", "orders:update", "orders:cancel"],
        },
      ],
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

describe("GET /api/users/:userId/permissions-by-market", () => {
  it("encaminha o identificador e o id_market, devolvendo a resposta em camelCase", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/users/${USER_ID}/permissions-by-market?id_market=${MARKET_ID}`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: USER_ID,
      markets: [
        {
          marketId: MARKET_ID,
          marketName: "Mercado Central",
          tenantSlug: "mercado-central",
          permissions: ["orders:read", "orders:update", "orders:cancel"],
        },
      ],
    });

    const forwarded = lastCaptured();
    expect(forwarded.method).toBe("GET");
    expect(forwarded.path).toBe(
      `/api/hub/users/${USER_ID}/permissions-by-market`,
    );
    expect(forwarded.query).toContain(`id_market=${MARKET_ID}`);
  });

  it("repassa erros do Core API mantendo status e formato", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/users/${FORBIDDEN_USER_ID}/permissions-by-market?id_market=${MARKET_ID}`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "FORBIDDEN",
      message: "Usuário sem permissão.",
    });
  });
});
