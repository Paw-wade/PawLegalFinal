const mongoose = require('mongoose');

function getTenantUserModel(conn) {
  if (!mongoose.models.User) {
    require('../../models/User');
  }
  if (!conn.models.User) {
    conn.model('User', mongoose.models.User.schema);
  }
  return conn.models.User;
}

module.exports = { getTenantUserModel };
