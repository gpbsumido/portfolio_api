require('dotenv').config();
const express = require('express');
const router = express.Router();
const { addGalleryItem, getGalleryItemById, deleteGalleryItem, getGalleryItems } = require('../utils/db');
const multer = require("multer");
const AWS = require("aws-sdk");
const sharp = require('sharp'); // Add sharp for image processing
const { checkJwt } = require('../middleware/auth');

// Validate required environment variables
const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET_NAME'];
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Environment variable ${varName} is not defined.`);
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });
router.post("/", checkJwt, upload.single("file"), async (req, res) => {
    if (!req.is("multipart/form-data")) {
        return res.status(400).json({ error: "Content-Type must be multipart/form-data." });
    }

    const { text, description, date } = req.body;

    if (!req.file || !text || !description || !date) {
        return res.status(400).json({ error: "All fields are required." });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format." });
    }

    try {
        const userSub = req.auth?.payload?.sub ? req.auth?.payload?.sub : undefined;

        const inputBuffer = req.file.buffer;
        const mimetype = req.file.mimetype;
        const originalExt = req.file.originalname.split('.').pop().toLowerCase();

        // Sanitize filename to prevent unsafe characters
        const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");

        let optimizedBuffer;
        let outputFormat;
        let contentType;

        // Add .rotate() to handle EXIF orientation
        const transformer = sharp(inputBuffer)
            .rotate() // Auto-rotate based on EXIF metadata
            .resize({ width: 1024, withoutEnlargement: true });

        if (mimetype === "image/jpeg" || mimetype === "image/jpg") {
            optimizedBuffer = await transformer.jpeg({ quality: 80 }).toBuffer();
            outputFormat = "jpg";
            contentType = "image/jpeg";
        } else if (mimetype === "image/png") {
            optimizedBuffer = await transformer.png({ compressionLevel: 9 }).toBuffer();
            outputFormat = "png";
            contentType = "image/png";
        } else if (mimetype === "image/webp") {
            optimizedBuffer = await transformer.webp({ quality: 80 }).toBuffer();
            outputFormat = "webp";
            contentType = "image/webp";
        } else {
            // Reject unsupported formats
            return res.status(400).json({ error: "Unsupported image format." });
        }

        const s3Params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `gallery/${Date.now()}_${sanitizedFilename.replace(/\.[^/.]+$/, "")}.${outputFormat}`,
            Body: optimizedBuffer,
            ContentType: contentType,
            ACL: "public-read",
        };

        const s3Response = await s3.upload(s3Params).promise();
        const imageUrl = s3Response.Location;

        const savedData = await addGalleryItem({
            text,
            description,
            imageUrl,
            date: parsedDate, // Use validated and parsed date
            user_sub: userSub, // Save the user_sub with the record
        });

        res.status(201).json(savedData);
    } catch (error) {
        console.error("Error uploading image or saving data:", error);
        res.status(500).json({ error: "Failed to upload image or save data." });
    }
});

router.get("/", async (req, res) => {
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page, 10);
    const limitNumber = parseInt(limit, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber <= 0 || limitNumber <= 0) {
        return res.status(400).json({ error: "Invalid page or limit parameters." });
    }

    try {
        const galleryItems = await getGalleryItems(pageNumber, limitNumber);

        const images = galleryItems.map((item) => ({
            id: item.id,
            text: item.title,
            description: item.description,
            imageUrl: item.image_url,
            date: item.date,
            user_sub: item.user_sub,
        }));

        res.status(200).json(images);
    } catch (error) {
        console.error("Error fetching gallery items from database:", error);
        res.status(500).json({ error: "Failed to fetch gallery items from database." });
    }
});

router.delete("/:id", checkJwt, async (req, res) => {
    const { id } = req.params;
    const userSub = req.auth?.payload?.sub;

    try {
        const record = await getGalleryItemById(id);

        if (!record) {
            return res.status(404).json({ error: "Record not found." });
        }

        if (!userSub || record.user_sub !== userSub) {
            return res.status(403).json({ error: "Unauthorized to delete this record." });
        }

        await deleteGalleryItem(id);

        const key = new URL(record.image_url).pathname.slice(1);
        await s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }).promise();

        res.status(200).json({ message: "Record and image deleted successfully." });
    } catch (error) {
        console.error("Error deleting gallery item:", error);
        res.status(500).json({ error: "Failed to delete record." });
    }
});

module.exports = router;