import mongoose from 'mongoose';

const BlacklistSchema = new mongoose.Schema({
  scammerId: { type: String, required: true, index: true },
  upiIds: [String],
  phoneNumbers: [String],
  reason: String,
  addedAt: { type: Date, default: Date.now }
});

BlacklistSchema.index({ upiIds: 1 });
BlacklistSchema.index({ phoneNumbers: 1 });

export default mongoose.model('Blacklist', BlacklistSchema);

