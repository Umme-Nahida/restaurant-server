const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express()
const cors = require('cors')
const stripe = require('stripe')('sk_test_51OZHgME5jTTsl0NgK4jroDpZyHxSvMHxzDsdVDozHIIPyHAwHRSKY2f8Xb1dtWSY1zy5lGZ1UhbPNhod2CYbJURE003eOg8yhY')
const port = process.env.PORT || 5000;

// middleware
app.use(express.json())
app.use(cors({
  origin: ["http://localhost:5173","https://peppy-valkyrie-6c037b.netlify.app","https://restaurant-client-rust.vercel.app"]
}))

const varifyToken = (req, res, next) => {
  // console.log(req.headers.authorization)
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "forbidden access" })
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.secret, (err, decode) => {
    if (err) {
      return res.status(403).send({ message: "unAuthorized access" })
    }
    // console.log("tokenErr:",err)
    req.validUser = decode;
    req.tokenErr = err;
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
    const bookingCollection = bistroDB.collection("bookingCollection")
    const reviewCollection = bistroDB.collection("reviewCollection")


    // varify admin 

    const varifyAdmin = async (req, res, next) => {
      console.log("validUser", req.validUser)
      // console.log("errToken:",req.tokenErr)
      const email = req.validUser.email;
      const query = { userEmail: email }
      const user = await userCollection.findOne(query)
      const isAdmin = user?.role === "admin"
      if (!isAdmin) {
        return res.status(403).send({ message: "anAuthorized access" })
      }
      next()

    }

    // logout functionalitly
    app.get('/logoutUser/:email', async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email }
      const user = await userCollection.findOne(query)
      const isErr = req.tokenErr;
      if (isErr) {
        return res.send({ user: "false" })
      }
      return res.send(user)

    })

    // create jwt 
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.Secret, { expiresIn: '365d' })
      res.send({ token })
    })

    try {
      app.post('/create-payment-intent', async (req, res) => {
        const { price } = req.body;
        // console.log(price)
        const amount = parseInt(price * 100)
        // console.log('this amoun',amount)

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ['card']
        })

        res.send({
          clientSecret: paymentIntent.client_secret,
        })
      })
    } catch (err) {
      console.log(err)
    }

    // save payment 
    try {
      app.post('/payment', async (req, res) => {
        const payment = req.body;
        const paymentResult = await paymentCollection.insertOne(payment)

        console.log('payment', payment)
        // delete cart payment
        const query = {
          _id: {
            $in: payment.menuId.map(id => (id)) // Ensure ObjectId is instantiated properly
          }
        };

        const deleteResult = await cartsCollection.deleteMany(query)
        res.send({ paymentResult, deleteResult })
      })
    } catch (err) {
      console.log(err)
    }


    // get payment all data
    app.get('/getAllPayment', async (req, res) => {
      const result = await paymentCollection.find().toArray()
      res.send(result)
    })


    //  get user State
    try {
      app.get('/userStats/:email', async (req, res) => {
        const email = req.params.email
        const totalOrder = await paymentCollection.countDocuments({ email: email })
        const review = await reviewCollection.countDocuments({ email: email })
        const booking = await bookingCollection.countDocuments({ email: email })
        res.send({ totalOrder, review, booking })
      })
    } catch (err) {
      console.log(err)
    }

    // get admin stats
    try {
      app.get('/adminStats', async (req, res) => {
        try {
          // Aggregation queries
          const users = await userCollection.countDocuments();
          const products = await menuCollection.countDocuments();
          const orders = await paymentCollection.countDocuments();

          const salesStats = await paymentCollection.aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$price" },
                totalSales: { $sum: 1 },
              },
            },
          ]).toArray();

          const totalRevenue = salesStats[0]?.totalRevenue || 0;
          const revenueInt = totalRevenue.toFixed(2);
          const totalSales = salesStats[0].totalSales || 0;


          res.send({ users, products, orders, totalSales, revenueInt });
        } catch (err) {
          console.error("Error fetching admin stats:", err);
          res.status(500).send({ error: "Internal Server Error" });
        }
      });
    } catch (err) {
      console.error("Error in route setup:", err);
    }


    // user is exite or not exite api 
    try {
      app.post('/user', async (req, res) => {
        // console.log(req.headers)
        const user = req.body;
        // console.log(user)
        const query = { userEmail: user?.userEmail }
        const exitingUser = await userCollection.findOne(query)
        if (exitingUser) {
          return res.send({ message: "user already exite" })
        }
        const result = await userCollection.insertOne(user)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }




    // get user role 
    try {
      app.get('/getUserRole/:email', async (req, res) => {
        const email = req.params.email;
        const query = { userEmail: email }
        const result = await userCollection.findOne(query)
        res.send(result)
      })
    } catch (error) {
      console.log(error)
    }

    //check is isAdmin or not 
    app.get('/user/isAdmin/:email', varifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email }
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin'
      if (isAdmin) {
        return res.send({ user })
      }
      return res.send({ admin: "false" })
    })

    //  user updated api 
    app.patch('/user/admin/:id', varifyToken, varifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin"
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })

    // delete user api
    try {
      app.delete('/userDelete/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await userCollection.deleteOne(query);
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // get all users
    try {
      app.get("/allusers",  async (req, res) => {
        // console.log("validUser",req.validUser)
        console.log("errToken", req.tokenErr)
        const result = await userCollection.find().toArray()
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // save cart item to the db
    try {
      app.post('/carts', async (req, res) => {
        const item = req.body;
        const result = await cartsCollection.insertOne(item);
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }
    try {
      app.get("/getCarts", async (req, res) => {
        const email = req.query.email;
        let query = {}
        if (req.query.email) {
          query = { customerEmail: email }
        }
        const result = await cartsCollection.find(query).toArray()
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // delete cart from shop page 
    try {
      app.delete('/deleteCart/:id', async (req, res) => {
        const id = req.params.id;
        console.log(id)
        const query = { _id: new ObjectId(id) }
        const result = await cartsCollection.deleteOne(query)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // get menu items 
    try {
      app.get("/menu", async (req, res) => {
        const result = await menuCollection.find().toArray()
        res.send(result);
      })
    } catch (err) {
      console.log(err)
    }

    // get one product for update
    try {
      app.get('/getUpdateItem/:id', async (req, res) => {
        const id = req.params.id;
        console.log(id)
        const query = { _id: (id) }
        const result = await menuCollection.findOne(query)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    try {
      app.put('/updateProduct/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id:(id)};
        const item = req.body;
        // console.log(item)
        const options = { upsert: true };
        const updateProduct = {
          $set: {
            name: item.name,
            recipe: item.recipe,
            image: item.image,
            category: item.category,
            price: item.price
          }
        }

        const result = await menuCollection.updateOne(query,updateProduct,options)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // post food item in mongodb
    try {
      app.post("/menuAdd", varifyToken, varifyAdmin, async (req, res) => {
        const item = req.body;
        const result = await menuCollection.insertOne(item)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }

    // deleted menu item
    try {
      app.delete('/deleteMenu/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await menuCollection.deleteOne(query)
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }




    //booking api added here 
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      console.log(booking)

      const result = await bookingCollection.insertOne(booking)
      res.send(result)
    })


    // get all booking 
    app.get('/getBooking', async (req, res) => {
      const result = await bookingCollection.find().toArray()
      res.send(result)
    })

    // get all bookings for spacific user
    app.get('/userBookings/:email', async (req, res) => {
      const email = req.params.email;
      console.log(email)
      const query = { email: email }
      const result = await bookingCollection.find(query).toArray()
      res.send(result)
    })

    // update booking status by admin
    try {
      app.patch('/updateStatus/:id', async (req, res) => {
        const id = req.params.id;
        const status = req.body;
        const query = { _id: new ObjectId(id) }
        const option = { upsert: true }
        const updateDoc = {
          $set: {
            status: status.status
          }
        }

        const result = await bookingCollection.updateOne(query, updateDoc, option)
        res.send(result)

      })
    } catch (err) {
      console.log(err)
    }


    // create all api for review 
    try {
      app.post('/addReview', async (req, res) => {
        const review = req.body;
        const result = await reviewCollection.insertOne(review)
        res.send(result)
      })

    } catch (err) {
      console.log(err)
    }

    // get all review in mongodb
    try {
      app.get('/getAllReview', async (req, res) => {
        const result = await reviewCollection.find().toArray();
        res.send(result)
      })
    } catch (err) {
      console.log(err)
    }


    //get my all review from mongodb
    try {
      app.get('/myReview', async (req, res) => {
        const email = req.params.email;
        const query = { email: email }
        const result = await reviewCollection.find(query).toArray()
        res.send(result)
      })
    } catch (err) {
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