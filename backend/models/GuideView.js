const mongoose = require('mongoose');

const guideViewSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, index: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    viewedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

module.exports = mongoose.model('GuideView', guideViewSchema);
