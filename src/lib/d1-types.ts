export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: boolean;
    meta?: { changes?: number };
  }>;
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch<T = Record<string, unknown>>(
    statements: D1Statement[],
  ): Promise<{ results: T[]; success: boolean; meta?: { changes?: number } }[]>;
}
