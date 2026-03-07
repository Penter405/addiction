const { google } = require('googleapis');
const { connectDB, User, AuditLog } = require('./_lib/db');
const { encrypt, decrypt } = require('./_lib/crypto');
const { getSession } = require('./_lib/session');
const { handleCors } = require('./_lib/cors');
const { protectEndpoint, parseIp } = require('./_lib/security');

const FILE_NAME_REGEX = /^[^\/\r\n]{1,100}$/;
const FOLDER_STRATEGIES = new Set(['use_existing', 'create_new']);

function escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listFoldersByExactName(drive, folderName) {
    const escaped = escapeDriveQueryValue(folderName);
    const response = await drive.files.list({
        q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 20,
        spaces: 'drive',
    });

    return response.data.files || [];
}

async function pickUniqueFolderName(drive, baseName) {
    const escaped = escapeDriveQueryValue(baseName);
    const response = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${escaped}'`,
        fields: 'files(name)',
        pageSize: 200,
        spaces: 'drive',
    });

    const existingNames = new Set((response.data.files || []).map((f) => f.name));
    if (!existingNames.has(baseName)) return baseName;

    for (let i = 2; i <= 2000; i += 1) {
        const candidate = `${baseName} (${i})`;
        if (!existingNames.has(candidate)) return candidate;
    }

    return `${baseName} ${Date.now()}`;
}

async function createDriveFolder(drive, folderName) {
    const created = await drive.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id, name',
    });

    return { id: created.data.id, name: created.data.name };
}

async function verifyFolderAccess(drive, folderId) {
    try {
        const resp = await drive.files.get({
            fileId: folderId,
            fields: 'id, name, trashed',
            spaces: 'drive',
        });
        if (resp.data.trashed) return null;
        return { id: resp.data.id, name: resp.data.name };
    } catch {
        return null;
    }
}

async function resolveParentFolder(drive, folderName, folderConflictStrategy, existingFolderId, parentFolderId) {
    // Case 1: parentFolderId provided (e.g. daily rotation) — verify access
    if (parentFolderId) {
        const verified = await verifyFolderAccess(drive, parentFolderId);
        if (verified) {
            return {
                parentFolderId: verified.id,
                parentFolderName: verified.name,
                resolution: 'verified_existing',
            };
        }
        // Access lost — tell frontend
        return { accessLost: true };
    }

    // Case 2: no folder requested
    if (!folderName || typeof folderName !== 'string' || !folderName.trim()) {
        return { parentFolderId: null, parentFolderName: null, resolution: 'no_folder' };
    }

    const trimmedFolderName = folderName.trim();
    const existingFolders = await listFoldersByExactName(drive, trimmedFolderName);

    if (!existingFolders.length) {
        const folder = await createDriveFolder(drive, trimmedFolderName);
        return {
            parentFolderId: folder.id,
            parentFolderName: folder.name,
            resolution: 'created_new',
        };
    }

    if (!folderConflictStrategy) {
        return {
            conflict: {
                requestedFolderName: trimmedFolderName,
                existingFolders: existingFolders.map((f) => ({
                    id: f.id,
                    name: f.name,
                    modifiedTime: f.modifiedTime,
                })),
                choices: ['use_existing', 'create_new'],
            },
        };
    }

    if (!FOLDER_STRATEGIES.has(folderConflictStrategy)) {
        const error = new Error('Invalid folderConflictStrategy');
        error.statusCode = 400;
        throw error;
    }

    if (folderConflictStrategy === 'use_existing') {
        const chosenFolder =
            existingFolderId && existingFolders.find((f) => f.id === existingFolderId)
                ? existingFolders.find((f) => f.id === existingFolderId)
                : existingFolders[0];

        return {
            parentFolderId: chosenFolder.id,
            parentFolderName: chosenFolder.name,
            resolution: 'used_existing',
        };
    }

    const uniqueName = await pickUniqueFolderName(drive, trimmedFolderName);
    const folder = await createDriveFolder(drive, uniqueName);
    return {
        parentFolderId: folder.id,
        parentFolderName: folder.name,
        resolution: 'created_new_after_conflict',
    };
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const userId = getSession(req);
    const guard = await protectEndpoint(req, res, {
        scope: 'drive_create_file',
        userId,
        shortLimit: 12,
        longLimit: 60,
    });
    if (!guard || guard.ok !== true) return;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { fileName, folderName, folderConflictStrategy, existingFolderId, parentFolderId } = req.body || {};
    if (!fileName) {
        return res.status(400).json({ error: 'Missing fileName' });
    }

    if (typeof fileName !== 'string' || !FILE_NAME_REGEX.test(fileName) || !fileName.toLowerCase().endsWith('.json')) {
        return res.status(400).json({ error: 'Invalid fileName (must be <=100 chars and end with .json)' });
    }

    try {
        await connectDB();
        const user = await User.findOne({ googleId: userId });

        if (!user || !user.encryptedAccessToken || !user.encryptedRefreshToken) {
            return res.status(400).json({ error: 'Missing OAuth token. Please log in again.' });
        }

        const accessToken = decrypt(user.encryptedAccessToken);
        const refreshToken = decrypt(user.encryptedRefreshToken);

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.Client_secret,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        oauth2Client.on('tokens', async (newTokens) => {
            try {
                const updateData = {
                    encryptedAccessToken: encrypt(newTokens.access_token),
                    updatedAt: new Date(),
                };
                if (newTokens.refresh_token) {
                    updateData.encryptedRefreshToken = encrypt(newTokens.refresh_token);
                }
                await User.findOneAndUpdate({ googleId: userId }, { $set: updateData });
            } catch (err) {
                console.error('Token refresh save error:', err);
            }
        });

        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const folderResult = await resolveParentFolder(
            drive,
            folderName,
            folderConflictStrategy,
            existingFolderId,
            parentFolderId
        );

        if (folderResult.accessLost) {
            return res.status(410).json({
                error: 'folder_access_lost',
                message: 'The previously used folder is no longer accessible. Please re-select a folder.',
            });
        }

        if (folderResult.conflict) {
            return res.status(409).json({
                error: 'folder_conflict',
                message: 'A folder with this name already exists. Choose how to proceed.',
                ...folderResult.conflict,
            });
        }

        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
        };
        if (folderResult.parentFolderId) {
            fileMetadata.parents = [folderResult.parentFolderId];
        }

        const media = {
            mimeType: 'application/json',
            body: JSON.stringify(
                {
                    syncTimestamp: new Date().toISOString(),
                    triggerAction: 'create',
                    treeData: null,
                },
                null,
                2
            ),
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media,
            fields: 'id, name',
        });

        const fileId = file.data.id;
        const updateFields = {
            driveFileId: fileId,
            driveFileName: fileName,
            updatedAt: new Date(),
        };
        if (folderResult.parentFolderName) {
            updateFields.driveFolderName = folderResult.parentFolderName;
        }
        if (folderResult.parentFolderId) {
            updateFields.driveFolderId = folderResult.parentFolderId;
        } else {
            updateFields.driveFolderId = null;
            updateFields.driveFolderName = null;
        }

        await User.findOneAndUpdate({ googleId: userId }, { $set: updateFields });

        await AuditLog.create({
            userId,
            action: 'create_drive_file',
            fileId,
            ip: parseIp(req),
            status: 'success',
        });

        res.status(200).json({
            success: true,
            fileId,
            fileName,
            folderId: folderResult.parentFolderId,
            folderName: folderResult.parentFolderName,
            folderResolution: folderResult.resolution,
        });
    } catch (err) {
        console.error('Create drive file error:', err);
        const statusCode = err.statusCode || 500;
        const message = err.statusCode ? err.message : 'Failed to create Drive file';
        res.status(statusCode).json({ error: message, detail: err.message });
    }
};

