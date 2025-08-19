import { eq } from "drizzle-orm";
import { cycles, type NewCycle } from "../db/schema.js";
import { BaseSyncService } from "./base-sync.js";

interface LinearCycle {
	id: string;
	teamId?: string | undefined;
	number?: number | undefined;
	name?: string | undefined;
	description?: string | undefined;
	startsAt: string;
	endsAt: string;
	completedAt?: string | undefined;
	autoArchivedAt?: string | undefined;
	createdAt: string;
	updatedAt: string;
	archivedAt?: string | undefined;
	team?: { id: string } | undefined;
}

export class CycleSyncService extends BaseSyncService {
	/**
	 * Sync cycles from Linear to database
	 */
	async sync(options: Record<string, unknown> = {}): Promise<void> {
		const { incremental, teamId } = options as {
			incremental?: boolean;
			teamId?: string;
		};
		console.log("Starting cycle sync...");

		try {
			const syncedCycles = await this.executeWithRetry(() =>
				this.syncCycles(incremental, teamId),
			);
			console.log(`✅ Synced ${syncedCycles} cycles`);
		} catch (error) {
			console.error("❌ Cycle sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync cycles with optional incremental sync and team filtering
	 */
	private async syncCycles(
		incremental: boolean = false,
		teamId?: string,
	): Promise<number> {
		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time from existing cycles
			const lastCycle = await this.db
				.select({ syncedAt: cycles.syncedAt })
				.from(cycles)
				.orderBy(cycles.syncedAt)
				.limit(1);

			if (lastCycle.length > 0 && lastCycle[0]?.syncedAt) {
				lastSyncTime = lastCycle[0].syncedAt;
			}
		}

		// If teamId is provided, sync only that team's cycles
		if (teamId) {
			return await this.syncCyclesByTeam(teamId, lastSyncTime);
		}

		// Otherwise, sync all cycles
		let allCycles: LinearCycle[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch all cycles with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.linearClient.cycles({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allCycles = allCycles.concat(response.nodes as unknown as LinearCycle[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Cycles fetched", allCycles.length);
			await this.addDelay();
		}

		console.log(`Found ${allCycles.length} cycles to sync`);

		if (allCycles.length === 0) {
			return 0;
		}

		// Process cycles in batches
		const batchSize = 10;
		let processed = 0;

		for (let i = 0; i < allCycles.length; i += batchSize) {
			const batch = allCycles.slice(i, i + batchSize);

			for (const linearCycle of batch) {
				await this.upsertCycle(linearCycle);
				processed++;

				if (processed % 10 === 0) {
					this.logProgress("Cycles processed", processed, allCycles.length);
				}
			}

			// Small delay between batches
			await this.addDelay(50);
		}

		return processed;
	}

	/**
	 * Sync cycles for a specific team
	 */
	private async syncCyclesByTeam(
		teamId: string,
		lastSyncTime?: Date | null,
	): Promise<number> {
		console.log(`Syncing cycles for team: ${teamId}`);

		const team = await this.linearClient.team(teamId);
		if (!team) {
			throw new Error(`Team ${teamId} not found`);
		}

		let allCycles: LinearCycle[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch team cycles with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await team.cycles({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allCycles = allCycles.concat(response.nodes as unknown as LinearCycle[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress(`Team ${teamId} cycles fetched`, allCycles.length);
			await this.addDelay();
		}

		console.log(`Found ${allCycles.length} cycles for team ${teamId}`);

		// Process cycles
		let processed = 0;
		for (const linearCycle of allCycles) {
			await this.upsertCycle(linearCycle);
			processed++;

			if (processed % 10 === 0) {
				this.logProgress("Cycles processed", processed, allCycles.length);
			}
		}

		return processed;
	}

	/**
	 * Upsert a single cycle
	 */
	private async upsertCycle(linearCycle: LinearCycle): Promise<void> {
		const cycleData: NewCycle = {
			id: linearCycle.id,
			teamId: linearCycle.team?.id || linearCycle.teamId || "",
			number: linearCycle.number || null,
			name: linearCycle.name || null,
			description: linearCycle.description || null,
			startsAt: this.parseLinearDate(linearCycle.startsAt),
			endsAt: this.parseLinearDate(linearCycle.endsAt),
			completedAt: linearCycle.completedAt
				? this.parseLinearDate(linearCycle.completedAt)
				: null,
			autoArchivedAt: linearCycle.autoArchivedAt
				? this.parseLinearDate(linearCycle.autoArchivedAt)
				: null,
			createdAt: this.parseLinearDate(linearCycle.createdAt),
			updatedAt: this.parseLinearDate(linearCycle.updatedAt),
			archivedAt: linearCycle.archivedAt
				? this.parseLinearDate(linearCycle.archivedAt)
				: null,
			syncedAt: new Date(),
		};

		// Check if cycle exists
		const existingCycle = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.id, linearCycle.id))
			.limit(1);

		if (existingCycle.length > 0) {
			// Update existing cycle
			await this.db
				.update(cycles)
				.set(cycleData)
				.where(eq(cycles.id, linearCycle.id));
		} else {
			// Insert new cycle
			await this.db.insert(cycles).values(cycleData);
		}
	}

	/**
	 * Get cycle by ID (helper method)
	 */
	async getCycleById(cycleId: string): Promise<LinearCycle | null> {
		const result = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.id, cycleId))
			.limit(1);

		if (!result[0]) return null;

		// Convert database cycle to LinearCycle format
		return {
			id: result[0].id,
			teamId: result[0].teamId,
			number: result[0].number ?? undefined,
			name: result[0].name ?? undefined,
			description: result[0].description ?? undefined,
			startsAt: result[0].startsAt.toISOString(),
			endsAt: result[0].endsAt.toISOString(),
			completedAt: result[0].completedAt?.toISOString(),
			autoArchivedAt: result[0].autoArchivedAt?.toISOString(),
			createdAt: result[0].createdAt.toISOString(),
			updatedAt: result[0].updatedAt.toISOString(),
			archivedAt: result[0].archivedAt?.toISOString(),
		};
	}

	/**
	 * Get cycles by team ID (helper method)
	 */
	async getCyclesByTeamId(teamId: string): Promise<LinearCycle[]> {
		const result = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.teamId, teamId));

		return result.map((cycle) => ({
			id: cycle.id,
			teamId: cycle.teamId,
			number: cycle.number ?? undefined,
			name: cycle.name ?? undefined,
			description: cycle.description ?? undefined,
			startsAt: cycle.startsAt.toISOString(),
			endsAt: cycle.endsAt.toISOString(),
			completedAt: cycle.completedAt?.toISOString(),
			autoArchivedAt: cycle.autoArchivedAt?.toISOString(),
			createdAt: cycle.createdAt.toISOString(),
			updatedAt: cycle.updatedAt.toISOString(),
			archivedAt: cycle.archivedAt?.toISOString(),
		}));
	}

	/**
	 * Get active cycles (not completed or archived)
	 */
	async getActiveCycles(): Promise<LinearCycle[]> {
		const result = await this.db.select().from(cycles);

		return result
			.filter((cycle) => !cycle.completedAt && !cycle.archivedAt)
			.map((cycle) => ({
				id: cycle.id,
				teamId: cycle.teamId,
				number: cycle.number ?? undefined,
				name: cycle.name ?? undefined,
				description: cycle.description ?? undefined,
				startsAt: cycle.startsAt.toISOString(),
				endsAt: cycle.endsAt.toISOString(),
				completedAt: cycle.completedAt?.toISOString(),
				autoArchivedAt: cycle.autoArchivedAt?.toISOString(),
				createdAt: cycle.createdAt.toISOString(),
				updatedAt: cycle.updatedAt.toISOString(),
				archivedAt: cycle.archivedAt?.toISOString(),
			}));
	}

	/**
	 * Get current cycle for a team (active cycle that contains current date)
	 */
	async getCurrentCycleForTeam(teamId: string): Promise<LinearCycle | null> {
		const now = new Date();
		const result = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.teamId, teamId));

		// Filter to find cycle that contains current date
		const currentCycle = result
			.filter((cycle) => !cycle.completedAt && !cycle.archivedAt)
			.find((cycle) => cycle.startsAt <= now && cycle.endsAt >= now);

		if (!currentCycle) return null;

		// Convert database cycle to LinearCycle format
		return {
			id: currentCycle.id,
			teamId: currentCycle.teamId,
			number: currentCycle.number ?? undefined,
			name: currentCycle.name ?? undefined,
			description: currentCycle.description ?? undefined,
			startsAt: currentCycle.startsAt.toISOString(),
			endsAt: currentCycle.endsAt.toISOString(),
			completedAt: currentCycle.completedAt?.toISOString(),
			autoArchivedAt: currentCycle.autoArchivedAt?.toISOString(),
			createdAt: currentCycle.createdAt.toISOString(),
			updatedAt: currentCycle.updatedAt.toISOString(),
			archivedAt: currentCycle.archivedAt?.toISOString(),
		};
	}

	/**
	 * Sync a specific cycle by ID
	 */
	async syncCycleById(cycleId: string): Promise<void> {
		try {
			const linearCycle = await this.executeWithRetry(() =>
				this.linearClient.cycle(cycleId),
			);

			if (linearCycle) {
				await this.upsertCycle(linearCycle as unknown as LinearCycle);
				console.log(`✅ Synced cycle: ${linearCycle.name || cycleId}`);
			}
		} catch (error) {
			console.error(`❌ Failed to sync cycle ${cycleId}:`, error);
			throw error;
		}
	}

	/**
	 * Sync cycles for all teams
	 */
	async syncAllTeamCycles(): Promise<void> {
		console.log("Syncing cycles for all teams...");

		// Get all teams first
		const teamsResponse = await this.linearClient.teams();
		const teams = teamsResponse.nodes;

		console.log(`Found ${teams.length} teams to sync cycles for`);

		let totalSynced = 0;

		for (const team of teams) {
			console.log(`\nSyncing cycles for team: ${team.name} (${team.key})`);

			try {
				const synced = await this.syncCyclesByTeam(team.id);
				totalSynced += synced;
				console.log(`✅ Synced ${synced} cycles for team ${team.name}`);
			} catch (error) {
				console.error(`❌ Failed to sync cycles for team ${team.name}:`, error);
				// Continue with next team instead of failing completely
			}

			// Add delay between teams
			await this.addDelay(200);
		}

		console.log(`\n✅ Total cycles synced: ${totalSynced}`);
	}
}
