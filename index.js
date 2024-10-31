const express = require('express')
const bodyParser = require('body-parser')
const db = require('./db')
const app = express()
const port = 3000

app.use(bodyParser.json())
app.use(
    bodyParser.urlencoded({
        extended: true,
    })
)

app.get('/move-to-pim', db.moveToPim)
app.get('/categories-for-move', db.getCategoriesToPim)
app.get('/errors', db.getErrors)
app.get('/in-complete', db.getInComplete)
app.get('/fill-cat-titles', db.fillAllCategoryTitles)
app.get('/get-cat-titles', db.getAllCategoryTitles)
app.get('/create-one', db.createOneCategoryWithProduct)
app.get('/reset-objects', db.resetObjects)
app.listen(port, () => {
    console.log(`App running on port ${port}.`)
})