import mongoose from 'mongoose';

const PhishingDomainsSchema = new mongoose.Schema({
  domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
  addedAt: { type: Date, default: Date.now }
});

PhishingDomainsSchema.index({ domain: 1 });

export default mongoose.model('PhishingDomains', PhishingDomainsSchema);
