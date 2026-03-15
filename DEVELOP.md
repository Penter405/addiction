# 🛠️ Developer Documentation

## Project Structure

```
exam/
├── docs/
│   ├── index.html              # Frontend SPA (Version 2 - Visual Node Editor)
│   ├── old.html                # Frontend SPA (Version 1 - Original Tree View)
│   └── temp.js                 # Shared core logic and UI components
├── api/
│   ├── auth/
│   │   ├── google.js           # OAuth: redirect to Google
│   │   ├── google/callback.js  # OAuth: handle callback, create session
│   │   ├── me.js               # GET current user info
│   │   └── logout.js           # POST logout, clear session
│   ├── _lib/                   # (底線開頭避開 Vercel API 數量限制)
│   │   ├── cors.js             # CORS middleware
│   │   ├── crypto.js           # AES-256-GCM encrypt/decrypt
│   │   ├── db.js               # MongoDB connection + schemas
│   │   └── session.js          # HMAC session create/verify/clear
│   ├── browse-drive.js         # GET/POST list folders/files and load file by ID
│   ├── create-drive-file.js    # POST create new JSON on Drive
│   ├── load-from-drive.js      # GET read tree data from Drive
│   ├── set-drive-file.js       # POST set Drive file ID for user
│   └── sync-drive.js           # POST write tree data to Drive
├── vercel.json                 # Vercel routing & headers
├── package.json
├── README.md
└── DEVELOP.md                  # (this file)
```

---

## Flowcharts

### 1. Google OAuth Login Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Frontend (GitHub Pages)
    participant API as Vercel API
    participant G as Google OAuth
    participant DB as MongoDB

    U->>FE: Click "使用 Google 登入"
    FE->>API: GET /api/auth/google
    API->>API: Generate CSRF state, set cookie
    API->>G: Redirect to Google OAuth consent
    G->>U: User grants permission
    G->>API: GET /api/auth/google/callback?code=...&state=...
    API->>API: Verify CSRF state
    API->>G: Exchange code for tokens
    G-->>API: access_token + refresh_token
    API->>API: Encrypt tokens (AES-256-GCM)
    API->>DB: Upsert User record
    API->>DB: Create AuditLog (login)
    API->>API: Create HMAC session token
    API->>FE: Redirect to frontend?token=...
    FE->>FE: Store token in localStorage
```

### 2. Data Sync Flow

```mermaid
flowchart TD
    A[User saves action] --> B{storageMode?}
    B -- local --> C[Save to localStorage]
    B -- drive --> D[POST /api/sync-drive]
    B -- both --> C
    C --> D
    D --> E{Drive API success?}
    E -- Yes --> F[Update sync indicator ✅]
    E -- No --> G[Show error toast ⚠️]
    E -- 402/403 --> H[Toast: Drive 空間不足]
```

### 3. Page Load & Conflict Resolution

```mermaid
flowchart TD
    A[Page Load] --> B{Has session token?}
    B -- No --> C[Load from localStorage]
    C --> D[storageMode = local]
    B -- Yes --> E[Fetch /api/auth/me]
    E --> F{Logged in + hasDriveFile?}
    F -- No --> C
    F -- Yes --> G[Load BOTH local + Drive data]
    G --> H{Data identical?}
    H -- Yes --> I[Use data, mode = both]
    H -- No --> J[Show Conflict Dialog]
    J --> K[User sees both trees]
    K --> L{User chooses}
    L -- Use Local --> M[Create new files with local data]
    L -- Use Drive --> N[Create new files with Drive data]
    M --> O[Toast: 已建立新版本]
    N --> O
```

### 4. More Options Storage Modes

```mermaid
stateDiagram-v2
    [*] --> Local : No login
    [*] --> Both : Login (default)
    Local --> Both : User logs in
    Both --> Local : More Options: 僅本機
    Both --> DriveOnly : More Options: 僅雲端
    Local --> Both : More Options: 同步兩端
    DriveOnly --> Both : More Options: 同步兩端
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Initiate OAuth flow |
| GET | `/api/auth/google/callback` | OAuth callback handler |
| GET | `/api/auth/me` | Get current user (requires Bearer token) |
| POST | `/api/auth/logout` | Logout + audit log |

### Google Drive

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/create-drive-file` | `{ fileName, folderName }` | Create new JSON file on Drive |
| GET / POST | `/api/browse-drive` | `?action=folders` or `{ action: 'load', fileId }` | Consolidated endpoint for custom Drive Picker UI (lists folders, files, or loads by ID) |
| POST | `/api/set-drive-file` | `{ fileId }` | Set existing file as sync target |
| POST | `/api/sync-drive` | `{ treeData, triggerAction }` | Write tree data to Drive |
| GET | `/api/load-from-drive` | — | Read tree data from Drive |

---

## Data Models

### User (MongoDB)

```js
{
  googleId: String,        // unique
  email: String,
  name: String,
  picture: String,
  encryptedAccessToken: {  // AES-256-GCM
    iv: String,
    authTag: String,
    encrypted: String
  },
  encryptedRefreshToken: Object,
  driveFileId: String,     // Google Drive file ID (V1 - old.html)
  driveFileName: String,   // (V1)
  driveFolderName: String, // Google Drive parent folder path (V1)
  driveFolderIdV2: String, // Google Drive folder ID (V2 - index.html)
  driveFileNameV2: String, // (V2)
  createdAt: Date,
  updatedAt: Date
}
```

### AuditLog (MongoDB)

```js
{
  userId: String,
  action: String,    // 'login' | 'logout' | 'sync_drive' | 'load_drive' | 'set_file' | 'create_drive_file'
  fileId: String,
  timestamp: Date,
  ip: String,
  status: String,    // 'success' | 'error'
  errorMessage: String
}
```

### Tree Data (JSON)

**Version 1 Format (old.html)**
```js
{
  name: "human",
  children: [
    {
      id: "demand_xxx",
      name: "紓解工作壓力",
      actions: [
        {
          id: "action_xxx",
          name: "抽菸",
          cp: 7.0,       // final CP = st + lt * 0.1
          st: 15,        // short-term total
          lt: -80,       // long-term total
          isNew: false,
          tokens: [
            { id: "token_xxx", name: "多巴胺", score: 10, timeType: "st", stage: "reward" }
          ]
        }
      ]
    }
  ]
}
```

**Version 2 Format (index.html)**
```js
{
  version: 2,
  humanTree: {
    name: "human",
    children: [ /* Same structure as Version 1 */ ]
  },
  nodeTree: {
    nodes: [ /* Freestyle dragging visual nodes */ ],
    links: [ /* Visual connections between nodes */ ]
  },
  hasInitialized: true,
  savedAt: "2026-03-15T..."
}
```

---

## Security Notes

1. **Never expose tokens**: OAuth access/refresh tokens are encrypted at rest and only decrypted server-side in memory
2. **Minimal scope (`drive.file`)**: 
   - Restricts access to app-created or user-selected files only. 
   - **Folder Visibility**: Because of this scope, the app's custom Google Drive Folder/File Picker can **ONLY** see folders and files that were created by the app itself. It cannot see or read the user's personal Google Drive folders created outside the app.
3. **CSRF**: OAuth state parameter verified in callback
4. **Session**: HMAC-SHA256 signed, 7-day expiry, no server-side session store needed
5. **CORS**: Whitelisted to `FRONTEND_URL` origin + localhost
6. **File restrictions**: Only `.json` files allowed, structure validated, 5MB max size
7. **Audit trail**: Every operation logged with IP, timestamp, and status
