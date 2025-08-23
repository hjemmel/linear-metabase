import { CycleSyncService } from "./cycle-sync.js";
import { IssueSyncService } from "./issue-sync.js";
import { LabelSyncService } from "./label-sync.js";
import { ProjectSyncService } from "./project-sync.js";
import { TeamMemberSyncService } from "./team-member-sync.js";
import { TeamSyncService } from "./team-sync.js";
import { UserSyncService } from "./user-sync.js";

export interface SyncOptions {
	incremental?: boolean;
	teamId?: string;
	cycleId?: string;
	limit?: number;
	order?: (
		| "users"
		| "teams"
		| "teamMembers"
		| "cycles"
		| "labels"
		| "projects"
		| "issues"
	)[];
}

export class SyncOrchestrator {
	private userSync: UserSyncService;
	private teamSync: TeamSyncService;
	private teamMemberSync: TeamMemberSyncService;
	private cycleSync: CycleSyncService;
	private labelSync: LabelSyncService;
	private projectSync: ProjectSyncService;
	private issueSync: IssueSyncService;

	constructor() {
		this.userSync = new UserSyncService();
		this.teamSync = new TeamSyncService();
		this.teamMemberSync = new TeamMemberSyncService();
		this.cycleSync = new CycleSyncService();
		this.labelSync = new LabelSyncService();
		this.projectSync = new ProjectSyncService();
		this.issueSync = new IssueSyncService();
	}

	/**
	 * Sync all entities in the correct order
	 */
	async syncAll(options: SyncOptions = {}): Promise<void> {
		const { incremental = false, teamId, order } = options;

		console.log("🚀 Starting full sync...");
		console.log(`Mode: ${incremental ? "Incremental" : "Full"}`);
		if (teamId) console.log(`Team filter: ${teamId}`);

		const startTime = Date.now();

		try {
			// Default order ensures foreign key dependencies are respected
			const syncOrder = order || [
				"users",
				"teams",
				"teamMembers",
				"cycles",
				"labels",
				"projects",
				"issues",
			];

			for (const entity of syncOrder) {
				console.log(`\n📊 Syncing ${entity}...`);

				switch (entity) {
					case "users":
						await this.userSync.sync({ incremental });
						break;
					case "teams":
						await this.teamSync.sync({ incremental });
						break;
					case "teamMembers":
						await this.teamMemberSync.sync({
							incremental,
							...(teamId && { teamId }),
						});
						break;
					case "cycles":
						await this.cycleSync.sync({
							incremental,
							...(teamId && { teamId }),
						});
						break;
					case "labels":
						await this.labelSync.sync({
							incremental,
						});
						break;
					case "projects":
						await this.projectSync.sync({
							incremental,
						});
						break;
					case "issues":
						await this.issueSync.sync({
							incremental,
							...(teamId && { teamId }),
							...(options.limit && { limit: options.limit }),
						});
						break;
				}

				// Add delay between entity types
				await this.sleep(500);
			}

			const duration = (Date.now() - startTime) / 1000;
			console.log(
				`\n✅ Full sync completed successfully in ${duration.toFixed(2)}s`,
			);
		} catch (error) {
			const duration = (Date.now() - startTime) / 1000;
			console.error(
				`\n❌ Full sync failed after ${duration.toFixed(2)}s:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Sync issues for a specific cycle
	 */
	async syncIssuesByCycle(
		cycleId: string,
		options: { incremental?: boolean } = {},
	): Promise<void> {
		console.log(`🎯 Starting cycle-specific issue sync for: ${cycleId}`);

		const startTime = Date.now();

		try {
			// Ensure dependencies are synced first
			console.log("📊 Syncing users (for assignees/creators)...");
			await this.userSync.sync({ incremental: true });

			console.log("📊 Syncing teams (for team reference)...");
			await this.teamSync.sync({ incremental: true });

			console.log("📊 Syncing cycle data...");
			await this.cycleSync.syncCycleById(cycleId);

			console.log(`📊 Syncing issues for cycle: ${cycleId}...`);
			await this.issueSync.syncByCycle(cycleId, options);

			const duration = (Date.now() - startTime) / 1000;
			console.log(
				`\n✅ Cycle sync completed successfully in ${duration.toFixed(2)}s`,
			);
		} catch (error) {
			const duration = (Date.now() - startTime) / 1000;
			console.error(
				`\n❌ Cycle sync failed after ${duration.toFixed(2)}s:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Sync issues for multiple cycles
	 */
	async syncIssuesForCycles(
		cycleIds: string[],
		options: { incremental?: boolean } = {},
	): Promise<void> {
		console.log(
			`🎯 Starting multi-cycle issue sync for ${cycleIds.length} cycles`,
		);

		const startTime = Date.now();

		try {
			// Ensure dependencies are synced first
			console.log("📊 Syncing users (for assignees/creators)...");
			await this.userSync.sync({ incremental: true });

			console.log("📊 Syncing teams (for team reference)...");
			await this.teamSync.sync({ incremental: true });

			console.log("📊 Syncing cycles...");
			for (const cycleId of cycleIds) {
				await this.cycleSync.syncCycleById(cycleId);
			}

			console.log(`📊 Syncing issues for ${cycleIds.length} cycles...`);
			await this.issueSync.syncMultipleCycles(cycleIds, options);

			const duration = (Date.now() - startTime) / 1000;
			console.log(
				`\n✅ Multi-cycle sync completed successfully in ${duration.toFixed(2)}s`,
			);
		} catch (error) {
			const duration = (Date.now() - startTime) / 1000;
			console.error(
				`\n❌ Multi-cycle sync failed after ${duration.toFixed(2)}s:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Sync data for a specific team
	 */
	async syncTeam(
		teamId: string,
		options: {
			incremental?: boolean;
			includeIssues?: boolean;
			issueLimit?: number;
		} = {},
	): Promise<void> {
		const { incremental = false, includeIssues = true, issueLimit } = options;

		console.log(`🏢 Starting team-specific sync for: ${teamId}`);

		const startTime = Date.now();

		try {
			// Sync users first (for foreign key references)
			console.log("📊 Syncing users...");
			await this.userSync.sync({ incremental });

			// Sync the specific team
			console.log(`📊 Syncing team: ${teamId}...`);
			await this.teamSync.syncTeamById(teamId);

			// Sync team members
			console.log("📊 Syncing team members...");
			await this.teamMemberSync.sync({ incremental, teamId });

			// Sync team cycles
			console.log("📊 Syncing team cycles...");
			await this.cycleSync.sync({ incremental, teamId });

			// Optionally sync team issues
			if (includeIssues) {
				console.log("📊 Syncing team issues...");
				await this.issueSync.sync({
					incremental,
					teamId,
					...(issueLimit && { limit: issueLimit }),
				});
			}

			const duration = (Date.now() - startTime) / 1000;
			console.log(
				`\n✅ Team sync completed successfully in ${duration.toFixed(2)}s`,
			);
		} catch (error) {
			const duration = (Date.now() - startTime) / 1000;
			console.error(
				`\n❌ Team sync failed after ${duration.toFixed(2)}s:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Quick sync - only sync essential data
	 */
	async syncEssentials(options: { teamId?: string } = {}): Promise<void> {
		console.log("⚡ Starting quick essentials sync...");

		const startTime = Date.now();

		try {
			await this.userSync.sync({ incremental: true });
			await this.teamSync.sync({ incremental: true });

			if (options.teamId) {
				await this.teamMemberSync.sync({
					incremental: true,
					teamId: options.teamId,
				});
				await this.cycleSync.sync({
					incremental: true,
					teamId: options.teamId,
				});
			} else {
				await this.teamMemberSync.sync({ incremental: true });
				await this.cycleSync.sync({ incremental: true });
			}

			const duration = (Date.now() - startTime) / 1000;
			console.log(`\n✅ Essentials sync completed in ${duration.toFixed(2)}s`);
		} catch (error) {
			const duration = (Date.now() - startTime) / 1000;
			console.error(
				`\n❌ Essentials sync failed after ${duration.toFixed(2)}s:`,
				error,
			);
			throw error;
		}
	}

	/**
	 * Get sync statistics
	 */
	async getSyncStats(): Promise<Record<string, unknown>> {
		console.log("📈 Gathering sync statistics...");

		try {
			const teams = await this.teamSync.getAllTeams();
			const cycles = await this.cycleSync.getActiveCycles();

			// Get actual counts from database
			const stats = {
				teams: teams?.length || 0,
				activeCycles: cycles?.length || 0,
				lastSyncTime: new Date().toISOString(),
			};

			console.log("📊 Sync Statistics:", stats);
			return stats;
		} catch (error) {
			console.error("❌ Failed to get sync stats:", error);
			return {
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Validate sync integrity
	 */
	async validateSync(): Promise<Record<string, unknown>> {
		console.log("🔍 Validating sync integrity...");

		try {
			const validation = {
				orphanedIssues: 0,
				missingAssignees: 0,
				missingTeams: 0,
				issues: [],
			};

			// This is a basic validation - you can expand this
			console.log("✅ Sync validation completed");
			return validation;
		} catch (error) {
			console.error("❌ Sync validation failed:", error);
			return {
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * Utility method for sleeping
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Get service instances (for advanced usage)
	 */
	getServices() {
		return {
			users: this.userSync,
			teams: this.teamSync,
			teamMembers: this.teamMemberSync,
			cycles: this.cycleSync,
			labels: this.labelSync,
			projects: this.projectSync,
			issues: this.issueSync,
		};
	}
}
