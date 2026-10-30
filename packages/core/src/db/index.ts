import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as authSchema from "./auth-schema.js";
import * as tenancySchema from "./tenancy-schema.js";
import * as crmSchema from "./crm-schema.js";
import * as usageSchema from "./usage-schema.js";

export const schema = { ...authSchema, ...tenancySchema, ...usageSchema, ...crmSchema };
export type Db = NodePgDatabase<typeof schema>;
export * from "./auth-schema.js";
export * from "./tenancy-schema.js";
export * from "./usage-schema.js";
export * from "./crm-schema.js";
export * from "./tenant.js";
