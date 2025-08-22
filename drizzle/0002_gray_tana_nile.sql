CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"url" text,
	"slug_id" text,
	"state" text NOT NULL,
	"priority" integer DEFAULT 0,
	"sort_order" numeric,
	"target_date" timestamp,
	"start_date" timestamp,
	"completed_at" timestamp,
	"canceled_at" timestamp,
	"lead_id" text,
	"member_ids" jsonb,
	"team_ids" jsonb,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_users_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_name_idx" ON "projects" USING btree ("name");--> statement-breakpoint
CREATE INDEX "projects_state_idx" ON "projects" USING btree ("state");--> statement-breakpoint
CREATE INDEX "projects_lead_idx" ON "projects" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "projects_completed_idx" ON "projects" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "projects_target_date_idx" ON "projects" USING btree ("target_date");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_project_idx" ON "issues" USING btree ("project_id");