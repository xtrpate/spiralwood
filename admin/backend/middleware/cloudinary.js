const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// 1. Log in to Cloudinary using your .env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 2. Tell Multer to send files straight to Cloudinary instead of a local folder
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "spiral_wood_uploads", // This creates a neat folder in your Cloudinary account
    allowed_formats: ["jpg", "jpeg", "png", "webp", "pdf"],
  },
});

// 3. Export the upload middleware
const upload = multer({ storage: storage });

module.exports = { cloudinary, upload };
