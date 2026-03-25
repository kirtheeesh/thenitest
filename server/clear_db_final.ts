import mongoose from 'mongoose';
import { Transaction, Employee } from './db';
import dotenv from 'dotenv';

dotenv.config();

async function clearDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const transactionsResult = await Transaction.deleteMany({});
    console.log(`Deleted ${transactionsResult.deletedCount} transactions`);

    const employeesResult = await Employee.deleteMany({});
    console.log(`Deleted ${employeesResult.deletedCount} employees`);

    console.log('Database cleared successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing database:', error);
    process.exit(1);
  }
}

clearDB();
