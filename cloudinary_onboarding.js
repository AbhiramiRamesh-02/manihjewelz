require('dotenv').config();
const cloudinary = require('cloudinary').v2;

// 1. Configure Cloudinary using environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUDINARY_CLOUD_NAME',
  api_key: process.env.CLOUDINARY_API_KEY || 'YOUR_CLOUDINARY_API_KEY',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'YOUR_CLOUDINARY_API_SECRET'
});

console.log("Starting Cloudinary Onboarding Script...");

// 2. Upload sample image from Cloudinary demo domain
const sampleImageUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

cloudinary.uploader.upload(sampleImageUrl, {
  public_id: 'onboarding_sample_image'
}, function(error, result) {
  if (error) {
    console.error("Cloudinary upload failed:", error);
    return;
  }

  // Print secure URL and public ID
  console.log("Upload Success!");
  console.log("Secure URL:", result.secure_url);
  console.log("Public ID:", result.public_id);

  // 3. Get and print image details (width, height, format, size in bytes)
  console.log("\n--- Image Metadata ---");
  console.log("Width:", result.width);
  console.log("Height:", result.height);
  console.log("Format:", result.format);
  console.log("File Size (Bytes):", result.bytes);

  // 4. Transform the image
  // fetch_format: 'auto' (f_auto) dynamically selects the best format for the customer's browser (e.g. WebP/AVIF)
  // quality: 'auto' (q_auto) optimizes compression to reduce file size without losing visual quality
  const transformedUrl = cloudinary.url(result.public_id, {
    secure: true,
    fetch_format: 'auto',
    quality: 'auto'
  });

  console.log("\nDone! Click link below to see optimized version of the image. Check the size and the format.");
  console.log(transformedUrl);
});
