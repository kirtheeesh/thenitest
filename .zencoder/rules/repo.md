---
description: Repository Information Overview
alwaysApply: true
---

# Theni Aanantham Information

## Summary
Theni Aanantham is a full-stack (MERN) **Employee Billing Report & Analytics System** designed to manage and analyze billing transactions across multiple floors. It features advanced data entry (manual and bulk Excel upload), real-time analytics with charts, and comprehensive report generation in PDF and Excel formats.

## Structure
The project follows a unified TypeScript structure with the frontend and backend managed by a single root `package.json`.

- **client/**: React + Vite + Tailwind CSS frontend application.
- **server/**: Express + Mongoose + TypeScript backend.
- **shared/**: Shared types and Zod schemas used by both client and server.
- **script/**: Build and utility scripts (e.g., `build.ts`, `clear_db_final.ts`).
- **data/**: Contains Excel data files for processing or seeding.
- **dist/**: Build output directory (server bundle and static frontend files).

## Language & Runtime
**Language**: TypeScript  
**Version**: 5.4.5 (TypeScript), Node.js v20.18+ (Target: node20)  
**Build System**: Custom `tsx` build script using `esbuild` and `vite`.  
**Package Manager**: npm  

## Dependencies
**Main Dependencies**:
- **Frontend**: `react` (v18), `react-router-dom`, `recharts`, `lucide-react`, `tailwind-merge`, `clsx`, `axios`.
- **Backend**: `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `multer`, `dotenv`, `cors`.
- **Processing & Exports**: `exceljs`, `xlsx`, `pdfkit`.
- **Validation**: `zod`.
- **Runtime**: `tsx`, `esbuild`, `vite`.

**Development Dependencies**:
- `@types/express`, `@types/react`, `@types/node`, `@types/multer`, `@types/pdfkit`.

## Build & Installation
```bash
# Install dependencies
npm install

# Run development server (Frontend + Backend via tsx)
npm run dev

# Build for production (Client + Server)
npm run build

# Start production server
npm start
```

## Main Files & Resources
- **Frontend Entry**: [./client/src/main.tsx](./client/src/main.tsx)
- **Backend Entry**: [./server/index.ts](./server/index.ts)
- **Database Schema**: [./server/db.ts](./server/db.ts) (Mongoose models for Employee and Transaction)
- **Shared Schemas**: [./shared/schema.ts](./shared/schema.ts) (Zod schemas for validation)
- **Environment Config**: [./.env.example](./.env.example) (Configuration for MongoDB, JWT, and Admin credentials)

## Operations
- **Data Entry**: Support for manual entry and bulk Excel upload via API.
- **Analytics**: Aggregated reports with KPI cards and charts (Bar, Pie, Line).
- **Exports**: PDF reports (via `pdfkit`) and multi-sheet Excel workbooks (via `exceljs`).
- **Maintenance**: `npm run clear-db` for clearing the database.

## Validation
- **Quality Checks**: `npm run check` for TypeScript compilation checks.
- **Error Tracking**: `npm run check:errors` (via `script/color-check.js`).
- **Validation Logic**: Extensive use of **Zod** for API request and data validation.
