import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export function getDatabase(): NeonQueryFunction<false, false> | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  return databaseUrl ? neon(databaseUrl) : null;
}
