# Operator AI -- Frontend

Next.js 15 + TypeScript dashboard for Operator AI.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

The app redirects to /auth/login when unauthenticated and to /dashboard when signed in.

## Environment

Create frontend/.env.local:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## Project Structure

```
src/
  app/           # Next.js App Router pages
  components/    # Reusable UI components
    dashboard/   # Dashboard feature components
    layout/      # Sidebar, Header, Shell
  lib/           # Auth, API clients, utilities
```

## Pages

| Route | Description |
|---|---|
| /auth/login | Sign in |
| /auth/register | Create account |
| /dashboard | Overview, Operators, Inbox, Calls, Leads, Calendar, Analytics, Integrations |

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Vanilla CSS with CSS variables
- Lucide React icons
- FastAPI backend at http://localhost:8000
