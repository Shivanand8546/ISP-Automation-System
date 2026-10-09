# ISPFlow

ISPFlow is an ISP management platform with a Node.js/Express backend and a React frontend.

## Local setup

1. Copy the env example files and fill in the values.
   - Backend: `cp backend/.env.example backend/.env`
   - Frontend: Vite reads from the browser environment; configure as needed.
2. Start PostgreSQL and Redis:
   - `docker compose up -d postgres redis`
3. Install dependencies:
   - `cd backend && npm install`
   - `cd ../frontend && npm install`
4. Run database migrations:
   - `cd backend && npx prisma migrate dev`
5. To create the first administrator, set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters) in `backend/.env`, then run `npm run db:bootstrap-admin` from `backend`. Keep these values private and do not commit `.env`.
6. Start the app:
   - `cd backend && npm run dev`
   - `cd frontend && npm run dev`

## Useful checks

- Backend type-check: `cd backend && npx tsc --noEmit`
- Backend tests: `cd backend && npm test`
- Frontend build: `cd frontend && npm run build`

The application does not create demo accounts or sample records. Add genuine customer and service records through the application or your approved import process.
