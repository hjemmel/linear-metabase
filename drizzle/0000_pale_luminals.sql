CREATE TABLE "cycles" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"number" integer,
	"name" text,
	"description" text,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"auto_archived_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"edited_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"cycle_id" text,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" integer,
	"priority_label" text,
	"estimate" numeric,
	"assignee_id" text,
	"assignee_name" text,
	"creator_id" text,
	"creator_name" text,
	"state" text NOT NULL,
	"state_type" text NOT NULL,
	"labels" jsonb,
	"url" text,
	"branch_name" text,
	"customer_ticket_count" integer DEFAULT 0,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"canceled_at" timestamp,
	"started_at" timestamp,
	"archived_at" timestamp,
	"auto_archived_at" timestamp,
	"auto_closed_at" timestamp,
	"due_date" timestamp,
	"snoozed_until_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_email" text,
	"display_name" text,
	"avatar_url" text,
	"admin" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"private" boolean DEFAULT false,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cycles_team_idx" ON "cycles" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "cycles_dates_idx" ON "cycles" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "cycles_number_idx" ON "cycles" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "issue_comments_issue_idx" ON "issue_comments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_comments_user_idx" ON "issue_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_comments_created_idx" ON "issue_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "issues_team_idx" ON "issues" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "issues_cycle_idx" ON "issues" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "issues_assignee_idx" ON "issues" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "issues_state_idx" ON "issues" USING btree ("state");--> statement-breakpoint
CREATE INDEX "issues_completed_idx" ON "issues" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "issues_number_idx" ON "issues" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "issues_priority_idx" ON "issues" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "team_members_team_user_idx" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_key_idx" ON "teams" USING btree ("key");--> statement-breakpoint
CREATE INDEX "teams_name_idx" ON "teams" USING btree ("name");