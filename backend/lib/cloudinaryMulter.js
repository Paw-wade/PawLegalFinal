const cloudinary = require('cloudinary').v2;
const { applyCloudinaryConfig, isCloudinaryConfigured } = require('./cloudinaryConfig');

applyCloudinaryConfig(cloudinary);

module.exports = {
  cloudinary,
  isCloudinaryConfigured,
};
