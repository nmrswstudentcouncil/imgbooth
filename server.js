const express = require('express');
const { google } = require('googleapis');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

const app = express();
app.use(express.static('public')); // ให้เข้าถึงไฟล์ html ได้
app.use(bodyParser.json({ limit: '50mb' })); // รับไฟล์รูปขนาดใหญ่ได้

// --- ตั้งค่า Google Drive ---
// ต้องมีไฟล์ credentials.json จาก Google Cloud Console
const KEY_FILE_PATH = path.join(__dirname, 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
});

// ใส่ ID ของ Folder ใน Google Drive ที่แชร์ให้ Service Account แล้ว
const DRIVE_FOLDER_ID = 'YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE'; 

async function uploadToDrive(buffer, fileName) {
    const drive = google.drive({ version: 'v3', auth });
    
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
        name: fileName,
        parents: [DRIVE_FOLDER_ID],
    };
    
    const media = {
        mimeType: 'image/png',
        body: bufferStream,
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink',
    });

    // ปรับสิทธิ์ให้ใครก็ได้ที่มีลิงก์ดูรูปได้ (เพื่อให้ QR Code ทำงานได้กับทุกคน)
    await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
            role: 'reader',
            type: 'anyone',
        },
    });

    return response.data.webViewLink;
}

// --- API รับรูปและสร้าง QR ---
app.post('/upload', async (req, res) => {
    try {
        const { image } = req.body;
        // แปลง Base64 กลับเป็น Buffer
        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        
        const fileName = `photo_${Date.now()}.png`;

        console.log("Uploading...");
        const driveLink = await uploadToDrive(buffer, fileName);
        console.log("Uploaded: " + driveLink);

        // สร้าง QR Code จาก Link
        const qrCodeDataUrl = await QRCode.toDataURL(driveLink);

        res.json({ success: true, qrCode: qrCodeDataUrl, link: driveLink });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Upload Failed' });
    }
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
