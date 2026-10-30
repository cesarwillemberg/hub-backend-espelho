import { buildApp } from "./app";
import { env } from "./config/env";

async function main() {
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`BFF Hub rodando em http://${env.HOST}:${env.PORT}`);
    app.log.info(`Core API upstream: ${env.CORE_API_URL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
