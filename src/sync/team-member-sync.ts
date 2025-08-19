import { eq } from "drizzle-orm";
import { type NewTeamMember, teamMembers, teams, users } from "../db/schema.js";
import { BaseSyncService } from "./base-sync.js";
import { TeamSyncService } from "./team-sync.js";
import { UserSyncService } from "./user-sync.js";

interface LinearTeamMember {
	id: string;
	teamId?: string | undefined;
	userId?: string | undefined;
	admin?: boolean | undefined;
	createdAt: string;
	updatedAt: string;
	team?: { id: string } | undefined;
	user?: { id: string } | undefined;
}

export class TeamMemberSyncService extends BaseSyncService {
	private userSync: UserSyncService;
	private teamSync: TeamSyncService;

	constructor() {
		super();
		this.userSync = new UserSyncService();
		this.teamSync = new TeamSyncService();
	}
	/**
	 * Sync team members from Linear to database
	 */
	async sync(options: Record<string, unknown> = {}): Promise<void> {
		const { incremental, teamId } = options as {
			incremental?: boolean;
			teamId?: string;
		};
		console.log("Starting team member sync...");

		try {
			const syncedMembers = await this.executeWithRetry(() =>
				this.syncTeamMembers(incremental, teamId),
			);
			console.log(`✅ Synced ${syncedMembers} team members`);
		} catch (error) {
			console.error("❌ Team member sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync team members with optional incremental sync
	 */
	private async syncTeamMembers(
		incremental: boolean = false,
		teamId?: string,
	): Promise<number> {
		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time from existing team members
			const lastMember = await this.db
				.select({ syncedAt: teamMembers.syncedAt })
				.from(teamMembers)
				.orderBy(teamMembers.syncedAt)
				.limit(1);

			if (lastMember.length > 0 && lastMember[0]?.syncedAt) {
				lastSyncTime = lastMember[0].syncedAt;
			}
		}

		// If teamId is provided, sync only that team's members
		if (teamId) {
			return await this.syncTeamMembersByTeam(teamId, lastSyncTime);
		}

		// Otherwise, sync all team members
		let allMembers: LinearTeamMember[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch all team memberships with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.linearClient.teamMemberships({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allMembers = allMembers.concat(
				response.nodes as unknown as LinearTeamMember[],
			);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Team members fetched", allMembers.length);
			await this.addDelay();
		}

		console.log(`Found ${allMembers.length} team members to sync`);

		if (allMembers.length === 0) {
			return 0;
		}

		// Process members in batches
		const batchSize = 10;
		let processed = 0;

		for (let i = 0; i < allMembers.length; i += batchSize) {
			const batch = allMembers.slice(i, i + batchSize);

			for (const linearMember of batch) {
				await this.upsertTeamMember(linearMember);
				processed++;

				if (processed % 10 === 0) {
					this.logProgress(
						"Team members processed",
						processed,
						allMembers.length,
					);
				}
			}

			// Small delay between batches
			await this.addDelay(50);
		}

		return processed;
	}

	/**
	 * Sync team members for a specific team
	 */
	private async syncTeamMembersByTeam(
		teamId: string,
		lastSyncTime?: Date | null,
	): Promise<number> {
		console.log(`Syncing members for team: ${teamId}`);

		const team = await this.linearClient.team(teamId);
		if (!team) {
			throw new Error(`Team ${teamId} not found`);
		}

		let allMembers: LinearTeamMember[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch team members with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await team.members({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			// Transform team members to include team context
			const membersWithTeam = response.nodes.map((member: unknown) => ({
				...(member as object),
				team: { id: teamId },
			})) as unknown as LinearTeamMember[];

			allMembers = allMembers.concat(membersWithTeam);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress(`Team ${teamId} members fetched`, allMembers.length);
			await this.addDelay();
		}

		console.log(`Found ${allMembers.length} members for team ${teamId}`);

		// Process members
		let processed = 0;
		for (const linearMember of allMembers) {
			await this.upsertTeamMember(linearMember);
			processed++;

			if (processed % 10 === 0) {
				this.logProgress(
					"Team members processed",
					processed,
					allMembers.length,
				);
			}
		}

		return processed;
	}

	/**
	 * Upsert a single team member
	 */
	private async upsertTeamMember(
		linearMember: LinearTeamMember,
	): Promise<void> {
		const userId = linearMember.user?.id || linearMember.userId || "";
		const teamId = linearMember.team?.id || linearMember.teamId || "";

		if (!userId) {
			console.warn(`Skipping team member ${linearMember.id} - no user ID`);
			return;
		}

		if (!teamId) {
			console.warn(`Skipping team member ${linearMember.id} - no team ID`);
			return;
		}

		// Ensure the user and team exist before creating team member
		await this.ensureUserExists(userId);
		await this.ensureTeamExists(teamId);

		const memberData: NewTeamMember = {
			id: linearMember.id,
			teamId: teamId,
			userId: userId,
			admin: linearMember.admin || false,
			createdAt: this.parseLinearDate(linearMember.createdAt),
			updatedAt: this.parseLinearDate(linearMember.updatedAt),
			syncedAt: new Date(),
		};

		// Check if team member exists
		const existingMember = await this.db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.id, linearMember.id))
			.limit(1);

		if (existingMember.length > 0) {
			// Update existing team member
			await this.db
				.update(teamMembers)
				.set(memberData)
				.where(eq(teamMembers.id, linearMember.id));
		} else {
			// Insert new team member
			await this.db.insert(teamMembers).values(memberData);
		}
	}

	/**
	 * Ensure a user exists in the database, sync from Linear if not
	 */
	private async ensureUserExists(userId: string): Promise<void> {
		// Check if user exists in database
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
				throw new Error(`Cannot sync team member - user ${userId} sync failed`);
			}
		}
	}

	/**
	 * Ensure a team exists in the database, sync from Linear if not
	 */
	private async ensureTeamExists(teamId: string): Promise<void> {
		// Check if team exists in database
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
				throw new Error(`Cannot sync team member - team ${teamId} sync failed`);
			}
		}
	}

	/**
	 * Get team members by team ID (helper method)
	 */
	async getTeamMembersByTeamId(teamId: string): Promise<LinearTeamMember[]> {
		const result = await this.db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.teamId, teamId));

		return result.map((member) => ({
			id: member.id,
			teamId: member.teamId,
			userId: member.userId,
			admin: member.admin ?? undefined,
			createdAt: member.createdAt.toISOString(),
			updatedAt: member.updatedAt.toISOString(),
		}));
	}

	/**
	 * Get team members by user ID (helper method)
	 */
	async getTeamMembersByUserId(userId: string): Promise<LinearTeamMember[]> {
		const result = await this.db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.userId, userId));

		return result.map((member) => ({
			id: member.id,
			teamId: member.teamId,
			userId: member.userId,
			admin: member.admin ?? undefined,
			createdAt: member.createdAt.toISOString(),
			updatedAt: member.updatedAt.toISOString(),
		}));
	}

	/**
	 * Check if user is member of team
	 */
	async isUserTeamMember(userId: string, teamId: string): Promise<boolean> {
		const result = await this.db
			.select()
			.from(teamMembers)
			.where(eq(teamMembers.userId, userId))
			.limit(1);

		return result.some((member) => member.teamId === teamId);
	}

	/**
	 * Sync team members for all teams
	 */
	async syncAllTeamMembers(): Promise<void> {
		console.log("Syncing team members for all teams...");

		// Get all teams first
		const teamsResponse = await this.linearClient.teams();
		const teams = teamsResponse.nodes;

		console.log(`Found ${teams.length} teams to sync members for`);

		let totalSynced = 0;

		for (const team of teams) {
			console.log(`\nSyncing members for team: ${team.name} (${team.key})`);

			try {
				const synced = await this.syncTeamMembersByTeam(team.id);
				totalSynced += synced;
				console.log(`✅ Synced ${synced} members for team ${team.name}`);
			} catch (error) {
				console.error(
					`❌ Failed to sync members for team ${team.name}:`,
					error,
				);
				// Continue with next team instead of failing completely
			}

			// Add delay between teams
			await this.addDelay(200);
		}

		console.log(`\n✅ Total team members synced: ${totalSynced}`);
	}
}
