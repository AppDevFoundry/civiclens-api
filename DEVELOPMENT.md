# Development Guide

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon or local)
- Congress.gov API key

### Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Environment setup**:
Create a `.env` file:
```env
DATABASE_URL=your_postgres_connection_string
JWT_SECRET=your_jwt_secret
CONGRESS_API_KEY=your_congress_api_key
NODE_ENV=development  # Important for dev features!
```

3. **Database setup**:
```bash
npx prisma generate
npx prisma migrate deploy
npx prisma db seed  # Optional: seed with test data
```

4. **Start development server**:
```bash
npm start
```

Server will be available at `http://localhost:3000`

---

## Development Tools

### Generate Test JWT Token

For testing authenticated endpoints:

```bash
npm run dev:token
```

This creates a test user and generates a JWT token you can use for API testing.

**Test User Credentials**:
- Username: `testuser`
- Email: `test@example.com`
- Password: `testpassword123`

**Using the token**:
```bash
# Copy the token from the output, then:
curl -H "Authorization: Token YOUR_TOKEN_HERE" http://localhost:3000/api/watchlist
```

### Sync Commands

```bash
# Sync bills (200 most recent)
npm run sync:bills

# Sync members (100 current)
npm run sync:members

# Sync hearings
npm run sync:hearings

# Sync everything
npm run sync:all

# Check sync status
npm run sync:status
```

### Test API Endpoints

```bash
# Run automated API tests (requires server running)
npm run dev:test-api
```

---

## API Endpoints Overview

### Public Endpoints (No Auth Required)

#### Health Check
```http
GET /api/cron/health
```

#### Congress Data
```http
GET /api/bills?congress=118&limit=20
GET /api/members?chamber=Senate
GET /api/hearings?fromDate=2025-01-01
```

### Protected Endpoints (Requires Auth)

Add header: `Authorization: Token YOUR_JWT_TOKEN`

#### Watchlist
```http
GET /api/watchlist
POST /api/watchlist/bill/:billId
DELETE /api/watchlist/bill/:billId
POST /api/watchlist/member/:bioguideId
DELETE /api/watchlist/member/:bioguideId
```

### Admin Endpoints (Development: No Auth, Production: Requires ADMIN_SECRET)

#### Dashboard
```http
GET /api/admin/dashboard
```

#### Manual Sync Triggers
```http
POST /api/admin/sync/bills
POST /api/admin/sync/members
POST /api/admin/sync/hearings
```

### Cron Endpoints (Development: No Auth, Production: Requires CRON_SECRET)

```http
POST /api/cron/sync-bills
POST /api/cron/sync-members
POST /api/cron/sync-hearings
```

---

## Development Features

### Automatic Auth Bypass (Development Mode)

When `NODE_ENV !== 'production'` OR when `ADMIN_SECRET` / `CRON_SECRET` are not set:
- Admin endpoints allow all requests
- Cron endpoints allow all requests

This makes local development easier without needing to manage secrets.

### Test User Auto-Creation

Running `npm run dev:token` automatically creates a test user if it doesn't exist. The same credentials always work across dev environments for consistency.

---

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:api
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

---

## Database Management

### View Data (Prisma Studio)
```bash
npx prisma studio
```

Opens a web UI at `http://localhost:5555` to browse database records.

### Run Migrations
```bash
npx prisma migrate dev
```

### Reset Database (Warning: Deletes all data!)
```bash
npx prisma migrate reset
```

---

## Debugging

### Enable Debug Logging

Set environment variable:
```bash
DEBUG=* npm start
```

### TypeScript Debugging

VS Code launch.json configuration:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug API",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["start"],
  "port": 9229,
  "skipFiles": ["<node_internals>/**"]
}
```

---

## Common Development Tasks

### Add a New API Endpoint

1. Create controller in `src/app/routes/[resource]/[resource].controller.ts`
2. Add route to `src/app/routes/routes.ts`
3. Add integration test in `src/app/routes/__tests__/`

### Add a New Sync Service

1. Create service in `src/app/services/sync/[resource]-sync.service.ts`
2. Implement sync methods
3. Add to orchestrator in `src/app/services/sync/orchestrator.service.ts`
4. Add CLI command in `src/scripts/sync-congress.ts`

### Add a New Database Model

1. Update `src/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name describe_your_changes`
3. Run `npx prisma generate` to update Prisma Client
4. Update TypeScript types if needed

---

## Troubleshooting

### "Cannot connect to database"
- Check your `DATABASE_URL` in `.env`
- Verify database is running
- Run `npx prisma migrate deploy`

### "401 Unauthorized" on watchlist endpoints
- Generate a fresh token: `npm run dev:token`
- Make sure to include the full header: `Authorization: Token YOUR_TOKEN`

### "Rate limit exceeded" from Congress.gov API
- Wait a moment and retry
- Check your API key is valid
- The system automatically retries with exponential backoff

### Server won't start
- Check for TypeScript errors: `npm run build`
- Make sure port 3000 is available
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`

---

## Code Style

This project uses:
- ESLint for linting
- Prettier for formatting
- TypeScript strict mode

Run linting:
```bash
npm run lint
```

Format code:
```bash
npm run format
```

---

## Contributing

See `PHASE_2.md` for planned enhancements and how to contribute.

Before submitting a PR:
1. Run tests: `npm test`
2. Run linting: `npm run lint`
3. Update documentation if needed
4. Test locally with `npm start`

---

## Need Help?

- Check `README.md` for project overview
- See `PHASE_2.md` for roadmap
- Open an issue for bugs
- Start a discussion for questions
