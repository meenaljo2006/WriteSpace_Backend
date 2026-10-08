import { customType } from "drizzle-orm/pg-core";

/**
 * Custom Drizzle column type for pgvector's `vector` type.
 * Stores arrays of numbers and maps to Postgres `vector(n)`.
 *
 * Usage:
 *   embedding: vector("embedding", { dimensions: 1024 })
 */
export const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .map((n) => parseFloat(n));
  },
});