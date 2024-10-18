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

app.get('/catalogs', db.getProductsWithCatalog)
app.get('/all-categories', db.getCategories)
app.listen(port, () => {
    console.log(`App running on port ${port}.`)
})

//V1 Берем 1 категорию по title и собираем с нее готовый объект для экспорта
//ROUTE => "/catalogs" QUERY => ?title=***

//V2 Все категории разом обрабатываются и возвращается массив объектов
//ROUTE => "/all-categories"