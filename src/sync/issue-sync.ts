import { eq } from "drizzle-orm";
import {
	cycles,
	issueLabels,
	issues,
	labels,
	type NewIssue,
	type NewIssueLabel,
	projects,
	teams,
	users,
} from "../db/schema.js";
import { BaseSyncService } from "./base-sync.js";
import { CycleSyncService } from "./cycle-sync.js";
import { LabelSyncService } from "./label-sync.js";
import { ProjectSyncService } from "./project-sync.js";
import { TeamSyncService } from "./team-sync.js";
import { UserSyncService } from "./user-sync.js";

interface LinearIssue {
	id: string;
	teamId?: string | undefined;
	cycleId?: string | undefined;
	number: number;
	title: string;
	description?: string | undefined;
	priority?: number | undefined;
	priorityLabel?: string | undefined;
	estimate?: number | undefined;
	assigneeId?: string | undefined;
	creatorId?: string | undefined;
	state:
		| string
		| { name: string; type: string }
		| { id: string; name: string; type: string };
	stateType?: string | undefined;
	labels?:
		| { nodes: Array<{ id: string; name: string; color: string }> }
		| undefined;
	url?: string | undefined;
	branchName?: string | undefined;
	customerTicketCount?: number | undefined;
	createdAt: string;
	updatedAt: string;
	completedAt?: string | undefined;
	canceledAt?: string | undefined;
	startedAt?: string | undefined;
	archivedAt?: string | undefined;
	autoArchivedAt?: string | undefined;
	autoClosedAt?: string | undefined;
	dueDate?: string | undefined;
	snoozedUntilAt?: string | undefined;
	team?: { id: string } | undefined;
	cycle?: { id: string } | undefined;
	project?: { id: string } | undefined;
	assignee?: { id: string } | undefined;
	creator?: { id: string } | undefined;
}

export class IssueSyncService extends BaseSyncService {
	private userSync: UserSyncService;
	private teamSync: TeamSyncService;
	private cycleSync: CycleSyncService;
	private projectSync: ProjectSyncService;
	private labelSync: LabelSyncService;

	constructor() {
		super();
		this.userSync = new UserSyncService();
		this.teamSync = new TeamSyncService();
		this.cycleSync = new CycleSyncService();
		this.projectSync = new ProjectSyncService();
		this.labelSync = new LabelSyncService();
	}
	/**
	 * Fetch issues using GraphQL to get complete data including state
	 */
	private async fetchIssuesGraphQL(
		variables: Record<string, unknown>,
	): Promise<{
		nodes: LinearIssue[];
		pageInfo: { hasNextPage: boolean; endCursor: string };
	}> {
		const graphqlQuery = `
			query GetIssues($first: Int, $after: String, $filter: IssueFilter) {
				issues(first: $first, after: $after, filter: $filter) {
					nodes {
						id
						number
						title
						description
						priority
						priorityLabel
						estimate
						url
						branchName
						customerTicketCount
						createdAt
						updatedAt
						completedAt
						canceledAt
						startedAt
						archivedAt
						autoArchivedAt
						autoClosedAt
						dueDate
						snoozedUntilAt
						state {
							id
							name
							type
						}
						team {
							id
						}
						cycle {
							id
						}
						project {
							id
						}
						assignee {
							id
						}
						creator {
							id
						}
						labels {
							nodes {
								id
								name
								color
							}
						}
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		`;

		const result = (await this.linearClient.client.request(
			graphqlQuery,
			variables,
		)) as {
			issues: {
				nodes: LinearIssue[];
				pageInfo: { hasNextPage: boolean; endCursor: string };
			};
		};
		return result.issues;
	}

	/**
	 * Fetch cycle issues using GraphQL
	 */
	private async fetchCycleIssuesGraphQL(
		cycleId: string,
		variables: Record<string, unknown>,
	): Promise<
		| {
				nodes: LinearIssue[];
				pageInfo: { hasNextPage: boolean; endCursor: string };
		  }
		| undefined
	> {
		const graphqlQuery = `
			query GetCycleIssues($cycleId: String!, $first: Int, $after: String, $filter: IssueFilter) {
				cycle(id: $cycleId) {
					issues(first: $first, after: $after, filter: $filter) {
						nodes {
							id
							number
							title
							description
							priority
							priorityLabel
							estimate
							url
							branchName
							customerTicketCount
							createdAt
							updatedAt
							completedAt
							canceledAt
							startedAt
							archivedAt
							autoArchivedAt
							autoClosedAt
							dueDate
							snoozedUntilAt
							state {
								id
								name
								type
							}
							team {
								id
							}
							cycle {
								id
							}
							project {
								id
							}
							assignee {
								id
							}
							creator {
								id
							}
							labels {
								nodes {
									id
									name
									color
								}
							}
						}
						pageInfo {
							hasNextPage
							endCursor
						}
					}
				}
			}
		`;

		const result = (await this.linearClient.client.request(graphqlQuery, {
			cycleId,
			...variables,
		})) as {
			cycle?: {
				issues: {
					nodes: LinearIssue[];
					pageInfo: { hasNextPage: boolean; endCursor: string };
				};
			};
		};
		return result.cycle?.issues;
	}

	/**
	 * Sync issues from Linear to database
	 */
	async sync(options: Record<string, unknown> = {}): Promise<void> {
		const { incremental, teamId, cycleId, limit } = options as {
			incremental?: boolean;
			teamId?: string;
			cycleId?: string;
			limit?: number;
		};
		console.log("Starting issue sync...");

		try {
			const syncedIssues = await this.executeWithRetry(() =>
				this.syncIssues(incremental, teamId, cycleId, limit),
			);
			console.log(`✅ Synced ${syncedIssues} issues`);
		} catch (error) {
			console.error("❌ Issue sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync issues by cycle ID
	 */
	async syncByCycle(
		cycleId: string,
		options: Record<string, unknown> = {},
	): Promise<void> {
		const { incremental } = options as { incremental?: boolean };
		console.log(`Starting issue sync for cycle: ${cycleId}`);

		try {
			const cycle = await this.linearClient.cycle(cycleId);
			if (!cycle) {
				throw new Error(`Cycle ${cycleId} not found`);
			}

			console.log(`Syncing issues for cycle: ${cycle.name || cycleId}`);

			const syncedIssues = await this.executeWithRetry(() =>
				this.syncIssuesByCycle(cycleId, incremental),
			);

			console.log(
				`✅ Synced ${syncedIssues} issues for cycle: ${cycle.name || cycleId}`,
			);
		} catch (error) {
			console.error(`❌ Issue sync failed for cycle ${cycleId}:`, error);
			throw error;
		}
	}

	/**
	 * Sync issues with various filtering options
	 */
	private async syncIssues(
		incremental: boolean = false,
		teamId?: string,
		cycleId?: string,
		limit?: number,
	): Promise<number> {
		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time from existing issues
			const lastIssue = await this.db
				.select({ syncedAt: issues.syncedAt })
				.from(issues)
				.orderBy(issues.syncedAt)
				.limit(1);

			if (lastIssue.length > 0 && lastIssue[0]?.syncedAt) {
				lastSyncTime = lastIssue[0].syncedAt;
			}
		}

		// If cycleId is provided, sync only that cycle's issues
		if (cycleId) {
			return await this.syncIssuesByCycle(cycleId, incremental);
		}

		// If teamId is provided, sync only that team's issues
		if (teamId) {
			return await this.syncIssuesByTeam(teamId, lastSyncTime, limit);
		}

		// Otherwise, sync all issues
		return await this.syncAllIssues(lastSyncTime, limit);
	}

	/**
	 * Sync issues for a specific cycle
	 */
	private async syncIssuesByCycle(
		cycleId: string,
		incremental: boolean = false,
	): Promise<number> {
		console.log(`Fetching issues for cycle: ${cycleId}`);

		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time for issues in this cycle
			const lastIssue = await this.db
				.select({ syncedAt: issues.syncedAt })
				.from(issues)
				.where(eq(issues.cycleId, cycleId))
				.orderBy(issues.syncedAt)
				.limit(1);

			if (lastIssue.length > 0 && lastIssue[0]?.syncedAt) {
				lastSyncTime = lastIssue[0].syncedAt;
			}
		}

		const cycle = await this.linearClient.cycle(cycleId);
		if (!cycle) {
			throw new Error(`Cycle ${cycleId} not found`);
		}

		let allIssues: LinearIssue[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch cycle issues with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.fetchCycleIssuesGraphQL(cycleId, {
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			if (!response) {
				throw new Error(`Failed to fetch issues for cycle ${cycleId}`);
			}

			allIssues = allIssues.concat(response.nodes as unknown as LinearIssue[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress(`Cycle ${cycleId} issues fetched`, allIssues.length);
			await this.addDelay();
		}

		console.log(`Found ${allIssues.length} issues for cycle ${cycleId}`);

		if (allIssues.length === 0) {
			return 0;
		}

		// Process issues
		let processed = 0;
		for (const linearIssue of allIssues) {
			await this.upsertIssue(linearIssue);
			processed++;

			if (processed % 25 === 0) {
				this.logProgress("Issues processed", processed, allIssues.length);
			}

			// Small delay between issue processing
			await this.addDelay(25);
		}

		return processed;
	}

	/**
	 * Sync issues for a specific team
	 */
	private async syncIssuesByTeam(
		teamId: string,
		lastSyncTime?: Date | null,
		limit?: number,
	): Promise<number> {
		console.log(`Syncing issues for team: ${teamId}`);

		const team = await this.linearClient.team(teamId);
		if (!team) {
			throw new Error(`Team ${teamId} not found`);
		}

		let allIssues: LinearIssue[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch team issues with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.fetchIssuesGraphQL({
				first: limit && limit < 50 ? limit : 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && {
					filter: { ...filter, team: { id: { eq: teamId } } },
				}),
			});

			allIssues = allIssues.concat(response.nodes as unknown as LinearIssue[]);
			hasNextPage =
				response.pageInfo.hasNextPage && (!limit || allIssues.length < limit);
			cursor = response.pageInfo.endCursor;

			this.logProgress(`Team ${teamId} issues fetched`, allIssues.length);
			await this.addDelay();

			// Break if we've reached the limit
			if (limit && allIssues.length >= limit) {
				allIssues = allIssues.slice(0, limit);
				break;
			}
		}

		console.log(`Found ${allIssues.length} issues for team ${teamId}`);

		return await this.processIssues(allIssues);
	}

	/**
	 * Sync all issues across all teams
	 */
	private async syncAllIssues(
		lastSyncTime?: Date | null,
		limit?: number,
	): Promise<number> {
		console.log("Syncing all issues...");

		let allIssues: LinearIssue[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch all issues with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.fetchIssuesGraphQL({
				first: limit && limit < 50 ? limit : 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allIssues = allIssues.concat(response.nodes as unknown as LinearIssue[]);
			hasNextPage =
				response.pageInfo.hasNextPage && (!limit || allIssues.length < limit);
			cursor = response.pageInfo.endCursor;

			this.logProgress("Issues fetched", allIssues.length);
			await this.addDelay();

			// Break if we've reached the limit
			if (limit && allIssues.length >= limit) {
				allIssues = allIssues.slice(0, limit);
				break;
			}
		}

		console.log(`Found ${allIssues.length} issues to sync`);

		return await this.processIssues(allIssues);
	}

	/**
	 * Process a batch of issues
	 */
	private async processIssues(allIssues: LinearIssue[]): Promise<number> {
		if (allIssues.length === 0) {
			return 0;
		}

		// Process issues in batches
		const batchSize = 10;
		let processed = 0;

		for (let i = 0; i < allIssues.length; i += batchSize) {
			const batch = allIssues.slice(i, i + batchSize);

			for (const linearIssue of batch) {
				await this.upsertIssue(linearIssue);
				processed++;

				if (processed % 25 === 0) {
					this.logProgress("Issues processed", processed, allIssues.length);
				}
			}

			// Small delay between batches
			await this.addDelay(50);
		}

		return processed;
	}

	/**
	 * Upsert a single issue
	 */
	private async upsertIssue(linearIssue: LinearIssue): Promise<void> {
		const teamId = linearIssue.team?.id || linearIssue.teamId || "";
		const assigneeId = linearIssue.assignee?.id || null;
		const creatorId = linearIssue.creator?.id || null;
		const cycleId = linearIssue.cycle?.id || null;
		const projectId = linearIssue.project?.id || null;

		// Ensure dependencies exist before creating issue
		if (!teamId) {
			console.warn(`Skipping issue ${linearIssue.id} - no team ID`);
			return;
		}

		await this.ensureTeamExists(teamId);

		if (assigneeId) {
			await this.ensureUserExists(assigneeId);
		}

		if (creatorId) {
			await this.ensureUserExists(creatorId);
		}

		if (cycleId) {
			await this.ensureCycleExists(cycleId);
		}

		if (projectId) {
			await this.ensureProjectExists(projectId);
		}

		// Handle labels - ensure they exist and prepare junction table data
		const labelIds: string[] = [];
		if (linearIssue.labels?.nodes && linearIssue.labels.nodes.length > 0) {
			for (const labelNode of linearIssue.labels.nodes) {
				const labelId = labelNode.id;
				await this.ensureLabelExists(labelId);
				labelIds.push(labelId);
			}
		}

		// Handle state data from GraphQL response
		let stateName = "Backlog";
		let stateType = "unstarted";

		// GraphQL returns proper state object
		if (linearIssue.state && typeof linearIssue.state === "object") {
			stateName =
				(linearIssue.state as { name: string; type: string })?.name ||
				"Backlog";
			stateType =
				(linearIssue.state as { name: string; type: string })?.type ||
				"unstarted";
		} else if (typeof linearIssue.state === "string") {
			stateName = linearIssue.state || "Backlog";
			stateType = linearIssue.stateType || "unstarted";
		}

		// Final safety check - never allow empty/null values
		stateName = stateName || "Backlog";
		stateType = stateType || "unstarted";

		const issueData: NewIssue = {
			id: linearIssue.id,
			teamId: teamId,
			cycleId: cycleId,
			projectId: projectId,
			number: linearIssue.number,
			title: linearIssue.title,
			description: linearIssue.description || null,
			priority: linearIssue.priority || null,
			priorityLabel: linearIssue.priorityLabel || null,
			estimate: linearIssue.estimate ? linearIssue.estimate.toString() : null,
			assigneeId: assigneeId,
			creatorId: creatorId,
			state: stateName,
			stateType: stateType,
			labels: null, // We'll use the junction table instead
			url: linearIssue.url || null,
			branchName: linearIssue.branchName || null,
			customerTicketCount: linearIssue.customerTicketCount || 0,
			createdAt: this.parseLinearDate(linearIssue.createdAt),
			updatedAt: this.parseLinearDate(linearIssue.updatedAt),
			completedAt: linearIssue.completedAt
				? this.parseLinearDate(linearIssue.completedAt)
				: null,
			canceledAt: linearIssue.canceledAt
				? this.parseLinearDate(linearIssue.canceledAt)
				: null,
			startedAt: linearIssue.startedAt
				? this.parseLinearDate(linearIssue.startedAt)
				: null,
			archivedAt: linearIssue.archivedAt
				? this.parseLinearDate(linearIssue.archivedAt)
				: null,
			autoArchivedAt: linearIssue.autoArchivedAt
				? this.parseLinearDate(linearIssue.autoArchivedAt)
				: null,
			autoClosedAt: linearIssue.autoClosedAt
				? this.parseLinearDate(linearIssue.autoClosedAt)
				: null,
			dueDate: linearIssue.dueDate
				? this.parseLinearDate(linearIssue.dueDate)
				: null,
			snoozedUntilAt: linearIssue.snoozedUntilAt
				? this.parseLinearDate(linearIssue.snoozedUntilAt)
				: null,
			syncedAt: new Date(),
		};

		// Check if issue exists
		const existingIssue = await this.db
			.select()
			.from(issues)
			.where(eq(issues.id, linearIssue.id))
			.limit(1);

		if (existingIssue.length > 0) {
			// Update existing issue
			await this.db
				.update(issues)
				.set(issueData)
				.where(eq(issues.id, linearIssue.id));
		} else {
			// Insert new issue
			await this.db.insert(issues).values(issueData);
		}

		// Sync issue-label associations
		await this.syncIssueLabels(linearIssue.id, labelIds);
	}

	/**
	 * Ensure a user exists in the database, sync from Linear if not
	 */
	private async ensureUserExists(userId: string): Promise<void> {
		const existingUser = await this.db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (existingUser.length === 0) {
			console.log(`User ${userId} not found, syncing from Linear...`);
			try {
				await this.userSync.syncUserById(userId);
				console.log(`✅ Successfully synced user ${userId}`);
			} catch (error) {
				console.error(`❌ Failed to sync user ${userId}:`, error);
				throw new Error(`Cannot sync issue - user ${userId} sync failed`);
			}
		}
	}

	/**
	 * Ensure a team exists in the database, sync from Linear if not
	 */
	private async ensureTeamExists(teamId: string): Promise<void> {
		const existingTeam = await this.db
			.select()
			.from(teams)
			.where(eq(teams.id, teamId))
			.limit(1);

		if (existingTeam.length === 0) {
			console.log(`Team ${teamId} not found, syncing from Linear...`);
			try {
				await this.teamSync.syncTeamById(teamId);
				console.log(`✅ Successfully synced team ${teamId}`);
			} catch (error) {
				console.error(`❌ Failed to sync team ${teamId}:`, error);
				throw new Error(`Cannot sync issue - team ${teamId} sync failed`);
			}
		}
	}

	/**
	 * Ensure a cycle exists in the database, sync from Linear if not
	 */
	private async ensureCycleExists(cycleId: string): Promise<void> {
		const existingCycle = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.id, cycleId))
			.limit(1);

		if (existingCycle.length === 0) {
			console.log(`Cycle ${cycleId} not found, syncing from Linear...`);
			try {
				await this.cycleSync.syncCycleById(cycleId);
				console.log(`✅ Successfully synced cycle ${cycleId}`);
			} catch (error) {
				console.error(`❌ Failed to sync cycle ${cycleId}:`, error);
				throw new Error(`Cannot sync issue - cycle ${cycleId} sync failed`);
			}
		}
	}

	/**
	 * Ensure a project exists in the database, sync from Linear if not
	 */
	private async ensureProjectExists(projectId: string): Promise<void> {
		const existingProject = await this.db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);

		if (existingProject.length === 0) {
			console.log(`📦 Syncing missing project: ${projectId}`);
			try {
				await this.projectSync.syncProjectById(projectId);
				console.log(`✅ Synced project ${projectId}`);
			} catch (error) {
				console.error(`❌ Failed to sync project ${projectId}:`, error);
				// Don't throw error - allow issue sync to continue even if project sync fails
				console.warn(`⚠️ Issue will be created without project association`);
			}
		}
	}

	/**
	 * Ensure a label exists in the database, sync from Linear if not
	 */
	private async ensureLabelExists(labelId: string): Promise<void> {
		const existingLabel = await this.db
			.select()
			.from(labels)
			.where(eq(labels.id, labelId))
			.limit(1);

		if (existingLabel.length === 0) {
			try {
				await this.labelSync.ensureLabelExists(labelId);
			} catch (error) {
				console.warn(`⚠️ Could not sync label ${labelId}:`, error);
			}
		}
	}

	/**
	 * Sync issue-label associations in the junction table
	 */
	private async syncIssueLabels(
		issueId: string,
		labelIds: string[],
	): Promise<void> {
		// First, remove existing label associations for this issue
		await this.db.delete(issueLabels).where(eq(issueLabels.issueId, issueId));

		// Then, add new associations
		if (labelIds.length > 0) {
			const associations: NewIssueLabel[] = labelIds.map((labelId) => ({
				id: `${issueId}-${labelId}`,
				issueId,
				labelId,
				createdAt: new Date(),
			}));

			await this.db.insert(issueLabels).values(associations);
		}
	}

	/**
	 * Get issue by ID (helper method)
	 */
	async getIssueById(issueId: string): Promise<LinearIssue | null> {
		const result = await this.db
			.select()
			.from(issues)
			.where(eq(issues.id, issueId))
			.limit(1);

		if (!result[0]) return null;

		// Convert database issue to LinearIssue format
		const issue = result[0];
		return {
			id: issue.id,
			teamId: issue.teamId,
			cycleId: issue.cycleId ?? undefined,
			number: issue.number,
			title: issue.title,
			description: issue.description ?? undefined,
			priority: issue.priority ?? undefined,
			priorityLabel: issue.priorityLabel ?? undefined,
			estimate: issue.estimate ? parseFloat(issue.estimate) : undefined,
			assigneeId: issue.assigneeId ?? undefined,
			creatorId: issue.creatorId ?? undefined,
			state: issue.state,
			stateType: issue.stateType ?? undefined,
			labels: issue.labels ? JSON.parse(issue.labels as string) : undefined,
			url: issue.url ?? undefined,
			branchName: issue.branchName ?? undefined,
			customerTicketCount: issue.customerTicketCount ?? undefined,
			createdAt: issue.createdAt.toISOString(),
			updatedAt: issue.updatedAt.toISOString(),
			completedAt: issue.completedAt?.toISOString(),
			canceledAt: issue.canceledAt?.toISOString(),
			startedAt: issue.startedAt?.toISOString(),
			archivedAt: issue.archivedAt?.toISOString(),
			autoArchivedAt: issue.autoArchivedAt?.toISOString(),
			autoClosedAt: issue.autoClosedAt?.toISOString(),
			dueDate: issue.dueDate?.toISOString(),
			snoozedUntilAt: issue.snoozedUntilAt?.toISOString(),
		};
	}

	/**
	 * Get issues by team ID (helper method)
	 */
	async getIssuesByTeamId(
		teamId: string,
		limit?: number,
	): Promise<LinearIssue[]> {
		const baseQuery = this.db
			.select()
			.from(issues)
			.where(eq(issues.teamId, teamId));

		const result = limit ? await baseQuery.limit(limit) : await baseQuery;
		return result.map((issue) => ({
			id: issue.id,
			teamId: issue.teamId,
			cycleId: issue.cycleId ?? undefined,
			number: issue.number,
			title: issue.title,
			description: issue.description ?? undefined,
			priority: issue.priority ?? undefined,
			priorityLabel: issue.priorityLabel ?? undefined,
			estimate: issue.estimate ? parseFloat(issue.estimate) : undefined,
			assigneeId: issue.assigneeId ?? undefined,
			creatorId: issue.creatorId ?? undefined,
			state: issue.state,
			stateType: issue.stateType ?? undefined,
			labels: issue.labels ? JSON.parse(issue.labels as string) : undefined,
			url: issue.url ?? undefined,
			branchName: issue.branchName ?? undefined,
			customerTicketCount: issue.customerTicketCount ?? undefined,
			createdAt: issue.createdAt.toISOString(),
			updatedAt: issue.updatedAt.toISOString(),
			completedAt: issue.completedAt?.toISOString(),
			canceledAt: issue.canceledAt?.toISOString(),
			startedAt: issue.startedAt?.toISOString(),
			archivedAt: issue.archivedAt?.toISOString(),
			autoArchivedAt: issue.autoArchivedAt?.toISOString(),
			autoClosedAt: issue.autoClosedAt?.toISOString(),
			dueDate: issue.dueDate?.toISOString(),
			snoozedUntilAt: issue.snoozedUntilAt?.toISOString(),
		}));
	}

	/**
	 * Get issues by cycle ID (helper method)
	 */
	async getIssuesByCycleId(cycleId: string): Promise<LinearIssue[]> {
		const result = await this.db
			.select()
			.from(issues)
			.where(eq(issues.cycleId, cycleId));

		return result.map((issue) => ({
			id: issue.id,
			teamId: issue.teamId,
			cycleId: issue.cycleId ?? undefined,
			number: issue.number,
			title: issue.title,
			description: issue.description ?? undefined,
			priority: issue.priority ?? undefined,
			priorityLabel: issue.priorityLabel ?? undefined,
			estimate: issue.estimate ? parseFloat(issue.estimate) : undefined,
			assigneeId: issue.assigneeId ?? undefined,
			creatorId: issue.creatorId ?? undefined,
			state: issue.state,
			stateType: issue.stateType ?? undefined,
			labels: issue.labels ? JSON.parse(issue.labels as string) : undefined,
			url: issue.url ?? undefined,
			branchName: issue.branchName ?? undefined,
			customerTicketCount: issue.customerTicketCount ?? undefined,
			createdAt: issue.createdAt.toISOString(),
			updatedAt: issue.updatedAt.toISOString(),
			completedAt: issue.completedAt?.toISOString(),
			canceledAt: issue.canceledAt?.toISOString(),
			startedAt: issue.startedAt?.toISOString(),
			archivedAt: issue.archivedAt?.toISOString(),
			autoArchivedAt: issue.autoArchivedAt?.toISOString(),
			autoClosedAt: issue.autoClosedAt?.toISOString(),
			dueDate: issue.dueDate?.toISOString(),
			snoozedUntilAt: issue.snoozedUntilAt?.toISOString(),
		}));
	}

	/**
	 * Get issues by assignee (helper method)
	 */
	async getIssuesByAssignee(assigneeId: string): Promise<LinearIssue[]> {
		const result = await this.db
			.select()
			.from(issues)
			.where(eq(issues.assigneeId, assigneeId));

		return result.map((issue) => ({
			id: issue.id,
			teamId: issue.teamId,
			cycleId: issue.cycleId ?? undefined,
			number: issue.number,
			title: issue.title,
			description: issue.description ?? undefined,
			priority: issue.priority ?? undefined,
			priorityLabel: issue.priorityLabel ?? undefined,
			estimate: issue.estimate ? parseFloat(issue.estimate) : undefined,
			assigneeId: issue.assigneeId ?? undefined,
			creatorId: issue.creatorId ?? undefined,
			state: issue.state,
			stateType: issue.stateType ?? undefined,
			labels: issue.labels ? JSON.parse(issue.labels as string) : undefined,
			url: issue.url ?? undefined,
			branchName: issue.branchName ?? undefined,
			customerTicketCount: issue.customerTicketCount ?? undefined,
			createdAt: issue.createdAt.toISOString(),
			updatedAt: issue.updatedAt.toISOString(),
			completedAt: issue.completedAt?.toISOString(),
			canceledAt: issue.canceledAt?.toISOString(),
			startedAt: issue.startedAt?.toISOString(),
			archivedAt: issue.archivedAt?.toISOString(),
			autoArchivedAt: issue.autoArchivedAt?.toISOString(),
			autoClosedAt: issue.autoClosedAt?.toISOString(),
			dueDate: issue.dueDate?.toISOString(),
			snoozedUntilAt: issue.snoozedUntilAt?.toISOString(),
		}));
	}

	/**
	 * Sync a specific issue by ID
	 */
	async syncIssueById(issueId: string): Promise<void> {
		try {
			const linearIssue = await this.executeWithRetry(() =>
				this.linearClient.issue(issueId),
			);

			if (linearIssue) {
				await this.upsertIssue(linearIssue as unknown as LinearIssue);
				console.log(`✅ Synced issue: ${linearIssue.title}`);
			}
		} catch (error) {
			console.error(`❌ Failed to sync issue ${issueId}:`, error);
			throw error;
		}
	}

	/**
	 * Sync issues for multiple cycles
	 */
	async syncMultipleCycles(
		cycleIds: string[],
		options: Record<string, unknown> = {},
	): Promise<void> {
		const { incremental } = options as { incremental?: boolean };
		console.log(`Syncing issues for ${cycleIds.length} cycles...`);

		let totalSynced = 0;

		for (const cycleId of cycleIds) {
			try {
				console.log(`\nSyncing cycle: ${cycleId}`);
				const synced = await this.syncIssuesByCycle(cycleId, incremental);
				totalSynced += synced;
				console.log(`✅ Synced ${synced} issues for cycle ${cycleId}`);

				// Add delay between cycles
				await this.addDelay(300);
			} catch (error) {
				console.error(`❌ Failed to sync cycle ${cycleId}:`, error);
				// Continue with next cycle instead of failing completely
			}
		}

		console.log(`\n✅ Total issues synced across all cycles: ${totalSynced}`);
	}

	/**
	 * Get cycle statistics
	 */
	async getCycleStats(cycleId: string): Promise<Record<string, unknown>> {
		const cycleIssues = await this.getIssuesByCycleId(cycleId);

		const stats = {
			total: cycleIssues.length,
			completed: cycleIssues.filter((issue) => issue.completedAt).length,
			inProgress: cycleIssues.filter(
				(issue) => issue.startedAt && !issue.completedAt,
			).length,
			todo: cycleIssues.filter(
				(issue) => !issue.startedAt && !issue.completedAt,
			).length,
			canceled: cycleIssues.filter((issue) => issue.canceledAt).length,
		};

		return stats;
	}
}
