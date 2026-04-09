# QuikScale - Phase 1 Setup Guide

## Prerequisites

- Node.js 18+ (https://nodejs.org/)
- PostgreSQL 14+ (https://www.postgresql.org/)
- Git (https://git-scm.com/)
- npm or yarn

## Step 1: Clone & Install Dependencies

```bash
cd quikscale
npm install
```

## Step 2: Set Up PostgreSQL Database

### Option A: Local PostgreSQL
```bash
# Create database
createdb quikscale_dev

# Get connection string
# postgresql://user:password@localhost:5432/quikscale_dev
```

### Option B: Use Neon.tech (Cloud PostgreSQL)
1. Sign up at https://neon.tech
2. Create a new project
3. Copy the connection string

## Step 3: Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/quikscale_dev"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

Generate a secure NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

## Step 4: Initialize Database

```bash
# Run Prisma migrations
npx prisma migrate dev

# When prompted, name the migration (e.g., "init")

# Seed database with demo data
npm run db:seed
```

## Step 5: Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser

## Step 6: Login

**Demo Credentials** (auto-filled):
- **CEO**: ceo@demo.com / password123
- **Manager**: manager@demo.com / password123
- **Employee**: employee@demo.com / password123

## Available Scripts

```bash
# Development
npm run dev                 # Start dev server
npm run type-check        # TypeScript check
npm run lint              # ESLint check

# Database
npm run db:push           # Push schema to database (dev only)
npm run db:studio         # Open Prisma Studio (GUI)
npm run db:migrate        # Create migration
npm run db:seed           # Seed demo data
npm run db:reset          # Reset database (WARNING: destructive)

# Build & Deploy
npm run build             # Production build
npm start                 # Run production server
```

## Database Schema

Prisma schema is in `/prisma/schema.prisma`

View all tables:
```bash
npm run db:studio
```

## Project Structure

```
quikscale/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Login/register pages
│   ├── (dashboard)/         # Authenticated pages + sidebar
│   ├── api/                 # API routes
│   └── globals.css          # Global styles + CSS variables
├── components/              # React components (future)
├── lib/                     # Utilities, auth, types
├── services/                # Business logic (future)
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts              # Demo data
├── types/                   # TypeScript types
├── middleware.ts            # Auth middleware
├── tsconfig.json            # TypeScript config
├── tailwind.config.ts       # Tailwind config
├── next.config.js           # Next.js config
└── package.json             # Dependencies
```

## Phase 1 Deliverables Checklist

- [x] Next.js 14+ project setup
- [x] TypeScript strict mode configured
- [x] Tailwind CSS with custom design system
- [x] CSS Custom Properties for theming (light/dark)
- [x] PostgreSQL + Prisma configured
- [x] Database schema (14 tables)
- [x] NextAuth.js v5 authentication
- [x] Multi-tenant middleware
- [x] RBAC enforcement
- [x] Left sidebar navigation
- [x] Dashboard skeleton pages (all modules)
- [x] Demo data seeding (3 users, 2 teams, 3 KPIs, etc.)
- [x] CSS design system implemented
- [x] Framer Motion animations (page load, modals)
- [x] Login page with demo credentials
- [x] Settings page with logout

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
Make sure PostgreSQL is running:
```bash
# macOS (Homebrew)
brew services start postgresql

# Linux
sudo service postgresql start

# Windows - use PostgreSQL installer
```

### Port 3000 Already in Use
```bash
npm run dev -- -p 3001
```

### Prisma Schema Mismatch
```bash
npm run db:reset  # WARNING: Deletes all data
npm run db:seed   # Reseeds demo data
```

### NextAuth Secret Not Set
```bash
# Generate a new secret
openssl rand -base64 32

# Add to .env.local
NEXTAUTH_SECRET="your-generated-secret"
```

## Next Steps

Once Phase 1 is running:

1. **Review the dashboard** - Explore all skeleton pages
2. **Check the database** - Use `npm run db:studio` to view data
3. **Read the docs** - Check COMPLETE_PROJECT_SUMMARY.md
4. **Approve Phase 1** - Confirm everything looks good
5. **Start Phase 2** - KPI Module implementation

## Resources

- **Next.js Docs**: https://nextjs.org/docs
- **Prisma Docs**: https://www.prisma.io/docs/
- **NextAuth.js Docs**: https://next-auth.js.org/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Framer Motion**: https://www.framer.com/motion/

## Support

For issues or questions, refer to:
- `/README.md` - Project overview
- `/COMPLETE_PROJECT_SUMMARY.md` - Full project plan
- `/TECH_STACK_COMPLETE.md` - Design system details

---

**Phase 1 Status**: ✅ Ready to run!

After setup, run `npm run dev` and open http://localhost:3000
