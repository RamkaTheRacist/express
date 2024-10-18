const Pool = require('pg').Pool
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: '123',
    port: 5432,
})

//V1 Берем 1 категорию по title и собираем с нее готовый объект для экспорта
const getProductsWithCatalog = (request, response) => {
    const title = request.query.title
    pool.query(
        `     
WITH RECURSIVE catalogs AS (
  SELECT 
    id, 
    title, 
    parent_id 
  FROM 
    public.categories 
  WHERE 
    title like $1
  UNION 
  SELECT 
    cat.id, 
    cat.title, 
    cat.parent_id 
  FROM 
    categories cat 
    INNER JOIN catalogs cats ON cats.parent_id = cat.id
) 
SELECT * FROM catalogs;     
        `,
        [title],
        (error, results) => {
            if (error) {
                response.status(501).json(error);
                return;
            }
            const catalogTree = createCatalogTree(results.rows)
            getProducts(title, catalogTree, response);
        })
}

const createCatalogTree = (catalogs) => {
    let result = {}
    for (let i = 0; i < catalogs.length; i++) {
        if (i === 0) {
            result = {
                title: catalogs[i].title
            };
        } else {
            result = {
                title: catalogs[i].title,
                children: result
            }
        }
    }
    return result;
}

const getProducts = (catalogTitle, catalogTree, response) => {
    const result = [];
    pool.query(
        `SELECT 
        id,
        brand,
        title,
        desc_base,
        art_prod,
        images_array,
        images_resize,
        tech_params,
        packaging_size,
        filters,
        barcode,
        quantity,
        sellers_info
        FROM public.products 
        WHERE category LIKE $1`,
        [catalogTitle],
        (error, results) => {
            if (error) {
                response.status(501).json(error);
                return;
            }
            const errors = []
            for (const product of results.rows) {
                try {
                    result.push(createProductObject(product))
                } catch (err) {
                    errors.push(err.stack)
                }

            }
            response.status(200).json({
                catalog: catalogTree,
                products: result,
                errors
            })
        })
}

const createProductObject = (product) => {
    const newProduct = {
        chars: []
    }
    for (const property of Object.keys(product)) {
        const charObject = {
            title: property,
            value: product[property]
        }
        if (property == 'id') {
            charObject.title = 'Внутренний артикул';
        }
        if (property == 'brand') {
            charObject.title = 'Бренд';
        }
        if (property == 'title') {
            charObject.title = 'Название продукта';
        }
        if (property == 'desc_base') {
            charObject.title = 'Описание';
        }
        if (property == 'art_prod') {
            charObject.title = 'Артикул производителя';
        }
        if (property == 'barcode') {
            charObject.title = 'ШтрихКод';
        }
        if (property == 'quantity') {
            charObject.title = 'Количество';
        }
        if (property == 'sellers_info') {
            charObject.title = 'Производитель';
            charObject.value = product[property]['seller']
        }
        if (property == 'images_array') {
            charObject.title = 'Картинки детализированные';
            charObject.value = getImageArray(product[property]);
        }
        if (property == 'images_resize') {
            charObject.title = 'Картинки превью';
            charObject.value = ['https://www.barneo.ru' + product[property]['preview']]
        }
        if (property == 'tech_params' || property == 'filters' || property == 'packaging_size') {
            fillCharacteristics(product[property], newProduct.chars);
            continue;
        }
        newProduct.chars.push(charObject)
    }
    const index = newProduct.chars.findIndex((el) => el.title == 'Вес');
    if (index !== -1) {
        newProduct.chars[index].value = newProduct.chars[index].value.split(' ')[0]
    }
    return newProduct;
}

const getImageArray = (array) => {
    return array.map((el) => el = 'https://www.barneo.ru' + el.replace(/\s/g, ''));
}

const fillCharacteristics = (value, chars) => {
    for (const key of Object.keys(value)) {
        if (key === 'категория' || key === 'бренд') { continue; }
        let propName = key;
        if (propName.match(/длина|length/i)) {
            propName = 'Длина'
        }
        if (propName.match(/высота|height/i)) {
            propName = 'Высота'
        }
        if (propName.match(/ширина|width/i)) {
            propName = 'Ширина'
        }
        if (propName.match(/вес|weight/i)) {
            propName = 'Вес'
        }
        const charIndex = chars.findIndex((el) => el.title.toLowerCase() == propName.toLowerCase());
        if (charIndex === -1) {
            chars.push({
                title: propName.slice(0, 1).toUpperCase() + propName.slice(1),
                value: value[key]
            })
            continue;
        }
        if (chars[charIndex].value == value[key]) {
            continue;
        }
        if (value[key] === null || value[key] === undefined || !value[key].length) {
            continue;
        }
        if ((chars[charIndex].value === null || chars[charIndex].value === undefined || !chars[charIndex].value.length || chars[charIndex].value == 0) && (value[key] !== null && value[key] !== undefined && value[key].length)) {
            chars[charIndex].value = value[key];
        }
    }
}

//V1 ENDED


//V2 Все категории разом
const getCategories = (req, res) => {
    const mainResult = [];
    pool.query(
        `SELECT 
        DISTINCT
        category
        FROM public.products 
        `,
        (err, results) => {
            if (err) {
                throw err
            }
            for (let index = 0; index < results.rows.length; index++) {
                getProductsWithCatalogV2(results.rows[index]['category'], mainResult, index, results.rows.length - 1, res);
            }
        })
}

const getProductsWithCatalogV2 = (title, mainResult, curIndex, lastIndex, response) => {
    pool.query(
        `     
WITH RECURSIVE catalogs AS (
  SELECT 
    id, 
    title, 
    parent_id 
  FROM 
    public.categories 
  WHERE 
    title like $1
  UNION 
  SELECT 
    cat.id, 
    cat.title, 
    cat.parent_id 
  FROM 
    categories cat 
    INNER JOIN catalogs cats ON cats.parent_id = cat.id
) 
SELECT * FROM catalogs;     
        `,
        [title],
        (error, results) => {
            if (error) {
                throw error
            }
            const catalogTree = createCatalogTree(results.rows)
            getProductsV2(title, catalogTree, mainResult, curIndex, lastIndex, response);
        })
}

const getProductsV2 = (catalogTitle, catalogTree, mainResult, curIndex, lastIndex, response) => {
    const result = [];
    pool.query(
        `SELECT 
        id,
        brand,
        title,
        desc_base,
        art_prod,
        images_array,
        images_resize,
        tech_params,
        packaging_size,
        filters,
        barcode,
        quantity,
        sellers_info
        FROM public.products 
        WHERE category LIKE $1`,
        [catalogTitle],
        (err, results) => {
            if (err) {
                throw err
            }
            for (const product of results.rows) {
                result.push(createProductObject(product))
            }
            mainResult.push({
                catalog: catalogTree,
                products: result
            })
            if (curIndex == lastIndex) {
                response.status(200).json(mainResult)
            }
        })
}


module.exports = {
    getProductsWithCatalog,
    getCategories
}