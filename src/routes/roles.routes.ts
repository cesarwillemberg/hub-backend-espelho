import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys } from "../utils/caseConverter";

const rolesRoutes: FastifyPluginAsync = async function (fastify) {
  fastify.get("/", async (request, reply) => {
    try {
      const accessToken = request.headers.authorization?.replace("Bearer ", "");
      const client = createCoreApiClient({
        accessToken,
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const coreRes = await client.get("/api/hub/roles", {
        params: { includePermissions: false },
      });
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      fastify.log.error({ err }, "roles list failed");
      const status = err.status ?? err.response?.status ?? 502;
      return reply.status(status).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message ?? "Erro ao listar roles",
      });
    }
  });
};

export default rolesRoutes;
