import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { z } from "zod";
import { toSnakeCaseKeys, toCamelCaseKeys } from "../utils/caseConverter";

/**
 * Contrato da atualização de status (frontend ↔ BFF): camelCase.
 *
 * O motivo do cancelamento é enviado pelo frontend como `cancelReason` e
 * convertido para `cancel_reason` (snake_case) antes de chamar o Core API,
 * que espera JSON em snake_case. `cancelReason` é opcional aqui (espelhando o
 * DTO do Core API), mas o Core exige o motivo quando `status` é `CANCELLED`,
 * respondendo `400 CANCEL_REASON_REQUIRED`.
 */
const orderStatusSchema = z.object({
  status: z.enum(["PENDING", "PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"]),
  cancelReason: z.string().max(1000).optional(),
});

const ordersRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get("/api/hub/orders", {
        params: request.query,
      });
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.get("/:orderId", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get(`/api/hub/orders/${(request.params as { orderId: string }).orderId}`);
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.patch("/:orderId/status", async (request, reply) => {
    // O corpo chega em camelCase (`cancelReason`) e é convertido para
    // snake_case (`cancel_reason`) antes de seguir para o Core API.
    const parsed = orderStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors });
    }

    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.patch(`/api/hub/orders/${(request.params as { orderId: string }).orderId}/status`, toSnakeCaseKeys(parsed.data));
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });
};

export default ordersRoutes;
