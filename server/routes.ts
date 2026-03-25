import { Express, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import * as xlsx from 'xlsx';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { format, parse, isValid } from 'date-fns';
import { createServer, type Server } from "http";
import mongoose from 'mongoose';

const upload = multer({ storage: multer.memoryStorage() });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function normalizeDate(rawDate: any): Date {
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    // Already a date, but normalize to 12:00 UTC to avoid timezone issues
    // Use UTC components to ensure we don't shift the day
    return new Date(Date.UTC(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate(), 12, 0, 0, 0));
  }
  
  if (typeof rawDate === 'string' && rawDate.trim()) {
    const trimmed = rawDate.trim();
    // Try dd/MM/yyyy
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1]);
      const m = parseInt(dmyMatch[2]) - 1;
      const y = parseInt(dmyMatch[3]);
      const date = new Date(Date.UTC(y, m, d, 12, 0, 0, 0));
      if (!isNaN(date.getTime())) return date;
    }
    
    // Try yyyy-MM-dd
    const ymdMatch = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1]);
      const m = parseInt(ymdMatch[2]) - 1;
      const d = parseInt(ymdMatch[3]);
      const date = new Date(Date.UTC(y, m, d, 12, 0, 0, 0));
      if (!isNaN(date.getTime())) return date;
    }
    
    // Fallback to native parsing
    const native = new Date(trimmed);
    if (!isNaN(native.getTime())) {
      native.setUTCHours(12, 0, 0, 0);
      return native;
    }
  }
  
  // Default to today noon UTC if invalid
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  return today;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth Routes
  app.get('/api/checkdb', async (_req: Request, res: Response) => {
    try {
      const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      const state = mongoose.connection.readyState;
      res.json({
        status: states[state] || 'unknown',
        readyState: state,
        database: mongoose.connection.name,
        host: mongoose.connection.host
      });
    } catch (error: any) {
      res.status(500).json({ message: 'Error checking database status', error: error.message });
    }
  });

  app.post('/auth/login', async (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ username, role: 'Admin' }, JWT_SECRET, { expiresIn: '1d' });
      res.json({ token, user: { username, role: 'Admin' } });
      return;
    }
    res.status(401).json({ message: 'Invalid credentials' });
  });

  // Protected middleware
  const authMiddleware = (req: any, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };

  // Employee routes
  app.get('/api/employees', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { floor } = req.query;
      const employees = await storage.getEmployees(floor ? parseInt(floor as string) : undefined);
      res.json(employees);
    } catch (error: any) {
      res.status(500).json({ message: 'Error fetching employees', error: error.message });
    }
  });

  app.post('/api/employees', authMiddleware, async (req: Request, res: Response) => {
    try {
      const employee = await storage.createEmployee(req.body);
      res.status(201).json(employee);
    } catch (error: any) {
      res.status(500).json({ message: 'Error creating employee', error: error.message });
    }
  });

  // Transaction routes
  app.post('/api/transactions/manual', authMiddleware, async (req: Request, res: Response) => {
    try {
      const data = { ...req.body };
      if (data.entryDate && typeof data.entryDate === 'string' && data.entryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        data.entryDate = new Date(data.entryDate + 'T12:00:00Z');
      }
      const transaction = await storage.createTransaction(data);
      res.status(201).json({ message: 'Transaction saved successfully', transaction });
    } catch (error: any) {
      res.status(500).json({ message: 'Error saving transaction', error: error.message });
    }
  });

  app.post('/api/transactions/bulk', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Auto-detect format by checking for "Entry No" in the first few rows
      let data: any[] = xlsx.utils.sheet_to_json(sheet);
      
      // If "Entry No" is not found in the first row's keys, it might be the new format with 3 rows of header
      const firstRow = data[0] || {};
      if (!firstRow['Entry No'] && !firstRow['entryNo']) {
        // Try skipping 3 rows (headers at row 4)
        data = xlsx.utils.sheet_to_json(sheet, { range: 3, cellDates: true });
      }

      const bodyFloor = parseInt(req.body.floor);
      const processedTransactions = data.map(item => {
        const rawDate = item['Entry Date'] || item['entryDate'] || item['Date'];
        const entryDateVal = normalizeDate(rawDate);

        const groupBillNo = String(item['GroupBillno'] || item['groupBillNo'] || item['GroupName'] || item['GroupBillNo'] || '').trim();
        let floor = bodyFloor;

        // Parse floor from groupBillNo (e.g., "1FL/000001" -> 1 floor)
        if (groupBillNo && groupBillNo.includes('FL')) {
          const floorMatch = groupBillNo.match(/^(\d+)FL/);
          if (floorMatch) {
            floor = parseInt(floorMatch[1]);
          }
        }

        return {
          entryNo: String(item['Entry No'] || item['entryNo'] || ''),
          entryDate: entryDateVal, // Now a proper Date object
          cashier: String(item['Cashier'] || item['cashier'] || 'Unknown'),
          floor: floor,
          cash: Number(item['Cash'] || item['cash'] || 0),
          card: Number(item['Card'] || item['card'] || 0),
          cheque: Number(item['Cheque'] || item['cheque'] || 0),
          others: Number(item['Others'] || item['others'] || 0),
          balance: Number(item['Balance'] || item['balance'] || 0),
          billAmt: Number(item['Bill Amt'] || item['billAmt'] || item['Bill Amount'] || 0),
          discAmt: Number(item['Disc Amt'] || item['discAmt'] || 0),
          refundAmt: Number(item['Refund Amt'] || item['refundAmt'] || 0),
          customer: String(item['Customer'] || item['customer'] || ''),
          cusMob: String(item['CUSMob'] || item['cusMob'] || item['CUSMoB'] || ''),
          groupBillNo: groupBillNo,
        };
      }).filter(t => t.entryNo && t.billAmt !== undefined && t.billAmt !== null);
      await storage.bulkCreateTransactions(processedTransactions);
      res.status(201).json({ message: `Successfully processed ${processedTransactions.length} transactions` });
    } catch (error: any) {
      res.status(500).json({ message: 'Error processing bulk upload', error: error.message });
    }
  });

  app.post('/api/transactions/bulk-json', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { transactions } = req.body;
      console.log(`Received bulk JSON with ${transactions?.length} items`);
      if (!Array.isArray(transactions)) {
        return res.status(400).json({ message: 'Invalid data format' });
      }
      
      const processed = transactions
        .filter((t: any) => t && (t.entryNo || t['Entry No']) && (t.billAmt !== undefined || t['Bill Amt'] !== undefined || t['Bill Amount'] !== undefined)) // Only keep rows with essential data
        .map((t: any) => {
          const entryNo = String(t.entryNo || t['Entry No'] || t['EntryNo'] || t['Bill No'] || '').trim();
          const billAmt = Number(t.billAmt || t['Bill Amt'] || t['Bill Amount'] || 0);
          
          // Use provided entry date - normalize it
          const rawDate = t.entryDate || t['Entry Date'] || t['EntryDate'] || t['Date'] || '';
          const entryDateVal = normalizeDate(rawDate);
          
          return {
            entryNo: entryNo,
            entryDate: entryDateVal,
            cashier: String(t.cashier || t['Cashier'] || 'Unknown').trim(),
            floor: Number(t.floor || 1),
            cash: Number(t.cash || t['Cash'] || 0),
            card: Number(t.card || t['Card'] || 0),
            cheque: Number(t.cheque || t['Cheque'] || 0),
            others: Number(t.others || t['Others'] || 0),
            balance: Number(t.balance || t['Balance'] || 0),
            billAmt: billAmt,
            discAmt: Number(t.discAmt || t['Disc Amt'] || 0),
            refundAmt: Number(t.refundAmt || t['Refund Amt'] || 0),
            customer: String(t.customer || t['Customer'] || '').trim(),
            cusMob: String(t.cusMob || t['CUSMob'] || t['Mobile'] || t['CUSMoB'] || '').trim(),
            groupBillNo: String(t.groupBillNo || t['GroupBillno'] || t['BillNo'] || '').trim()
          };
        });

      if (processed.length === 0) {
        return res.status(400).json({ message: 'No valid transaction data found in the upload' });
      }

      console.log(`Attempting to save ${processed.length} valid transactions to database (ordered: false)...`);
      const result = await storage.bulkCreateTransactions(processed);
      const savedCount = Array.isArray(result) ? result.length : (result.insertedCount || 0);
      console.log(`Successfully saved ${savedCount} transactions.`);
      
      res.status(201).json({ 
        message: 'data inserted successfully', 
        count: savedCount,
        total: processed.length
      });
    } catch (error: any) {
      console.error('Error saving bulk transactions:', error);
      res.status(500).json({ message: 'Error saving transactions', error: error.message });
    }
  });

  app.get('/api/transactions', authMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getTransactions(req.query);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ message: 'Error fetching transactions', error: error.message });
    }
  });

  app.get('/api/cashiers', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { floor } = req.query;
      const cashiers = await storage.getUniqueCashiers(floor && floor !== 'All' ? parseInt(floor as string) : undefined);
      res.json(cashiers);
    } catch (error: any) {
      res.status(500).json({ message: 'Error fetching cashiers', error: error.message });
    }
  });

  app.get('/api/reports/generate', authMiddleware, async (req: Request, res: Response) => {
    try {
      const transactions = await storage.getTransactions(req.query);

      const metrics = {
        totalCustomers: transactions.length,
        totalBillingAmount: transactions.reduce((sum, t) => sum + t.billAmt, 0),
        withMobile: transactions.filter(t => t.cusMob && t.cusMob.length >= 10).length,
        withoutMobile: transactions.filter(t => !t.cusMob || t.cusMob.length < 10).length,
        below100: transactions.filter(t => t.billAmt < 100).length,
        above100: transactions.filter(t => t.billAmt >= 100).length,
        // Redeem points: 1 point per bill greater than 100 (count)
        redeemPointsCount: transactions.filter(t => t.billAmt > 100).length,
        // Redeem points total value (sum of bills > 100) - kept for exports if needed
        redeemPointsValue: transactions.filter(t => t.billAmt > 100).reduce((sum, t) => sum + t.billAmt, 0),
        // Backwards compatible field
        redeemPoints: transactions.filter(t => t.billAmt > 100).length,
      };

      // Group by date for daily trend
      const dailyTrendMap = new Map();
      transactions.forEach(t => {
        const dateStr = format(new Date(t.entryDate), 'yyyy-MM-dd');
        dailyTrendMap.set(dateStr, (dailyTrendMap.get(dateStr) || 0) + t.billAmt);
      });

      const dailyTrend = Array.from(dailyTrendMap.entries())
        .map(([_id, sales]) => ({ _id, sales }))
        .sort((a, b) => a._id.localeCompare(b._id));

      res.json({ metrics, dailyTrend, transactions: transactions.slice(0, 5000) });
    } catch (error: any) {
      res.status(500).json({ message: 'Error generating report', error: error.message });
    }
  });

  app.get('/api/reports/export-excel', authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log('Generating Excel report...');
      const transactions = await storage.getTransactions(req.query);
      const cashier = req.query.cashier ? String(req.query.cashier) : 'All';
      const adminName = (req as any).user?.username || 'Admin';
      const filename = `${cashier}_${adminName}.xlsx`;
      
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      worksheet.columns = [
        { header: 'Entry No', key: 'entryNo', width: 12 },
        { header: 'Entry', key: 'entryDate', width: 12 },
        { header: 'Cashier', key: 'cashier', width: 20 },
        { header: '', key: 'empty', width: 5 }, // Empty column like in original
        { header: 'Cash', key: 'cash', width: 10 },
        { header: 'Card', key: 'card', width: 10 },
        { header: 'Cheque', key: 'cheque', width: 10 },
        { header: 'Others', key: 'others', width: 10 },
        { header: 'Balance', key: 'balance', width: 12 },
        { header: 'Bill Amt', key: 'billAmt', width: 12 },
        { header: 'Disc Amt', key: 'discAmt', width: 10 },
        { header: 'Refund Amt', key: 'refundAmt', width: 10 },
        { header: 'Custome', key: 'customer', width: 25 },
        { header: 'CUSMoB', key: 'cusMob', width: 15 },
        { header: 'GroupBilln', key: 'groupBillNo', width: 15 },
      ];

      // Add data rows
      let totalCash = 0;
      let totalCard = 0;
      let totalCheque = 0;
      let totalOthers = 0;
      let totalBalance = 0;
      let totalBillAmt = 0;
      let totalDiscAmt = 0;
      let totalRefundAmt = 0;

      transactions.forEach(t => {
        totalCash += Number(t.cash || 0);
        totalCard += Number(t.card || 0);
        totalCheque += Number(t.cheque || 0);
        totalOthers += Number(t.others || 0);
        totalBalance += Number(t.balance || 0);
        totalBillAmt += Number(t.billAmt || 0);
        totalDiscAmt += Number(t.discAmt || 0);
        totalRefundAmt += Number(t.refundAmt || 0);

        const tDate = new Date(t.entryDate);
        const formattedDate = isValid(tDate) ? format(tDate, 'dd/MM/yyyy') : String(t.entryDate);
        
        worksheet.addRow({
          entryNo: String(t.entryNo || ''),
          entryDate: formattedDate,
          cashier: String(t.cashier || ''),
          empty: null,
          cash: Number(t.cash || 0).toFixed(2),
          card: Number(t.card || 0).toFixed(2),
          cheque: Number(t.cheque || 0).toFixed(2),
          others: Number(t.others || 0).toFixed(2),
          balance: Number(t.balance || 0).toFixed(2),
          billAmt: Number(t.billAmt || 0).toFixed(2),
          discAmt: Number(t.discAmt || 0).toFixed(2),
          refundAmt: Number(t.refundAmt || 0).toFixed(2),
          customer: String(t.customer || ''),
          cusMob: String(t.cusMob || ''),
          groupBillNo: String(t.groupBillNo || '')
        });
      });

      // Add a blank row
      worksheet.addRow({});

      // Add totals row
      const totalsRow = worksheet.addRow({
        entryNo: '',
        entryDate: '',
        cashier: '',
        empty: null,
        cash: totalCash.toFixed(0),
        card: totalCard.toFixed(0),
        cheque: totalCheque.toFixed(0),
        others: totalOthers.toFixed(0),
        balance: totalBalance.toFixed(0),
        billAmt: totalBillAmt.toFixed(0),
        discAmt: totalDiscAmt.toFixed(0),
        refundAmt: totalRefundAmt.toFixed(0),
        customer: '',
        cusMob: '',
        groupBillNo: ''
      });
      totalsRow.font = { bold: true };

      // Insert the 3 header rows at the top to match reference file exactly
      let displayDate = new Date();
      if (transactions.length > 0) {
        const dates = transactions.map(t => new Date(t.entryDate).getTime()).filter(d => !isNaN(d));
        if (dates.length > 0) displayDate = new Date(Math.max(...dates));
      }
      const dateStr = format(displayDate, 'dd MMMM, yyyy');
      
      let startDateStr = 'Start';
      let endDateStr = 'End';
      
      if (req.query.startDate && req.query.endDate) {
        startDateStr = format(new Date(req.query.startDate as string), 'dd/MM/yyyy');
        endDateStr = format(new Date(req.query.endDate as string), 'dd/MM/yyyy');
      } else if (transactions.length > 0) {
        const dates = transactions.map(t => new Date(t.entryDate).getTime()).filter(d => !isNaN(d));
        if (dates.length > 0) {
          startDateStr = format(new Date(Math.min(...dates)), 'dd/MM/yyyy');
          endDateStr = format(new Date(Math.max(...dates)), 'dd/MM/yyyy');
        }
      }
      
      const rangeStr = `${startDateStr} - ${endDateStr}`;

      worksheet.insertRow(1, [dateStr]);
      worksheet.insertRow(2, ['Settlement Summary Report']);
      worksheet.insertRow(3, [rangeStr]);
      
      worksheet.mergeCells(1, 1, 1, 15);
      worksheet.mergeCells(2, 1, 2, 15);
      worksheet.mergeCells(3, 1, 3, 15);
      
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FF0000FF' } };
      worksheet.getRow(1).alignment = { horizontal: 'left' };
      worksheet.getRow(2).font = { bold: true, size: 20 };
      worksheet.getRow(2).alignment = { horizontal: 'left' };
      worksheet.getRow(3).font = { bold: true };
      worksheet.getRow(3).alignment = { horizontal: 'left' };
      
      worksheet.getRow(4).font = { bold: true };
      worksheet.getRow(4).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFBDBDBD' }
      };
      worksheet.getRow(4).alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 4) {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            if (typeof cell.value === 'number' || (!isNaN(Number(cell.value)) && cell.value !== '')) {
              cell.alignment = { horizontal: 'right' };
            } else {
              cell.alignment = { horizontal: 'left' };
            }
          });
        }
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      
      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
    } catch (error: any) {
      console.error('Error exporting Excel:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error exporting Excel', error: error.message });
      }
    }
  });

  app.get('/api/reports/export-analytics-excel', authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log('Generating Analytics Excel report (Cashier Wise)...');
      const transactions = await storage.getTransactions(req.query);
      const adminName = (req as any).user?.username || 'Admin';
      const filename = `Analytics_CashierWise_${adminName}.xlsx`;

      const selectedCashier = req.query.cashier ? String(req.query.cashier) : 'All';
      const selectedFloor = req.query.floor ? `Floor ${req.query.floor}` : 'All Floors';
      const generatedAt = format(new Date(), 'dd-MM-yyyy HH:mm:ss');

      // Grouping data by Date and Cashier
      const groupedData: Map<string, Map<string, any>> = new Map();

      transactions.forEach(t => {
        const entryDate = t.entryDate;
        let tDate: Date;
        if (typeof entryDate === 'string' && entryDate.includes('/')) {
          tDate = parse(entryDate, 'dd/MM/yyyy', new Date());
        } else {
          tDate = new Date(entryDate);
        }
        
        if (isNaN(tDate.getTime())) return;
        const dateStr = format(tDate, 'dd/MM/yyyy');

        if (!groupedData.has(dateStr)) {
          groupedData.set(dateStr, new Map());
        }
        const dateGroup = groupedData.get(dateStr)!;

        const isMinusBill = (Number(t.billAmt) === 0 && Number(t.cash) === 0 && Number(t.card) === 0 && 
                            Number(t.cheque) === 0 && Number(t.others) === 0 && Number(t.balance) === 0 && 
                            Number(t.discAmt) === 0 && Number(t.refundAmt) === 0) || Number(t.billAmt) < 0;

        const cashierName = isMinusBill ? `${t.cashier} (Minus Bill)` : t.cashier;

        if (!dateGroup.has(cashierName)) {
          dateGroup.set(cashierName, {
            pointsAdded: 0,
            below100: 0,
            pointsNotAdded: 0,
            minusBill: 0,
            totalBill: 0
          });
        }
        const stats = dateGroup.get(cashierName)!;

        if (isMinusBill) {
          stats.minusBill++;
        } else if (t.billAmt < 100) {
          stats.below100++;
        } else {
          if (t.cusMob && t.cusMob.length >= 10) {
            stats.pointsAdded++;
          } else {
            stats.pointsNotAdded++;
          }
        }
        stats.totalBill = stats.pointsAdded + stats.below100 + stats.pointsNotAdded + stats.minusBill;
      });

      // Calculate Metrics for summary
      const totalCustomers = transactions.length;
      const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.billAmt || 0), 0);
      const withMobile = transactions.filter(t => t.cusMob && t.cusMob.length >= 10).length;
      const withoutMobile = transactions.filter(t => !t.cusMob || t.cusMob.length < 10).length;
      const below100Count = transactions.filter(t => t.billAmt < 100).length;
      const above100Count = transactions.filter(t => t.billAmt >= 100).length;
      const redeemPoints = above100Count;

      if (selectedCashier === 'All') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Cashier Wise Report');

        worksheet.columns = [
          { header: 'Entry Date', key: 'entryDate', width: 25 },
          { header: 'Cashier', key: 'cashier', width: 25 },
          { header: 'Points Added', key: 'pointsAdded', width: 15 },
          { header: 'Below 100', key: 'below100', width: 12 },
          { header: 'Points Not Added', key: 'pointsNotAdded', width: 15 },
          { header: 'Total Bill', key: 'totalBill', width: 12 }
        ];

        const titleRow = worksheet.insertRow(1, ['CASHIER WISE REPORT']);
        worksheet.mergeCells(1, 1, 1, 6);
        titleRow.font = { bold: true, size: 14, color: { argb: 'FF0047AB' } };
        titleRow.alignment = { horizontal: 'center' };

        const headerRow = worksheet.getRow(2);
        headerRow.values = ['Entry Date', 'Cashier', 'Points Added', 'Below 100', 'Points Not Added', 'Total Bill'];
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB0C4DE' } };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        let currentRow = 3;
        let grandPointsAdded = 0;
        let grandBelow100 = 0;
        let grandPointsNotAdded = 0;
        let grandMinusBill = 0;
        let grandTotalBill = 0;

        const sortedDates = Array.from(groupedData.keys()).sort((a, b) => {
          try {
            const aStr = String(a || '');
            const bStr = String(b || '');
            if (!aStr.includes('/') || !bStr.includes('/')) return aStr.localeCompare(bStr);
            const [dayA, monthA, yearA] = aStr.split('/').map(Number);
            const [dayB, monthB, yearB] = bStr.split('/').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateA.getTime() - dateB.getTime();
          } catch (e) { return 0; }
        });

        sortedDates.forEach(dateStr => {
          const dateGroup = groupedData.get(dateStr)!;
          const cashiers = Array.from(dateGroup.keys()).sort();
          const startRow = currentRow;
          
          let displayDate = dateStr;
          try {
            const aStrStr = String(dateStr || '');
            const [day, month, year] = aStrStr.split('/').map(Number);
            const parsedDate = new Date(year, month - 1, day);
            if (!isNaN(parsedDate.getTime())) displayDate = format(parsedDate, 'EEEE, MMMM dd, yyyy');
          } catch (e) {}

          cashiers.forEach((cashier, idx) => {
            const stats = dateGroup.get(cashier)!;
            const row = worksheet.addRow({
              entryDate: idx === 0 ? displayDate : '',
              cashier: cashier,
              pointsAdded: stats.pointsAdded,
              below100: stats.below100,
              pointsNotAdded: stats.pointsNotAdded,
              totalBill: stats.totalBill
            });

            row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } };
            if (stats.pointsNotAdded > 0) row.getCell(5).font = { color: { argb: 'FFFF0000' } };

            row.eachCell(cell => {
              cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });

            grandPointsAdded += stats.pointsAdded;
            grandBelow100 += stats.below100;
            grandPointsNotAdded += stats.pointsNotAdded;
            grandMinusBill += stats.minusBill;
            grandTotalBill += stats.totalBill;
            currentRow++;
          });

          if (cashiers.length > 1) worksheet.mergeCells(startRow, 1, currentRow - 1, 1);
          worksheet.getCell(startRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF8D' } };
        });

        const grandTotalRow = worksheet.addRow(['', 'Shop Grand Total', grandPointsAdded, grandBelow100, grandPointsNotAdded, grandTotalBill]);
        grandTotalRow.font = { bold: true };
        grandTotalRow.getCell(5).font = { bold: true, color: { argb: 'FFFF0000' } };
        grandTotalRow.eachCell(cell => {
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          cell.alignment = { horizontal: 'center' };
        });

        worksheet.addRow([]);
        const summaryDataAll = [
          { label: 'POINTS ADDED', value: grandPointsAdded, color: 'FFFFFF00' },
          { label: 'BELOW100', value: grandBelow100, color: 'FFFFFF00' },
          { label: 'MINUS BILL', value: grandMinusBill, color: 'FFFF0000' },
          { label: 'POINTS NOT ADDED', value: grandPointsNotAdded, color: 'FFFF0000' },
          { label: 'TOTAL BILL', value: grandTotalBill, color: 'FF00BFFF' }
        ];

        summaryDataAll.forEach(item => {
          const row = worksheet.addRow(['', item.label, '', '', '', item.value]);
          worksheet.mergeCells(row.number, 2, row.number, 5);
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.color } };
          row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.color } };
          row.getCell(2).font = { bold: true };
          row.getCell(6).font = { bold: true };
          row.getCell(2).alignment = { horizontal: 'center' };
          row.getCell(6).alignment = { horizontal: 'center' };
          row.eachCell(cell => {
            if (cell.col >= 2) cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
      } else {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Summary');
        worksheet.addRow([]);
        const summaryTitleRow = worksheet.addRow(['', 'Summary']);
        summaryTitleRow.font = { bold: true, size: 14 };
        worksheet.addRow(['', `Cashier: ${selectedCashier} | Floor: ${selectedFloor}`]);
        const genRow = worksheet.addRow(['', `Generated: ${generatedAt}`]);
        genRow.font = { italic: true, color: { argb: 'FF666666' } };
        worksheet.addRow([]);
        const tableHeaderRow = worksheet.addRow(['', 'Metric', '', '', '', 'Value']);
        worksheet.mergeCells(tableHeaderRow.number, 2, tableHeaderRow.number, 5);
        tableHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD2691E' } };
        tableHeaderRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0FFFF' } };
        tableHeaderRow.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        tableHeaderRow.getCell(6).font = { bold: true, color: { argb: 'FF008B8B' } };
        tableHeaderRow.getCell(2).alignment = { horizontal: 'center' };
        tableHeaderRow.getCell(6).alignment = { horizontal: 'center' };

        const newSummaryData = [
          { label: 'Total Customers', value: totalCustomers, color: 'FFFF9933' },
          { label: 'Total Revenue', value: `Rs. ${totalRevenue.toLocaleString()}`, color: 'FF66B2FF' },
          { label: 'With Mobile', value: withMobile, color: 'FF33CC99' },
          { label: 'Without Mobile', value: withoutMobile, color: 'FF99ADC1' },
          { label: 'Bills < Rs. 100', value: below100Count, color: 'FFFFCC33' },
          { label: 'Bills >= Rs. 100', value: above100Count, color: 'FF9966FF' },
          { label: 'Redeem Points', value: redeemPoints, color: 'FFFF6666' }
        ];

        newSummaryData.forEach(item => {
          const row = worksheet.addRow(['', item.label, '', '', '', item.value]);
          worksheet.mergeCells(row.number, 2, row.number, 5);
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.color } };
          row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.color } };
          row.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          row.getCell(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          row.getCell(2).alignment = { horizontal: 'left' };
          row.getCell(6).alignment = { horizontal: 'center' };
          row.eachCell(cell => {
            if (cell.col >= 2) cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
      }
    } catch (error: any) {
      console.error('Error exporting Analytics Excel:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error exporting Analytics Excel', error: error.message });
      }
    }
  });

  app.get('/api/reports/export-pdf', authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log('Generating PDF report...');
      const transactions = await storage.getTransactions(req.query);
      const isView = req.query.view === 'true';
      const cashier = req.query.cashier ? String(req.query.cashier) : 'All';
      const adminName = (req as any).user?.username || 'Admin';
      const filename = `${cashier}_${adminName}.pdf`;
      
      const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 20 });
      const buffers: any[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Length', pdfData.length);
        res.status(200).send(pdfData);
      });

      res.setHeader('Content-Type', 'application/pdf');
      if (isView) {
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

      // Header - match the XLS reference file
      const today = new Date();
      const dateStr = format(today, 'dd MMMM, yyyy');
      const startDate = req.query.startDate ? format(new Date(req.query.startDate as string), 'dd/MM/yyyy') : 'Start';
      const endDate = req.query.endDate ? format(new Date(req.query.endDate as string), 'dd/MM/yyyy') : 'End';
      const rangeStr = `${startDate} - ${endDate}`;

      doc.fontSize(12).font('Helvetica-Bold').text(dateStr, { align: 'left' });
      doc.fontSize(14).text('Settlement Summary Report', { align: 'left' });
      doc.fontSize(12).text(rangeStr, { align: 'left' });
      doc.moveDown(1);

      // Table Header setup
      const headers = [
        'Entry No', 'Date', 'Cashier', '', 'Cash', 'Card', 'Cheque', 'Others', 
        'Balance', 'Bill Amt', 'Disc', 'Refund', 'Customer', 'CUSMoB', 'BillNo'
      ];
      const colWidths = [45, 55, 80, 20, 45, 45, 45, 45, 50, 50, 40, 45, 90, 75, 72];
      const startX = 20;
      const rowHeight = 18;
      let y = doc.y;

      const drawHeader = (currentY: number) => {
        doc.rect(startX, currentY - 2, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#E0E0E0');
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000');
        let cx = startX;
        headers.forEach((h, i) => {
          doc.text(h, cx + 2, currentY + 3, { width: colWidths[i] - 4, align: 'left' });
          doc.strokeColor('#000000').lineWidth(0.5).rect(cx, currentY - 2, colWidths[i], rowHeight).stroke();
          cx += colWidths[i];
        });
        return currentY + rowHeight;
      };

      y = drawHeader(y);
      doc.font('Helvetica').fontSize(6.5);

      transactions.forEach((t) => {
        if (y > 520) {
          doc.addPage({ layout: 'landscape', margin: 20 });
          y = 30;
          y = drawHeader(y);
          doc.font('Helvetica').fontSize(6.5);
        }

        const tDate = new Date(t.entryDate);
        const formattedDate = isValid(tDate) ? format(tDate, 'dd/MM/yyyy') : String(t.entryDate);

        const rowData = [
          String(t.entryNo || ''),
          formattedDate,
          String(t.cashier || '').substring(0, 15),
          '',
          Number(t.cash || 0).toFixed(2),
          Number(t.card || 0).toFixed(2),
          Number(t.cheque || 0).toFixed(2),
          Number(t.others || 0).toFixed(2),
          Number(t.balance || 0).toFixed(2),
          Number(t.billAmt || 0).toFixed(2),
          Number(t.discAmt || 0).toFixed(2),
          Number(t.refundAmt || 0).toFixed(2),
          String(t.customer || '').substring(0, 18),
          String(t.cusMob || ''),
          String(t.groupBillNo || '').substring(0, 15)
        ];

        let cx = startX;
        rowData.forEach((cell, i) => {
          doc.fillColor('#000000').text(cell, cx + 2, y + 3, { width: colWidths[i] - 4 });
          doc.rect(cx, y - 2, colWidths[i], rowHeight).stroke();
          cx += colWidths[i];
        });
        y += rowHeight;
      });

      doc.end();
    } catch (error: any) {
      console.error('Error exporting PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error exporting PDF', error: error.message });
      }
    }
  });

  app.get('/api/reports/export-analytics-pdf', authMiddleware, async (req: Request, res: Response) => {
    try {
      console.log('Generating Analytics PDF report (Cashier Wise)...');
      const transactions = await storage.getTransactions(req.query);
      const isView = req.query.view === 'true';
      const adminName = (req as any).user?.username || 'Admin';
      const filename = `Analytics_CashierWise_${adminName}.pdf`;

      // Grouping data by Date and Cashier
      const groupedData: Map<string, Map<string, any>> = new Map();

      transactions.forEach(t => {
        const entryDate = t.entryDate;
        let tDate: Date;
        if (typeof entryDate === 'string' && entryDate.includes('/')) {
          tDate = parse(entryDate, 'dd/MM/yyyy', new Date());
        } else {
          tDate = new Date(entryDate);
        }
        
        if (isNaN(tDate.getTime())) return;
        const dateStr = format(tDate, 'dd/MM/yyyy');
          
        if (!groupedData.has(dateStr)) {
          groupedData.set(dateStr, new Map());
        }
        const dateGroup = groupedData.get(dateStr)!;

        const isMinusBill = (Number(t.billAmt) === 0 && Number(t.cash) === 0 && Number(t.card) === 0 && 
                            Number(t.cheque) === 0 && Number(t.others) === 0 && Number(t.balance) === 0 && 
                            Number(t.discAmt) === 0 && Number(t.refundAmt) === 0) || Number(t.billAmt) < 0;

        const cashierName = isMinusBill ? `${t.cashier} (Minus Bill)` : t.cashier;

        if (!dateGroup.has(cashierName)) {
          dateGroup.set(cashierName, {
            pointsAdded: 0,
            below100: 0,
            pointsNotAdded: 0,
            minusBill: 0,
            totalBill: 0
          });
        }
        const stats = dateGroup.get(cashierName)!;

        if (isMinusBill) {
          stats.minusBill++;
        } else if (t.billAmt < 100) {
          stats.below100++;
        } else {
          if (t.cusMob && t.cusMob.length >= 10) {
            stats.pointsAdded++;
          } else {
            stats.pointsNotAdded++;
          }
        }
        stats.totalBill = stats.pointsAdded + stats.below100 + stats.pointsNotAdded + stats.minusBill;
      });

      const doc = new PDFDocument({ size: 'A4', margin: 20 });
      const buffers: any[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Length', pdfData.length);
        res.status(200).send(pdfData);
      });

      res.setHeader('Content-Type', 'application/pdf');
      if (isView) {
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

      const selectedCashier = req.query.cashier ? String(req.query.cashier) : 'All';
      const selectedFloor = req.query.floor ? `Floor ${req.query.floor}` : 'All Floors';
      const generatedAt = format(new Date(), 'dd-MM-yyyy HH:mm:ss');

      // Title
      if (selectedCashier === 'All') {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#0047AB').text('CASHIER WISE REPORT', { align: 'center' });
      } else {
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#D2691E').text('Visual Analytics Report', { align: 'center' });
        doc.fontSize(14).font('Helvetica').fillColor('#666666').text(`Cashier: ${selectedCashier}   |   Floor: ${selectedFloor}`, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${generatedAt}`, { align: 'center' });
      }
      doc.moveDown(0.5);

      const startX = 20;
      let y = doc.y;

      // Calculate Metrics for Summary
      const totalCustomers = transactions.length;
      const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.billAmt || 0), 0);
      const withMobile = transactions.filter(t => t.cusMob && t.cusMob.length >= 10).length;
      const withoutMobile = transactions.filter(t => !t.cusMob || t.cusMob.length < 10).length;
      const below100Count = transactions.filter(t => t.billAmt < 100).length;
      const above100Count = transactions.filter(t => t.billAmt >= 100).length;
      const redeemPoints = above100Count;

      if (selectedCashier === 'All') {
        const colWidths = [150, 150, 70, 60, 75, 50];
        const headers = ['Entry Date', 'Cashier', 'Points Added', 'Below 100', 'Points Not Added', 'Total Bill'];

        const drawTableHeader = (currentY: number) => {
          doc.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), 20).fill('#B0C4DE');
          doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');
          let cx = startX;
          headers.forEach((h, i) => {
            doc.text(h, cx, currentY + 5, { width: colWidths[i], align: 'center' });
            doc.rect(cx, currentY, colWidths[i], 20).stroke();
            cx += colWidths[i];
          });
          return currentY + 20;
        };

        y = drawTableHeader(y);

        let grandPointsAdded = 0;
        let grandBelow100 = 0;
        let grandPointsNotAdded = 0;
        let grandMinusBill = 0;
        let grandTotalBill = 0;

        // Sort dates
        const sortedDates = Array.from(groupedData.keys()).sort((a, b) => {
          try {
            const aStr = String(a || '');
            const bStr = String(b || '');
            if (!aStr.includes('/') || !bStr.includes('/')) return aStr.localeCompare(bStr);
            const [dayA, monthA, yearA] = aStr.split('/').map(Number);
            const [dayB, monthB, yearB] = bStr.split('/').map(Number);
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateA.getTime() - dateB.getTime();
          } catch (e) { return 0; }
        });

        sortedDates.forEach(dateStr => {
          const dateGroup = groupedData.get(dateStr)!;
          const cashiers = Array.from(dateGroup.keys()).sort();
          const rowCount = cashiers.length;
          const groupHeight = rowCount * 18;

          if (y + groupHeight > 750) {
            doc.addPage();
            y = 30;
            y = drawTableHeader(y);
          }

          // Draw Date Cell
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000');
          let displayDate = dateStr;
          try {
            const aStrStr = String(dateStr || '');
            const [day, month, year] = aStrStr.split('/').map(Number);
            const parsedDate = new Date(year, month - 1, day);
            if (!isNaN(parsedDate.getTime())) {
              displayDate = format(parsedDate, 'EEEE, MMMM dd, yyyy');
            }
          } catch (e) {}

          doc.rect(startX, y, colWidths[0], groupHeight).fill('#FFF8DC').stroke();
          doc.fillColor('#000000').text(displayDate, startX + 5, y + (groupHeight / 2) - 5, { width: colWidths[0] - 10, align: 'center' });

          let currentY = y;
          cashiers.forEach((cashier, idx) => {
            const stats = dateGroup.get(cashier)!;
            const cx = startX + colWidths[0];

            doc.rect(cx, currentY, colWidths[1], 18).fill('#90EE90').stroke();
            doc.fillColor('#000000').font('Helvetica').fontSize(9).text(cashier, cx + 5, currentY + 5, { width: colWidths[1] - 10 });

            let sx = cx + colWidths[1];
            const rowStats = [stats.pointsAdded, stats.below100, stats.pointsNotAdded, stats.totalBill];
            rowStats.forEach((val, i) => {
              doc.rect(sx, currentY, colWidths[i + 2], 18).fill('#FFFFFF').stroke();
              if (i === 2 && val > 0) doc.fillColor('#FF0000');
              else doc.fillColor('#000000');
              doc.text(String(val), sx, currentY + 5, { width: colWidths[i + 2], align: 'center' });
              sx += colWidths[i + 2];
            });

            grandPointsAdded += stats.pointsAdded;
            grandBelow100 += stats.below100;
            grandPointsNotAdded += stats.pointsNotAdded;
            grandMinusBill += stats.minusBill;
            grandTotalBill += stats.totalBill;
            currentY += 18;
          });
          y += groupHeight;
        });

        // Shop Grand Total
        doc.rect(startX, y, colWidths[0] + colWidths[1], 18).fill('#FFFFFF').stroke();
        doc.fillColor('#000000').font('Helvetica-Bold').text('Shop Grand Total', startX + 5, y + 5, { width: colWidths[0] + colWidths[1] - 10, align: 'right' });
        let tx = startX + colWidths[0] + colWidths[1];
        const totals = [grandPointsAdded, grandBelow100, grandPointsNotAdded, grandTotalBill];
        totals.forEach((val, i) => {
          doc.rect(tx, y, colWidths[i + 2], 18).fill('#FFFFFF').stroke();
          if (i === 2) doc.fillColor('#FF0000');
          else doc.fillColor('#000000');
          doc.text(String(val), tx, y + 5, { width: colWidths[i + 2], align: 'center' });
          tx += colWidths[i + 2];
        });
        y += 40;

        // "All Cashier" Summary Table
        const summaryWidth = 400;
        const summaryX = (doc.page.width - summaryWidth) / 2;
        const summaryRowHeight = 22;

        if (y + (5 * summaryRowHeight) > 750) {
          doc.addPage();
          y = 30;
        }

        const summaryDataAll = [
          { label: 'POINTS ADDED', value: grandPointsAdded, color: '#FFFF00' },
          { label: 'BELOW100', value: grandBelow100, color: '#FFFF00' },
          { label: 'MINUS BILL', value: grandMinusBill, color: '#FF0000' },
          { label: 'POINTS NOT ADDED', value: grandPointsNotAdded, color: '#FF0000' },
          { label: 'TOTAL BILL', value: grandTotalBill, color: '#00BFFF' }
        ];

        summaryDataAll.forEach(item => {
          doc.rect(summaryX, y, summaryWidth * 0.7, summaryRowHeight).fill(item.color).stroke();
          doc.fillColor('#000000').font('Helvetica-Bold').fontSize(11).text(item.label, summaryX, y + 6, { width: summaryWidth * 0.7, align: 'center' });
          doc.rect(summaryX + summaryWidth * 0.7, y, summaryWidth * 0.3, summaryRowHeight).fill(item.color).stroke();
          doc.fillColor('#000000').text(String(item.value), summaryX + summaryWidth * 0.7, y + 6, { width: summaryWidth * 0.3, align: 'center' });
          y += summaryRowHeight;
        });

      } else {
        // Specific Cashier Summary (Second Image)
        y += 20;
        const summaryWidth = 400;
        const summaryX = (doc.page.width - summaryWidth) / 2;
        const summaryRowHeight = 25;

        doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000').text('Summary', { align: 'left' });
        doc.fontSize(12).font('Helvetica').text(`Cashier: ${selectedCashier}   |   Floor: ${selectedFloor}`, { align: 'left' });
        doc.fontSize(10).fillColor('#666666').text(`Generated: ${generatedAt}`, { align: 'left' });
        doc.moveDown(1);
        y = doc.y;

        doc.rect(summaryX, y, summaryWidth * 0.6, summaryRowHeight).fill('#D2691E').stroke();
        doc.rect(summaryX + summaryWidth * 0.6, y, summaryWidth * 0.4, summaryRowHeight).fill('#E0FFFF').stroke();
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('Metric', summaryX, y + 7, { width: summaryWidth * 0.6, align: 'center' });
        doc.fillColor('#008B8B').text('Value', summaryX + summaryWidth * 0.6, y + 7, { width: summaryWidth * 0.4, align: 'center' });
        y += summaryRowHeight;

        const newSummaryData = [
          { label: 'Total Customers', value: String(totalCustomers), color: '#FF9933' },
          { label: 'Total Revenue', value: `Rs. ${totalRevenue.toLocaleString()}`, color: '#66B2FF' },
          { label: 'With Mobile', value: String(withMobile), color: '#33CC99' },
          { label: 'Without Mobile', value: String(withoutMobile), color: '#99ADC1' },
          { label: 'Bills < Rs. 100', value: String(below100Count), color: '#FFCC33' },
          { label: 'Bills >= Rs. 100', value: String(above100Count), color: '#9966FF' },
          { label: 'Redeem Points', value: String(redeemPoints), color: '#FF6666' }
        ];

        newSummaryData.forEach(item => {
          doc.rect(summaryX, y, summaryWidth * 0.6, summaryRowHeight).fill(item.color).stroke();
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(item.label, summaryX + 10, y + 7, { width: summaryWidth * 0.6 - 20, align: 'left' });
          doc.rect(summaryX + summaryWidth * 0.6, y, summaryWidth * 0.4, summaryRowHeight).fill(item.color).stroke();
          doc.fillColor('#FFFFFF').text(item.value, summaryX + summaryWidth * 0.6, y + 7, { width: summaryWidth * 0.4, align: 'center' });
          y += summaryRowHeight;
        });
      }

      doc.end();
    } catch (error: any) {
      console.error('Error exporting Analytics PDF:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error exporting Analytics PDF', error: error.message });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
