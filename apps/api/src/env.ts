export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://ownlevel:ownlevel@localhost:5432/ownlevel",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  webOrigins: (process.env.WEB_ORIGINS ?? "http://localhost:3100").split(","),
};
