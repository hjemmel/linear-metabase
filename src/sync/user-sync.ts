import { eq } from "drizzle-orm";
import { type NewUser, users } from "../db/schema.js";
import { BaseSyncService } from "./base-sync.js";

interface LinearUser {
	id: string;
	name: string;
	email?: string | undefined;
	displayName?: string | undefined;
	avatarUrl?: string | undefined;
	admin?: boolean | undefined;
	active?: boolean | undefined;
	createdAt: string;
	updatedAt: string;
	archivedAt?: string | undefined;
}

export class UserSyncService extends BaseSyncService {
	/**
	 * Sync users from Linear to database
	 */
	async sync(options: Record<string, unknown> = {}): Promise<void> {
		const { incremental } = options as { incremental?: boolean };
		console.log("Starting user sync...");

		try {
			const syncedUsers = await this.executeWithRetry(() =>
				this.syncUsers(incremental),
			);
			console.log(`✅ Synced ${syncedUsers} users`);
		} catch (error) {
			console.error("❌ User sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync users with optional incremental sync
	 */
	private async syncUsers(incremental: boolean = false): Promise<number> {
		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time from existing users
			const lastUser = await this.db
				.select({ syncedAt: users.syncedAt })
				.from(users)
				.orderBy(users.syncedAt)
				.limit(1);

			if (lastUser.length > 0 && lastUser[0]?.syncedAt) {
				lastSyncTime = lastUser[0].syncedAt;
			}
		}

		let allUsers: LinearUser[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch all users with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.linearClient.users({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			allUsers = allUsers.concat(response.nodes as unknown as LinearUser[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Users fetched", allUsers.length);
			await this.addDelay();
		}

		console.log(`Found ${allUsers.length} users to sync`);

		if (allUsers.length === 0) {
			return 0;
		}

		// Process users in batches
		const batchSize = 10;
		let processed = 0;

		for (let i = 0; i < allUsers.length; i += batchSize) {
			const batch = allUsers.slice(i, i + batchSize);

			for (const linearUser of batch) {
				await this.upsertUser(linearUser);
				processed++;

				if (processed % 10 === 0) {
					this.logProgress("Users processed", processed, allUsers.length);
				}
			}

			// Small delay between batches
			await this.addDelay(50);
		}

		return processed;
	}

	/**
	 * Upsert a single user
	 */
	private async upsertUser(linearUser: LinearUser): Promise<void> {
		const userData: NewUser = {
			id: linearUser.id,
			name: linearUser.name,
			email: linearUser.email || null,
			displayName: linearUser.displayName || null,
			avatarUrl: linearUser.avatarUrl || null,
			admin: linearUser.admin || false,
			active: linearUser.active !== false, // Default to true if not specified
			createdAt: this.parseLinearDate(linearUser.createdAt),
			updatedAt: this.parseLinearDate(linearUser.updatedAt),
			archivedAt: linearUser.archivedAt
				? this.parseLinearDate(linearUser.archivedAt)
				: null,
			syncedAt: new Date(),
		};

		// Check if user exists
		const existingUser = await this.db
			.select()
			.from(users)
			.where(eq(users.id, linearUser.id))
			.limit(1);

		if (existingUser.length > 0) {
			// Update existing user
			await this.db
				.update(users)
				.set(userData)
				.where(eq(users.id, linearUser.id));
		} else {
			// Insert new user
			await this.db.insert(users).values(userData);
		}
	}

	/**
	 * Get user by ID (helper method)
	 */
	async getUserById(userId: string): Promise<LinearUser | null> {
		const result = await this.db
			.select()
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (!result[0]) return null;

		// Convert database user to LinearUser format
		return {
			id: result[0].id,
			name: result[0].name,
			email: result[0].email ?? undefined,
			displayName: result[0].displayName ?? undefined,
			avatarUrl: result[0].avatarUrl ?? undefined,
			admin: result[0].admin ?? undefined,
			active: result[0].active ?? undefined,
			createdAt: result[0].createdAt.toISOString(),
			updatedAt: result[0].updatedAt.toISOString(),
			archivedAt: result[0].archivedAt?.toISOString(),
		};
	}

	/**
	 * Sync a specific user by ID
	 */
	async syncUserById(userId: string): Promise<void> {
		try {
			const linearUser = await this.executeWithRetry(() =>
				this.linearClient.user(userId),
			);

			if (linearUser) {
				await this.upsertUser(linearUser as unknown as LinearUser);
				console.log(`✅ Synced user: ${linearUser.name}`);
			}
		} catch (error) {
			console.error(`❌ Failed to sync user ${userId}:`, error);
			throw error;
		}
	}
}
