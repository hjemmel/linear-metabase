CREATE TABLE "issue_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"label_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"archived_at" timestamp,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_labels" ADD CONSTRAINT "issue_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_labels_issue_idx" ON "issue_labels" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_labels_label_idx" ON "issue_labels" USING btree ("label_id");--> statement-breakpoint
CREATE INDEX "issue_labels_unique_idx" ON "issue_labels" USING btree ("issue_id","label_id");--> statement-breakpoint
CREATE INDEX "labels_name_idx" ON "labels" USING btree ("name");--> statement-breakpoint
CREATE INDEX "labels_color_idx" ON "labels" USING btree ("color");