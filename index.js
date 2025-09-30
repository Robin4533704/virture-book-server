import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import admin from "firebase-admin";
import fs from "fs";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Firebase Service Account
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH;
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dvaruep.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Firebase Token Middleware
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // decodedToken.uid, email ইত্যাদি পাওয়া যায়
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Main Function
async function run() {
  try {
    await client.connect();
    const booksCollection = client.db("virtualbook").collection("books");

    // Routes
    app.post("/users", async (req, res) => {
      const user = req.body;
      res.status(201).send({ message: "User created", user });
    });

    app.get("/books", async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    app.post("/books", verifyFBToken, async (req, res) => {
      const bookData = req.body;
      try {
        const result = await booksCollection.insertOne(bookData);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    app.get("/books/:id", async (req, res) => {
      const id = req.params.id;
      const result = await booksCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Book deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Book not found" });
        }
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.put("/books/:id", async (req, res) => {
      const id = req.params.id;
      const { _id, ...updateData } = req.body;
      try {
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Book not found" });
        }
        res.json({ message: "Book updated successfully", result });
      } catch (err) {
        res.status(500).json({ error: "Failed to update book" });
      }
    });

    // Upvote
    app.post("/books/:id/upvote", async (req, res) => {
      const id = req.params.id;
      const { user_email } = req.body;

      try {
        const book = await booksCollection.findOne({ _id: new ObjectId(id) });
        if (!book) return res.status(404).send({ message: "Book not found" });

        if (book.user_email === user_email)
          return res.status(400).send({ message: "You cannot upvote your own book" });

        await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { upvote: 1 } }
        );

        res.send({ success: true, upvote: (book.upvote || 0) + 1 });
      } catch (err) {
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    // Reviews
    app.get("/books/:id/reviews", async (req, res) => {
      const id = req.params.id;
      const book = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!book) return res.status(404).send({ message: "Book not found" });
      res.send(book.reviews || []);
    });

    app.post("/books/:id/reviews", async (req, res) => {
      const id = req.params.id;
      const { user_name, user_email, review } = req.body;
      const book = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!book) return res.status(404).send({ message: "Book not found" });

      const reviews = book.reviews || [];
      const existingIndex = reviews.findIndex((r) => r.user_email === user_email);
      if (existingIndex > -1) {
        reviews[existingIndex].review = review;
      } else {
        reviews.push({ user_name, user_email, review, _id: new ObjectId() });
      }

      await booksCollection.updateOne({ _id: new ObjectId(id) }, { $set: { reviews } });
      res.send(reviews);
    });

    app.delete("/books/:bookId/reviews/:reviewId", async (req, res) => {
      const { bookId, reviewId } = req.params;
      const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
      if (!book) return res.status(404).send({ message: "Book not found" });

      const reviews = (book.reviews || []).filter((r) => r._id.toString() !== reviewId);
      await booksCollection.updateOne({ _id: new ObjectId(bookId) }, { $set: { reviews } });
      res.send(reviews);
    });

    console.log("MongoDB connected successfully ✅");
  } catch (err) {
    console.error("MongoDB connection error ❌", err);
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("Virtual Bookshop API is running 📚");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port} 🚀`);
});
