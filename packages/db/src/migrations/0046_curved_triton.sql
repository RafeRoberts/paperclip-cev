CREATE TABLE "approval_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"approval_type" text NOT NULL,
	"action" text NOT NULL,
	"decided_by" text,
	"feedback" text,
	"risk_tier" text,
	"rework_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"adapter_type" text NOT NULL,
	"endpoint_or_cmd" text NOT NULL,
	"risk_tier" text NOT NULL,
	"params_schema" jsonb,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "approval_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "risk_tier" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "action_type" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "approval_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "rework_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "max_rework" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "parent_issue_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "action_payload" jsonb;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_log" ADD CONSTRAINT "approval_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_log" ADD CONSTRAINT "approval_log_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_registry" ADD CONSTRAINT "tool_registry_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_registry" ADD CONSTRAINT "tool_registry_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_log_company_issue_idx" ON "approval_log" USING btree ("company_id","issue_id");--> statement-breakpoint
CREATE INDEX "tool_registry_company_name_idx" ON "tool_registry" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "tool_registry_company_risk_idx" ON "tool_registry" USING btree ("company_id","risk_tier");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_issue_id_issues_id_fk" FOREIGN KEY ("parent_issue_id") REFERENCES "public"."issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_company_approval_status_idx" ON "issues" USING btree ("company_id","approval_type","approval_status");