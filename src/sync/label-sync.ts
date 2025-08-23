import { LinearClient } from "@linear/sdk";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { type Label, labels, type NewLabel } from "../db/schema.js";

interface LinearLabel {
	id: string;
	name: string;
	description?: string;
	color: string;
	createdAt: string;
	updatedAt: string;
	archivedAt?: string;
}

export class LabelSyncService {
	private linearClient: LinearClient;
	private requestDelay: number = 100;

	constructor() {
		if (!process.env.LINEAR_API_KEY) {
			throw new Error(
				"LINEAR_API_KEY environment variable is required for label sync",
			);
		}
		this.linearClient = new LinearClient({
			apiKey: process.env.LINEAR_API_KEY,
		});
	}

	/**
	 * Main sync method for labels
	 */
	async sync(options: { incremental?: boolean } = {}): Promise<void> {
		const { incremental = false } = options;
		console.log("Starting label sync...");

		try {
			const syncedLabels = await this.executeWithRetry(() =>
				this.syncLabels(incremental),
			);

			console.log(`✅ Synced ${syncedLabels} labels`);
		} catch (error) {
			console.error("❌ Label sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync labels with various filtering options
	 */
	private async syncLabels(incremental: boolean = false): Promise<number> {
		console.log("Fetching labels from Linear...");

		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time
			const lastLabel = await db
				.select({ syncedAt: labels.syncedAt })
				.from(labels)
				.orderBy(desc(labels.syncedAt))
				.limit(1);

			if (lastLabel.length > 0 && lastLabel[0]?.syncedAt) {
				lastSyncTime = lastLabel[0].syncedAt;
			}
		}

		let allLabels: LinearLabel[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch labels with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.fetchLabelsGraphQL({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			if (!response) {
				throw new Error("Failed to fetch labels");
			}

			allLabels = allLabels.concat(response.nodes as unknown as LinearLabel[]);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Labels fetched", allLabels.length);
			await this.addDelay();
		}

		console.log(`Found ${allLabels.length} labels`);

		if (allLabels.length === 0) {
			return 0;
		}

		// Process labels
		return await this.processLabels(allLabels);
	}

	/**
	 * Fetch labels using GraphQL
	 */
	private async fetchLabelsGraphQL(variables: Record<string, unknown>): Promise<
		| {
				nodes: LinearLabel[];
				pageInfo: { hasNextPage: boolean; endCursor: string };
		  }
		| undefined
	> {
		const graphqlQuery = `
			query GetLabels($first: Int, $after: String, $filter: IssueLabelFilter) {
				issueLabels(first: $first, after: $after, filter: $filter) {
					nodes {
						id
						name
						description
						color
						createdAt
						updatedAt
						archivedAt
					}
					pageInfo {
						hasNextPage
						endCursor
					}
				}
			}
		`;

		try {
			const result = (await this.linearClient.client.request(
				graphqlQuery,
				variables,
			)) as {
				issueLabels: {
					nodes: LinearLabel[];
					pageInfo: { hasNextPage: boolean; endCursor: string };
				};
			};
			return result.issueLabels;
		} catch (error) {
			console.error("Failed to fetch labels - GraphQL query:", graphqlQuery);
			console.error("Variables:", variables);
			console.error("Error details:", error);
			throw error;
		}
	}

	/**
	 * Process and upsert labels
	 */
	private async processLabels(linearLabels: LinearLabel[]): Promise<number> {
		let processedCount = 0;

		for (const label of linearLabels) {
			try {
				await this.upsertLabel(label);
				processedCount++;

				// Add delay between labels
				await this.addDelay(50);
			} catch (error) {
				console.error(`Failed to process label ${label.id}:`, error);
				// Continue with next label rather than failing entirely
			}
		}

		return processedCount;
	}

	/**
	 * Upsert a single label
	 */
	private async upsertLabel(linearLabel: LinearLabel): Promise<void> {
		const labelData: NewLabel = {
			id: linearLabel.id,
			name: linearLabel.name,
			description: linearLabel.description || null,
			color: linearLabel.color,
			createdAt: new Date(linearLabel.createdAt),
			updatedAt: new Date(linearLabel.updatedAt),
			archivedAt: linearLabel.archivedAt
				? new Date(linearLabel.archivedAt)
				: null,
			syncedAt: new Date(),
		};

		await db
			.insert(labels)
			.values(labelData)
			.onConflictDoUpdate({
				target: labels.id,
				set: {
					name: labelData.name,
					description: labelData.description,
					color: labelData.color,
					updatedAt: labelData.updatedAt,
					archivedAt: labelData.archivedAt,
					syncedAt: labelData.syncedAt,
				},
			});
	}

	/**
	 * Get all labels from database
	 */
	async getAllLabels(): Promise<Label[]> {
		return await db.select().from(labels).orderBy(asc(labels.name));
	}

	/**
	 * Get label by ID
	 */
	async getLabelById(labelId: string): Promise<Label | null> {
		const result = await db
			.select()
			.from(labels)
			.where(eq(labels.id, labelId))
			.limit(1);

		return result.length > 0 ? result[0] || null : null;
	}

	/**
	 * Sync a specific label by ID
	 */
	async syncLabelById(labelId: string): Promise<void> {
		console.log(`Syncing specific label: ${labelId}`);

		try {
			const label = await this.linearClient.issueLabel(labelId);
			if (!label) {
				throw new Error(`Label ${labelId} not found`);
			}

			await this.upsertLabel(label as unknown as LinearLabel);
			console.log(`✅ Synced label: ${labelId}`);
		} catch (error) {
			console.error(`❌ Failed to sync label ${labelId}:`, error);
			throw error;
		}
	}

	/**
	 * Ensure a label exists in the database, sync from Linear if not
	 */
	async ensureLabelExists(labelId: string): Promise<void> {
		const existingLabel = await db
			.select()
			.from(labels)
			.where(eq(labels.id, labelId))
			.limit(1);

		if (existingLabel.length === 0) {
			console.log(`🏷️ Syncing missing label: ${labelId}`);
			try {
				await this.syncLabelById(labelId);
				console.log(`✅ Synced label ${labelId}`);
			} catch (error) {
				console.error(`❌ Failed to sync label ${labelId}:`, error);
				// Don't throw error - allow issue sync to continue even if label sync fails
				console.warn(`⚠️ Label ${labelId} will be skipped`);
			}
		}
	}

	/**
	 * Execute with retry logic
	 */
	private async executeWithRetry<T>(
		operation: () => Promise<T>,
		maxRetries: number = 3,
		delay: number = 1000,
	): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error as Error;
				console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);

				if (attempt < maxRetries) {
					console.log(`Retrying in ${delay}ms...`);
					await this.sleep(delay);
					delay *= 2; // Exponential backoff
				}
			}
		}

		throw lastError || new Error("Operation failed after retries");
	}

	/**
	 * Add delay between requests
	 */
	private async addDelay(customDelay?: number): Promise<void> {
		const delay = customDelay || this.requestDelay;
		await this.sleep(delay);
	}

	/**
	 * Sleep utility
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Log progress
	 */
	private logProgress(message: string, count: number): void {
		if (count % 25 === 0 || count < 10) {
			console.log(`${message}: ${count}`);
		}
	}
}
