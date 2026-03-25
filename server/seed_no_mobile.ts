import mongoose from 'mongoose';
import { Transaction } from './db';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

const cashiers = [
  'Arun', 'Priya', 'Suresh', 'Deepa', 'Vijay', 
  'Kavitha', 'Rajesh', 'Anitha', 'Manoj', 'Sandhiya'
];

const generateDummyData = () => {
  const transactions: any[] = [];
  const floors = [1, 2, 3, 4];
  const countPerFloor = 10;

  floors.forEach(floor => {
    for (let i = 1; i <= countPerFloor; i++) {
      const billAmt = Math.floor(Math.random() * 3000) + 20;
      
      // Random date within last 30 days
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));

      transactions.push({
        entryNo: `NM${floor}${String(i).padStart(3, '0')}`,
        entryDate: date,
        cashier: cashiers[Math.floor(Math.random() * cashiers.length)],
        floor: floor,
        cash: billAmt,
        card: 0,
        cheque: 0,
        others: 0,
        balance: 0,
        billAmt: billAmt,
        discAmt: 0,
        refundAmt: 0,
        customer: `Walk-in ${floor}-${i}`,
        cusMob: '', // Empty mobile number as requested
        groupBillNo: `G${Math.floor(Math.random() * 1000)}`,
      });
    }
  });

  return transactions;
};

const seed = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seeding (No Mobile)...');

    const data = generateDummyData();
    await Transaction.insertMany(data);
    console.log(`Successfully inserted ${data.length} transactions without mobile numbers (10 per floor).`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seed();
