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

// ===== Counter Schema (for auto-increment internalId) =====
const counterSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, seq: { type: Number, default: 0 } },
  { versionKey: false }
);
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

async function getNextInternalId() {
  const counter = await Counter.findByIdAndUpdate(
    'userId',
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return counter.seq;
}

// ===== User Schema =====
const userSchema = new mongoose.Schema({
  internalId: { type: Number, unique: true, sparse: true },
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  name: { type: String },
  picture: { type: String },
  encryptedAccessToken: { type: Object },  // { iv, authTag, encrypted }
  encryptedRefreshToken: { type: Object },  // { iv, authTag, encrypted }
  driveFileId: { type: String, default: null },
  driveFileName: { type: String, default: null },
  driveFolderName: { type: String, default: null },
  driveFolderId: { type: String, default: null },
  tosAccepted: { type: Boolean, default: false },
  tosAcceptedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ===== AuditLog Schema =====
// userInternalId replaces userId (googleId) for privacy — logs are anonymous
const auditLogSchema = new mongoose.Schema({
  userInternalId: { type: Number, required: true },
  action: { type: String, required: true }, // 'sync_drive', 'load_drive', 'set_file', 'login', 'logout', etc.
  fileId: { type: String },
  timestamp: { type: Date, default: Date.now },
  ip: { type: String },
  status: { type: String, required: true }, // 'success', 'error'
  errorMessage: { type: String },
});

// ===== BannedUsers Schema =====
// Stores one-way SHA-256 hash of googleId+salt — cannot be reversed to identity
const bannedUserSchema = new mongoose.Schema({
  googleIdHash: { type: String, required: true, unique: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// 避免 Vercel cold start 重複定義 model
const User = mongoose.models.User || mongoose.model('User', userSchema);
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
const BannedUser = mongoose.models.BannedUser || mongoose.model('BannedUser', bannedUserSchema);

module.exports = { connectDB, User, AuditLog, BannedUser, getNextInternalId };
