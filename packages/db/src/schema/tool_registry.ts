import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const toolRegistry = pgTable(
  "tool_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    description: text("description"),
    adapterType: text("adapter_type").notNull(),
    endpointOrCmd: text("endpoint_or_cmd").notNull(),
    riskTier: text("risk_tier").notNull(),
    paramsSchema: jsonb("params_schema").$type<Record<string, unknown>>(),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyNameIdx: index("tool_registry_company_name_idx").on(table.companyId, table.name),
    companyRiskIdx: index("tool_registry_company_risk_idx").on(table.companyId, table.riskTier),
  }),
);
