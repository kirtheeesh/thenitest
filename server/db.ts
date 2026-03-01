import mongoose, { Schema, Document } from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
console.log('mongoUri:', mongoUri);
if (!mongoUri) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

export interface IEmployee extends Document {
  name: string;
  floor: number;
}

const EmployeeSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  floor: { type: Number, required: true, enum: [1, 2, 3, 4] },
}, { timestamps: true });

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);

export interface ITransaction extends Document {
  entryNo: string;
  entryDate: Date;
  cashier: string;
  floor: number;
  cash: number;
  card: number;
  cheque: number;
  others: number;
  balance: number;
  billAmt: number;
  discAmt: number;
  refundAmt: number;
  customer?: string;
  cusMob: string;
  groupBillNo: string;
}

const TransactionSchema: Schema = new Schema({
  entryNo: { type: String, required: true },
  entryDate: { type: Date, required: true },
  cashier: { type: String, required: true },
  floor: { type: Number, required: true },
  cash: { type: Number, default: 0 },
  card: { type: Number, default: 0 },
  cheque: { type: Number, default: 0 },
  others: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  billAmt: { type: Number, required: true },
  discAmt: { type: Number, default: 0 },
  refundAmt: { type: Number, default: 0 },
  customer: { type: String },
  cusMob: { type: String },
  groupBillNo: { type: String },
}, { timestamps: true });

TransactionSchema.index({ cashier: 1 });
TransactionSchema.index({ floor: 1 });
TransactionSchema.index({ entryDate: 1 });

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default mongoose;
