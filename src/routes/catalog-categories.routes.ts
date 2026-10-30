import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys } from "../utils/caseConverter";

const catalogCategoriesRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get("/api/hub/catalog-categories");
      return reply.status(coreRes.status).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return reply.status(err.status ?? 502).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message,
      });
    }
  });
};

export default catalogCategoriesRoutes;
