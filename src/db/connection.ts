import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let clientInstance: ReturnType<typeof postgres> | null = null;

// Create database connection only when needed
export function getDb() {
	if (!dbInstance) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error("DATABASE_URL environment variable is required");
		}

		// Create postgres client
		clientInstance = postgres(connectionString);

		// Create drizzle instance
		dbInstance = drizzle(clientInstance, { schema });
	}

	return dbInstance;
}

// Export db instance
export const db = getDb();

// Close connection function
export const closeConnection = async () => {
	if (clientInstance) {
		await clientInstance.end();
		clientInstance = null;
		dbInstance = null;
	}
};
