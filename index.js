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
app.get('/', (request, response) => {
    response.json({ info: 'Node.js, Express, and Postgres API' })
})

app.get('/move-to-pim', db.moveToPim)
app.get('/all-categories', db.getCategories)
app.get('/categories-for-move', db.getCategoriesToPim)
app.get('/errors-from-move', db.getErrorsFromMove)
app.get('/in-complete', db.getInComplete)
app.listen(port, () => {
    console.log(`App running on port ${port}.`)
})