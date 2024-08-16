const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express()
const cors = require('cors')
const port = process.env.PORT || 5000;

// middleware
app.use(express.json())
app.use(cors({
  origin:["http://localhost:5173"]
}))

// connect mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ytj0kf8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const bistroDB = client.db("bistroDB")
    const menuCollection = bistroDB.collection("menuCollection")
    const cartsCollection = bistroDB.collection("cartsCollection")
    const userCollection = bistroDB.collection("userCollection")
 
    // user collection 
    try{
      app.post('/user',async(req,res)=>{
        const user = req.body;
        const result = await userCollection.insertOne(user)
        res.send(result)
      })
    }catch(err){
      console.log(err)
    }

    try{
      app.post('/carts',async(req,res)=>{
        const item = req.body;
        const result = await cartsCollection.insertOne(item);
        res.send(result)
      })
    }catch(err){
      console.log(err)
    }
    try{
      app.get("/getCarts",async(req,res)=>{
        const email = req.query.email;
        let query ={}
        if(req.query.email){
           query = {customerEmail: email}
        }
        const result = await cartsCollection.find(query).toArray()
        res.send(result)
      })
    }catch(err){
      console.log(err)
    }

   try{
    app.delete('/deleteCart/:id',async(req,res)=>{
      const id = req.params.id;
      console.log(id)
      const query= {_id: new ObjectId(id)}
      const result = await cartsCollection.deleteOne(query)
      res.send(result)
    })
   }catch(err){
    console.log(err)
   }

    // get menu items 
    try{
        app.get("/menu",async(req,res)=>{
            const result = await menuCollection.find().toArray()
            res.send(result);
           })
    }catch(err){
        console.log(err)
    }
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})   




/**
 * Naming convention
 * app.get('/user')
 * app.get("/user")
 */