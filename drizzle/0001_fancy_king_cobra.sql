CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"display_name" text,
	"avatar_url" text,
	"admin" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_name_idx" ON "users" USING btree ("name");--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("active");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "assignee_name";--> statement-breakpoint
ALTER TABLE "issues" DROP COLUMN "creator_name";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "user_name";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "user_email";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "team_members" DROP COLUMN "active";