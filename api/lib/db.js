const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDB() {
  if (cachedConnection && cachedConnection.readyState === 1) {
    return cachedConnection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI 環境變數未設定');

  const conn = await mongoose.connect(uri, {
    bufferCommands: false,
  });

  cachedConnection = conn.connection;
  return cachedConnection;
}

// ===== User Schema =====
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String },
  picture: { type: String },
  encryptedAccessToken: { type: Object },  // { iv, authTag, encrypted }
  encryptedRefreshToken: { type: Object }, // { iv, authTag, encrypted }
  driveFileId: { type: String, default: null },
  driveFileName: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ===== Audit Log Schema =====
const auditLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  action: { type: String, required: true }, // 'sync_drive', 'load_drive', 'set_file', 'login', 'logout'
  fileId: { type: String },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String },
  status: { type: String, required: true }, // 'success', 'error'
  errorMessage: { type: String },
});

// 避免 Vercel cold start 重複定義 model
const User = mongoose.models.User || mongoose.model('User', userSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = { connectDB, User, AuditLog };
