import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const approvalLog = pgTable(
  "approval_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    issueId: uuid("issue_id").notNull().references(() => issues.id),
    approvalType: text("approval_type").notNull(),
    action: text("action").notNull(),
    decidedBy: text("decided_by"),
    feedback: text("feedback"),
    riskTier: text("risk_tier"),
    reworkCount: integer("rework_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIssueIdx: index("approval_log_company_issue_idx").on(table.companyId, table.issueId),
  }),
);
