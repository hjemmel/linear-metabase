import { eq } from "drizzle-orm";
import { type NewTeam, teams } from "../db/schema.js";
import { BaseSyncService } from "./base-sync.js";

interface LinearTeam {
	id: string;
	name: string;
	key: string;
	description?: string | undefined;
	icon?: string | undefined;
	color?: string | undefined;
	private?: boolean | undefined;
	createdAt: string;
	updatedAt: string;
	archivedAt?: string | undefined;
}

export class TeamSyncService extends BaseSyncService {
	/**
	 * Sync teams from Linear to database
	 */
	async sync(options: Record<string, unknown> = {}): Promise<void> {
		const { incremental } = options as { incremental?: boolean };
		console.log("Starting team sync...");

		try {
			const syncedTeams = await this.executeWithRetry(() =>
				this.syncTeams(incremental),
			);
			console.log(`✅ Synced ${syncedTeams} teams`);
		} catch (error) {
			console.error("❌ Team sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync teams with optional incremental sync
	 */
	private async syncTeams(incremental: boolean = false): Promise<number> {
		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time from existing teams
			const lastTeam = await this.db
				.select({ syncedAt: teams.syncedAt })
				.from(teams)
				.orderBy(teams.syncedAt)
				.limit(1);

			if (lastTeam.length > 0 && lastTeam[0]?.syncedAt) {
				lastSyncTime = lastTeam[0].syncedAt;
			}
		}

		let allTeams: LinearTeam[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch all teams with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.linearClient.teams({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allTeams = allTeams.concat(response.nodes as unknown as LinearTeam[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Teams fetched", allTeams.length);
			await this.addDelay();
		}

		console.log(`Found ${allTeams.length} teams to sync`);

		if (allTeams.length === 0) {
			return 0;
		}

		// Process teams in batches
		const batchSize = 10;
		let processed = 0;

		for (let i = 0; i < allTeams.length; i += batchSize) {
			const batch = allTeams.slice(i, i + batchSize);

			for (const linearTeam of batch) {
				await this.upsertTeam(linearTeam);
				processed++;

				if (processed % 10 === 0) {
					this.logProgress("Teams processed", processed, allTeams.length);
				}
			}

			// Small delay between batches
			await this.addDelay(50);
		}

		return processed;
	}

	/**
	 * Upsert a single team
	 */
	private async upsertTeam(linearTeam: LinearTeam): Promise<void> {
		const teamData: NewTeam = {
			id: linearTeam.id,
			name: linearTeam.name,
			key: linearTeam.key,
			description: linearTeam.description || null,
			icon: linearTeam.icon || null,
			color: linearTeam.color || null,
			private: linearTeam.private || false,
			createdAt: this.parseLinearDate(linearTeam.createdAt),
			updatedAt: this.parseLinearDate(linearTeam.updatedAt),
			archivedAt: linearTeam.archivedAt
				? this.parseLinearDate(linearTeam.archivedAt)
				: null,
			syncedAt: new Date(),
		};

		// Check if team exists
		const existingTeam = await this.db
			.select()
			.from(teams)
			.where(eq(teams.id, linearTeam.id))
			.limit(1);

		if (existingTeam.length > 0) {
			// Update existing team
			await this.db
				.update(teams)
				.set(teamData)
				.where(eq(teams.id, linearTeam.id));
		} else {
			// Insert new team
			await this.db.insert(teams).values(teamData);
		}
	}

	/**
	 * Get team by ID (helper method)
	 */
	async getTeamById(teamId: string): Promise<LinearTeam | null> {
		const result = await this.db
			.select()
			.from(teams)
			.where(eq(teams.id, teamId))
			.limit(1);

		if (!result[0]) return null;

		// Convert database team to LinearTeam format
		return {
			id: result[0].id,
			name: result[0].name,
			key: result[0].key,
			description: result[0].description ?? undefined,
			icon: result[0].icon ?? undefined,
			color: result[0].color ?? undefined,
			private: result[0].private ?? undefined,
			createdAt: result[0].createdAt.toISOString(),
			updatedAt: result[0].updatedAt.toISOString(),
			archivedAt: result[0].archivedAt?.toISOString(),
		};
	}

	/**
	 * Get team by key (helper method)
	 */
	async getTeamByKey(teamKey: string): Promise<LinearTeam | null> {
		const result = await this.db
			.select()
			.from(teams)
			.where(eq(teams.key, teamKey))
			.limit(1);

		if (!result[0]) return null;

		// Convert database team to LinearTeam format
		return {
			id: result[0].id,
			name: result[0].name,
			key: result[0].key,
			description: result[0].description ?? undefined,
			icon: result[0].icon ?? undefined,
			color: result[0].color ?? undefined,
			private: result[0].private ?? undefined,
			createdAt: result[0].createdAt.toISOString(),
			updatedAt: result[0].updatedAt.toISOString(),
			archivedAt: result[0].archivedAt?.toISOString(),
		};
	}

	/**
	 * Sync a specific team by ID
	 */
	async syncTeamById(teamId: string): Promise<void> {
		try {
			const linearTeam = await this.executeWithRetry(() =>
				this.linearClient.team(teamId),
			);

			if (linearTeam) {
				await this.upsertTeam(linearTeam as unknown as LinearTeam);
				console.log(`✅ Synced team: ${linearTeam.name}`);
			}
		} catch (error) {
			console.error(`❌ Failed to sync team ${teamId}:`, error);
			throw error;
		}
	}

	/**
	 * Get all teams (helper method for other sync services)
	 */
	async getAllTeams(): Promise<LinearTeam[]> {
		const result = await this.db.select().from(teams);
		return result.map((team) => ({
			id: team.id,
			name: team.name,
			key: team.key,
			description: team.description ?? undefined,
			icon: team.icon ?? undefined,
			color: team.color ?? undefined,
			private: team.private ?? undefined,
			createdAt: team.createdAt.toISOString(),
			updatedAt: team.updatedAt.toISOString(),
			archivedAt: team.archivedAt?.toISOString(),
		}));
	}
}
