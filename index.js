// index.js
// Project
// Revision history
// Sreehari Prathap, Section 6, 2023.11.24: Created

const express = require("express")
const path = require("path")
const fileUpload = require("express-fileupload")
const mongoose = require("mongoose")
const { check, validationResult } = require("express-validator")

const app = express()
const PORT = 3333

mongoose.connect("mongodb://localhost:27017/fruitsdb", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

const itemSchema = new mongoose.Schema({
  itemName: String,
  itemQuantity: Number,
  itemUnitPrice: Number,
  itemTotalPrice: Number,
})

const orderSchema = new mongoose.Schema({
  name: String,
  phone: String,
  subTotal: Number,
  salesTax: Number,
  total: Number,
  items: [itemSchema],
})

const Order = mongoose.model("Order", orderSchema)

const products = [
  { id: 1, name: "Mango Juice", price: 2.99, quantity: 0 },
  { id: 2, name: "Berry Juice", price: 1.99, quantity: 0 },
  { id: 3, name: "Apple Juices", price: 2.49, quantity: 0 },
]

let selectedProducts = []

const User = mongoose.model("User", {
  email: String,
  password: String,
})
app.use(express.urlencoded({ extended: false }))

app.set("views", path.join(__dirname, "views"))
app.use(express.static(path.join(__dirname, "public")))
app.set("view engine", "ejs")

app.get("/", async (req, res) => {
  res.render("home")
  await createAdminUser()
})

async function createAdminUser() {
  const existingUser = await User.findOne({ email: "admin@fruitbae.com" })
  if (existingUser) {
    console.log("Admin user already exists.")
    return
  }

  const adminUser = new User({
    email: "admin@fruitbae.com",
    password: "password",
  })

  await adminUser.save()
}

app.get("/order", (req, res) => {
  res.render("form", { products, formErrors: {} })
})

// Validate and process the form
app.post(
  "/process",
  [
    check("name", "Name is required").notEmpty(),
    check("phone", "Invalid phone number").matches(/^\d{3}-\d{3}-\d{4}$/),
  ],
  async (req, res) => {
    // Validate quantities
    const quantities = {}
    let isValid = true
    let subTotal = 0

    products.forEach((product) => {
      const quantity = Number(req.body[`quantity_${product.id}`])

      if (isNaN(quantity) || quantity < 0) {
        isValid = false
        quantities[`quantity_${product.id}`] = "Invalid quantity"
      } else {
        quantities[`quantity_${product.id}`] = ""
      }
    })

    // Calculate total price and update selectedProducts
    let selectedProducts = []

    for (const productId in req.body) {
      if (productId.startsWith("quantity_")) {
        const quantity = parseInt(req.body[productId], 10)
        const productIdNumber = parseInt(productId.replace("quantity_", ""), 10)

        const product = products.find((p) => p.id === productIdNumber)

        if (product && !isNaN(quantity) && quantity >= 0) {
          subTotal += quantity * product.price
          product.quantity = quantity
          selectedProducts.push(product)
        }
      }
    }

    const errors = validationResult(req)

    if (
      !(selectedProducts, selectedProducts.some((item) => item.quantity > 0)) ||
      !errors.isEmpty()
    ) {
      // Extracting errors for form fields
      let formErrors = {}
      errors.array().forEach((error) => {
        formErrors[error.param] = error.msg
      })
      quantities.totalError = "Please select atleast one product"
      formErrors = { ...formErrors, ...quantities }
      res.render("form", { products, formErrors })
    } else {
      // Fetch all the form fields
      const { name, phone } = req.body

      // Calculate sales tax based on province (replace with your logic)
      const salesTax = 0.13
      const taxAmount = subTotal * salesTax

      // Generate receipt
      const receipt = {
        name,
        phone,
        products: selectedProducts,
        subTotal,
        taxAmount,
        total: subTotal + taxAmount,
      }

      // Save the receipt data as an Order in MongoDB
      const order = new Order({
        name,
        phone,
        subTotal,
        taxAmount,
        total: subTotal + taxAmount,
        items: selectedProducts.map((product) => ({
          itemName: product.name,
          itemQuantity: product.quantity,
          itemUnitPrice: product.price,
          itemTotalPrice: product.quantity * product.price,
        })),
      })

      try {
        await order.save()
      } catch (error) {
        console.error("Error saving order:", error)
      }

      // Render the receipt
      res.render("receipt", { receipt })
    }
  }
)
app.get("/admin", async (req, res) => {
  try {
    const orders = await Order.find()
    res.render("admin", { orders })
  } catch (error) {
    console.error("Error fetching all orders:", error)
    res.status(500).send("Internal Server Error")
  }
})

app.get("/login", (req, res) => {
  res.render("login", { loginFormErrors: {} })
})

// Validate and process the login form
app.post(
  "/validate",
  [
    check("email")
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Please enter a valid email"),
    check("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      const loginFormErrors = errors.array().reduce((acc, error) => {
        acc[error.param] = error.msg
        return acc
      }, {})
      res.render("login", { loginFormErrors })
    } else {
      const { email, password } = req.body

      try {
        const user = await User.findOne({ email })
        if (!user || user.password !== password) {
          return res.render("login", {
            loginFormErrors: {
              password: "User not found or incorrect password",
            },
            pages,
          })
        }

        // Successful login, redirect to admin page
        const pages = await Page.find()
        res.render("admin", { pages })
      } catch (err) {
        console.error(err)
        res.status(500).send("Internal Server Error")
      }
    }
  }
)

app.get("/delete/:id", async (req, res) => {
  try {
    const orderId = req.params.id
    const order = await Order.findById(orderId)

    if (!order) {
      return res.status(404).send("Order not found")
    }

    await Order.findByIdAndDelete(orderId)
    res.redirect("/admin")
  } catch (err) {
    console.error(err)
    res.status(500).send("Internal Server Error")
  }
})

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`)
})
