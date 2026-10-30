import { FastifyPluginAsync } from "fastify";
import { createCoreApiClient } from "../services/coreApiClient";
import { toCamelCaseKeys, toSnakeCaseKeys } from "../utils/caseConverter";

type TenantSummary = {
  id: string;
  marketName: string;
  tenantSlug: string;
  documentNumber?: string;
  activeTenant: boolean;
  roles: string[];
};

const usersRoutes: FastifyPluginAsync = async function (fastify) {
  // As rotas de gestão permanecem sempre limitadas ao tenant resolvido pelo
  // middleware; o cliente não pode escolher outro tenant via query/body.
  const forwardError = (reply: any, err: any, fallback: string) => {
    fastify.log.error({ err }, fallback);
    return reply.status(err.status ?? err.response?.status ?? 502).send({
      error: err.data?.error ?? "CORE_API_ERROR",
      message: err.data?.message ?? err.message ?? fallback,
    });
  };

  fastify.get("/", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const coreRes = await client.get("/api/hub/users", { params: request.query });
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao listar usuários");
    }
  });

  fastify.get("/:userId", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const { userId } = request.params as { userId: string };
      const coreRes = await client.get(`/api/hub/users/${userId}`);
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao buscar usuário");
    }
  });

  fastify.post("/", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const coreRes = await client.post("/api/hub/users", toSnakeCaseKeys(request.body));
      return reply.status(coreRes.status ?? 201).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao criar usuário");
    }
  });

  fastify.patch("/:userId/status", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const { userId } = request.params as { userId: string };
      const coreRes = await client.patch(`/api/hub/users/${userId}/status`, toSnakeCaseKeys(request.body));
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao atualizar situação do usuário");
    }
  });

  fastify.patch("/:userId", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const { userId } = request.params as { userId: string };
      const coreRes = await client.patch(`/api/hub/users/${userId}`, toSnakeCaseKeys(request.body));
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao atualizar usuário");
    }
  });

  fastify.delete("/:userId", async (request, reply) => {
    try {
      const client = createCoreApiClient({
        accessToken: request.headers.authorization?.replace("Bearer ", ""),
        tenantSlug: request.tenantSlug ?? undefined,
      });
      const { userId } = request.params as { userId: string };
      const coreRes = await client.delete(`/api/hub/users/${userId}`);
      if (coreRes.status === 204) return reply.status(204).send();
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data));
    } catch (err: any) {
      return forwardError(reply, err, "Erro ao remover usuário");
    }
  });

  fastify.get("/me", async (request, reply) => {
    try {
      const accessToken = request.headers.authorization?.replace("Bearer ", "");
      const client = createCoreApiClient({
        accessToken,
        tenantSlug: request.tenantSlug ?? undefined,
      });

      const coreRes = await client.get("/api/hub/users/me");
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data ?? {}));
    } catch (err: any) {
      fastify.log.error({ err }, "users/me profile failed");
      const status = err.status ?? err.response?.status ?? 502;
      return reply.status(status).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message ?? "Erro ao buscar usuário atual",
      });
    }
  });

  fastify.get("/me/current-tenant", async (request, reply) => {
    try {
      const accessToken = request.headers.authorization?.replace("Bearer ", "");
      const client = createCoreApiClient({
        accessToken,
        tenantSlug: request.tenantSlug ?? undefined,
      });

      const coreRes = await client.get("/api/hub/users/me/current-tenant");
      const data = coreRes.data ?? {};
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(data));
    } catch (err: any) {
      fastify.log.error({ err }, "users/me/current-tenant failed");
      const status = err.status ?? err.response?.status ?? 502;
      return reply.status(status).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message ?? "Erro ao buscar tenant atual",
      });
    }
  });

  fastify.get("/me/tenants", async (request, reply) => {
    try {
      const accessToken = request.headers.authorization?.replace("Bearer ", "");
      const client = createCoreApiClient({
        accessToken,
        tenantSlug: request.tenantSlug ?? undefined,
      });

      // O Core API retorna uma lista direta em snake_case:
      // [{ id, market_name, slug, active, is_current }]
      const coreRes = await client.get("/api/hub/users/me/tenants");
      const raw: any = coreRes.data ?? [];
      const list: any[] = Array.isArray(raw) ? raw : raw?.tenants ?? [];

      const tenants: TenantSummary[] = list.map((item) => {
        const t = toCamelCaseKeys(item) as {
          id: string;
          marketName: string;
          slug: string;
          isCurrent?: boolean;
        };
        return {
          id: t.id,
          marketName: t.marketName,
          tenantSlug: t.slug,
          activeTenant: Boolean(t.isCurrent),
          roles: [],
        };
      });

      return reply.status(coreRes.status ?? 200).send({ tenants });
    } catch (err: any) {
      fastify.log.error({ err }, "users/me/tenants failed");
      const status = err.status ?? err.response?.status ?? 502;
      return reply.status(status).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message ?? "Erro ao buscar mercados do usuário",
      });
    }
  });

  /**
   * Proxy de `GET /api/hub/users/{userId}/permissions-by-market`.
   *
   * Usado pelo frontend para verificar as permissões efetivas do usuário no
   * mercado atual (query `id_market`), como fonte mais fresca que as
   * permissões embutidas na resposta do login. O Core exige `users:manage`,
   * portanto o frontend trata falhas (403) mantendo as permissões do login.
   */
  fastify.get("/:userId/permissions-by-market", async (request, reply) => {
    const accessToken = request.headers.authorization?.replace("Bearer ", "");
    const client = createCoreApiClient({
      accessToken,
      tenantSlug: request.tenantSlug ?? undefined,
    });

    try {
      const coreRes = await client.get(
        `/api/hub/users/${(request.params as { userId: string }).userId}/permissions-by-market`,
        { params: request.query },
      );
      return reply.status(coreRes.status ?? 200).send(toCamelCaseKeys(coreRes.data ?? {}));
    } catch (err: any) {
      fastify.log.error({ err }, "users/:userId/permissions-by-market failed");
      const status = err.status ?? err.response?.status ?? 502;
      return reply.status(status).send({
        error: err.data?.error ?? "CORE_API_ERROR",
        message: err.data?.message ?? err.message ?? "Erro ao buscar permissões do usuário",
      });
    }
  });
};

export default usersRoutes;
