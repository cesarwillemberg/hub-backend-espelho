import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { z } from "zod";
import { toSnakeCaseKeys, toCamelCaseKeys } from "../utils/caseConverter";

const categoryRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  canonical_key: z.string().max(80).nullable().optional(),
  active: z.boolean().optional(),
});

const categoriesRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get("/api/hub/categories", {
        params: request.query,
      });
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.post("/", async (request, reply) => {
    const parsed = categoryRequestSchema.safeParse(toSnakeCaseKeys(request.body));
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors });
    }

    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.post("/api/hub/categories", toSnakeCaseKeys(parsed.data));
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.get("/:categoryId", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get(`/api/hub/categories/${(request.params as { categoryId: string }).categoryId}`);
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.put("/:categoryId", async (request, reply) => {
    const parsed = categoryRequestSchema.safeParse(toSnakeCaseKeys(request.body));
    if (!parsed.success) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: parsed.error.flatten().fieldErrors });
    }

    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.put(`/api/hub/categories/${(request.params as { categoryId: string }).categoryId}`, toSnakeCaseKeys(parsed.data));
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.delete("/:categoryId", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.delete(`/api/hub/categories/${(request.params as { categoryId: string }).categoryId}`);
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });
};

export default categoriesRoutes;
