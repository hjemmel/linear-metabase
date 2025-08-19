import type { LinearClient } from "@linear/sdk";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getDb } from "../db/connection.js";
import { getLinearClient } from "./linear-client.js";

export abstract class BaseSyncService {
	protected linearClient: LinearClient;
	protected db: PostgresJsDatabase<Record<string, unknown>>;

	constructor() {
		this.linearClient = getLinearClient();
		this.db = getDb();
	}

	/**
	 * Handle rate limiting by checking response and waiting if necessary
	 */
	protected async handleRateLimit(error: unknown): Promise<void> {
		if (
			typeof error === "object" &&
			error !== null &&
			"extensions" in error &&
			typeof error.extensions === "object" &&
			error.extensions !== null &&
			"code" in error.extensions &&
			error.extensions.code === "RATE_LIMITED"
		) {
			const retryAfter =
				("retryAfter" in error.extensions &&
				typeof error.extensions.retryAfter === "number"
					? error.extensions.retryAfter
					: 3600) || 3600; // Default 1 hour
			console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
			await this.sleep(retryAfter * 1000);
		} else {
			throw error;
		}
	}

	/**
	 * Sleep for specified milliseconds
	 */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Add delay between API calls to avoid rate limiting
	 */
	protected async addDelay(ms: number = 100): Promise<void> {
		await this.sleep(ms);
	}

	/**
	 * Execute with retry logic for rate limiting
	 */
	protected async executeWithRetry<T>(
		operation: () => Promise<T>,
		maxRetries: number = 3,
	): Promise<T> {
		let lastError: unknown;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error;

				if (
					typeof error === "object" &&
					error !== null &&
					"extensions" in error &&
					typeof error.extensions === "object" &&
					error.extensions !== null &&
					"code" in error.extensions &&
					error.extensions.code === "RATE_LIMITED"
				) {
					await this.handleRateLimit(error);
				} else if (attempt < maxRetries - 1) {
					// Exponential backoff for other errors
					await this.sleep(1000 * 2 ** attempt);
				}
			}
		}

		throw lastError;
	}

	/**
	 * Log sync progress
	 */
	protected logProgress(
		entity: string,
		processed: number,
		total?: number,
	): void {
		if (total) {
			console.log(
				`${entity}: ${processed}/${total} (${Math.round((processed / total) * 100)}%)`,
			);
		} else {
			console.log(`${entity}: ${processed} processed`);
		}
	}

	/**
	 * Convert Linear timestamp to Date
	 */
	protected parseLinearDate(dateString: string): Date {
		return new Date(dateString);
	}

	/**
	 * Abstract method to be implemented by concrete sync services
	 */
	abstract sync(options?: Record<string, unknown>): Promise<void>;
}
