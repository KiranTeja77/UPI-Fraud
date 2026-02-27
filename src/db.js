import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.warn('MONGODB_URI is not set. ChatSession/Blacklist features will not work without MongoDB.');
} else {
  mongoose
    .connect(uri, {
      maxPoolSize: 10
    })
    .then(() => {
      console.log('MongoDB connected for ChatSession/Blacklist.');
    })
    .catch((err) => {
      console.error('MongoDB connection error:', err.message);
    });
}

export default mongoose;

