import fastifyJwt, { FastifyJWTOptions } from "@fastify/jwt";
import fastifyPlugin from "fastify-plugin";
import { env } from "../config/env";

export default fastifyPlugin(async function jwtPlugin(fastify) {
  const options: FastifyJWTOptions = {
    secret: env.JWT_SECRET,
  };

  await fastify.register(fastifyJwt, options);
});

declare module "fastify" {
  interface FastifyRequest {
    jwtVerify(): Promise<unknown>;
  }
}
