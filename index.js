import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import admin from "firebase-admin";
import fs from "fs";
import multer from "multer";
import axios from "axios"; // ✅ import axios
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const upload = multer();

// Firebase Admin Initialization
const serviceAccountPath = new URL('./virtual-bookshelf-admin.json', import.meta.url);
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dvaruep.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Firebase Token Middleware
const verifyFBToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

async function run() {
  try {
    await client.connect();
    const booksCollection = client.db("virtualbook").collection("books");
    const usersCollection = client.db("virtualbook").collection("user"); // ✅ corrected name

    // Create User
    app.post("/user", async (req, res) => {
      try {
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.status(201).send({
          message: "User created",
          user: { _id: result.insertedId, ...user },
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Failed to create user" });
      }
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

    // PATCH /books/:bookId
app.patch("/books/:bookId", async (req, res) => {
  const { bookId } = req.params;
  const { reading_status } = req.body;

  try {
    // MongoDB collection থেকে খুঁজে update করা
    const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) return res.status(404).json({ message: "Book not found in DB" });

    const updatedBook = await booksCollection.findOneAndUpdate(
      { _id: new ObjectId(bookId) },
      { $set: { reading_status } },
      { returnDocument: "after" } // update হওয়া document ফেরত দিবে
    );

    res.json(updatedBook.value);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
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

app.post("/books/:id/upvote", async (req, res) => {
  const { id } = req.params;
  const { user_email } = req.body;

  try {
    const book = await booksCollection.findOne({ _id: new ObjectId(id) });

    if (!book) return res.status(404).send({ message: "Book not found" });

    const bookOwnerEmail = book.user_email || book.user?.email; // safety
    if (!bookOwnerEmail)
      return res.status(400).send({ message: "Book owner info missing" });

    if (bookOwnerEmail === user_email)
      return res.status(400).send({ message: "You cannot upvote your own book" });

    const result = await booksCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $inc: { upvote: 1 } },
      { returnDocument: "after" }
    );

    res.send({ success: true, upvote: result.value.upvote });
  } catch (err) {
    console.error("Upvote error:", err);
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
