const cloudinary = require('cloudinary').v2;
const {
  applyCloudinaryConfig,
  isCloudinaryConfigured,
  shouldUseCloudinaryForUploads,
} = require('./cloudinaryConfig');

applyCloudinaryConfig(cloudinary);

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
  shouldUseCloudinaryForUploads,
};
