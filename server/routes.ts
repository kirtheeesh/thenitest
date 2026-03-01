import { Express, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import * as xlsx from 'xlsx';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import { createServer, type Server } from "http";

const upload = multer({ storage: multer.memoryStorage() });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth Routes
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
      const transaction = await storage.createTransaction(req.body);
      res.status(201).json({ message: 'Transaction saved successfully', transaction });
    } catch (error: any) {
      res.status(500).json({ message: 'Error saving transaction', error: error.message });
    }
  });

  app.post('/api/transactions/bulk', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data: any[] = xlsx.utils.sheet_to_json(sheet);
      const floor = parseInt(req.body.floor);
      const processedTransactions = data.map(item => ({
        entryNo: String(item['Entry No'] || ''),
        entryDate: item['Entry Date'] ? new Date(item['Entry Date']) : new Date(),
        cashier: String(item['Cashier'] || ''),
        floor: floor,
        cash: Number(item['Cash'] || 0),
        card: Number(item['Card'] || 0),
        cheque: Number(item['Cheque'] || 0),
        others: Number(item['Others'] || 0),
        balance: Number(item['Balance'] || 0),
        billAmt: Number(item['Bill Amt'] || 0),
        discAmt: Number(item['Disc Amt'] || 0),
        refundAmt: Number(item['Refund Amt'] || 0),
        customer: String(item['Customer'] || ''),
        cusMob: String(item['CUSMob'] || ''),
        groupBillNo: String(item['GroupBillno'] || ''),
      }));
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
        .filter((t: any) => t.entryNo && t.billAmt) // Only keep rows with essential data
        .map((t: any) => {
          const d = t.entryDate ? new Date(t.entryDate) : new Date();
          const validDate = isNaN(d.getTime()) ? new Date() : d;
          
          return {
            entryNo: String(t.entryNo).trim(),
            entryDate: validDate,
            cashier: String(t.cashier || 'Unknown').trim(),
            floor: Number(t.floor || 1),
            cash: Number(t.cash || 0),
            card: Number(t.card || 0),
            cheque: Number(t.cheque || 0),
            others: Number(t.others || 0),
            balance: Number(t.balance || 0),
            billAmt: Number(t.billAmt || 0),
            discAmt: Number(t.discAmt || 0),
            refundAmt: Number(t.refundAmt || 0),
            customer: String(t.customer || '').trim(),
            cusMob: String(t.cusMob || '').trim(),
            groupBillNo: String(t.groupBillNo || '').trim()
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

      res.json({ metrics, dailyTrend, transactions: transactions.slice(0, 100) });
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
        { header: 'Entry Date', key: 'entryDate', width: 12 },
        { header: 'Cashier', key: 'cashier', width: 20 },
        { header: 'Cash', key: 'cash', width: 10 },
        { header: 'Card', key: 'card', width: 10 },
        { header: 'Cheque', key: 'cheque', width: 10 },
        { header: 'Others', key: 'others', width: 10 },
        { header: 'Balance', key: 'balance', width: 12 },
        { header: 'Bill Amt', key: 'billAmt', width: 12 },
        { header: 'Disc Amt', key: 'discAmt', width: 10 },
        { header: 'Refund Amt', key: 'refundAmt', width: 10 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'CUSMob', key: 'cusMob', width: 15 },
        { header: 'GroupBillno', key: 'groupBillNo', width: 15 },
      ];

      // Add data rows
      transactions.forEach(t => {
        const entryDate = t.entryDate ? new Date(t.entryDate) : new Date();
        const formattedDate = isNaN(entryDate.getTime()) ? '' : format(entryDate, 'dd-MM-yyyy');

        worksheet.addRow({
          entryNo: String(t.entryNo || ''),
          entryDate: formattedDate,
          cashier: String(t.cashier || ''),
          cash: Number(t.cash || 0),
          card: Number(t.card || 0),
          cheque: Number(t.cheque || 0),
          others: Number(t.others || 0),
          balance: Number(t.balance || 0),
          billAmt: Number(t.billAmt || 0),
          discAmt: Number(t.discAmt || 0),
          refundAmt: Number(t.refundAmt || 0),
          customer: String(t.customer || ''),
          cusMob: String(t.cusMob || ''),
          groupBillNo: String(t.groupBillNo || '')
        });
      });

      // Insert title, cashier and floor at the top
      const floor = req.query.floor && req.query.floor !== 'All' ? `Floor ${req.query.floor}` : 'All Floors';
      const cashierDisplay = cashier || 'All';

      // Title
      worksheet.insertRow(1, ['Settlement Summary Report']);
      worksheet.mergeCells(1, 1, 1, 14);
      worksheet.getRow(1).font = { bold: true, size: 14 };
      worksheet.getRow(1).alignment = { horizontal: 'center' };

      // Cashier and floor
      worksheet.insertRow(2, [`Cashier: ${cashierDisplay}`, `Floor: ${floor}`]);
      worksheet.mergeCells(2, 1, 2, 14);
      worksheet.getRow(2).font = { italic: true, size: 11 };
      worksheet.getRow(2).alignment = { horizontal: 'center' };

      const headerRowIndex = floor ? 3 : 2;
      worksheet.getRow(headerRowIndex).font = { bold: true };
      worksheet.getRow(headerRowIndex).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

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
      console.log('Generating Analytics Excel report...');
      const transactions = await storage.getTransactions(req.query);
  const cashier = req.query.cashier ? String(req.query.cashier) : 'All';
  const adminName = (req as any).user?.username || 'Admin';
  const filename = `Analytics_${cashier}_${adminName}.xlsx`;
      
      const metrics = {
        totalCustomers: transactions.length,
        totalBillingAmount: transactions.reduce((sum, t) => sum + t.billAmt, 0),
        withMobile: transactions.filter(t => t.cusMob && t.cusMob.length >= 10).length,
        withoutMobile: transactions.filter(t => !t.cusMob || t.cusMob.length < 10).length,
        below100: transactions.filter(t => t.billAmt < 100).length,
        above100: transactions.filter(t => t.billAmt >= 100).length,
  // Redeem points: 1 point per bill greater than 100 (count)
  redeemPointsCount: transactions.filter(t => t.billAmt > 100).length,
  // Redeem points total value (sum of bills > 100)
  redeemPointsValue: transactions.filter(t => t.billAmt > 100).reduce((sum, t) => sum + t.billAmt, 0),
  // Backwards compatible
  redeemPoints: transactions.filter(t => t.billAmt > 100).length,
      };

      const dailyTrendMap = new Map();
      transactions.forEach(t => {
        const dateStr = format(new Date(t.entryDate), 'yyyy-MM-dd');
        dailyTrendMap.set(dateStr, (dailyTrendMap.get(dateStr) || 0) + t.billAmt);
      });

      const dailyTrend = Array.from(dailyTrendMap.entries())
        .map(([_id, sales]) => ({ _id, sales }))
        .sort((a, b) => a._id.localeCompare(b._id));

      const workbook = new ExcelJS.Workbook();
      const summarySheet = workbook.addWorksheet('Report');

      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 },
      ];

      summarySheet.addRows([
        { metric: 'Total Customers', value: metrics.totalCustomers },
        { metric: 'Total Revenue', value: metrics.totalBillingAmount },
        { metric: 'With Mobile', value: metrics.withMobile },
        { metric: 'Without Mobile', value: metrics.withoutMobile },
        { metric: 'Bills < ₹100', value: metrics.below100 },
        { metric: 'Bills >= ₹100', value: metrics.above100 },
        { metric: 'Redeem Points', value: metrics.redeemPoints },
      ]);

      const floorInfo = req.query.floor && req.query.floor !== 'All' ? `Floor ${req.query.floor}` : 'All Floors';
      const cashierDisplay = cashier || 'All';

      // Title
      summarySheet.insertRow(1, ['Visual Analytics Report']);
      summarySheet.mergeCells(1, 1, 1, 2);
      summarySheet.getRow(1).font = { bold: true, size: 14 };
      summarySheet.getRow(1).alignment = { horizontal: 'center' };

      // Cashier & Floor
      summarySheet.insertRow(2, [`Cashier: ${cashierDisplay}    |    Floor: ${floorInfo}`]);
      summarySheet.mergeCells(2, 1, 2, 2);
      summarySheet.getRow(2).font = { italic: true, size: 11 };
      summarySheet.getRow(2).alignment = { horizontal: 'center' };

      const summaryHeaderIndex = 4;
      summarySheet.getRow(summaryHeaderIndex).font = { bold: true };
      summarySheet.getRow(summaryHeaderIndex).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };

      // Daily Revenue Stream removed from Analytics Excel as requested

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      
      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
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

      // Header - include cashier and floor info
      const floor = req.query.floor && req.query.floor !== 'All' ? `Floor ${req.query.floor}` : 'All Floors';
      const cashierDisplay = cashier || 'All';

      doc.fontSize(18).font('Helvetica-Bold').text('Settlement Summary Report', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text(`Cashier: ${cashierDisplay}    |    Floor: ${floor}`, { align: 'center' });
      doc.fontSize(8).font('Helvetica').text(`Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, { align: 'center' });
      doc.moveDown(1);

      // Table Header setup - ALL FIELDS
      const headers = [
        'Entry No', 'Date', 'Cashier', 'Cash', 'Card', 'Cheque', 'Others', 
        'Balance', 'Bill Amt', 'Disc', 'Refund', 'Customer', 'Mobile', 'BillNo'
      ];
      // A4 Landscape is ~842 points wide. Margins 20+20 = 40. Available ~800.
      const colWidths = [45, 55, 80, 45, 45, 45, 45, 50, 50, 40, 45, 90, 75, 80];
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

        const entryDate = t.entryDate ? new Date(t.entryDate) : new Date();
        const dateStr = isNaN(entryDate.getTime()) ? '' : format(entryDate, 'dd/MM/yy');

        const rowData = [
          String(t.entryNo || ''),
          dateStr,
          String(t.cashier || '').substring(0, 15),
          String(t.cash || 0),
          String(t.card || 0),
          String(t.cheque || 0),
          String(t.others || 0),
          String(t.balance || 0),
          String(t.billAmt || 0),
          String(t.discAmt || 0),
          String(t.refundAmt || 0),
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
      console.log('Generating Analytics PDF report...');
      const transactions = await storage.getTransactions(req.query);
      const isView = req.query.view === 'true';
  const cashier = req.query.cashier ? String(req.query.cashier) : 'All';
  const adminName = (req as any).user?.username || 'Admin';
  const filename = `Analytics_${cashier}_${adminName}.pdf`;
      
      const metrics = {
        totalCustomers: transactions.length,
        totalBillingAmount: transactions.reduce((sum, t) => sum + t.billAmt, 0),
        withMobile: transactions.filter(t => t.cusMob && t.cusMob.length >= 10).length,
        withoutMobile: transactions.filter(t => !t.cusMob || t.cusMob.length < 10).length,
        below100: transactions.filter(t => t.billAmt < 100).length,
        above100: transactions.filter(t => t.billAmt >= 100).length,
  // Redeem points: 1 point per bill > 100
  redeemPointsCount: transactions.filter(t => t.billAmt > 100).length,
  // Redeem points total value (sum of bills > 100)
  redeemPointsValue: transactions.filter(t => t.billAmt > 100).reduce((sum, t) => sum + t.billAmt, 0),
  // Backwards compatible
  redeemPoints: transactions.filter(t => t.billAmt > 100).length,
      };

      const dailyTrendMap = new Map();
      transactions.forEach(t => {
        const dateStr = format(new Date(t.entryDate), 'yyyy-MM-dd');
        dailyTrendMap.set(dateStr, (dailyTrendMap.get(dateStr) || 0) + t.billAmt);
      });

      const dailyTrend = Array.from(dailyTrendMap.entries())
        .map(([_id, sales]) => ({ _id, sales }))
        .sort((a, b) => a._id.localeCompare(b._id));

      const doc = new PDFDocument({ size: 'A4', margin: 40 });
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

      // Header - include cashier and floor
      const floorInfo = req.query.floor && req.query.floor !== 'All' ? `Floor ${req.query.floor}` : 'All Floors';
      const cashierDisplay = cashier || 'All';

  // Title (orange primary to match theme)
  doc.fontSize(26).font('Helvetica-Bold').fillColor('#f97316').text('Visual Analytics Report', { align: 'center' });
  doc.fontSize(14).font('Helvetica').fillColor('#6b7280').text(`Cashier: ${cashierDisplay}    |    Floor: ${floorInfo}`, { align: 'center' });
  doc.fontSize(10).fillColor('#9ca3af').text(`Generated: ${format(new Date(), 'dd-MM-yyyy HH:mm:ss')}`, { align: 'center' });
      doc.moveDown(2);

  // Summary Section - Table Format (show cashier & floor near the summary)
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#111827').text('Summary');
  doc.moveDown(0.25);
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text(`Cashier: ${cashierDisplay}    |    Floor: ${floorInfo}`);
  doc.moveDown(0.5);

      const startX = 50;
      const kpiColWidths = [200, 150];
      const rowHeight = 25;
      let currentY = doc.y;

      const kpis: Array<[string, string | number]> = [
        ['Total Customers', metrics.totalCustomers],
        ['Total Revenue', `Rs. ${metrics.totalBillingAmount.toLocaleString()}`],
        ['With Mobile', metrics.withMobile],
        ['Without Mobile', metrics.withoutMobile],
        ['Bills < Rs. 100', metrics.below100],
        ['Bills >= Rs. 100', metrics.above100],
        ['Redeem Points', metrics.redeemPointsCount ?? metrics.redeemPoints],
      ];

      // Column base colors (left: warm/orange, right: cool/teal)
      const colColors = {
        leftBase: '#fff7ed', // warm
        leftAlt: '#fffaf0',
        rightBase: '#ecfeff', // cool
        rightAlt: '#f0f9ff',
      };

      // Header: left and right header cell backgrounds
      doc.rect(startX, currentY, kpiColWidths[0], rowHeight).fill(colColors.leftBase);
      doc.rect(startX + kpiColWidths[0], currentY, kpiColWidths[1], rowHeight).fill(colColors.rightBase);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#92400e');
      doc.text('Metric', startX + 10, currentY + 7);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#065f46');
      doc.text('Value', startX + kpiColWidths[0] + 10, currentY + 7);

      doc.strokeColor('#e6e6e6').lineWidth(0.5);
      doc.rect(startX, currentY, kpiColWidths[0], rowHeight).stroke();
      doc.rect(startX + kpiColWidths[0], currentY, kpiColWidths[1], rowHeight).stroke();

      currentY += rowHeight;

      // Use semantic accent colors as the row background (value color becomes background)
      const metricBg = (label: string) => {
        if (/Revenue/i.test(label)) return '#60a5fa'; // blue (bright)
        if (/Total Customers/i.test(label)) return '#fb923c'; // orange (bright)
        if (/With Mobile/i.test(label)) return '#34d399'; // green (bright)
        if (/Without Mobile/i.test(label)) return '#94a3b8'; // muted slate
        if (/Bills < /i.test(label)) return '#fbbf24'; // amber
        if (/Bills >=/i.test(label)) return '#8b5cf6'; // indigo
        if (/Redeem/i.test(label)) return '#fb7185'; // rose
        return '#0f172a'; // fallback dark slate
      };

      kpis.forEach(([label, value], idx) => {
        const rowColor = metricBg(String(label));

        // draw full-row background so both columns share the same semantic color
        doc.rect(startX, currentY, kpiColWidths[0] + kpiColWidths[1], rowHeight).fill(rowColor);

        // label text (light for contrast)
        doc.fontSize(10).font('Helvetica').fillColor('#f3f4f6');
        doc.text(String(label), startX + 10, currentY + 7);

        // value text (white for maximum contrast)
        doc.font('Helvetica-Bold').fillColor('#ffffff').text(String(value), startX + kpiColWidths[0] + 10, currentY + 7);

        // subtle border
        doc.strokeColor('#000000').rect(startX, currentY, kpiColWidths[0], rowHeight).stroke();
        doc.strokeColor('#000000').rect(startX + kpiColWidths[0], currentY, kpiColWidths[1], rowHeight).stroke();
        currentY += rowHeight;
      });

      doc.moveDown(2);

      // Daily Revenue Stream removed from Analytics PDF as requested

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
