import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { env } from "../config/env";

export interface CoreApiClientOptions {
  baseURL?: string;
  accessToken?: string;
  tenantSlug?: string;
}

export class CoreApiClient {
  private client: AxiosInstance;

  constructor(options: CoreApiClientOptions = {}) {
    this.client = axios.create({
      baseURL: options.baseURL ?? env.CORE_API_URL,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      if (options.accessToken) {
        config.headers.Authorization = `Bearer ${options.accessToken}`;
      }
      if (options.tenantSlug) {
        config.headers["X-Tenant-Slug"] = options.tenantSlug;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          const err: any = new Error(
            data?.message || `Core API respondeu com status ${status}`,
          );
          err.status = status;
          err.data = data;
          err.isAxiosError = true;
          return Promise.reject(err);
        }
        if (error.request) {
          const err: any = new Error("Core API indisponível. Verifique se o serviço está rodando em " + env.CORE_API_URL);
          err.code = "CORE_API_UNAVAILABLE";
          return Promise.reject(err);
        }
        return Promise.reject(error);
      },
    );
  }

  get<T = unknown>(path: string, config?: Parameters<AxiosInstance["get"]>[1]) {
    return this.client.get<T>(path, config);
  }

  post<T = unknown>(path: string, data?: unknown, config?: Parameters<AxiosInstance["post"]>[2]) {
    return this.client.post<T>(path, data, config);
  }

  put<T = unknown>(path: string, data?: unknown, config?: Parameters<AxiosInstance["put"]>[2]) {
    return this.client.put<T>(path, data, config);
  }

  patch<T = unknown>(path: string, data?: unknown, config?: Parameters<AxiosInstance["patch"]>[2]) {
    return this.client.patch<T>(path, data, config);
  }

  delete<T = unknown>(path: string, config?: Parameters<AxiosInstance["delete"]>[1]) {
    return this.client.delete<T>(path, config);
  }
}

export function createCoreApiClient(options: CoreApiClientOptions = {}): CoreApiClient {
  return new CoreApiClient(options);
}
