# Theni Aanantham - Employee Billing Report & Analytics System

A production-ready MERN stack application for managing and analyzing employee billing transactions across multiple floors with advanced reporting and export capabilities.

## 🚀 Quick Start

### Prerequisites
- Node.js v20.18+ (or upgrade to v22.12+)
- MongoDB Atlas account with connection credentials
- npm

### Installation & Running

Run everything from the root folder:

```bash
# Install all dependencies
npm run install-all

# Start both backend and frontend together
npm run dev
```

This command runs:
- **Backend**: http://localhost:5000 (Express + MongoDB)
- **Frontend**: http://localhost:5173 (React + Vite)

### Individual Commands

```bash
# Run only backend
npm run dev:backend

# Run only frontend
npm run dev:frontend

# Build both
npm run build

# Build backend only
npm run build:backend

# Build frontend only
npm run build:frontend
```

## 🔐 Admin Login Credentials

```
Username: Admin
Password: Admin@123
```

## 📁 Project Structure

```
Theni_Aanantham/
├── backend/                 # Express + TypeScript API
│   ├── src/
│   │   ├── models/         # MongoDB schemas (Employee, Transaction)
│   │   ├── controllers/    # API logic (auth, reports, data-entry, exports)
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # JWT authentication
│   │   └── index.ts        # Express server entry
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                # React + Vite + TypeScript
│   ├── src/
│   │   ├── pages/          # Login, Dashboard, DataEntry
│   │   ├── components/     # Shared components (Layout)
│   │   ├── services/       # API client (axios)
│   │   ├── App.tsx         # Router configuration
│   │   └── main.tsx        # Entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── package.json             # Root config for concurrent development
├── .env                     # MongoDB credentials
└── README.md
```

## ✨ Features

### Dashboard
- **Floor & Employee Filtering**: Select from 4 floors and multiple employees
- **Date Range Selection**: Custom reporting periods
- **7 KPI Cards**:
  - Total Customers
  - Total Billing Amount (₹)
  - Customers with Mobile
  - Customers without Mobile
  - Bills Below ₹100
  - Bills Above ₹100
  - Redeem Points Earned

### Analytics Charts
- **Bar Chart**: Bill distribution (Below/Above ₹100)
- **Pie Chart**: Customer contact status (With/Without Mobile)
- **Line Chart**: Daily sales trend

### Data Entry
- **Manual Entry**: Add individual transactions via form
- **Bulk Upload**: Import Excel files with multiple transactions

### Export Options
- **PDF Export**: Professional formatted report with header, KPIs, and transaction table
- **Excel Export**: 2-sheet workbook
  - Sheet 1: Summary with KPIs and filters
  - Sheet 2: All transaction details

### Transaction Table
- Searchable and sortable
- Displays last 100 transactions
- Shows Entry No, Date, Cashier, Bill Amount, Mobile number, Floor

## 🗄️ Database Schema

### Employee Model
```typescript
{
  _id: ObjectId,
  name: String (unique),
  floor: Number (1-4),
  createdAt: Date,
  updatedAt: Date
}
```

### Transaction Model
```typescript
{
  _id: ObjectId,
  entryNo: String,
  entryDate: Date,
  cashier: String,
  floor: Number,
  cash: Number,
  card: Number,
  cheque: Number,
  others: Number,
  balance: Number,
  billAmt: Number,
  discAmt: Number,
  refundAmt: Number,
  customer: String (optional),
  cusMob: String,
  groupBillNo: String,
  createdAt: Date,
  updatedAt: Date
}
```

## 🔌 API Endpoints

### Authentication
- `POST /auth/login` - Admin login

### Employees
- `GET /api/employees?floor=1` - Get employees by floor
- `POST /api/employees` - Create new employee

### Transactions
- `POST /api/transactions/manual` - Add single transaction
- `POST /api/transactions/bulk` - Bulk upload Excel
- `GET /api/transactions` - Get filtered transactions

### Reports
- `GET /api/reports/generate` - Generate analytics report
- `GET /api/reports/export-pdf` - Export PDF
- `GET /api/reports/export-excel` - Export Excel

## 🎨 UI Technologies

- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library
- **Recharts**: Chart visualization library
- **date-fns**: Date manipulation

## ⚙️ Environment Variables

Create a `.env` file in the root:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://xenco:Xenco@123@cluster0.wxennmf.mongodb.net/?appName=Cluster0
JWT_SECRET=your_jwt_secret_key_here
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=Admin@123
FRONTEND_URL=http://localhost:3000
```

## 📊 Performance

- MongoDB indexes on: `employeeId`, `floor`, `createdAt`
- Aggregation pipeline for efficient report generation
- Target: Report generation < 2 seconds for 10,000+ records

## 🛠️ Development Notes

### Backend
- TypeScript with strict typing
- Express.js with CORS support
- MongoDB with Mongoose ODM
- JWT-based authentication
- PDFKit & ExcelJS for exports

### Frontend
- React 19 with TypeScript
- Vite for fast development and builds
- React Router v7 for navigation
- Protected routes with token-based auth
- Responsive design with Tailwind CSS

## 🚨 Troubleshooting

### Port Already in Use
If ports 5000 or 5173 are busy, kill the process or change ports in the dev script.

### MongoDB Connection Error
- Verify `.env` has correct `MONGODB_URI`
- Check MongoDB Atlas IP whitelist
- Ensure username/password are correct

### Vite Config Issues
If Vite fails to load config, run:
```bash
cd frontend
npx vite --force
```

### Missing Dependencies
```bash
npm run install-all
```

## 📝 License

© 2026 Theni Aanantham. All rights reserved.

## 📧 Support

For issues or questions, please check the server logs at `backend/logs/` or browser console.
