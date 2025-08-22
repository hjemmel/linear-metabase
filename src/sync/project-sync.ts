import { LinearClient } from "@linear/sdk";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
	type NewProject,
	type Project,
	projects,
	users,
} from "../db/schema.js";

interface LinearProject {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	color?: string;
	url: string;
	slugId?: string;
	state: string;
	priority: number;
	sortOrder: number;
	targetDate?: string;
	startDate?: string;
	completedAt?: string;
	canceledAt?: string;
	lead?: {
		id: string;
	};
	members: {
		nodes: Array<{
			id: string;
		}>;
	};
	teams: {
		nodes: Array<{
			id: string;
		}>;
	};
	createdAt: string;
	updatedAt: string;
	archivedAt?: string;
}

export class ProjectSyncService {
	private linearClient: LinearClient;
	private requestDelay: number = 100;

	constructor() {
		if (!process.env.LINEAR_API_KEY) {
			throw new Error(
				"LINEAR_API_KEY environment variable is required for project sync",
			);
		}
		this.linearClient = new LinearClient({
			apiKey: process.env.LINEAR_API_KEY,
		});
	}

	/**
	 * Main sync method for projects
	 */
	async sync(options: { incremental?: boolean } = {}): Promise<void> {
		const { incremental = false } = options;
		console.log("Starting project sync...");

		try {
			const syncedProjects = await this.executeWithRetry(() =>
				this.syncProjects(incremental),
			);

			console.log(`✅ Synced ${syncedProjects} projects`);
		} catch (error) {
			console.error("❌ Project sync failed:", error);
			throw error;
		}
	}

	/**
	 * Sync projects with various filtering options
	 */
	private async syncProjects(incremental: boolean = false): Promise<number> {
		console.log("Fetching projects from Linear...");

		let lastSyncTime: Date | null = null;

		if (incremental) {
			// Get the most recent sync time
			const lastProject = await db
				.select({ syncedAt: projects.syncedAt })
				.from(projects)
				.orderBy(desc(projects.syncedAt))
				.limit(1);

			if (lastProject.length > 0 && lastProject[0]?.syncedAt) {
				lastSyncTime = lastProject[0].syncedAt;
			}
		}

		let allProjects: LinearProject[] = [];
		let hasNextPage = true;
		let cursor: string | undefined;

		// Fetch projects with pagination
		while (hasNextPage) {
			const filter = lastSyncTime
				? {
						updatedAt: {
							gt: lastSyncTime.toISOString(),
						},
					}
				: {};

			const response = await this.fetchProjectsGraphQL({
				first: 50,
				...(cursor && { after: cursor }),
				...(Object.keys(filter).length > 0 && { filter }),
			});

			if (!response) {
				console.error("No response received from GraphQL query");
				throw new Error("Failed to fetch projects");
			}

			allProjects = allProjects.concat(
				response.nodes as unknown as LinearProject[],
			);
			hasNextPage = response.pageInfo.hasNextPage;
			cursor = response.pageInfo.endCursor;

			this.logProgress("Projects fetched", allProjects.length);
			await this.addDelay();
		}

		console.log(`Found ${allProjects.length} projects`);

		if (allProjects.length === 0) {
			return 0;
		}

		// Process projects
		return await this.processProjects(allProjects);
	}

	/**
	 * Fetch projects using GraphQL
	 */
	private async fetchProjectsGraphQL(
		variables: Record<string, unknown>,
	): Promise<
		| {
				nodes: LinearProject[];
				pageInfo: { hasNextPage: boolean; endCursor: string };
		  }
		| undefined
	> {
		const graphqlQuery = `
			query GetProjects($first: Int, $after: String, $filter: ProjectFilter) {
				projects(first: $first, after: $after, filter: $filter) {
					nodes {
						id
						name
						description
						icon
						color
						url
						slugId
						state
						priority
						sortOrder
						targetDate
						startDate
						completedAt
						canceledAt
						lead {
							id
						}
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
				projects: {
					nodes: LinearProject[];
					pageInfo: { hasNextPage: boolean; endCursor: string };
				};
			};
			return result.projects;
		} catch (error) {
			console.error("Failed to fetch projects - GraphQL query:", graphqlQuery);
			console.error("Variables:", variables);
			console.error("Error details:", error);
			throw error;
		}
	}

	/**
	 * Process and upsert projects
	 */
	private async processProjects(
		linearProjects: LinearProject[],
	): Promise<number> {
		let processedCount = 0;

		for (const project of linearProjects) {
			try {
				await this.upsertProject(project);
				processedCount++;

				// Add delay between projects
				await this.addDelay(50);
			} catch (error) {
				console.error(`Failed to process project ${project.id}:`, error);
				// Continue with next project rather than failing entirely
			}
		}

		return processedCount;
	}

	/**
	 * Upsert a single project
	 */
	private async upsertProject(linearProject: LinearProject): Promise<void> {
		// Ensure lead user exists if specified
		if (linearProject.lead?.id) {
			await this.ensureUserExists(linearProject.lead.id);
		}

		const projectData: NewProject = {
			id: linearProject.id,
			name: linearProject.name,
			description: linearProject.description || null,
			icon: linearProject.icon || null,
			color: linearProject.color || null,
			url: linearProject.url,
			slugId: linearProject.slugId || null,
			state: linearProject.state?.toLowerCase() || "backlog",
			priority: linearProject.priority || 0,
			sortOrder: linearProject.sortOrder?.toString() || null,
			targetDate: linearProject.targetDate
				? new Date(linearProject.targetDate)
				: null,
			startDate: linearProject.startDate
				? new Date(linearProject.startDate)
				: null,
			completedAt: linearProject.completedAt
				? new Date(linearProject.completedAt)
				: null,
			canceledAt: linearProject.canceledAt
				? new Date(linearProject.canceledAt)
				: null,
			leadId: linearProject.lead?.id || null,
			memberIds: null, // Will add members/teams in a separate query if needed
			teamIds: null,
			createdAt: new Date(linearProject.createdAt),
			updatedAt: new Date(linearProject.updatedAt),
			archivedAt: linearProject.archivedAt
				? new Date(linearProject.archivedAt)
				: null,
			syncedAt: new Date(),
		};

		await db
			.insert(projects)
			.values(projectData)
			.onConflictDoUpdate({
				target: projects.id,
				set: {
					name: projectData.name,
					description: projectData.description,
					icon: projectData.icon,
					color: projectData.color,
					url: projectData.url,
					slugId: projectData.slugId,
					state: projectData.state,
					priority: projectData.priority,
					sortOrder: projectData.sortOrder,
					targetDate: projectData.targetDate,
					startDate: projectData.startDate,
					completedAt: projectData.completedAt,
					canceledAt: projectData.canceledAt,
					leadId: projectData.leadId,
					memberIds: projectData.memberIds,
					teamIds: projectData.teamIds,
					updatedAt: projectData.updatedAt,
					archivedAt: projectData.archivedAt,
					syncedAt: projectData.syncedAt,
				},
			});
	}

	/**
	 * Ensure user exists (basic check)
	 */
	private async ensureUserExists(userId: string): Promise<void> {
		const existingUser = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		if (existingUser.length === 0) {
			console.warn(`⚠️ User ${userId} not found - may need to sync users first`);
		}
	}

	/**
	 * Get all projects from database
	 */
	async getAllProjects(): Promise<Project[]> {
		return await db.select().from(projects).orderBy(asc(projects.name));
	}

	/**
	 * Get project by ID
	 */
	async getProjectById(projectId: string): Promise<Project | null> {
		const result = await db
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);

		return result.length > 0 ? result[0] || null : null;
	}

	/**
	 * Sync a specific project by ID
	 */
	async syncProjectById(projectId: string): Promise<void> {
		console.log(`Syncing specific project: ${projectId}`);

		try {
			const project = await this.linearClient.project(projectId);
			if (!project) {
				throw new Error(`Project ${projectId} not found`);
			}

			await this.upsertProject(project as unknown as LinearProject);
			console.log(`✅ Synced project: ${projectId}`);
		} catch (error) {
			console.error(`❌ Failed to sync project ${projectId}:`, error);
			throw error;
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
