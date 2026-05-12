const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 50000 },
    isError: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Lien public lecture seule pour une conversation / extrait Paw AI (TTL).
 */
const pawAiPublicShareSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true, maxlength: 64 },
    title: { type: String, default: 'Discussion Paw AI', maxlength: 500 },
    scope: { type: String, enum: ['full', 'since_last_user', 'this_exchange'], required: true },
    messages: { type: [messageSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pawAiPublicShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PawAiPublicShare', pawAiPublicShareSchema);
