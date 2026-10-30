import { type SQL, sql } from "drizzle-orm";

/** drizzle expands a JS array parameter into a tuple; this builds a real text[] instead. */
export const textArray = (values: string[]): SQL =>
  values.length ? sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;
