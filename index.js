const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3000;

// middlewares
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

// Main function
async function run() {
  try {
    await client.connect();
    const booksCollection = client.db("virtualbook").collection("books");

    // ✅ Get all books
  
 app.get('/books', async (req, res) => {
      const cursor = booksCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

// ✅ Get a single book by ID
    app.get('/books/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    // ✅ Delete a book by ID
app.delete('/books/:id', async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  try {
    const result = await booksCollection.deleteOne(query);
    if (result.deletedCount === 1) {
      res.send({ success: true, message: '✅ Book deleted successfully' });
    } else {
      res.status(404).send({ success: false, message: '❌ Book not found' });
    }
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).send({ success: false, message: '❌ Server error while deleting' });
  }
});

    // ✅ Get books by user email
    app.get('/my-books', async (req, res) => {
      const email = req.query.email;
      const result = await booksCollection.find({ user_email: email }).toArray();
      res.send(result);
    });
// ⚠️ Optional: comment out after first run
    const existing = await booksCollection.countDocuments();
    if (existing === 0) {
      await booksCollection.insertMany(seedData);
      console.log('📚 Initial books inserted');
    }

    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
  }
}

run().catch(console.dir);

// Root route
app.get('/', (req, res) => {
  res.send('📚 Virtual Bookshop API is running!');
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
