# Linear to Metabase ETL Pipeline

A robust ETL (Extract, Transform, Load) system for syncing data from Linear to PostgreSQL, designed for analytics and reporting with Metabase. Features automatic dependency resolution, intelligent error handling, and comprehensive data synchronization.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Linear API key with workspace access

### Installation

1. **Clone and install dependencies**

   ```bash
   git clone <your-repo>
   cd linear-metabase
   npm install
   ```

2. **Environment setup**

   ```bash
   cp env.example .env
   ```

   Configure your `.env` file:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/linear_db
   LINEAR_API_KEY=lin_api_your_linear_api_key_here
   ```

3. **Database setup**

   ```bash
   # Push schema to database
   npm run db:push

   # Or run migrations if available
   npm run db:migrate
   ```

4. **First sync**

   ```bash
   # Quick essentials sync (users, teams, cycles)
   npm run sync essentials

   # Or full sync (includes all issues)
   npm run sync all
   ```

## ✨ Key Features

### 🎯 Cycle-Specific Issue Sync

The primary feature - sync all issues for specific Linear cycles:

```bash
# Sync all issues in a cycle
npm run sync cycle cycle_abc123

# Incremental sync for faster updates
npm run sync cycle cycle_abc123 --incremental
```

### 🔗 Smart Dependency Resolution

- **Automatic dependency syncing** - missing users, teams, or cycles are synced automatically
- **Foreign key integrity** - prevents constraint violations by ensuring dependencies exist
- **Graceful error handling** - clear error messages when dependencies can't be resolved

### ⚡ Intelligent Sync Features

- **Incremental sync** - only sync updated data since last run
- **Rate limiting** - automatic Linear API rate limit handling with backoff
- **Progress tracking** - real-time sync progress with detailed logging
- **Error recovery** - robust retry mechanisms with exponential backoff

### 📊 Comprehensive Data Coverage

- **Users** - profiles, metadata, and permissions
- **Teams** - team information and settings
- **Team Members** - membership relationships with roles
- **Cycles** - sprint/cycle data with dates and status
- **Issues** - complete issue data with all relationships
- **Issue Comments** - discussions and updates

## 🛠️ Usage Guide

### Command Line Interface

#### Full Sync Operations

```bash
# Sync all data types
npm run sync all

# Incremental sync (only updated items)
npm run sync all --incremental

# Sync specific team with all its data
npm run sync team team_abc123

# Quick essentials (core data, excludes issues)
npm run sync essentials

# Team-specific essentials
npm run sync essentials --team-id=team_abc123
```

#### Cycle-Specific Operations

```bash
# Sync issues for specific cycle
npm run sync cycle cycle_xyz789

# Incremental cycle sync
npm run sync cycle cycle_xyz789 --incremental

# The system will automatically sync:
# - Users (for assignees/creators)
# - Teams (for team reference)
# - Cycle data (if missing)
# - Then all cycle issues
```

#### Individual Entity Sync

```bash
# Sync specific data types
npm run sync users
npm run sync teams
npm run sync members
npm run sync cycles
npm run sync issues

# With filters and limits
npm run sync issues --team-id=team_abc123
npm run sync issues --cycle-id=cycle_xyz789
npm run sync issues --limit=100
npm run sync cycles --team-id=team_abc123
npm run sync members --team-id=team_abc123

# Team sync options
npm run sync team team_abc123 --no-issues        # Skip issues
npm run sync team team_abc123 --issue-limit=500  # Limit issues
```

#### Monitoring & Utilities

```bash
# Get comprehensive sync statistics
npm run sync stats

# Validate data integrity
npm run sync validate

# View all available options
npm run sync help
```

### Programmatic Usage

```typescript
import { SyncOrchestrator } from "./src/sync";

const orchestrator = new SyncOrchestrator();

// Sync issues for specific cycle
await orchestrator.syncIssuesByCycle("cycle_123", {
  incremental: true,
});

// Sync entire team with options
await orchestrator.syncTeam("team_456", {
  includeIssues: true,
  issueLimit: 500,
  incremental: true,
});

// Access individual services
const services = orchestrator.getServices();

// Get current cycle and sync its issues
const teams = await services.teams.getAllTeams();
for (const team of teams) {
  const cycles = await services.cycles.getActiveCycles(team.id);
  for (const cycle of cycles) {
    await services.issues.syncByCycle(cycle.id);
  }
}

// Sync specific user by ID
await services.users.syncUserById("user_123");
```

## 🗄️ Database Schema

### Core Tables

#### Users Table

```sql
users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  admin BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW()
)
```

#### Teams Table

```sql
teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  private BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP,
  synced_at TIMESTAMP DEFAULT NOW()
)
```

#### Issues Table

```sql
issues (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  cycle_id TEXT REFERENCES cycles(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER,
  assignee_id TEXT REFERENCES users(id),
  creator_id TEXT REFERENCES users(id),
  state TEXT NOT NULL,
  state_type TEXT NOT NULL,
  labels JSONB,
  -- ... additional fields
  synced_at TIMESTAMP DEFAULT NOW()
)
```

### Key Features

- **Foreign key relationships** ensure data integrity
- **Automatic dependency resolution** prevents constraint violations
- **Sync timestamps** enable incremental updates
- **JSON fields** store complex Linear data (labels, etc.)
- **Comprehensive indexing** for optimal query performance

## ⚙️ Configuration

### Environment Variables

| Variable         | Description                  | Required | Example                               |
| ---------------- | ---------------------------- | -------- | ------------------------------------- |
| `DATABASE_URL`   | PostgreSQL connection string | ✅       | `postgresql://user:pass@localhost/db` |
| `LINEAR_API_KEY` | Linear API key from settings | ✅       | `lin_api_1234567890abcdef`            |

### Sync Options

| Option              | Description               | Example                                        |
| ------------------- | ------------------------- | ---------------------------------------------- |
| `--incremental`     | Only sync updated items   | `npm run sync all --incremental`               |
| `--team-id=<id>`    | Filter by specific team   | `npm run sync issues --team-id=team_123`       |
| `--cycle-id=<id>`   | Filter by specific cycle  | `npm run sync issues --cycle-id=cycle_456`     |
| `--limit=<number>`  | Limit number of items     | `npm run sync issues --limit=100`              |
| `--no-issues`       | Skip issues (team sync)   | `npm run sync team team_123 --no-issues`       |
| `--issue-limit=<n>` | Limit issues in team sync | `npm run sync team team_123 --issue-limit=200` |

## 🔧 Architecture

### Sync Services

Each entity has a dedicated service with consistent interfaces:

- **`UserSyncService`** - User profiles and metadata
- **`TeamSyncService`** - Team information and settings
- **`TeamMemberSyncService`** - Team membership relationships
- **`CycleSyncService`** - Cycle/sprint data and timeline
- **`IssueSyncService`** - Issues with automatic dependency resolution

### Dependency Resolution System

**NEW**: Automatic dependency syncing prevents foreign key violations:

```typescript
// When syncing issues, the system automatically:
// 1. Checks if creator/assignee users exist
// 2. Syncs missing users from Linear
// 3. Checks if team exists
// 4. Syncs missing team from Linear
// 5. Checks if cycle exists
// 6. Syncs missing cycle from Linear
// 7. Only then creates/updates the issue

// This prevents errors like:
// "Foreign key constraint violation: user_id not found"
```

### Orchestrator Pattern

The `SyncOrchestrator` coordinates all operations:

- **Dependency order management** - ensures correct sync sequence
- **Cross-service relationships** - handles complex data dependencies
- **Unified error handling** - consistent error reporting across services
- **Rate limiting coordination** - manages API limits across all services

### Error Handling & Resilience

- **Automatic retries** with exponential backoff
- **Foreign key violation prevention** via dependency checking
- **Linear API rate limit detection** and intelligent waiting
- **Graceful degradation** for network issues
- **Comprehensive logging** for troubleshooting

## 📈 Performance & Monitoring

### Optimization Strategies

#### For Large Datasets

```bash
# Use incremental sync for regular updates
npm run sync all --incremental

# Sync in stages for initial setup
npm run sync essentials              # Core data first
npm run sync issues --limit=500     # Issues gradually

# Team-specific optimization
npm run sync team team_123 --issue-limit=200
```

#### For Regular Operations

```bash
# Daily routine
npm run sync essentials                    # Quick core updates
npm run sync cycle current_cycle_id        # Current cycle issues

# Weekly comprehensive sync
npm run sync all --incremental

# Monthly full refresh
npm run sync all
```

### Monitoring Tools

#### Sync Statistics

```bash
npm run sync stats
```

Displays:

- Record counts by entity type
- Last sync timestamps per entity
- Active cycles and teams
- Sync health indicators
- Performance metrics

#### Data Validation

```bash
npm run sync validate
```

Validates:

- Foreign key relationships
- Orphaned records detection
- Data consistency checks
- Missing dependency identification

## 🔄 Metabase Integration

Optimized for seamless Metabase analytics:

### Database Design Benefits

- **Normalized schema** - clean table relationships for easy joins
- **Descriptive column names** - intuitive field names for non-technical users
- **Proper data types** - optimal field types for analysis
- **Comprehensive indexing** - fast query performance

### Sample Analytics Queries

#### Cycle Performance Analysis

```sql
-- Issues completion by cycle
SELECT
  c.name as cycle_name,
  t.name as team_name,
  c.starts_at,
  c.ends_at,
  COUNT(i.id) as total_issues,
  COUNT(CASE WHEN i.completed_at IS NOT NULL THEN 1 END) as completed_issues,
  ROUND(
    COUNT(CASE WHEN i.completed_at IS NOT NULL THEN 1 END) * 100.0 / COUNT(i.id),
    2
  ) as completion_rate
FROM cycles c
JOIN teams t ON c.team_id = t.id
LEFT JOIN issues i ON c.id = i.cycle_id
GROUP BY c.id, c.name, t.name, c.starts_at, c.ends_at
ORDER BY c.starts_at DESC;
```

#### Team Productivity Metrics

```sql
-- User productivity by cycle
SELECT
  u.name as assignee,
  t.name as team_name,
  c.name as cycle_name,
  COUNT(i.id) as assigned_issues,
  COUNT(CASE WHEN i.completed_at IS NOT NULL THEN 1 END) as completed_issues,
  AVG(CASE
    WHEN i.completed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (i.completed_at - i.created_at))/86400
  END) as avg_completion_days
FROM users u
JOIN issues i ON u.id = i.assignee_id
JOIN cycles c ON i.cycle_id = c.id
JOIN teams t ON c.team_id = t.id
GROUP BY u.id, u.name, t.name, c.id, c.name
ORDER BY completed_issues DESC;
```

#### Issue State Analysis

```sql
-- Issue distribution by state and team
SELECT
  t.name as team_name,
  i.state,
  i.state_type,
  COUNT(*) as issue_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY t.id), 2) as percentage
FROM issues i
JOIN teams t ON i.team_id = t.id
WHERE i.archived_at IS NULL
GROUP BY t.id, t.name, i.state, i.state_type
ORDER BY t.name, issue_count DESC;
```

## 🚨 Troubleshooting

### Common Issues & Solutions

#### Foreign Key Constraint Violations

```
ERROR: Foreign key constraint violation: creator_id not found
```

**Solution**: This is now automatically handled! The system will:

1. Detect the missing user/team/cycle
2. Sync the missing dependency from Linear
3. Retry the operation

If you still see this error, ensure your Linear API key has proper permissions.

#### Rate Limiting

```
Rate limited. Waiting 3600 seconds...
```

**Solution**: The system handles this automatically. For frequent syncs:

- Use `--incremental` flag to reduce API calls
- Sync specific entities instead of full sync
- Space out large sync operations

#### Database Connection Issues

```
DATABASE_URL environment variable is required
```

**Solutions**:

1. Check your `.env` file exists and is properly configured
2. Verify PostgreSQL is running and accessible
3. Test connection: `npm run db:studio`

#### Sync Performance Issues

```
Sync taking too long or timing out
```

**Solutions**:

```bash
# Break down large syncs
npm run sync essentials              # Core data first
npm run sync issues --limit=100     # Issues in batches

# Use incremental sync
npm run sync all --incremental

# Sync specific teams/cycles
npm run sync team specific_team_id
npm run sync cycle specific_cycle_id
```

### Debug Mode

Enable verbose logging:

```bash
DEBUG=true npm run sync all
```

This provides:

- Detailed API request/response logs
- Database query information
- Dependency resolution steps
- Performance timing data

## 🧪 Development & Testing

### Development Setup

```bash
# Install dependencies
npm install

# Run TypeScript checks
npm run build

# Check database schema
npm run db:studio

# Run linting
npm run lint
```

### Adding New Entities

Follow the established pattern:

1. **Create sync service** extending `BaseSyncService`
2. **Add dependency checking** using the `ensure*Exists` pattern
3. **Implement proper error handling** with retry logic
4. **Add CLI commands** in `cli.ts`
5. **Update orchestrator** with new service
6. **Add documentation** and examples

### Testing Sync Operations

```bash
# Test individual services
npm run sync users --limit=5
npm run sync teams --limit=3

# Test dependency resolution
npm run sync issues --limit=1  # Should auto-sync users/teams

# Test error handling
# (temporarily disable database to test reconnection)
```

## 🤝 Contributing

### Guidelines

1. **Follow service patterns** - maintain consistency with existing services
2. **Add comprehensive error handling** - use try/catch with descriptive messages
3. **Implement dependency checking** - prevent foreign key violations
4. **Include proper TypeScript types** - maintain type safety
5. **Update documentation** - keep README and inline docs current
6. **Add logging** - help with debugging and monitoring

### Code Style

- Use TypeScript strict mode
- Follow existing naming conventions
- Add JSDoc comments for public methods
- Implement proper error boundaries
- Use consistent logging patterns

## 📚 Examples & Recipes

### Complete Cycle Workflow

```typescript
import { SyncOrchestrator } from "./src/sync";

const orchestrator = new SyncOrchestrator();
const services = orchestrator.getServices();

// 1. Get all teams
const teams = await services.teams.getAllTeams();

// 2. For each team, get current cycle
for (const team of teams) {
  const cycles = await services.cycles.getActiveCycles(team.id);

  for (const cycle of cycles) {
    console.log(`Syncing cycle: ${cycle.name} for team: ${team.name}`);

    // 3. Sync all issues for this cycle
    await orchestrator.syncIssuesByCycle(cycle.id, {
      incremental: true,
    });

    // 4. Get cycle statistics
    const stats = await services.issues.getCycleStats(cycle.id);
    console.log(`Cycle stats: ${stats.completed}/${stats.total} completed`);
  }
}
```

### Team Onboarding Workflow

```typescript
// Sync everything for a new team
const teamId = "team_new_123";

// 1. Sync team data
await services.teams.syncTeamById(teamId);

// 2. Sync team members
await services.teamMembers.sync({ teamId });

// 3. Sync team cycles
await services.cycles.sync({ teamId });

// 4. Sync recent team issues
await services.issues.sync({
  teamId,
  incremental: true,
  limit: 500,
});
```

### Data Health Check

```typescript
// Check sync health across all entities
const stats = await orchestrator.getSyncStats();
const validation = await orchestrator.validateSync();

console.log("Sync Statistics:", stats);
console.log("Validation Results:", validation);

// Re-sync if issues found
if (validation.issues.length > 0) {
  console.log("Issues found, running corrective sync...");
  await orchestrator.syncAll({ incremental: true });
}
```

## 🔗 Resources & Links

- **[Linear API Documentation](https://developers.linear.app/)** - Complete API reference
- **[Drizzle ORM Documentation](https://orm.drizzle.team/)** - Database ORM used
- **[PostgreSQL Documentation](https://www.postgresql.org/docs/)** - Database system
- **[Metabase Documentation](https://www.metabase.com/docs/)** - Analytics platform
- **[TypeScript Documentation](https://www.typescriptlang.org/docs/)** - Language reference

## 📄 License

MIT License - see LICENSE file for details.

---

**🚀 Built with reliability and performance in mind for Linear + Metabase integration**

_Version 2.0 - Now with automatic dependency resolution and enhanced error handling_
