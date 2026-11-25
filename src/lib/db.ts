import postgres, {
  type PendingQuery,
  type RowList,
  type TransactionSql,
} from 'postgres';

export type SqlRow = Record<string, unknown>;
export type SqlResult = RowList<SqlRow[]>;
export type SqlQuery = PendingQuery<SqlRow[]>;
export type SqlParam = postgres.ParameterOrFragment<undefined>;
export type TransactionIsolationLevel = 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

export interface TransactionSqlAdapter {
  (strings: TemplateStringsArray, ...values: readonly SqlParam[]): SqlQuery;
  json(value: postgres.JSONValue): SqlParam;
}

export interface SqlAdapter extends TransactionSqlAdapter {
  transaction(
    fn: (tx: TransactionSqlAdapter) => readonly SqlQuery[],
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): Promise<SqlResult[]>;
  end(options?: { timeout?: number }): Promise<void>;
  verifyEnvironment?(expectedEnvId?: string): Promise<string>;
}

export class EnvironmentIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentIdentityError';
  }
}

export function getExpectedEnvId(): string | null {
  const value = process.env.SHIFO_ENV_ID?.trim();
  return value ? value : null;
}

const WRITE_SQL_PATTERN = /\b(insert|update|delete|truncate|alter|drop|create|merge)\b/i;

export function isWriteSql(sqlText: string): boolean {
  return WRITE_SQL_PATTERN.test(sqlText);
}

const ISOLATION_MODE: Record<TransactionIsolationLevel, string> = {
  ReadCommitted: 'isolation level read committed',
  RepeatableRead: 'isolation level repeatable read',
  Serializable: 'isolation level serializable',
};

const globalForDb = globalThis as typeof globalThis & {
  __shifoDbCache?: { url: string; db: SqlAdapter };
};

export async function assertDatabaseEnvironment(
  db: SqlAdapter,
  expectedEnvId?: string,
): Promise<string> {
  if (typeof db.verifyEnvironment === 'function') {
    return db.verifyEnvironment(expectedEnvId);
  }
  const expected = (expectedEnvId ?? getExpectedEnvId() ?? '').trim();
  if (!expected) {
    throw new EnvironmentIdentityError('SHIFO_ENV_ID environment variable is required before writing to the database.');
  }
  let rows: SqlRow[];
  try {
    rows = await db`
      SELECT env_id AS "envId"
      FROM public.environment_identity
      WHERE singleton = true
      LIMIT 1
    `;
  } catch (error) {
    throw new EnvironmentIdentityError(
      `Failed to verify public.environment_identity against expected SHIFO_ENV_ID="${expected}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const actual = typeof rows[0]?.envId === 'string' ? rows[0].envId.trim() : '';
  if (!actual || actual !== expected) {
    throw new EnvironmentIdentityError(
      `Database environment mismatch: expected SHIFO_ENV_ID="${expected}", got "${actual || 'missing'}".`,
    );
  }
  return expected;
}

export function createDatabase(databaseUrl: string): SqlAdapter {
  const trimmedUrl = databaseUrl.trim();
  if (!trimmedUrl) {
    throw new Error('DATABASE_URL must be a non-empty connection string.');
  }

  const client = postgres(trimmedUrl, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    max_pipeline: 1,
    transform: { undefined: null },
  });

  let verifiedEnvId: string | null = null;
  let verifyingPromise: Promise<string> | null = null;

  async function ensureEnvironmentVerified(expectedOverride?: string): Promise<string> {
    const expected = (expectedOverride ?? getExpectedEnvId() ?? '').trim();
    if (!expected) {
      throw new EnvironmentIdentityError('SHIFO_ENV_ID environment variable is required before writing to the database.');
    }
    if (verifiedEnvId === expected) {
      return expected;
    }
    if (verifyingPromise) {
      return verifyingPromise;
    }

    verifyingPromise = (async () => {
      let rows: SqlRow[];
      try {
        rows = await client<SqlRow[]>`
          SELECT env_id AS "envId"
          FROM public.environment_identity
          WHERE singleton = true
          LIMIT 1
        `;
      } catch (error) {
        throw new EnvironmentIdentityError(
          `Failed to verify public.environment_identity against expected SHIFO_ENV_ID="${expected}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const actual = typeof rows[0]?.envId === 'string' ? rows[0].envId.trim() : '';
      if (!actual || actual !== expected) {
        throw new EnvironmentIdentityError(
          `Database environment mismatch: expected SHIFO_ENV_ID="${expected}", got "${actual || 'missing'}".`,
        );
      }
      verifiedEnvId = expected;
      return expected;
    })();

    try {
      return await verifyingPromise;
    } finally {
      verifyingPromise = null;
    }
  }

  const query = ((strings: TemplateStringsArray, ...values: readonly SqlParam[]): SqlQuery => {
    const runQuery = () => client<SqlRow[]>(strings, ...(values as readonly postgres.ParameterOrFragment<never>[]));
    if (isWriteSql(strings.join(' '))) {
      const expected = getExpectedEnvId();
      if (!expected || verifiedEnvId !== expected) {
        return ensureEnvironmentVerified().then(runQuery) as unknown as SqlQuery;
      }
    }
    return runQuery();
  }) as SqlAdapter;

  query.json = (value: postgres.JSONValue): SqlParam => client.json(value);
  query.verifyEnvironment = ensureEnvironmentVerified;

  query.transaction = async (
    fn: (tx: TransactionSqlAdapter) => readonly SqlQuery[],
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): Promise<SqlResult[]> => {
    await ensureEnvironmentVerified();

    const run = async (tx: TransactionSql): Promise<SqlResult[]> => {
      const txAdapter = Object.assign(
        (strings: TemplateStringsArray, ...values: readonly SqlParam[]): SqlQuery =>
          tx<SqlRow[]>(strings, ...(values as readonly postgres.ParameterOrFragment<never>[])),
        {
          json: (value: postgres.JSONValue): SqlParam => tx.json(value),
        },
      ) as TransactionSqlAdapter;
      const queries = fn(txAdapter);
      const results: SqlResult[] = [];
      for (const pending of queries) {
        results.push(await pending);
      }
      return results;
    };

    if (options?.isolationLevel) {
      return client.begin(ISOLATION_MODE[options.isolationLevel], run);
    }

    return client.begin(run);
  };

  query.end = (options?: { timeout?: number }) => client.end(options);

  return query;
}

export function getDatabase(): SqlAdapter | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    if (globalForDb.__shifoDbCache) {
      const stale = globalForDb.__shifoDbCache;
      globalForDb.__shifoDbCache = undefined;
      void stale.db.end({ timeout: 5 }).catch(() => {});
    }
    return null;
  }

  if (globalForDb.__shifoDbCache?.url === databaseUrl) {
    return globalForDb.__shifoDbCache.db;
  }

  if (globalForDb.__shifoDbCache) {
    const stale = globalForDb.__shifoDbCache;
    globalForDb.__shifoDbCache = undefined;
    void stale.db.end({ timeout: 5 }).catch(() => {});
  }

  const db = createDatabase(databaseUrl);
  globalForDb.__shifoDbCache = { url: databaseUrl, db };
  return db;
}
