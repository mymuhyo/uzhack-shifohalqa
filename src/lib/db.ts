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
}

const ISOLATION_MODE: Record<TransactionIsolationLevel, string> = {
  ReadCommitted: 'isolation level read committed',
  RepeatableRead: 'isolation level repeatable read',
  Serializable: 'isolation level serializable',
};

const globalForDb = globalThis as typeof globalThis & {
  __shifoDbCache?: { url: string; db: SqlAdapter };
};

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

  const query = ((strings: TemplateStringsArray, ...values: readonly SqlParam[]): SqlQuery =>
    client<SqlRow[]>(strings, ...(values as readonly postgres.ParameterOrFragment<never>[]))) as SqlAdapter;

  query.json = (value: postgres.JSONValue): SqlParam => client.json(value);

  query.transaction = async (
    fn: (tx: TransactionSqlAdapter) => readonly SqlQuery[],
    options?: { isolationLevel?: TransactionIsolationLevel },
  ): Promise<SqlResult[]> => {
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
