import fastifyCors, { FastifyCorsOptions } from "@fastify/cors";
import fastifyPlugin from "fastify-plugin";
import { env } from "../config/env";

export default fastifyPlugin(async function corsPlugin(fastify) {
  const options: FastifyCorsOptions = {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Slug",
      "X-Marvi-Tenant",
    ],
    exposedHeaders: ["Set-Cookie"],
  };

  await fastify.register(fastifyCors, options);
});
