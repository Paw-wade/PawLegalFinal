const mongoose = require('mongoose');

const cmsContentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    locale: {
      type: String,
      required: true,
      default: 'fr-FR',
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    page: {
      type: String,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    changeHistory: [{
      version: Number,
      value: String,
      description: String,
      status: String,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      updatedAt: {
        type: Date,
        default: Date.now,
      },
      changeType: {
        type: String,
        enum: ['created', 'updated', 'status_changed', 'published', 'archived'],
      },
    }],
  },
  {
    timestamps: true,
  }
);

cmsContentSchema.index({ key: 1, locale: 1, isActive: 1 });

module.exports = mongoose.model('CmsContent', cmsContentSchema);



