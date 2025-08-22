import { relations } from "drizzle-orm";
import {
	boolean,
	decimal,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

// Users table
export const users = pgTable(
	"users",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email"),
		displayName: text("display_name"),
		avatarUrl: text("avatar_url"),
		admin: boolean("admin").default(false),
		active: boolean("active").default(true),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		archivedAt: timestamp("archived_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		emailIdx: index("users_email_idx").on(table.email),
		nameIdx: index("users_name_idx").on(table.name),
		activeIdx: index("users_active_idx").on(table.active),
	}),
);

// Teams table
export const teams = pgTable(
	"teams",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		key: text("key").notNull(),
		description: text("description"),
		icon: text("icon"),
		color: text("color"),
		private: boolean("private").default(false),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		archivedAt: timestamp("archived_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		keyIdx: index("teams_key_idx").on(table.key),
		nameIdx: index("teams_name_idx").on(table.name),
	}),
);

// Team members table
export const teamMembers = pgTable(
	"team_members",
	{
		id: text("id").primaryKey(),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		admin: boolean("admin").default(false),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		teamUserIdx: index("team_members_team_user_idx").on(
			table.teamId,
			table.userId,
		),
		userIdx: index("team_members_user_idx").on(table.userId),
	}),
);

// Projects table
export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		icon: text("icon"),
		color: text("color"),
		url: text("url"),
		slugId: text("slug_id"),
		state: text("state").notNull(), // planned, started, completed, canceled, backlog, paused
		priority: integer("priority").default(0),
		sortOrder: decimal("sort_order"),
		targetDate: timestamp("target_date"),
		startDate: timestamp("start_date"),
		completedAt: timestamp("completed_at"),
		canceledAt: timestamp("canceled_at"),
		leadId: text("lead_id").references(() => users.id),
		memberIds: jsonb("member_ids"), // Array of user IDs
		teamIds: jsonb("team_ids"), // Array of team IDs
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		archivedAt: timestamp("archived_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		nameIdx: index("projects_name_idx").on(table.name),
		stateIdx: index("projects_state_idx").on(table.state),
		leadIdx: index("projects_lead_idx").on(table.leadId),
		completedIdx: index("projects_completed_idx").on(table.completedAt),
		targetDateIdx: index("projects_target_date_idx").on(table.targetDate),
	}),
);

// Cycles table
export const cycles = pgTable(
	"cycles",
	{
		id: text("id").primaryKey(),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id, { onDelete: "cascade" }),
		number: integer("number"),
		name: text("name"),
		description: text("description"),
		startsAt: timestamp("starts_at").notNull(),
		endsAt: timestamp("ends_at").notNull(),
		completedAt: timestamp("completed_at"),
		autoArchivedAt: timestamp("auto_archived_at"),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		archivedAt: timestamp("archived_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		teamIdx: index("cycles_team_idx").on(table.teamId),
		datesIdx: index("cycles_dates_idx").on(table.startsAt, table.endsAt),
		numberIdx: index("cycles_number_idx").on(table.teamId, table.number),
	}),
);

// Issues table
export const issues = pgTable(
	"issues",
	{
		id: text("id").primaryKey(),
		teamId: text("team_id")
			.notNull()
			.references(() => teams.id),
		cycleId: text("cycle_id").references(() => cycles.id),
		projectId: text("project_id").references(() => projects.id),
		number: integer("number").notNull(),
		title: text("title").notNull(),
		description: text("description"),
		priority: integer("priority"),
		priorityLabel: text("priority_label"),
		estimate: decimal("estimate"),
		assigneeId: text("assignee_id").references(() => users.id),
		creatorId: text("creator_id").references(() => users.id),
		state: text("state").notNull(),
		stateType: text("state_type").notNull(),
		labels: jsonb("labels"),
		url: text("url"),
		branchName: text("branch_name"),
		customerTicketCount: integer("customer_ticket_count").default(0),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		completedAt: timestamp("completed_at"),
		canceledAt: timestamp("canceled_at"),
		startedAt: timestamp("started_at"),
		archivedAt: timestamp("archived_at"),
		autoArchivedAt: timestamp("auto_archived_at"),
		autoClosedAt: timestamp("auto_closed_at"),
		dueDate: timestamp("due_date"),
		snoozedUntilAt: timestamp("snoozed_until_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		teamIdx: index("issues_team_idx").on(table.teamId),
		cycleIdx: index("issues_cycle_idx").on(table.cycleId),
		projectIdx: index("issues_project_idx").on(table.projectId),
		assigneeIdx: index("issues_assignee_idx").on(table.assigneeId),
		stateIdx: index("issues_state_idx").on(table.state),
		completedIdx: index("issues_completed_idx").on(table.completedAt),
		numberIdx: index("issues_number_idx").on(table.teamId, table.number),
		priorityIdx: index("issues_priority_idx").on(table.priority),
	}),
);

// Issue comments table (for additional context)
export const issueComments = pgTable(
	"issue_comments",
	{
		id: text("id").primaryKey(),
		issueId: text("issue_id")
			.notNull()
			.references(() => issues.id, { onDelete: "cascade" }),
		userId: text("user_id").notNull(),
		userName: text("user_name"),
		body: text("body").notNull(),
		createdAt: timestamp("created_at").notNull(),
		updatedAt: timestamp("updated_at").notNull(),
		editedAt: timestamp("edited_at"),
		syncedAt: timestamp("synced_at").defaultNow(),
	},
	(table) => ({
		issueIdx: index("issue_comments_issue_idx").on(table.issueId),
		userIdx: index("issue_comments_user_idx").on(table.userId),
		createdIdx: index("issue_comments_created_idx").on(table.createdAt),
	}),
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
	teamMemberships: many(teamMembers),
	assignedIssues: many(issues, { relationName: "assignedIssues" }),
	createdIssues: many(issues, { relationName: "createdIssues" }),
}));

export const teamsRelations = relations(teams, ({ many }) => ({
	members: many(teamMembers),
	cycles: many(cycles),
	issues: many(issues),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
	team: one(teams, {
		fields: [teamMembers.teamId],
		references: [teams.id],
	}),
	user: one(users, {
		fields: [teamMembers.userId],
		references: [users.id],
	}),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
	lead: one(users, {
		fields: [projects.leadId],
		references: [users.id],
	}),
	issues: many(issues),
}));

export const cyclesRelations = relations(cycles, ({ one, many }) => ({
	team: one(teams, {
		fields: [cycles.teamId],
		references: [teams.id],
	}),
	issues: many(issues),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
	team: one(teams, {
		fields: [issues.teamId],
		references: [teams.id],
	}),
	cycle: one(cycles, {
		fields: [issues.cycleId],
		references: [cycles.id],
	}),
	project: one(projects, {
		fields: [issues.projectId],
		references: [projects.id],
	}),
	assignee: one(users, {
		fields: [issues.assigneeId],
		references: [users.id],
		relationName: "assignedIssues",
	}),
	creator: one(users, {
		fields: [issues.creatorId],
		references: [users.id],
		relationName: "createdIssues",
	}),
	comments: many(issueComments),
}));

export const issueCommentsRelations = relations(issueComments, ({ one }) => ({
	issue: one(issues, {
		fields: [issueComments.issueId],
		references: [issues.id],
	}),
}));

// Export types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type IssueComment = typeof issueComments.$inferSelect;
export type NewIssueComment = typeof issueComments.$inferInsert;
