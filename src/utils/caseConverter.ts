function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/(_[a-z])/g, (match) => match.toUpperCase().replace("_", ""));
}

export function toSnakeCaseKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((value) => toSnakeCaseKeys(value));
  if (!isPlainObject(obj)) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    if (Array.isArray(value)) {
      result[snakeKey] = value.map((v) => toSnakeCaseKeys(v));
    } else {
      result[snakeKey] = toSnakeCaseKeys(value);
    }
  }
  return result;
}

export function toCamelCaseKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((value) => toCamelCaseKeys(value));
  if (!isPlainObject(obj)) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (Array.isArray(value)) {
      result[camelKey] = value.map((v) => toCamelCaseKeys(v));
    } else {
      result[camelKey] = toCamelCaseKeys(value);
    }
  }
  return result;
}
