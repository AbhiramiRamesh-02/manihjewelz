require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const dns = require('dns');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Razorpay SDK
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID',
  key_secret: process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || 'YOUR_RAZORPAY_KEY_SECRET'
});

// Initialize Cloudinary SDK
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'YOUR_CLOUDINARY_CLOUD_NAME',
  api_key: process.env.CLOUDINARY_API_KEY || 'YOUR_CLOUDINARY_API_KEY',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'YOUR_CLOUDINARY_API_SECRET'
});

const JWT_SECRET = process.env.JWT_SECRET || 'manih_jewelz_secure_jwt_secret_2026';
const adminPasswordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'manih2026', 10);

function authenticateAdmin(req, res, next) {
  if (req.path === '/login') {
    return next();
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. No session token provided." });
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: "Access denied. Unauthorized permissions." });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized. Session token is invalid or expired." });
  }
}

function authenticateCustomer(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. Please log in." });
  }
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

// Setup CORS Options dynamically
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const originUrl = new URL(origin);
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1' || originUrl.hostname.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

// Setup Helmet with custom security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to prevent blocking Google Sign-In dynamic scripts/popups
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false // Allows Google Sign-in OAuth popup callback communication
}));

// Setup Rate Limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000, // Relaxed for local and live testing
  message: { error: "Too many requests. Please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500, // Relaxed for local and live testing
  message: { error: "Too many authentication attempts. Please try again in 10 minutes." }
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500, // Relaxed for local and live testing
  message: { error: "Too many payment initialization requests. Please try again in 10 minutes." }
});

app.use(generalLimiter);
app.use('/api/customer/login', authLimiter);
app.use('/api/customer/signup', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/checkout', paymentLimiter);
app.use('/api/create-order', paymentLimiter);

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/api/admin', authenticateAdmin);

// Initialize Database
let db;
if (process.env.TURSO_DATABASE_URL) {
  // Use Turso Cloud SQLite
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });

  db = {
    run: function(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      const cleanSql = sql.trim().toUpperCase();
      if (cleanSql === "BEGIN TRANSACTION" || cleanSql === "BEGIN" || cleanSql === "COMMIT" || cleanSql === "ROLLBACK") {
        if (callback) {
          setTimeout(() => {
            callback.call({ lastID: null, changes: 0 }, null);
          }, 0);
        }
        return;
      }

      client.execute({ sql, args: params })
        .then(res => {
          if (callback) callback.call({ lastID: res.lastInsertRowid ? Number(res.lastInsertRowid) : null, changes: res.rowsAffected }, null);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    get: function(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      client.execute({ sql, args: params })
        .then(res => {
          if (callback) callback(null, res.rows[0]);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    all: function(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }
      client.execute({ sql, args: params })
        .then(res => {
          if (callback) callback(null, res.rows);
        })
        .catch(err => {
          if (callback) callback(err);
        });
    },
    prepare: function(sql) {
      return {
        run: function(...args) {
          const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
          db.run(sql, args, callback);
        },
        finalize: function() {
          // No-op for cloud execution
        }
      };
    },
    serialize: function(callback) {
      if (callback) callback();
    }
  };

  console.log('Connected to Turso Cloud SQLite Database.');
  setTimeout(() => {
    initializeDatabase();
  }, 100);
} else {
  // Fallback to local sqlite3 file
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, 'database.sqlite');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('Connected to local SQLite database.');
      initializeDatabase();
    }
  });
}

// Helper functions for auto-generating product codes
function getCategoryPrefix(category) {
  if (!category) return 'PR';
  const cat = category.toLowerCase().trim();
  if (cat.includes('earring')) return 'ER';
  if (cat.includes('jhumka')) return 'JM';
  if (cat.includes('antitarnish')) return 'AT';
  if (cat.includes('ethnic')) return 'ET';
  if (cat.includes('earcuff')) return 'EC';
  if (cat.includes('neckchain') || cat.includes('necklace')) return 'NC';
  if (cat.includes('bracelet')) return 'BR';
  if (cat.includes('kada')) return 'KD';
  if (cat.includes('bangle')) return 'BG';
  if (cat.includes('cuff')) return 'CF';
  if (cat.includes('anklet')) return 'AK';
  if (cat.includes('ring')) return 'RN';
  if (cat.includes('tiara')) return 'TR';
  
  const clean = category.replace(/[^a-zA-Z]/g, '');
  if (clean.length >= 2) {
    return clean.substring(0, 2).toUpperCase();
  }
  return 'PR';
}

function assignMissingProductCodes(db) {
  db.all("SELECT id, name, category, product_code FROM products", [], (err, rows) => {
    if (err) {
      console.error("Error fetching products for code assignment:", err);
      return;
    }
    const prefixCounts = {};
    const pending = [];

    rows.forEach(p => {
      const prefix = getCategoryPrefix(p.category);
      if (p.product_code) {
        const numPart = parseInt(p.product_code.replace(prefix, ''), 10);
        if (!isNaN(numPart)) {
          prefixCounts[prefix] = Math.max(prefixCounts[prefix] || 0, numPart);
        }
      } else {
        pending.push(p);
      }
    });

    pending.forEach(p => {
      const prefix = getCategoryPrefix(p.category);
      const nextNum = (prefixCounts[prefix] || 0) + 1;
      prefixCounts[prefix] = nextNum;
      const code = `${prefix}${String(nextNum).padStart(2, '0')}`;
      
      db.run("UPDATE products SET product_code = ? WHERE id = ?", [code, p.id], (err2) => {
        if (err2) {
          console.error(`Error updating product code for ID ${p.id}:`, err2);
        } else {
          console.log(`Assigned code ${code} to existing product: ${p.name}`);
        }
      });
    });
  });
}

// Create tables and seed data
function initializeDatabase() {
  db.serialize(() => {
    // 1. Products Table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        base_price REAL NOT NULL,
        discount_price REAL,
        description TEXT NOT NULL,
        images TEXT NOT NULL, -- JSON string (Array of image paths)
        specs TEXT NOT NULL,  -- JSON string
        stock INTEGER NOT NULL,
        product_code TEXT,
        metal_options TEXT DEFAULT 'none',
        gold_stock INTEGER DEFAULT 0,
        silver_stock INTEGER DEFAULT 0
      )
    `);

    // Schema Migration: Add discount_price column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN discount_price REAL`, (err) => {
      // Ignore error if column already exists
    });

    // Schema Migration: Add product_code column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN product_code TEXT`, (err) => {
      // Ignore error if column already exists
      assignMissingProductCodes(db);
    });

    // Schema Migration: Add metal_options column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN metal_options TEXT DEFAULT 'none'`, (err) => {
      // Ignore error if column already exists
    });

    // Schema Migration: Add gold_stock column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN gold_stock INTEGER DEFAULT 0`, (err) => {
      if (!err) {
        db.run(`UPDATE products SET gold_stock = stock WHERE gold_stock = 0`, () => {});
      }
    });

    // Schema Migration: Add silver_stock column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN silver_stock INTEGER DEFAULT 0`, (err) => {
      if (!err) {
        db.run(`UPDATE products SET silver_stock = stock WHERE silver_stock = 0`, () => {});
      }
    });

    // Schema Migration: Add archived column if it does not exist
    db.run(`ALTER TABLE products ADD COLUMN archived INTEGER DEFAULT 0`, (err) => {
      // Ignore error if column already exists
    });

    // 1.5 Password Resets Table
    db.run(`
      CREATE TABLE IF NOT EXISTS password_resets (
        email TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    // 2. Orders Table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        shipping_address TEXT NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL, -- 'Pending', 'Paid', 'Failed'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Order Items Table
    db.run(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        metal TEXT NOT NULL,
        gemstone TEXT NOT NULL,
        price REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
      )
    `);

    // 4. Transactions Table
    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        transaction_ref TEXT UNIQUE NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        status TEXT NOT NULL, -- 'Success', 'Declined', 'Failed'
        provider TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (id)
      )
    `, () => {
      // Create banners table
      db.run(`
        CREATE TABLE IF NOT EXISTS banners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          image_url TEXT NOT NULL,
          title TEXT,
          subtitle TEXT,
          link_url TEXT,
          bg_size TEXT DEFAULT 'cover',
          bg_position TEXT DEFAULT 'center',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create reviews table (homepage testimonials)
      db.run(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rating INTEGER NOT NULL,
          review_text TEXT NOT NULL,
          author_name TEXT NOT NULL,
          author_location TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create instagram_posts table
      db.run(`
        CREATE TABLE IF NOT EXISTS instagram_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          image_url TEXT NOT NULL,
          post_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create restock_requests table
      db.run("DROP TABLE IF EXISTS restock_requests", () => {
        db.run(`
          CREATE TABLE IF NOT EXISTS restock_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      });

      // Seeding dummy queries check
      db.run("SELECT 1", [], () => {
        db.get("SELECT COUNT(*) as count FROM instagram_posts", [], (err, row) => {
          if (row && row.count === 0) {
            db.run(`
              INSERT INTO instagram_posts (image_url, post_url)
              VALUES 
              ('assets/logo.png', 'https://instagram.com/manih_jewelz'),
              ('assets/logo.png', 'https://instagram.com/manih_jewelz'),
              ('assets/logo.png', 'https://instagram.com/manih_jewelz'),
              ('assets/logo.png', 'https://instagram.com/manih_jewelz')
            `);
          }
        });
      });

      // Create heritage_content table
      db.run(`
        CREATE TABLE IF NOT EXISTS heritage_content (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subtitle TEXT,
          title TEXT,
          desc1 TEXT,
          desc2 TEXT,
          image_url TEXT
        )
      `, () => {
        db.get("SELECT COUNT(*) as count FROM heritage_content", [], (err, row) => {
          if (row && row.count === 0) {
            db.run(`
              INSERT INTO heritage_content (subtitle, title, desc1, desc2, image_url)
              VALUES 
              ('CRAFTING STORIES', 
               'Affordable Luxury, Uncompromised.', 
               'At Manih Jewelz, we believe that premium style shouldn''t require premium solid-gold pricing. We design high-fidelity artificial jewelry that blends traditional Indian craftsmanship with modern daily-wear aesthetics.', 
               'From complex Meenakari and hand-painted lotus details to precise Swiss-cut cubic zirconia, each creation is engineered using premium brass bases, high-polish rose gold, and tarnish-resistant lacquer. Explore affordable elegance designed for women aged 18–35.', 
               'assets/logo.png')
            `);
          }
        });
      });

      // Create customers table
      db.run(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          phone TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, () => {
        // Seed default customer if empty
        db.get("SELECT COUNT(*) as count FROM customers", [], (err, row) => {
          if (row && row.count === 0) {
            const defaultHash = bcrypt.hashSync('password123', 10);
            db.run(`
              INSERT INTO customers (name, email, password, phone)
              VALUES ('Anjali Sharma', 'anjali@example.com', ?, '9876543210')
            `, [defaultHash]);
          }
        });
      });

      // Seed default products if empty
      db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
        if (row && row.count === 0) {
          console.log("Products table is empty. Seeding default Manih Jewelz products...");
          seedProducts();
        } else {
          console.log("Products table already has data. Skipping product seeding.");
        }
        // Auto-migrate local banner images to Cloudinary
        autoMigrateLocalBanners();
      });
    });
  });
}

// Auto-migrate local banner images to Cloudinary at startup
function autoMigrateLocalBanners() {
  db.all("SELECT * FROM banners", [], (err, rows) => {
    if (err) {
      console.error("Error fetching banners for migration:", err);
      return;
    }
    if (!rows || rows.length === 0) return;
    
    rows.forEach(banner => {
      // Check if image_url is a local path (starts with img/ or doesn't start with http)
      if (banner.image_url && !banner.image_url.startsWith('http')) {
        const localPath = path.isAbsolute(banner.image_url) 
          ? banner.image_url 
          : path.join(__dirname, banner.image_url);
        
        console.log(`Auto-migrating local banner ${banner.id} (${banner.image_url}) to Cloudinary...`);
        
        cloudinary.uploader.upload(localPath, {
          folder: 'manih_jewelz_banners'
        }, (uploadErr, result) => {
          if (uploadErr) {
            console.error(`Failed to upload local banner ${banner.image_url} to Cloudinary:`, uploadErr);
            return;
          }
          const cloudinaryUrl = result.secure_url;
          console.log(`Successfully uploaded ${banner.image_url} to Cloudinary: ${cloudinaryUrl}`);
          
          db.run("UPDATE banners SET image_url = ? WHERE id = ?", [cloudinaryUrl, banner.id], (updateErr) => {
            if (updateErr) {
              console.error(`Failed to update banner URL in database:`, updateErr);
            } else {
              console.log(`Updated banner ${banner.id} URL to ${cloudinaryUrl} in database.`);
            }
          });
        });
      }
    });
  });
}

function seedProducts() {
  const products = [
    {
      name: "Kundan Lotus Jhumkas",
      category: "Meenakari Jhumkas",
      base_price: 1299.00,
      discount_price: 999.00,
      description: "Exquisite hand-painted lotus jhumka earrings featuring high-grade synthetic Kundan stones set in a durable brass base with premium gold plating, finished with delicate faux pearls. Showcase details include traditional Meenakari artwork.",
      // Seeded with empty gallery array. Admin can assign custom images!
      images: JSON.stringify([]),
      specs: JSON.stringify({
        "18k Gold Plated": "Yes",
        "Brass": "Yes",
        "Anti-Tarnish": "Yes",
        "Pearl": "Yes",
        "Semi-precious Stone": "Yes"
      }),
      stock: 15
    },
    {
      name: "Rose Gold Blossom Studs",
      category: "Antitarnish",
      base_price: 499.00,
      discount_price: null,
      description: "Delicate flower studs crafted in premium brass with high-quality rose-gold plating, featuring a cluster of sparkling Swiss cubic zirconia crystals at the center. Lightweight and perfect for daily wear.",
      images: JSON.stringify([]),
      specs: JSON.stringify({
        "Daily Wear": "Yes",
        "Brass": "Yes",
        "Hypoallergenic": "Yes",
        "Semi-precious Stone": "Yes"
      }),
      stock: 25
    },
    {
      name: "The Royal Chaandbali Choker",
      category: "Neckchain",
      base_price: 2499.00,
      discount_price: 1999.00,
      description: "A majestic heritage-inspired choker featuring elaborate crescent moon motifs (Chaandbali). Crafted in premium gold-plated alloy, adorned with synthetic Polki stones, faux emerald beads, and multi-strand pearl beads.",
      images: JSON.stringify([]),
      specs: JSON.stringify({
        "Brass": "Yes",
        "Pearl": "Yes",
        "Semi-precious Stone": "Yes"
      }),
      stock: 8
    },
    {
      name: "Manih Signature Kada Bracelet",
      category: "Kada",
      base_price: 999.00,
      discount_price: null,
      description: "A sleek modern Kada cuff bracelet in premium rose-gold plated brass, featuring a contemporary interlocking wave design embellished with brilliant-cut cubic zirconia accents.",
      images: JSON.stringify([]),
      specs: JSON.stringify({
        "18k Gold Plated": "Yes",
        "Brass": "Yes",
        "Semi-precious Stone": "Yes"
      }),
      stock: 18
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO products (name, category, base_price, discount_price, description, images, specs, stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  products.forEach((p) => {
    stmt.run(p.name, p.category, p.base_price, p.discount_price, p.description, p.images, p.specs, p.stock);
  });
  stmt.finalize();
  console.log("Database seeded with Manih Jewelz products containing multiple images.");
}

// Email Transporter Setup
let mailTransporter;

// Ethereal Test Account fallback setup
async function setupMailTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER || 'YOUR_SMTP_USER';
  const pass = process.env.SMTP_PASS || 'YOUR_SMTP_PASSWORD';

  if (user && pass) {
    // Production SMTP Configuration
    mailTransporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user: user,
        pass: pass
      }
    });
    console.log(`Nodemailer: Initialized with production SMTP settings using ${user}.`);
  } else {
    // Sandbox / Development Mode: Create temporary Ethereal account dynamically
    try {
      const testAccount = await nodemailer.createTestAccount();
      mailTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log("Nodemailer: No SMTP credentials found. Created sandbox Ethereal account.");
      console.log(`Sandbox Credentials -> User: ${testAccount.user}, Pass: ${testAccount.pass}`);
    } catch (err) {
      console.error("Nodemailer: Failed to create Ethereal test account.", err.message);
    }
  }
}

// Send Welcome Email helper
async function sendWelcomeEmail(customerName, customerEmail) {
  if (!mailTransporter) {
    console.log("Nodemailer: Transporter not initialized. Skipping email.");
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Montserrat', Helvetica, Arial, sans-serif;
          background-color: #fcf8f5;
          margin: 0;
          padding: 0;
          color: #333333;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border: 1px solid #e3a387;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header {
          background-color: #5b0012; /* Brand Maroon */
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          color: #e3a387; /* Brand Rose Gold */
          font-family: 'Cinzel', Georgia, serif;
          margin: 0;
          font-size: 20px;
          letter-spacing: 2px;
          font-weight: 400;
        }
        .content {
          padding: 40px 30px;
          line-height: 1.8;
        }
        .content h2 {
          color: #5b0012;
          font-family: 'Cinzel', Georgia, serif;
          font-size: 18px;
          margin-top: 0;
          font-weight: 500;
        }
        .content p {
          font-size: 14px;
          margin-bottom: 20px;
          color: #555555;
        }
        .footer {
          background-color: #fcf8f5;
          padding: 30px;
          text-align: center;
          border-top: 1px solid #f6ece6;
          font-size: 12px;
          color: #999999;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>WELCOME TO MANIH JEWELZ</h1>
        </div>
        <div class="content">
          <h2>Hi ${customerName}!</h2>
          <p>Thank you for registering an account with <strong>Manih Jewelz</strong>. We are delighted to welcome you to our family.</p>
          <p>Your account has been created successfully under the email: <strong>${customerEmail}</strong>.</p>
          <p>You can now log in to view your order history, track deliveries in real time, and access priority concierge support. If you have any questions, our concierge team is always here to assist you at <a href="mailto:contact@manihjewelz.com" style="color: #e3a387; text-decoration: none;">contact@manihjewelz.com</a>.</p>
          <p>Warm regards,<br><strong>The Manih Jewelz Concierge</strong></p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Manih Jewelz.<br>
          Near Post Office, Valiyapoyil, Cheruvathur via Kasaragod Dist, Kerala - 671313</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Manih Jewelz" <manihjewelz@gmail.com>`,
    to: customerEmail,
    subject: "Welcome to Manih Jewelz",
    html: htmlContent
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`Nodemailer: Welcome email sent successfully to ${customerEmail}! Message ID: ${info.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`Nodemailer: Clickable Sandbox Message Preview URL -> ${previewUrl}`);
    }
  } catch (err) {
    console.error(`Nodemailer: Failed to send welcome email to ${customerEmail}. Error:`, err.message);
  }
}

// Send Order Confirmation Email helper
async function sendOrderConfirmationEmail(customerName, customerEmail, orderId, totalAmount, items, productNamesMap, shippingAddress) {
  if (!mailTransporter) {
    console.log("Nodemailer: Transporter not initialized. Skipping order confirmation email.");
    return;
  }

  // Construct items HTML table rows
  const itemsRowsHtml = items.map(item => {
    const prodName = productNamesMap[item.productId] || "Jewelry Piece";
    const metalDetails = item.metal && item.metal !== 'none' ? `Metal: ${item.metal}` : '';
    const gemstoneDetails = item.gemstone && item.gemstone !== 'none' ? `Gemstone: ${item.gemstone}` : '';
    const options = [metalDetails, gemstoneDetails].filter(Boolean).join(', ');
    const optionsText = options ? `<br><small style="color: #666;">${options}</small>` : '';

    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: left;">
          <strong>${prodName}</strong>
          ${optionsText}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(Number(item.price) || 0).toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Montserrat', Helvetica, Arial, sans-serif;
          background-color: #fcf8f5;
          margin: 0;
          padding: 0;
          color: #333333;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border: 1px solid #e3a387;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header {
          background-color: #5b0012;
          color: #ffffff;
          padding: 30px;
          text-align: center;
          border-bottom: 3px solid #d4a373;
        }
        .header h1 {
          font-family: 'Cinzel', Georgia, serif;
          margin: 0;
          font-size: 24px;
          letter-spacing: 2px;
        }
        .content {
          padding: 30px;
          line-height: 1.6;
        }
        .content h2 {
          color: #5b0012;
          margin-top: 0;
          font-family: 'Cinzel', Georgia, serif;
          font-size: 20px;
        }
        .order-summary {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
        }
        .order-summary th {
          background-color: #fcf8f5;
          padding: 10px;
          font-weight: 600;
          border-bottom: 2px solid #e3a387;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 1px;
        }
        .shipping-card {
          background-color: #fcf8f5;
          border: 1px solid #f2e2d9;
          padding: 15px;
          margin-top: 20px;
          border-radius: 4px;
        }
        .shipping-card h3 {
          margin-top: 0;
          color: #5b0012;
          font-family: 'Cinzel', Georgia, serif;
          font-size: 14px;
          border-bottom: 1px solid #e3a387;
          padding-bottom: 5px;
        }
        .footer {
          background-color: #fcf8f5;
          color: #777777;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          border-top: 1px solid #e3a387;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>ORDER CONFIRMED</h1>
        </div>
        <div class="content">
          <h2>Hi ${customerName},</h2>
          <p>Thank you for shopping with <strong>Manih Jewelz</strong>! Your payment was verified successfully and your order is confirmed.</p>
          <p><strong>Tracking Your Order:</strong> You can track your order at any time using your Order ID (<strong>#000${orderId}</strong>) and your email address (<strong>${customerEmail}</strong>). Simply visit the login/account section on our website and choose the <strong>Track Your Order</strong> option.</p>
          <p>We are currently preparing your jewelry pieces for shipment. Below are your order details:</p>
          
          <div style="margin: 15px 0; font-size: 14px;">
            <strong>Order Reference:</strong> #000${orderId}<br>
            <strong>Status:</strong> Paid / Confirmed
          </div>

          <table class="order-summary">
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
              <tr>
                <td colspan="2" style="padding: 10px; text-align: right; font-weight: bold; border-top: 2px solid #e3a387;">Total Amount Paid:</td>
                <td style="padding: 10px; text-align: right; font-weight: bold; color: #5b0012; font-size: 16px; border-top: 2px solid #e3a387;">₹${(Number(totalAmount) || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          <div class="shipping-card">
            <h3>Shipping Address</h3>
            <p style="margin: 0; font-size: 13px; color: #555;">
              ${shippingAddress.replace(/, PIN:/g, '<br>PIN:').replace(/, Phone:/g, '<br>Phone:')}
            </p>
          </div>

          <p style="margin-top: 20px;">An email confirmation containing the tracking details will be sent once your order ships. If you need any assistance, our concierge is always here at <a href="mailto:contact@manihjewelz.com" style="color: #5b0012; text-decoration: underline;">contact@manihjewelz.com</a>.</p>
          <p>Warm regards,<br><strong>The Manih Jewelz Concierge Team</strong></p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Manih Jewelz.<br>
          Near Post Office, Valiyapoyil, Cheruvathur via Kasaragod Dist, Kerala - 671313</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Manih Jewelz" <manihjewelz@gmail.com>`,
    to: customerEmail,
    subject: `Order Confirmed - #000${orderId} - Manih Jewelz`,
    html: htmlContent
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`Nodemailer: Order confirmation email sent successfully to ${customerEmail}! Message ID: ${info.messageId}`);
  } catch (err) {
    console.error(`Nodemailer: Failed to send order confirmation email to ${customerEmail}. Error:`, err.message);
  }
}

// Send Order Shipped Email helper
async function sendOrderShippedEmail(customerName, customerEmail, orderId) {
  if (!mailTransporter) {
    console.log("Nodemailer: Transporter not initialized. Skipping shipping email.");
    return;
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: 'Montserrat', Helvetica, Arial, sans-serif;
          background-color: #fcf8f5;
          margin: 0;
          padding: 0;
          color: #333333;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background-color: #ffffff;
          border: 1px solid #e3a387;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
        }
        .header {
          background-color: #5b0012;
          color: #ffffff;
          padding: 30px;
          text-align: center;
          border-bottom: 3px solid #d4a373;
        }
        .header h1 {
          font-family: 'Cinzel', Georgia, serif;
          margin: 0;
          font-size: 24px;
          letter-spacing: 2px;
        }
        .content {
          padding: 30px;
          line-height: 1.6;
        }
        .content h2 {
          color: #5b0012;
          margin-top: 0;
          font-family: 'Cinzel', Georgia, serif;
          font-size: 20px;
        }
        .footer {
          background-color: #fcf8f5;
          color: #777777;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          border-top: 1px solid #e3a387;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>ORDER SHIPPED</h1>
        </div>
        <div class="content">
          <h2>Hi ${customerName},</h2>
          <p>Exciting news! Your order <strong>#000${orderId}</strong> from <strong>Manih Jewelz</strong> has been shipped and is on its way to you.</p>
          <p>Our logistics partner will deliver it to your address shortly. Please keep your phone active to receive delivery notifications.</p>
          <p>If you have any questions, our concierge team is always here to assist you at <a href="mailto:contact@manihjewelz.com" style="color: #5b0012; text-decoration: underline;">contact@manihjewelz.com</a>.</p>
          <p>Warm regards,<br><strong>The Manih Jewelz Concierge Team</strong></p>
        </div>
        <div class="footer">
          <p>&copy; 2026 Manih Jewelz.<br>
          Near Post Office, Valiyapoyil, Cheruvathur via Kasaragod Dist, Kerala - 671313</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Manih Jewelz" <manihjewelz@gmail.com>`,
    to: customerEmail,
    subject: `Your Order #000${orderId} Has Shipped! - Manih Jewelz`,
    html: htmlContent
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`Nodemailer: Shipping confirmation email sent successfully to ${customerEmail}! Message ID: ${info.messageId}`);
  } catch (err) {
    console.error(`Nodemailer: Failed to send shipping email to ${customerEmail}. Error:`, err.message);
  }
}

// Validate email syntax and domain MX/A records
function validateEmailDomain(email) {
  return new Promise((resolve) => {
    // 1. Strict Regex Syntax Check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return resolve(false);
    }

    const domain = email.split('@')[1];
    if (!domain) {
      return resolve(false);
    }

    // 2. DNS MX records check with fail-safe fallback for hosting environments
    dns.resolveMx(domain, (err, addresses) => {
      if (err) {
        // DNS lookup failed on host network, fail-safe to true
        return resolve(true);
      }
      if (!addresses || addresses.length === 0) {
        // Fallback to checking A records if no MX records found
        dns.resolve4(domain, (err2, ipAddresses) => {
          if (err2) {
            // DNS lookup failed, fail-safe to true
            return resolve(true);
          }
          if (!ipAddresses || ipAddresses.length === 0) {
            resolve(false); // Domain definitely has no A records
          } else {
            resolve(true);
          }
        });
      } else {
        resolve(true); // Domain has active mail servers
      }
    });
  });
}

setupMailTransporter();

// API Routes

// 1. Get all products
app.get('/api/products', (req, res) => {
  db.all("SELECT * FROM products WHERE COALESCE(archived, 0) = 0", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    const formattedRows = rows.map(row => ({
      ...row,
      images: JSON.parse(row.images),
      specs: JSON.parse(row.specs)
    }));
    res.json(formattedRows);
  });
});

// 2. Checkout & Payment Simulation
app.post('/api/checkout', (req, res) => {
  const {
    customerName,
    customerEmail,
    shippingAddress,
    cardNumber,
    cardExpiry,
    cardCvv,
    items,
    totalAmount
  } = req.body;

  if (!customerName || !customerEmail || !shippingAddress || !cardNumber || !items || items.length === 0) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  setTimeout(() => {
    const cleanedCard = cardNumber.replace(/\s+/g, '');
    if (cleanedCard.endsWith('4002')) {
      return res.status(402).json({
        error: "Your payment was declined by the card issuer. Please use a different payment card.",
        code: "CARD_DECLINED"
      });
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let stockError = null;
      let checkedItems = 0;
      let computedTotal = 0;
      const productPriceMap = {};

      items.forEach((item) => {
        db.get("SELECT stock, name, base_price, discount_price, archived FROM products WHERE id = ?", [item.productId], (err, row) => {
          if (err) {
            stockError = "Database error verifying product details.";
          } else if (!row) {
            stockError = "Product not found.";
          } else if (row.archived) {
            stockError = `${row.name} is no longer available.`;
          } else if (row.stock < item.quantity) {
            stockError = `Insufficient stock for ${row.name}. Only ${row.stock} left.`;
          } else {
            const activePrice = row.discount_price !== null && row.discount_price > 0 ? row.discount_price : row.base_price;
            computedTotal += activePrice * item.quantity;
            productPriceMap[item.productId] = activePrice;
          }

          checkedItems++;
          if (checkedItems === items.length) {
            computedTotal += 50; // flat shipping fee
            if (!stockError && Math.abs(computedTotal - parseFloat(totalAmount)) > 0.01) {
              stockError = "Order total verification failed due to price discrepancy.";
            }

            if (stockError) {
              db.run("ROLLBACK");
              return res.status(400).json({ error: stockError });
            }

            db.run(
              `INSERT INTO orders (customer_name, customer_email, shipping_address, total_amount, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [customerName, customerEmail, shippingAddress, totalAmount, 'Paid', new Date().toISOString()],
              function(err) {
                if (err) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: "Failed to save order." });
                }

                const orderId = this.lastID;
                let processedItems = 0;

                items.forEach((item) => {
                  const finalPrice = productPriceMap[item.productId] || 0;
                  db.run(
                    `INSERT INTO order_items (order_id, product_id, quantity, metal, gemstone, price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderId, item.productId, item.quantity, item.metal, item.gemstone, finalPrice],
                    (err) => {
                      if (err) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: "Failed to save order items." });
                      }

                      let updateStockQuery = "UPDATE products SET stock = stock - ? WHERE id = ?";
                      let updateStockParams = [item.quantity, item.productId];

                      if (item.metal && item.metal.toLowerCase() === 'golden') {
                        updateStockQuery = "UPDATE products SET stock = stock - ?, gold_stock = gold_stock - ? WHERE id = ?";
                        updateStockParams = [item.quantity, item.quantity, item.productId];
                      } else if (item.metal && item.metal.toLowerCase() === 'silver') {
                        updateStockQuery = "UPDATE products SET stock = stock - ?, silver_stock = silver_stock - ? WHERE id = ?";
                        updateStockParams = [item.quantity, item.quantity, item.productId];
                      }

                      db.run(
                        updateStockQuery,
                        updateStockParams,
                        (err) => {
                          if (err) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: "Failed to update stock." });
                          }

                          processedItems++;
                          if (processedItems === items.length) {
                            const transactionRef = 'TXN_' + Math.random().toString(36).substr(2, 9).toUpperCase() + '_' + Date.now().toString().slice(-4);
                            const paymentMethod = `Visa ending in ${cleanedCard.slice(-4)}`;
                            
                            db.run(
                              `INSERT INTO transactions (order_id, transaction_ref, amount, payment_method, status, provider)
                               VALUES (?, ?, ?, ?, ?, ?)`,
                              [orderId, transactionRef, totalAmount, paymentMethod, 'Success', 'ManihPay Secure Gateway'],
                              (err) => {
                                if (err) {
                                  db.run("ROLLBACK");
                                  return res.status(500).json({ error: "Failed to record transaction." });
                                }

                                db.run("COMMIT", (err) => {
                                  if (err) {
                                    return res.status(500).json({ error: "Failed to finalize order." });
                                  }

                                  res.json({
                                    success: true,
                                    orderId: orderId,
                                    transactionRef: transactionRef,
                                    total: totalAmount,
                                    paymentMethod: paymentMethod,
                                    customerName: customerName,
                                    customerEmail: customerEmail,
                                    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
                                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                    })
                                  });
                                });
                              }
                            );
                          }
                        }
                      );
                    }
                  );
                });
              }
            );
          }
        });
      });
    });
  }, 1500);
});

// Razorpay: Get Key configuration
app.get('/api/config', (req, res) => {
  res.json({
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'YOUR_RAZORPAY_KEY_ID'
  });
});

// Razorpay: Create Order
app.post('/api/create-order', async (req, res) => {
  const { items, currency, receipt } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Invalid request payload. Items are required." });
  }

  const productIds = items.map(item => parseInt(item.productId, 10)).filter(Boolean);
  if (productIds.length === 0) {
    return res.status(400).json({ error: "Invalid product IDs in items list." });
  }

  const placeholders = productIds.map(() => "?").join(",");
  db.all(`SELECT id, base_price, discount_price, stock, archived, name FROM products WHERE id IN (${placeholders})`, productIds, async (err, dbProducts) => {
    if (err) {
      console.error("Database error fetching product details for price check:", err);
      return res.status(500).json({ error: "Internal database verification error." });
    }

    const productMap = {};
    (dbProducts || []).forEach(p => {
      productMap[p.id] = p;
    });

    let computedTotalAmount = 0;
    let stockOrArchivedError = null;

    for (const item of items) {
      const p = productMap[parseInt(item.productId, 10)];
      if (!p) {
        stockOrArchivedError = `Product with ID ${item.productId} was not found.`;
        break;
      }
      if (p.archived) {
        stockOrArchivedError = `${p.name} is no longer available.`;
        break;
      }
      if (p.stock < item.quantity) {
        stockOrArchivedError = `Insufficient stock for ${p.name}. Only ${p.stock} available.`;
        break;
      }

      const activePrice = p.discount_price !== null && p.discount_price > 0 ? p.discount_price : p.base_price;
      computedTotalAmount += activePrice * parseInt(item.quantity, 10);
    }

    if (stockOrArchivedError) {
      return res.status(400).json({ error: stockOrArchivedError });
    }

    // Add flat shipping fee of 50
    computedTotalAmount += 50;

    const amountPaise = Math.round(computedTotalAmount * 100);

    if (amountPaise < 100) {
      return res.status(400).json({ error: "Minimum checkout amount is 1 Rupee." });
    }

    try {
      const options = {
        amount: amountPaise,
        currency: currency || "INR",
        receipt: receipt || `receipt_${Date.now()}`
      };

      const order = await razorpay.orders.create(options);
      res.json({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency
      });
    } catch (err) {
      console.error("Razorpay order creation error:", err);
      res.status(500).json({ error: "Failed to create payment order." });
    }
  });
});

// Razorpay: Verify Payment Signature and Record Transaction
app.post('/api/verify-payment', (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    customerName,
    customerEmail,
    shippingAddress,
    items,
    totalAmount
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing Razorpay verification parameters." });
  }

  // 1. Verify Signature using HMAC-SHA256
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY || 'YOUR_RAZORPAY_KEY_SECRET';
  const hmac = crypto.createHmac('sha256', razorpaySecret);
  hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
  const generatedSignature = hmac.digest('hex');

  if (generatedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
  }

  // Idempotency: check if this transaction has already been processed
  db.get("SELECT order_id FROM transactions WHERE transaction_ref = ?", [razorpay_payment_id], (err, transRow) => {
    if (err) {
      return res.status(500).json({ error: "Database error checking duplicate transaction." });
    }
    if (transRow) {
      return res.json({
        success: true,
        orderId: transRow.order_id,
        transactionRef: razorpay_payment_id,
        message: "Payment signature already verified."
      });
    }

    if (!customerName || !customerEmail || !shippingAddress || !items || items.length === 0) {
      return res.status(400).json({ error: "Missing required customer or items fields." });
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      let stockError = null;
      let checkedItems = 0;
      const productNamesMap = {};
      const productPriceMap = {};

      items.forEach((item) => {
        db.get("SELECT stock, name, base_price, discount_price, archived FROM products WHERE id = ?", [item.productId], (err, row) => {
          if (err) {
            stockError = "Database error verifying stock.";
          } else if (!row) {
            stockError = "Product not found.";
          } else if (row.archived) {
            stockError = `\n${row.name} is no longer available.`;
          } else {
            productNamesMap[item.productId] = row.name;
            if (row.stock < item.quantity) {
              stockError = `Insufficient stock for ${row.name}. Only ${row.stock} left.`;
            } else {
              const activePrice = row.discount_price !== null && row.discount_price > 0 ? row.discount_price : row.base_price;
              productPriceMap[item.productId] = activePrice;
            }
          }

          checkedItems++;
          if (checkedItems === items.length) {
            if (stockError) {
              db.run("ROLLBACK");
              return res.status(400).json({ error: stockError });
            }

            db.run(
              `INSERT INTO orders (customer_name, customer_email, shipping_address, total_amount, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [customerName, customerEmail, shippingAddress, Number(totalAmount) || 0, 'Paid', new Date().toISOString()],
              function(err2) {
                if (err2) {
                  db.run("ROLLBACK");
                  return res.status(500).json({ error: "Failed to save order." });
                }

                const orderId = this.lastID;
                let processedItems = 0;

                items.forEach((item) => {
                  const finalPrice = productPriceMap[item.productId] || 0;
                  db.run(
                    `INSERT INTO order_items (order_id, product_id, quantity, metal, gemstone, price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderId, item.productId, item.quantity, item.metal, item.gemstone, finalPrice],
                    (err3) => {
                      if (err3) {
                        db.run("ROLLBACK");
                        return res.status(500).json({ error: "Failed to save order items." });
                      }

                      let updateStockQuery = "UPDATE products SET stock = stock - ? WHERE id = ?";
                      let updateStockParams = [item.quantity, item.productId];

                      if (item.metal && item.metal.toLowerCase() === 'golden') {
                        updateStockQuery = "UPDATE products SET stock = stock - ?, gold_stock = gold_stock - ? WHERE id = ?";
                        updateStockParams = [item.quantity, item.quantity, item.productId];
                      } else if (item.metal && item.metal.toLowerCase() === 'silver') {
                        updateStockQuery = "UPDATE products SET stock = stock - ?, silver_stock = silver_stock - ? WHERE id = ?";
                        updateStockParams = [item.quantity, item.quantity, item.productId];
                      }

                      db.run(
                        updateStockQuery,
                        updateStockParams,
                        (err4) => {
                          if (err4) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: "Failed to update stock." });
                          }

                          processedItems++;
                          if (processedItems === items.length) {
                            const transactionRef = razorpay_payment_id;
                            const paymentMethod = "Razorpay Standard Checkout";

                            db.run(
                              `INSERT INTO transactions (order_id, transaction_ref, amount, payment_method, status, provider)
                               VALUES (?, ?, ?, ?, ?, ?)`,
                              [orderId, transactionRef, totalAmount, paymentMethod, 'Success', 'Razorpay'],
                              (err5) => {
                                if (err5) {
                                  db.run("ROLLBACK");
                                  return res.status(500).json({ error: "Failed to record transaction." });
                                }

                                db.run("COMMIT", (err6) => {
                                  if (err6) {
                                    return res.status(500).json({ error: "Failed to finalize order." });
                                  }

                                  // Send order confirmation email asynchronously
                                  sendOrderConfirmationEmail(customerName, customerEmail, orderId, totalAmount, items, productNamesMap, shippingAddress);

                                  res.json({
                                    success: true,
                                    orderId: orderId,
                                    transactionRef: transactionRef,
                                    total: totalAmount,
                                    paymentMethod: paymentMethod,
                                    customerName: customerName,
                                    customerEmail: customerEmail,
                                    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
                                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                    })
                                  });
                                });
                              }
                            );
                          }
                        }
                      );
                    }
                  );
                });
              }
            );
          }
        });
      });
    });
  });
});

// 3. Admin Database Log Retrieval
app.get('/api/admin/db', (req, res) => {
  const data = {
    products: [],
    orders: [],
    transactions: [],
    banners: [],
    reviews: [],
    instagram: [],
    heritage: null,
    restock: []
  };

  db.all("SELECT * FROM products WHERE COALESCE(archived, 0) = 0", [], (err, productsRows) => {
    if (err) return res.status(500).json({ error: err.message });
    data.products = productsRows.map(p => ({
      ...p,
      images: JSON.parse(p.images),
      specs: JSON.parse(p.specs)
    }));

    db.all("SELECT * FROM orders ORDER BY id DESC", [], (err, ordersRows) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.all("SELECT oi.*, p.name AS product_name, p.images AS product_images FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id", [], (err, orderItemsRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const itemsMap = {};
        (orderItemsRows || []).forEach(item => {
          if (!itemsMap[item.order_id]) {
            itemsMap[item.order_id] = [];
          }
          let firstImg = 'assets/logo.png';
          if (item.product_images) {
            try {
              const imgs = JSON.parse(item.product_images);
              if (Array.isArray(imgs) && imgs.length > 0) {
                firstImg = imgs[0];
              }
            } catch (e) {}
          }
          itemsMap[item.order_id].push({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name || "Deleted Product",
            image: firstImg,
            quantity: item.quantity,
            metal: item.metal,
            gemstone: item.gemstone,
            price: item.price
          });
        });

        data.orders = ordersRows.map(o => ({
          ...o,
          items: itemsMap[o.id] || []
        }));

        db.all("SELECT * FROM transactions ORDER BY id DESC", [], (err, transRows) => {
        if (err) return res.status(500).json({ error: err.message });
        data.transactions = transRows;

        db.all("SELECT * FROM banners ORDER BY id ASC", [], (err, bannerRows) => {
          if (err) return res.status(500).json({ error: err.message });
          data.banners = bannerRows;

          db.all("SELECT * FROM reviews ORDER BY id DESC", [], (err, reviewRows) => {
            if (err) return res.status(500).json({ error: err.message });
            data.reviews = reviewRows;

            db.all("SELECT * FROM instagram_posts ORDER BY id ASC", [], (err, instaRows) => {
              if (err) return res.status(500).json({ error: err.message });
              data.instagram = instaRows;

              db.all("SELECT * FROM restock_requests ORDER BY id DESC", [], (err, restockRows) => {
                if (err) return res.status(500).json({ error: err.message });
                data.restock = restockRows || [];

                db.get("SELECT * FROM heritage_content WHERE id = 1", [], (err, heritageRow) => {
                  if (err) return res.status(500).json({ error: err.message });
                  data.heritage = heritageRow || {
                    subtitle: "CRAFTING STORIES",
                    title: "Affordable Luxury, Uncompromised.",
                    desc1: "At Manih Jewelz, we believe that premium style shouldn't require premium solid-gold pricing.",
                    desc2: "From complex Meenakari and hand-painted lotus details to precise Swiss-cut cubic zirconia.",
                    image_url: "assets/logo.png"
                  };
                  res.json(data);
                });
              });
            });
          });
        });
      });
      });
    });
  });
});

// 4. Admin Login Endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && bcrypt.compareSync(password.trim(), adminPasswordHash)) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ success: true, token: token });
  } else {
    res.status(401).json({ error: 'Unauthorized. Invalid security credentials.' });
  }
});

// Admin: Clear All Customers (Except Default Seed User)
app.post('/api/admin/clear-customers', (req, res) => {
  const { password } = req.body;
  if (!password || password.trim().toLowerCase() !== (process.env.ADMIN_PASSWORD || 'manih2026').toLowerCase()) {
    return res.status(401).json({ error: "Unauthorized. Invalid credentials." });
  }

  db.run("DELETE FROM customers", [], (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to clear customers." });
    }
    // Re-seed default customer
    db.run(`
      INSERT INTO customers (name, email, password, phone)
      VALUES ('Anjali Sharma', 'anjali@example.com', 'password123', '9876543210')
    `, () => {
      res.json({ success: true, message: "All customer accounts cleared successfully." });
    });
  });
});

// Admin: Update Order Status (Mark Shipped)
app.post('/api/admin/orders/update-status', (req, res) => {
  const { orderId, status } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({ error: "Missing orderId or status parameter." });
  }

  db.get("SELECT customer_name, customer_email FROM orders WHERE id = ?", [orderId], (err, orderRow) => {
    if (err || !orderRow) {
      return res.status(404).json({ error: "Order not found in database." });
    }

    db.run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId], function(err2) {
      if (err2) {
        return res.status(500).json({ error: "Failed to update order status." });
      }

      if (status === 'Shipped') {
        sendOrderShippedEmail(orderRow.customer_name, orderRow.customer_email, orderId);
      }

      res.json({ success: true, message: "Order status updated successfully." });
    });
  });
});

// Cloudinary: Upload Image from Admin Panel
app.post('/api/admin/upload-image', (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: "No image payload received." });
  }

  // Validate image MIME type (must start with data:image/)
  if (!image.startsWith('data:image/')) {
    return res.status(400).json({ error: "Invalid upload type. Only images are permitted." });
  }

  // Validate upload size limit (approx 5MB max base64 size)
  if (image.length * 0.75 > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "File size exceeds the 5MB security limit." });
  }

  cloudinary.uploader.upload(image, {
    folder: 'manih_jewelz_products'
  }, (err, result) => {
    if (err) {
      console.error("Cloudinary upload error:", err);
      return res.status(500).json({ error: err.message || "Failed to upload to Cloudinary." });
    }
    res.json({ secure_url: result.secure_url });
  });
});

// 5. Admin Add Product
app.post('/api/products', authenticateAdmin, (req, res) => {
  const { name, category, base_price, discount_price, description, images, specs, stock, metal_options, gold_stock, silver_stock } = req.body;
  if (!name || !category || !base_price || !description || !images || !specs || stock === undefined) {
    return res.status(400).json({ error: "All product details must be completed." });
  }

  const parsedDiscountPrice = (discount_price !== undefined && discount_price !== null && discount_price !== '') ? parseFloat(discount_price) : null;
  const finalMetalOptions = (metal_options && metal_options.trim() !== '') ? metal_options : 'none';
  const prefix = getCategoryPrefix(category);

  // Find max suffix count for this prefix in existing database records
  db.all("SELECT product_code FROM products WHERE category = ?", [category], (err, rows) => {
    let nextNum = 1;
    if (!err && rows && rows.length > 0) {
      rows.forEach(r => {
        if (r.product_code) {
          const numPart = parseInt(r.product_code.replace(prefix, ''), 10);
          if (!isNaN(numPart)) {
            nextNum = Math.max(nextNum, numPart + 1);
          }
        }
      });
    }

    const code = `${prefix}${String(nextNum).padStart(2, '0')}`;

    const stmt = db.prepare(`
      INSERT INTO products (name, category, base_price, discount_price, description, images, specs, stock, product_code, metal_options, gold_stock, silver_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      name,
      category,
      parseFloat(base_price),
      parsedDiscountPrice,
      description,
      typeof images === 'string' ? images : JSON.stringify(images),
      typeof specs === 'string' ? specs : JSON.stringify(specs),
      parseInt(stock),
      code,
      finalMetalOptions,
      parseInt(gold_stock || 0),
      parseInt(silver_stock || 0),
      function(err2) {
        if (err2) {
          return res.status(500).json({ error: "Failed to add product." });
        }
        res.json({ success: true, id: this.lastID, product_code: code });
      }
    );
    stmt.finalize();
  });
});

// 6. Admin Edit Product
app.put('/api/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const { name, category, base_price, discount_price, description, images, specs, stock, metal_options, gold_stock, silver_stock } = req.body;
  if (!name || !category || !base_price || !description || !images || !specs || stock === undefined) {
    return res.status(400).json({ error: "All product details must be completed." });
  }

  const parsedDiscountPrice = (discount_price !== undefined && discount_price !== null && discount_price !== '') ? parseFloat(discount_price) : null;
  const finalMetalOptions = (metal_options && metal_options.trim() !== '') ? metal_options : 'none';

  db.run(`
    UPDATE products
    SET name = ?, category = ?, base_price = ?, discount_price = ?, description = ?, images = ?, specs = ?, stock = ?, metal_options = ?, gold_stock = ?, silver_stock = ?
    WHERE id = ?`,
    [
      name,
      category,
      parseFloat(base_price),
      parsedDiscountPrice,
      description,
      typeof images === 'string' ? images : JSON.stringify(images),
      typeof specs === 'string' ? specs : JSON.stringify(specs),
      parseInt(stock),
      finalMetalOptions,
      parseInt(gold_stock || 0),
      parseInt(silver_stock || 0),
      parseInt(id)
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: "Failed to update product." });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Product not found." });
      }
      res.json({ success: true });
    }
  );
});

// 7. Admin Delete Product (with foreign key protection / soft-delete backup)
app.delete('/api/products/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const productId = parseInt(id, 10);

  // Check if product is in any orders
  db.get("SELECT COUNT(*) AS count FROM order_items WHERE product_id = ?", [productId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error checking orders: " + err.message });
    }

    if (row && row.count > 0) {
      // Product has order history - archive/soft-delete instead of physical delete
      db.run("UPDATE products SET archived = 1 WHERE id = ?", [productId], function(err2) {
        if (err2) {
          return res.status(500).json({ error: "Failed to archive product: " + err2.message });
        }
        res.json({ success: true, message: "Product archived successfully (retained for order history)." });
      });
    } else {
      // Product has no orders - safe to delete physically
      db.run("DELETE FROM products WHERE id = ?", [productId], function(err2) {
        if (err2) {
          return res.status(500).json({ error: "Failed to delete product." });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: "Product not found." });
        }
        res.json({ success: true, message: "Product deleted successfully." });
      });
    }
  });
});

// 8. Get all active banners
app.get('/api/banners', (req, res) => {
  db.all("SELECT * FROM banners ORDER BY id ASC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 8.5 Post restock request
app.post('/api/restock-requests', (req, res) => {
  const { productId, productName, customerName, customerEmail } = req.body;
  if (!productId || !productName || !customerEmail) {
    return res.status(400).json({ error: "Missing required details to submit restock request." });
  }

  const finalName = customerName ? customerName.trim() : 'Guest';

  db.run(
    "INSERT INTO restock_requests (product_id, product_name, customer_name, customer_email) VALUES (?, ?, ?, ?)",
    [parseInt(productId), productName, finalName, customerEmail.trim()],
    function(err) {
      if (err) {
        console.error("Error inserting restock request:", err);
        return res.status(500).json({ error: "Failed to record restock request." });
      }
      res.json({ success: true, message: "Restock notification request successfully recorded." });
    }
  );
});

// 9. Admin Add Banner
app.post('/api/admin/banners', (req, res) => {
  const { image_url, title, subtitle, link_url, bg_size, bg_position } = req.body;
  if (!image_url) {
    return res.status(400).json({ error: "Banner image URL is required." });
  }
  const size = bg_size || 'cover';
  const position = bg_position || 'center';

  db.run(`
    INSERT INTO banners (image_url, title, subtitle, link_url, bg_size, bg_position)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [image_url, title, subtitle, link_url, size, position],
    function(err) {
      if (err) {
        return res.status(500).json({ error: "Failed to add banner: " + err.message });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// 9.5. Admin Edit Banner
app.put('/api/admin/banners/:id', (req, res) => {
  const { id } = req.params;
  const { image_url, title, subtitle, link_url, bg_size, bg_position } = req.body;
  if (!image_url) {
    return res.status(400).json({ error: "Banner image URL is required." });
  }
  const size = bg_size || 'cover';
  const position = bg_position || 'center';

  db.run(`
    UPDATE banners
    SET image_url = ?, title = ?, subtitle = ?, link_url = ?, bg_size = ?, bg_position = ?
    WHERE id = ?`,
    [image_url, title, subtitle, link_url, size, position, parseInt(id)],
    function(err) {
      if (err) {
        return res.status(500).json({ error: "Failed to update banner: " + err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Banner not found." });
      }
      res.json({ success: true });
    }
  );
});

// 10. Admin Delete Banner
app.delete('/api/admin/banners/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM banners WHERE id = ?", [parseInt(id)], function(err) {
    if (err) {
      return res.status(500).json({ error: "Failed to delete banner: " + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Banner not found." });
    }
    res.json({ success: true });
  });
});

// 11. Homepage Reviews (Public List)
app.get('/api/reviews', (req, res) => {
  db.all("SELECT * FROM reviews ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 12. Admin Add Homepage Review
app.post('/api/admin/reviews', (req, res) => {
  const { rating, review_text, author_name, author_location } = req.body;
  if (!rating || !review_text || !author_name) {
    return res.status(400).json({ error: "Rating, review text, and author name are required." });
  }

  db.run(`
    INSERT INTO reviews (rating, review_text, author_name, author_location)
    VALUES (?, ?, ?, ?)`,
    [parseInt(rating), review_text, author_name, author_location || ''],
    function(err) {
      if (err) return res.status(500).json({ error: "Failed to add review: " + err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// 13. Admin Delete Homepage Review
app.delete('/api/admin/reviews/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM reviews WHERE id = ?", [parseInt(id)], function(err) {
    if (err) return res.status(500).json({ error: "Failed to delete review: " + err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Review not found." });
    res.json({ success: true });
  });
});

// 14. Instagram Feed (Public List)
app.get('/api/instagram', (req, res) => {
  db.all("SELECT * FROM instagram_posts ORDER BY id ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 15. Admin Add Instagram Post
app.post('/api/admin/instagram', (req, res) => {
  const { image_url, post_url } = req.body;
  if (!image_url) return res.status(400).json({ error: "Instagram post image URL is required." });

  db.run(`
    INSERT INTO instagram_posts (image_url, post_url)
    VALUES (?, ?)`,
    [image_url, post_url || ''],
    function(err) {
      if (err) return res.status(500).json({ error: "Failed to add Instagram post: " + err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// 16. Admin Delete Instagram Post
app.delete('/api/admin/instagram/:id', (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM instagram_posts WHERE id = ?", [parseInt(id)], function(err) {
    if (err) return res.status(500).json({ error: "Failed to delete Instagram post: " + err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Instagram post not found." });
    res.json({ success: true });
  });
});

// 17. Our Story (Public Details)
app.get('/api/heritage', (req, res) => {
  db.get("SELECT * FROM heritage_content WHERE id = 1", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) {
      return res.json({
        subtitle: "CRAFTING STORIES",
        title: "Affordable Luxury, Uncompromised.",
        desc1: "At Manih Jewelz, we believe that premium style shouldn't require premium solid-gold pricing.",
        desc2: "From complex Meenakari and hand-painted lotus details to precise Swiss-cut cubic zirconia.",
        image_url: "assets/logo.png"
      });
    }
    res.json(row);
  });
});

// 18. Admin Save Our Story Settings
app.post('/api/admin/heritage', (req, res) => {
  const { subtitle, title, desc1, desc2, image_url } = req.body;
  if (!subtitle || !title || !desc1 || !desc2 || !image_url) {
    return res.status(400).json({ error: "All story settings must be completed." });
  }

  db.get("SELECT id FROM heritage_content WHERE id = 1", [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      db.run(`
        UPDATE heritage_content
        SET subtitle = ?, title = ?, desc1 = ?, desc2 = ?, image_url = ?
        WHERE id = 1`,
        [subtitle, title, desc1, desc2, image_url],
        function(err) {
          if (err) return res.status(500).json({ error: "Failed to update story: " + err.message });
          res.json({ success: true });
        }
      );
    } else {
      db.run(`
        INSERT INTO heritage_content (id, subtitle, title, desc1, desc2, image_url)
        VALUES (1, ?, ?, ?, ?, ?)`,
        [subtitle, title, desc1, desc2, image_url],
        function(err) {
          if (err) return res.status(500).json({ error: "Failed to insert story: " + err.message });
          res.json({ success: true });
        }
      );
    }
  });
});

// 19. Customer Sign Up
app.post('/api/customer/signup', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  // Verify email deliverability (check format and domain DNS MX/A records)
  const isEmailValid = await validateEmailDomain(email.toLowerCase().trim());
  if (!isEmailValid) {
    return res.status(400).json({ error: "The email address is invalid or the domain does not exist. Please check your email and try again." });
  }

  // Check if email already exists
  db.get("SELECT id FROM customers WHERE LOWER(email) = ?", [email.toLowerCase().trim()], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error checking email uniqueness." });
    }
    if (row) {
      return res.status(400).json({ error: "Email address is already registered." });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    // Insert new customer
    const stmt = db.prepare(`
      INSERT INTO customers (name, email, password, phone)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(name.trim(), email.toLowerCase().trim(), hashedPassword, phone ? phone.trim() : '', function(err) {
      if (err) {
        return res.status(500).json({ error: "Failed to register customer." });
      }

      // Trigger Welcome Email asynchronously (don't block response)
      sendWelcomeEmail(name.trim(), email.toLowerCase().trim());

      const token = jwt.sign(
        { id: this.lastID, email: email.toLowerCase().trim(), name: name.trim() },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        id: this.lastID,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : '',
        token: token
      });
    });
    stmt.finalize();
  });
});

// 20. Customer Log In
app.post('/api/customer/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  db.get(
    "SELECT id, name, email, password, phone FROM customers WHERE LOWER(email) = ?",
    [email.toLowerCase().trim()],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Database error during login." });
      }
      if (!row || !bcrypt.compareSync(password, row.password)) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      const token = jwt.sign(
        { id: row.id, email: row.email, name: row.name },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        name: row.name,
        email: row.email,
        phone: row.phone,
        token: token
      });
    }
  );
});

// 21. Google Authentication Sign In / Sign Up
app.post('/api/customer/google-auth', (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: "Email and name are required from Google." });
  }

  const cleanEmail = email.toLowerCase().trim();
  db.get("SELECT id, name, email, phone FROM customers WHERE LOWER(email) = ?", [cleanEmail], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database check error." });
    }

    if (row) {
      const token = jwt.sign(
        { id: row.id, email: row.email, name: row.name },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({
        success: true,
        name: row.name,
        email: row.email,
        phone: row.phone,
        token: token
      });
    } else {
      // User does not exist, auto-register them
      const randomPassword = 'google_oauth_' + Math.random().toString(36).substr(2, 9);
      const hashedPassword = bcrypt.hashSync(randomPassword, 10);
      const stmt = db.prepare("INSERT INTO customers (name, email, password, phone) VALUES (?, ?, ?, ?)");
      stmt.run(name.trim(), cleanEmail, hashedPassword, '', function(err2) {
        if (err2) {
          return res.status(500).json({ error: "Failed to register Google user." });
        }
        sendWelcomeEmail(name.trim(), cleanEmail);
        
        const token = jwt.sign(
          { id: this.lastID, email: cleanEmail, name: name.trim() },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        res.json({
          success: true,
          name: name.trim(),
          email: cleanEmail,
          phone: '',
          token: token
        });
      });
      stmt.finalize();
    }
  });
});

// 22. Forgot Password Request
app.post('/api/customer/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email address is required." });
  }
  const cleanEmail = email.toLowerCase().trim();

  db.get("SELECT name FROM customers WHERE LOWER(email) = ?", [cleanEmail], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error checking email." });
    }
    if (!row) {
      return res.status(400).json({ error: "No account found with this email address." });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 86400000; // 24 hours

    db.run(
      "INSERT OR REPLACE INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)",
      [cleanEmail, token, expiresAt],
      (err2) => {
        if (err2) {
          return res.status(500).json({ error: "Failed to generate security token." });
        }

        // Send email using Nodemailer
        const host = req.get('host');
        const resetLink = `http://${host}/reset-password.html?token=${token}`;
        const mailOptions = {
          from: '"Manih Jewelz Support" <manihjewelz@gmail.com>',
          to: cleanEmail,
          subject: 'Password Reset Request | Manih Jewelz',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 2rem; color: #333; max-width: 600px; border: 1px solid #eee;">
              <h2 style="color: #5B0012;">Reset Your Password</h2>
              <p>Hello ${row.name},</p>
              <p>We received a request to reset your password. Click the button below to secure a new password:</p>
              <div style="margin: 2rem 0; text-align: center;">
                <a href="${resetLink}" style="background-color: #5B0012; color: #fff; padding: 0.8rem 1.5rem; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
              </div>
              <p>If you cannot click the button, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #888;">${resetLink}</p>
              <p style="font-size: 0.8rem; color: #aaa; margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem;">This link will expire in 24 hours. If you did not request a password reset, please ignore this email.</p>
            </div>
          `
        };

        if (mailTransporter) {
          mailTransporter.sendMail(mailOptions, (err3) => {
            if (err3) {
              console.error("Nodemailer reset mail error:", err3);
              return res.status(500).json({ error: "Failed to send reset email: " + err3.message });
            }
            res.json({ success: true, message: "A secure reset link has been dispatched to your email." });
          });
        } else {
          // Fallback if transporter is not setup yet (e.g. mock console log)
          console.log("Mock Email Sent: Password Reset Link is: ", resetLink);
          res.json({ success: true, message: "A reset link has been generated: " + resetLink });
        }
      }
    );
  });
});

// 23. Reset Password Submit
app.post('/api/customer/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Security token and new password are required." });
  }

  db.get("SELECT email, expires_at FROM password_resets WHERE token = ?", [token], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error verifying token." });
    }
    if (!row) {
      return res.status(400).json({ error: "This security link is invalid. If you requested a reset multiple times, please check for the newest email and click the latest link." });
    }
    if (row.expires_at < Date.now()) {
      return res.status(400).json({ error: "This security link has expired (24-hour limit). Please request a new link from the storefront." });
    }

    const email = row.email;
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run("UPDATE customers SET password = ? WHERE LOWER(email) = ?", [hashedPassword, email.toLowerCase()], (err2) => {
      if (err2) {
        return res.status(500).json({ error: "Failed to update password." });
      }
      // Delete the token
      db.run("DELETE FROM password_resets WHERE email = ?", [email], () => {});
      res.json({ success: true, message: "Your password has been successfully updated." });
    });
  });
});

// 24. Secure Customer Order History Log
app.get('/api/customer/orders', authenticateCustomer, (req, res) => {
  const customerEmail = req.user.email;
  db.all(
    "SELECT * FROM orders WHERE LOWER(customer_email) = ? ORDER BY id DESC",
    [customerEmail.toLowerCase().trim()],
    (err, ordersRows) => {
      if (err) {
        return res.status(500).json({ error: "Failed to retrieve orders." });
      }

      if (!ordersRows || ordersRows.length === 0) {
        return res.json({ orders: [] });
      }

      const orderIds = ordersRows.map(o => o.id);
      const placeholders = orderIds.map(() => "?").join(",");
      db.all(
        `SELECT oi.*, p.name AS product_name, p.images AS product_images 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id IN (${placeholders})`,
        orderIds,
        (err2, itemsRows) => {
          if (err2) {
            return res.status(500).json({ error: "Failed to retrieve order items." });
          }

          const itemsMap = {};
          (itemsRows || []).forEach(item => {
            if (!itemsMap[item.order_id]) {
              itemsMap[item.order_id] = [];
            }
            let firstImg = 'assets/logo.png';
            try {
              if (item.product_images) {
                const parsed = JSON.parse(item.product_images);
                if (Array.isArray(parsed) && parsed.length > 0) firstImg = parsed[0];
              }
            } catch (e) {}

            itemsMap[item.order_id].push({
              id: item.id,
              product_id: item.product_id,
              productName: item.product_name || 'Premium Piece',
              image: firstImg,
              quantity: item.quantity,
              metal: item.metal,
              gemstone: item.gemstone,
              price: item.price
            });
          });

          const enrichedOrders = ordersRows.map(o => ({
            ...o,
            items: itemsMap[o.id] || []
          }));

          res.json({ orders: enrichedOrders });
        }
      );
    }
  );
});

// 25. Secure Guest Track Order Status
app.post('/api/orders/track', (req, res) => {
  const { email, orderId } = req.body;
  if (!email || !orderId) {
    return res.status(400).json({ error: "Email and Order ID are required." });
  }

  db.get(
    "SELECT * FROM orders WHERE id = ? AND LOWER(customer_email) = ?",
    [parseInt(orderId, 10), email.toLowerCase().trim()],
    (err, orderRow) => {
      if (err) {
        return res.status(500).json({ error: "Failed to retrieve order." });
      }
      if (!orderRow) {
        return res.status(404).json({ error: "No matching order found." });
      }

      db.all(
        `SELECT oi.*, p.name AS product_name, p.images AS product_images 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [orderRow.id],
        (err2, itemsRows) => {
          if (err2) {
            return res.status(500).json({ error: "Failed to retrieve order details." });
          }

          const items = (itemsRows || []).map(item => {
            let firstImg = 'assets/logo.png';
            try {
              if (item.product_images) {
                const parsed = JSON.parse(item.product_images);
                if (Array.isArray(parsed) && parsed.length > 0) firstImg = parsed[0];
              }
            } catch (e) {}
            return {
              id: item.id,
              product_id: item.product_id,
              productName: item.product_name || 'Premium Piece',
              image: firstImg,
              quantity: item.quantity,
              metal: item.metal,
              gemstone: item.gemstone,
              price: item.price
            };
          });

          res.json({
            id: orderRow.id,
            status: orderRow.status,
            total_amount: orderRow.total_amount,
            shipping_address: orderRow.shipping_address,
            items: items
          });
        }
      );
    }
  );
});

// 24. Secure Customer Order History Log
app.get('/api/customer/orders', authenticateCustomer, (req, res) => {
  const customerEmail = req.user.email;
  db.all(
    "SELECT * FROM orders WHERE LOWER(customer_email) = ? ORDER BY id DESC",
    [customerEmail.toLowerCase().trim()],
    (err, ordersRows) => {
      if (err) {
        return res.status(500).json({ error: "Failed to retrieve orders." });
      }

      if (!ordersRows || ordersRows.length === 0) {
        return res.json({ orders: [] });
      }

      const orderIds = ordersRows.map(o => o.id);
      const placeholders = orderIds.map(() => "?").join(",");
      db.all(
        `SELECT oi.*, p.name AS product_name, p.images AS product_images 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id IN (${placeholders})`,
        orderIds,
        (err2, itemsRows) => {
          if (err2) {
            return res.status(500).json({ error: "Failed to retrieve order items." });
          }

          const itemsMap = {};
          (itemsRows || []).forEach(item => {
            if (!itemsMap[item.order_id]) {
              itemsMap[item.order_id] = [];
            }
            let firstImg = 'assets/logo.png';
            try {
              if (item.product_images) {
                const parsed = JSON.parse(item.product_images);
                if (Array.isArray(parsed) && parsed.length > 0) firstImg = parsed[0];
              }
            } catch (e) {}

            itemsMap[item.order_id].push({
              id: item.id,
              product_id: item.product_id,
              productName: item.product_name || 'Premium Piece',
              image: firstImg,
              quantity: item.quantity,
              metal: item.metal,
              gemstone: item.gemstone,
              price: item.price
            });
          });

          const enrichedOrders = ordersRows.map(o => ({
            ...o,
            items: itemsMap[o.id] || []
          }));

          res.json({ orders: enrichedOrders });
        }
      );
    }
  );
});

// 25. Secure Guest Track Order Status
app.post('/api/orders/track', (req, res) => {
  const { email, orderId } = req.body;
  if (!email || !orderId) {
    return res.status(400).json({ error: "Email and Order ID are required." });
  }

  db.get(
    "SELECT * FROM orders WHERE id = ? AND LOWER(customer_email) = ?",
    [parseInt(orderId, 10), email.toLowerCase().trim()],
    (err, orderRow) => {
      if (err) {
        return res.status(500).json({ error: "Failed to retrieve order." });
      }
      if (!orderRow) {
        return res.status(404).json({ error: "No matching order found." });
      }

      db.all(
        `SELECT oi.*, p.name AS product_name, p.images AS product_images 
         FROM order_items oi 
         LEFT JOIN products p ON oi.product_id = p.id 
         WHERE oi.order_id = ?`,
        [orderRow.id],
        (err2, itemsRows) => {
          if (err2) {
            return res.status(500).json({ error: "Failed to retrieve order details." });
          }

          const items = (itemsRows || []).map(item => {
            let firstImg = 'assets/logo.png';
            try {
              if (item.product_images) {
                const parsed = JSON.parse(item.product_images);
                if (Array.isArray(parsed) && parsed.length > 0) firstImg = parsed[0];
              }
            } catch (e) {}
            return {
              id: item.id,
              product_id: item.product_id,
              productName: item.product_name || 'Premium Piece',
              image: firstImg,
              quantity: item.quantity,
              metal: item.metal,
              gemstone: item.gemstone,
              price: item.price
            };
          });

          res.json({
            id: orderRow.id,
            status: orderRow.status,
            total_amount: orderRow.total_amount,
            shipping_address: orderRow.shipping_address,
            items: items
          });
        }
      );
    }
  );
});

// Health check endpoint for uptime monitors / keep-awake pings
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Manih Jewelz Backend running on http://localhost:${PORT}`);
});
