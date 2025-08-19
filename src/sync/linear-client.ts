import { LinearClient } from "@linear/sdk";

let linearClientInstance: LinearClient | null = null;

export function getLinearClient(): LinearClient {
	if (!linearClientInstance) {
		const apiKey = process.env.LINEAR_API_KEY;
		if (!apiKey) {
			throw new Error("LINEAR_API_KEY environment variable is required");
		}

		linearClientInstance = new LinearClient({
			apiKey,
		});
	}

	return linearClientInstance;
}

export const linearClient = getLinearClient();
