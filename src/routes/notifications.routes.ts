import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys } from "../utils/caseConverter";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  type: z.enum(["ORDER_STATUS_UPDATED", "LOW_STOCK"]).optional(),
});

const notificationIdSchema = z.string().uuid();

function coreError(err: any) {
  return {
    status: err.status ?? 502,
    body: {
      error: err.data?.error ?? "CORE_API_ERROR",
      message: err.data?.message ?? err.message,
    },
  };
}

const notificationsRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors });
    }
    const client = createCoreApiClient({
      accessToken: request.headers.authorization?.replace("Bearer ", ""),
      tenantSlug: request.tenantSlug ?? undefined,
    });
    try {
      const coreRes = await client.get("/api/hub/notifications", { params: parsed.data });
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      const result = coreError(err);
      return reply.status(result.status).send(result.body);
    }
  });

  fastify.get("/unread-count", async (request, reply) => {
    const client = createCoreApiClient({
      accessToken: request.headers.authorization?.replace("Bearer ", ""),
      tenantSlug: request.tenantSlug ?? undefined,
    });
    try {
      const coreRes = await client.get("/api/hub/notifications/unread-count");
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      const result = coreError(err);
      return reply.status(result.status).send(result.body);
    }
  });

  fastify.patch("/read-all", async (request, reply) => {
    const client = createCoreApiClient({
      accessToken: request.headers.authorization?.replace("Bearer ", ""),
      tenantSlug: request.tenantSlug ?? undefined,
    });
    try {
      const coreRes = await client.patch("/api/hub/notifications/read-all");
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      const result = coreError(err);
      return reply.status(result.status).send(result.body);
    }
  });

  fastify.patch("/:notificationId/read", async (request, reply) => {
    const { notificationId } = request.params as { notificationId: string };
    if (!notificationIdSchema.safeParse(notificationId).success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: { notificationId: ["Must be a UUID"] } });
    }
    const client = createCoreApiClient({
      accessToken: request.headers.authorization?.replace("Bearer ", ""),
      tenantSlug: request.tenantSlug ?? undefined,
    });
    try {
      const coreRes = await client.patch(`/api/hub/notifications/${notificationId}/read`);
      return reply.status(coreRes.status).send(coreRes.data);
    } catch (err: any) {
      const result = coreError(err);
      return reply.status(result.status).send(result.body);
    }
  });
};

export default notificationsRoutes;
