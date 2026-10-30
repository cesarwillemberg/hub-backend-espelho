import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { toSnakeCaseKeys, toCamelCaseKeys } from "../utils/caseConverter";

const settingsRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/store-info", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get("/api/hub/store-info");
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.put("/store-info", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.put("/api/hub/store-info", toSnakeCaseKeys(request.body));
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.get("/addresses", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get("/api/hub/addresses");
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.post("/addresses", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.post("/api/hub/addresses", toSnakeCaseKeys(request.body));
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });

  fastify.get("/addresses/:addressId/business-hours", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get(`/api/hub/addresses/${(request.params as { addressId: string }).addressId}/business-hours`);
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({ error: err.data?.error ?? "CORE_API_ERROR", message: err.data?.message ?? err.message });
    }
  });
};

export default settingsRoutes;
