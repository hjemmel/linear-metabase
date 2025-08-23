#!/usr/bin/env node

import { config } from "dotenv";
import { closeConnection } from "../db/connection.js";
import { SyncOrchestrator } from "./sync-orchestrator.js";

// Load environment variables
config();

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];
	const orchestrator = new SyncOrchestrator();

	try {
		switch (command) {
			case "all":
				await handleFullSync(args.slice(1), orchestrator);
				break;

			case "cycle":
				await handleCycleSync(args.slice(1), orchestrator);
				break;

			case "team":
				await handleTeamSync(args.slice(1), orchestrator);
				break;

			case "essentials":
				await handleEssentialsSync(args.slice(1), orchestrator);
				break;

			case "users":
				await orchestrator
					.getServices()
					.users.sync({ incremental: hasFlag(args, "--incremental") });
				break;

			case "teams":
				await orchestrator
					.getServices()
					.teams.sync({ incremental: hasFlag(args, "--incremental") });
				break;

			case "cycles":
				await orchestrator.getServices().cycles.sync({
					incremental: hasFlag(args, "--incremental"),
					...(getFlag(args, "--team-id") && {
						teamId: getFlag(args, "--team-id"),
					}),
				});
				break;

			case "labels":
				await orchestrator
					.getServices()
					.labels.sync({ incremental: hasFlag(args, "--incremental") });
				break;

			case "projects":
				await orchestrator
					.getServices()
					.projects.sync({ incremental: hasFlag(args, "--incremental") });
				break;

			case "members":
				await orchestrator.getServices().teamMembers.sync({
					incremental: hasFlag(args, "--incremental"),
					...(getFlag(args, "--team-id") && {
						teamId: getFlag(args, "--team-id"),
					}),
				});
				break;

			case "issues":
				await handleIssuesSync(args.slice(1), orchestrator);
				break;

			case "stats":
				await orchestrator.getSyncStats();
				break;

			case "validate":
				await orchestrator.validateSync();
				break;

			case "help":
			case "--help":
			case "-h":
				printHelp();
				break;

			default:
				console.error(`Unknown command: ${command}`);
				printHelp();
				process.exit(1);
		}

		console.log("\n🎉 Operation completed successfully!");
	} catch (error) {
		console.error("\n💥 Operation failed:", error);
		process.exit(1);
	} finally {
		await closeConnection();
	}
}

async function handleFullSync(args: string[], orchestrator: SyncOrchestrator) {
	const incremental = hasFlag(args, "--incremental");
	const teamId = getFlag(args, "--team-id");
	const limit = getNumberFlag(args, "--limit");

	const options = {
		incremental,
		...(teamId && { teamId }),
		...(limit && { limit }),
	};

	if (teamId) {
		console.log(`🏢 Running full sync for team: ${teamId}`);
	} else {
		console.log("🌐 Running full sync for all data");
	}

	await orchestrator.syncAll(options);
}

async function handleCycleSync(args: string[], orchestrator: SyncOrchestrator) {
	const cycleId = args[0];

	if (!cycleId) {
		console.error("❌ Cycle ID is required for cycle sync");
		console.log("Usage: npm run sync cycle <cycle-id> [--incremental]");
		process.exit(1);
	}

	const options = {
		incremental: hasFlag(args, "--incremental"),
	};

	console.log(`🎯 Running cycle sync for: ${cycleId}`);
	await orchestrator.syncIssuesByCycle(cycleId, options);
}

async function handleTeamSync(args: string[], orchestrator: SyncOrchestrator) {
	const teamId = args[0];

	if (!teamId) {
		console.error("❌ Team ID is required for team sync");
		console.log(
			"Usage: npm run sync team <team-id> [--incremental] [--no-issues] [--issue-limit=N]",
		);
		process.exit(1);
	}

	const incremental = hasFlag(args, "--incremental");
	const includeIssues = !hasFlag(args, "--no-issues");
	const issueLimit = getNumberFlag(args, "--issue-limit");

	const options = {
		incremental,
		includeIssues,
		...(issueLimit && { issueLimit }),
	};

	console.log(`🏢 Running team sync for: ${teamId}`);
	await orchestrator.syncTeam(teamId, options);
}

async function handleEssentialsSync(
	args: string[],
	orchestrator: SyncOrchestrator,
) {
	const teamId = getFlag(args, "--team-id");

	const options = {
		...(teamId && { teamId }),
	};

	console.log("⚡ Running essentials sync (users, teams, members, cycles)");
	await orchestrator.syncEssentials(options);
}

async function handleIssuesSync(
	args: string[],
	orchestrator: SyncOrchestrator,
) {
	const incremental = hasFlag(args, "--incremental");
	const teamId = getFlag(args, "--team-id");
	const cycleId = getFlag(args, "--cycle-id");
	const limit = getNumberFlag(args, "--limit");

	if (cycleId) {
		console.log(`🎯 Running issues sync for cycle: ${cycleId}`);
		await orchestrator.syncIssuesByCycle(cycleId, {
			incremental,
		});
	} else {
		console.log("📋 Running issues sync");
		await orchestrator.getServices().issues.sync({
			incremental,
			...(teamId && { teamId }),
			...(cycleId && { cycleId }),
			...(limit && { limit }),
		});
	}
}

function hasFlag(args: string[], flag: string): boolean {
	return args.includes(flag);
}

function getFlag(args: string[], flag: string): string | undefined {
	const flagIndex = args.findIndex((arg) => arg.startsWith(`${flag}=`));
	if (flagIndex !== -1) {
		const parts = args[flagIndex]?.split("=");
		return parts && parts.length > 1 ? parts[1] || undefined : undefined;
	}

	const nextIndex = args.indexOf(flag);
	if (nextIndex !== -1 && nextIndex + 1 < args.length) {
		return args[nextIndex + 1];
	}

	return undefined;
}

function getNumberFlag(args: string[], flag: string): number | undefined {
	const value = getFlag(args, flag);
	return value ? parseInt(value, 10) : undefined;
}

function printHelp() {
	console.log(`
Linear to Database Sync Tool

USAGE:
  npm run sync <command> [options]

COMMANDS:
  all                    Sync all entities (users, teams, members, cycles, labels, projects, issues)
  cycle <cycle-id>       Sync issues for a specific cycle
  team <team-id>         Sync all data for a specific team
  essentials             Quick sync of core entities (users, teams, members, cycles)
  users                  Sync users only
  teams                  Sync teams only
  members                Sync team members only
  cycles                 Sync cycles only
  labels                 Sync labels only
  projects               Sync projects only
  issues                 Sync issues only
  stats                  Show sync statistics
  validate               Validate sync integrity
  help                   Show this help message

OPTIONS:
  --incremental          Only sync items updated since last sync
  --team-id=<id>         Filter by specific team ID
  --cycle-id=<id>        Filter by specific cycle ID
  --limit=<number>       Limit number of items to sync
  --no-issues            Skip syncing issues (for team command)
  --issue-limit=<number> Limit number of issues to sync

EXAMPLES:
  # Full sync of all data
  npm run sync all

  # Incremental sync of all data
  npm run sync all --incremental

  # Sync specific team
  npm run sync team team_abc123

  # Sync issues for specific cycle
  npm run sync cycle cycle_xyz789

  # Sync issues for specific cycle (incremental)
  npm run sync cycle cycle_xyz789 --incremental

  # Quick essentials sync for specific team
  npm run sync essentials --team-id=team_abc123

  # Sync limited number of issues for team
  npm run sync team team_abc123 --issue-limit=100

  # Sync only cycles for specific team
  npm run sync cycles --team-id=team_abc123

  # Sync all labels
  npm run sync labels

  # Sync all projects
  npm run sync projects

  # Get sync statistics
  npm run sync stats

ENVIRONMENT VARIABLES:
  DATABASE_URL           PostgreSQL connection string (required)
  LINEAR_API_KEY         Linear API key (required)

For more information, visit: https://github.com/your-repo/linear-metabase
`);
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
	console.error("💥 Unhandled promise rejection:", error);
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	console.error("💥 Uncaught exception:", error);
	process.exit(1);
});

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
