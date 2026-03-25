import { Employee, Transaction, IEmployee, ITransaction } from './db';

export interface IStorage {
  getEmployees(floor?: number): Promise<IEmployee[]>;
  createEmployee(employee: Partial<IEmployee>): Promise<IEmployee>;
  getTransactions(query: any): Promise<ITransaction[]>;
  getUniqueCashiers(floor?: number): Promise<string[]>;
  createTransaction(transaction: Partial<ITransaction>): Promise<ITransaction>;
  bulkCreateTransactions(transactions: Partial<ITransaction>[]): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getEmployees(floor?: number): Promise<IEmployee[]> {
    const query: any = {};
    if (floor && floor !== 0) query.floor = floor;
    return await Employee.find(query).sort({ name: 1 });
  }

  async createEmployee(employee: Partial<IEmployee>): Promise<IEmployee> {
    const newEmployee = new Employee(employee);
    return await newEmployee.save();
  }

  async getTransactions(query: any): Promise<ITransaction[]> {
    const mongoQuery: any = {};
    if (query.floor && query.floor !== 'All') mongoQuery.floor = Number(query.floor);
    if (query.cashier && query.cashier !== 'All') mongoQuery.cashier = query.cashier;
    if (query.startDate && query.endDate) {
      const start = new Date(query.startDate);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(query.endDate);
      end.setUTCHours(23, 59, 59, 999);
      mongoQuery.entryDate = {
        $gte: start,
        $lte: end
      };
    }
    return await Transaction.find(mongoQuery).sort({ floor: 1, entryNo: 1 });
  }

  async getUniqueCashiers(floor?: number): Promise<string[]> {
    const query: any = {};
    if (floor && floor !== 0) query.floor = floor;
    return await Transaction.distinct('cashier', query);
  }

  async createTransaction(transaction: Partial<ITransaction>): Promise<ITransaction> {
    const newTransaction = new Transaction(transaction);
    return await newTransaction.save();
  }

  async bulkCreateTransactions(transactions: Partial<ITransaction>[]): Promise<any> {
    try {
      return await Transaction.insertMany(transactions, { ordered: false });
    } catch (err: any) {
      // If some failed, we still want to know what succeeded
      if (err.insertedDocs || err.result) {
        return err.result || { insertedCount: err.insertedDocs?.length };
      }
      throw err;
    }
  }
}

export const storage = new DatabaseStorage();
