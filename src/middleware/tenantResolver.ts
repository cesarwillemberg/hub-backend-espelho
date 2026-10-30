import { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

type JwtPayload = {
  sub?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  context?: string;
  tenant?: string;
  tenant_slug?: string;
  type?: string;
  iss?: string;
  [key: string]: unknown;
};

const tenantResolver: FastifyPluginAsync = async function (fastify) {
  fastify.addHook("preHandler", async (request) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return;
    }

    const token = authHeader.substring(7);

    try {
      const payload = (await fastify.jwt.verify(token)) as JwtPayload;

      const tenantSlug =
        payload.tenant_slug ?? payload.tenant ?? null;

      if (tenantSlug) {
        request.tenantSlug = tenantSlug;
      }

      request.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        permissions: payload.permissions ?? [],
        tenantSlug,
      };
    } catch {
      request.tenantSlug = "";
      request.authUser = null;
    }
  });
};

export default fastifyPlugin(tenantResolver);

declare module "fastify" {
  interface FastifyRequest {
    tenantSlug: string | null;
    authUser: {
      id: string | null;
      email: string | null;
      roles: string[];
      permissions: string[];
      tenantSlug: string | null;
    } | null;
  }
}
