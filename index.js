const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express()
const cors = require('cors')
const stripe = require('stripe')(process.env.paymentsk)
const port = process.env.PORT || 5000;

// middleware
app.use(express.json())
app.use(cors({
  origin:["http://localhost:5173"]
}))

const varifyToken=(req,res,next)=>{
  // console.log(req.headers.authorization)
  if(!req.headers.authorization){
    return res.status(401).send({message:"forbidden access"})
  }
  const token=req.headers.authorization.split(' ')[1];
  jwt.verify(token,process.env.secret,(err,decode)=>{
    if(err){
      return res.status(403).send({message:"unAuthorized access"})
    }
    // console.log("tokenErr:",err)
    req.validUser = decode;
    req.tokenErr=err;
    next()
  })


}
// console.log('Stripe Secret Key:', process.env.paymentsk);

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
    const paymentCollection = bistroDB.collection("paymentCollection")
 

    // varify admin 
   
      const varifyAdmin= async(req,res,next)=>{
        console.log("validUser",req.validUser)
        // console.log("errToken:",req.tokenErr)
        const email = req.validUser.email;
        const query = {userEmail: email}
        const user = await userCollection.findOne(query)
        const isAdmin = user.role === "admin"
        if(!isAdmin){
          return res.status(403).send({message: "anAuthorized access"})
        }
        next()

      }
  
      // logout functionalitly
      app.get('/logoutUser/:email',async(req,res)=>{
        const email = req.params.email;
        const query = {userEmail:email}
        const user = await userCollection.findOne(query)
        const isErr = req.tokenErr;
        if(isErr){
          return res.send({user:"false"})
        }
        return res.send(user)
        
      })

    // create jwt 
    app.post('/jwt',async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user,process.env.Secret,{expiresIn:'365d'})
      res.send({token})
    })

    try{
     app.post('/create-payment-intent',async(req,res)=>{
      const {price} = req.body;
      console.log(price)
      const amount = parseInt(price * 100)
      console.log('this amoun',amount)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types:['card']
      })

    res.send({
      clientSecret: paymentIntent.client_secret,
    })
     })
    }catch(err){
      console.log(err)
    }

    // save payment 
    try{
     app.post('/payment',async(req,res)=>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment)

      console.log('payment',payment)
      // delete cart payment
      const query = {_id: {
          $in: payment.menuId.map(id => (id)) // Ensure ObjectId is instantiated properly
        }
      };
      
      const deleteResult = await cartsCollection.deleteMany(query)
      res.send({paymentResult,deleteResult})
     })
    }catch(err){
      console.log(err)
    }


    // get payment all data
    

    // user is exite or not exite api 
    try{
      app.post('/user',async(req,res)=>{
        console.log(req.headers)
        const user = req.body;
        // console.log(user)
        const query = {userEmail: user?.userEmail}
        const exitingUser = await userCollection.findOne(query)
        if(exitingUser){
          return res.send({message:"user already exite"})
        }
        const result = await userCollection.insertOne(user)
        res.send(result)
      })
    }catch(err){
      console.log(err)
    }

  // get user role 
  try{
    app.get('/getUserRole/:email',async(req,res)=>{
        const email = req.params.email;
        const query = {userEmail: email}
        const result = await userCollection.findOne(query)
        res.send(result)
    })
  }catch(err){
    console.log(err)
  }

    //check is isAdmin or not 
    app.get('/user/isAdmin/:email',varifyToken,varifyAdmin,async(req,res)=>{
      const email = req.params.email;
      const query = {userEmail:email}
      const user = await userCollection.findOne(query);
      const isAdmin = user.role === 'admin'
      if(isAdmin){
        return res.send({user})
      }
      return res.send({admin:"false"})
    })

  //  user updated api 
  app.patch('/user/admin/:id',varifyToken,varifyAdmin, async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        role:"admin"
      },
    };
    const result = await userCollection.updateOne(query,updateDoc,options)
    res.send(result)
  })

    // delete user api
   try{
    app.delete('/userDelete/:id',async(req,res)=>{
      const id = req.params.id;
      const query= {_id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query);
      res.send(result)
    })
   }catch(err){
    console.log(err)
   }

    // get all users
    try{
      app.get("/allusers",varifyToken, async(req,res)=>{
        // console.log("validUser",req.validUser)
        console.log("errToken",req.tokenErr)
         const result = await userCollection.find().toArray()
         res.send(result)
      })
    }catch(err){
      console.log(err)
    }

    // save cart item to the db
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

    // delete cart from shop page 
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
        app.get("/menu", async(req,res)=>{
            const result = await menuCollection.find().toArray()
            res.send(result);
           })
    }catch(err){
        console.log(err)
    }

    // post food item in mongodb
    try{
      app.post("/menuAdd",varifyToken,varifyAdmin, async(req,res)=>{
        const item = req.body;
        const result = await menuCollection.insertOne(item)
        res.send(result)
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