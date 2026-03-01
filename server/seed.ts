import mongoose from 'mongoose';
import { Transaction } from './db';
import dotenv from 'dotenv';
import path from 'path';

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
  const countPerFloor = 20;

  floors.forEach(floor => {
    for (let i = 1; i <= countPerFloor; i++) {
      const billAmt = Math.floor(Math.random() * 5000) + 50;
      const cash = Math.random() > 0.3 ? billAmt : 0;
      const card = cash === 0 ? billAmt : 0;
      
      // Random date within last 30 days
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));

      transactions.push({
        entryNo: `E${floor}${String(i).padStart(3, '0')}`,
        entryDate: date,
        cashier: cashiers[Math.floor(Math.random() * cashiers.length)],
        floor: floor,
        cash: cash,
        card: card,
        cheque: 0,
        others: 0,
        balance: 0,
        billAmt: billAmt,
        discAmt: Math.floor(Math.random() * 100),
        refundAmt: 0,
        customer: `Customer ${floor}-${i}`,
        cusMob: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        groupBillNo: `G${Math.floor(Math.random() * 1000)}`,
      });
    }
  });

  return transactions;
};

const seed = async () => {
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB for seeding...');

    const data = generateDummyData();
    
    // Optional: Clear existing transactions first if you want a clean slate
    // await Transaction.deleteMany({});
    // console.log('Cleared existing transactions.');

    await Transaction.insertMany(data);
    console.log(`Successfully inserted ${data.length} dummy transactions (20 per floor).`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seed();
