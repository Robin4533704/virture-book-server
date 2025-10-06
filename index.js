import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";




dotenv.config();
const app = express();
const port = process.env.PORT || 3000;


// Path fix for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, "virtual-bookshelf-admin.json"), "utf-8")
);
// Firebase init
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "virtual-bookshelf-9cce9.appspot.com"
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://virtual-bookshop-server-assainment1.vercel.app",
      "https://guileless-klepon-50bfea.netlify.app"
    ],
    credentials: true,
  })
);

const bucket = admin.storage().bucket(); 

app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dvaruep.mongodb.net/virtualbook_Addmin?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



// ✅ Helper: Always get collections safely
async function getCollections() {
  if (!client.topology?.isConnected()) {
    await client.connect();
    console.log("MongoDB connected ✅");
  }
  const db = client.db(process.env.DB_NAME || "virtualbook");
  return {
    booksCollection: db.collection("books"),
    usersCollection: db.collection("user"),
    categoriesCollection: db.collection("categories"),
  };
}


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


app.get('/user', async (req, res) =>{
 try{
   const { usersCollection } = await getCollections();
  const user = await usersCollection.find().toArray();
  res.json(user)
 }catch (err) {
    console.error("Error fetching books:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
})

app.post("/user", async (req, res) => {
  try {
    const { email, displayName, role } = req.body;

    if (!email || !displayName) {
      return res.status(400).send({ message: "Email and name are required" });
    }

    // Check duplicate
      const { usersCollection } = await getCollections();
    const existing = await usersCollection.findOne({ email });
    if (existing) {
      return res.status(409).send({ message: "User already exists" });
    }

    const user = {
      email,
      displayName,
      role: role || "user",
      photoURL: "",
      created_at: new Date(),
      last_log_in: new Date(),
    };

    const result = await usersCollection.insertOne(user);
    res.status(201).send({
      message: "User created",
      user: { _id: result.insertedId, ...user },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create user" });
  }
} );

  
// ✅ PUBLIC route - no auth
app.get("/books", async (req, res) => {
  try {
    const { booksCollection } = await getCollections();
    const { category } = req.query;

    let query = {};
    if (category) {
      query.book_category = category;
    }

    const books = await booksCollection.find(query).toArray();
    res.send(books);
  } catch (err) {
    console.error("Error fetching books:", err);
    res.status(500).send({ error: "Internal Server Error" });
  }
});
app.post("/books", verifyFBToken, async (req, res) => {
  console.log("Decoded user:", req.user); // ✅ user check
  const bookData = req.body;
  bookData.user_email = req.user.email;
  bookData.upvote = 0;
  bookData.createdAt = new Date();
  const { booksCollection } = await getCollections();
  const result = await booksCollection.insertOne(bookData);
  res.status(201).send({
    message: "Book created",
    book: { _id: result.insertedId, ...bookData },
  });
});

   app.get("/books/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // ID valid কিনা চেক করো
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid book ID" });
    }

    const { booksCollection } = await getCollections();
    const book = await booksCollection.findOne({ _id: new ObjectId(id) });

    if (!book) {
      return res.status(404).json({ error: "Book not found" });
    }

    res.json(book);
  } catch (err) {
    console.error("Error fetching book:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const { booksCollection } = await getCollections();
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
    
    const { booksCollection } = await getCollections();
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

// Top Popular Books (by upvote)
app.get("/books/popular", async (req, res) => {
  const { booksCollection } = await getCollections();

  // সর্বোচ্চ upvote এর বইগুলো আনবে
  const popularBooks = await booksCollection
    .find()
    .sort({ upvotes: -1 }) // upvotes descending order
    .limit(9) // 6-9 টা বই নিতে পারবেন
    .toArray();

  res.send(popularBooks);
});



    app.put("/books/:id", async (req, res) => {
      const id = req.params.id;
      const { _id, ...updateData } = req.body;
      try {
        const { booksCollection } = await getCollections();
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


 // Reviews
  
 app.get("/books/:id/reviews", async (req, res) => {
      const id = req.params.id;
      const { booksCollection } = await getCollections();
      const book = await booksCollection.findOne({ _id: new ObjectId(id) });
      if (!book) return res.status(404).send({ message: "Book not found" });
      res.send(book.reviews || []);
    });
app.post("/books/:id/reviews", async (req, res) => {
  const id = req.params.id;
  const { user_name, user_email, review } = req.body;

  const { booksCollection } = await getCollections();
  const book = await booksCollection.findOne({ _id: new ObjectId(id) });
  if (!book) return res.status(404).send({ message: "Book not found" });

  let reviews = book.reviews || [];

  // পুরোনো reviews-এ যদি createdAt না থাকে, add করা
  reviews = reviews.map(r => ({
    ...r,
    createdAt: r.createdAt ? r.createdAt : new Date()
  }));

  const existingIndex = reviews.findIndex((r) => r.user_email === user_email);
  if (existingIndex > -1) {
    reviews[existingIndex].review = review;
    reviews[existingIndex].createdAt = new Date(); // আপডেট হলে নতুন date
  } else {
    reviews.push({ 
      _id: new ObjectId(),
      user_name, 
      user_email, 
      review, 
      createdAt: new Date() 
    });
  }

  await booksCollection.updateOne({ _id: new ObjectId(id) }, { $set: { reviews } });
  res.send(reviews);
});

    app.delete("/books/:bookId/reviews/:reviewId", async (req, res) => {
      const { bookId, reviewId } = req.params;

      const { booksCollection } = await getCollections();
      const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
      if (!book) return res.status(404).send({ message: "Book not found" });

      const reviews = (book.reviews || []).filter((r) => r._id.toString() !== reviewId);
      await booksCollection.updateOne({ _id: new ObjectId(bookId) }, { $set: { reviews } });
      res.send(reviews);
    });


app.post("/profile", verifyFBToken, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).send("Unauthorized");

  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
 
  } catch (err) {
    return res.status(401).send("Unauthorized");
  }
});

// GET /categories - সব ক্যাটাগরি
app.get("/categories", async (req, res) => {
  try {
    const { categoriesCollection } = await getCollections();
    const categories = await categoriesCollection.find({}).toArray();
    res.send(categories);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).send({ error: "Internal Server Error" });
  }
});

// POST /categories - নতুন category add
app.post("/categories", verifyFBToken, async (req, res) => {
  try {
    const categoryData = req.body; // { name: "Fiction" }
    const { categoriesCollection } = await getCollections();
    const result = await categoriesCollection.insertOne(categoryData);
    res.status(201).send({
      success: true,
      category: { _id: result.insertedId, ...categoryData },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to create category" });
  }
});
// Root route
app.get("/", (req, res) => {
  res.send("ping your Virtual Bookshop API is running 📚");
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port} 🚀`);
});
