import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys } from "../utils/caseConverter";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Must be a valid date in YYYY-MM-DD format");

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  size: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  entity: z.string().optional(),
  entityId: z.string().uuid().optional(),
  performedByUserId: z.string().uuid().optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  search: z.string().optional(),
});

const idSchema = z.string().uuid();

function coreError(err: any) {
  const status = Number.isInteger(err?.status) ? err.status : 502;
  return {
    status,
    body: {
      error: err?.data?.error ?? (status === 502 ? "CORE_API_UNAVAILABLE" : "CORE_API_ERROR"),
      message: err?.data?.message ?? err?.message ?? "Core API indisponível.",
    },
  };
}

function createClient(request: { headers: { authorization?: string }; tenantSlug?: string | null }) {
  const authorization = request.headers.authorization;
  return createCoreApiClient({
    accessToken: authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined,
    tenantSlug: request.tenantSlug ?? undefined,
  });
}

const activityLogsRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors });
    }
    try {
      const response = await createClient(request).get("/api/hub/activity-logs", { params: parsed.data });
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (error) {
      const result = coreError(error);
      return reply.status(result.status).send(result.body);
    }
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const parsed = idSchema.safeParse(request.params.id);
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: { id: ["Must be a UUID"] } });
    }
    try {
      const response = await createClient(request).get(`/api/hub/activity-logs/${parsed.data}`);
      return reply.status(response.status).send(toCamelCaseKeys(response.data));
    } catch (error) {
      const result = coreError(error);
      return reply.status(result.status).send(result.body);
    }
  });
};

export default activityLogsRoutes;
