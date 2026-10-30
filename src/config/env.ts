import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  CORE_API_URL: z.string().url().default("http://localhost:8080"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET é obrigatório"),
  JWT_ISSUER: z.string().default("marvi-core-api"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  REFRESH_TOKEN_COOKIE_NAME: z.string().default("refresh_token"),
  REFRESH_TOKEN_COOKIE_PATH: z.string().default("/api/auth/refresh"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_SECURE: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

let envCache: Env | null = null;

export function loadEnv(): Env {
  if (envCache) return envCache;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = Object.keys(parsed.error.flatten().fieldErrors);
    throw new Error(
      `Variáveis de ambiente inválidas ou ausentes: ${missing.join(", ")}. Copie .env.example para .env e preencha os valores obrigatórios.`,
    );
  }
  envCache = parsed.data;
  return envCache;
}

export const env = loadEnv();
