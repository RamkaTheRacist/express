const { default: axios } = require('axios')

// NEW ADDED
let allCategories = [];
const errors = {
    catalogTree: [],
    productsRaw: [],
    products: []
}

const moveObject = {
    isReady: false,
    categoriesToPim: []
}

const inComplete = {
    current: 0,
    total: 0,
    percent: 0,
    uncompleted: [],
    errors: []
}

const pg = require('pg');
const connectConf = ''
const client = new pg.Client(connectConf);
client.connect();
//FILL local allCategoryTitles
const fillAllCategoryTitles = async (req, res) => {
    const categories = await client.query(
        `
        SELECT 
        DISTINCT
        title,
        id      
        FROM public.categories
        `)
        .catch((error) => {
            res.status(501).json(error);
        });
    if (!categories) { return; }
    allCategories = categories.rows;
    res.json({
        status: 'done',
        length: allCategories.length
    })
}
//RETURN local allCategoryTitles
const getAllCategoryTitles = (req, res) => {
    res.json({
        length: allCategories.length,
        categories: allCategories
    })
}
//PUSH LOCAL CATEGORY FOR PIM WITH PRODUCTS
const createOneCategoryWithProduct = async (req, res) => {
    if (!allCategories.length) {
        return res.json({ error: 'Нет названий категорий' })
    }
    if (moveObject.categoriesToPim.length == 5 && req.query.testing === undefined) {
        return res.json({
            error: 'Уже 5 категорий с товаром есть',
            moveObject: moveObject.categoriesToPim.map((el) => { return { catalog: el.catalog, productLength: el.products.length } })
        })
    }
    const category = allCategories.pop();
    const categoryTree = await getCategoryTree(category['title']);
    const products = await getProducts(category);
    if (!products.length) {
        res.json({
            date: new Date(),
            error: 'В категории нет товаров или не удалось получить',
            category
        })
        return;
    }
    moveObject.categoriesToPim.push({
        catalog: categoryTree,
        products
    })
    moveObject.isReady = true;
    res.json({
        isReady: moveObject.isReady,
        leftCategories: allCategories.length,
        categoryTree,
        productLength: products.length
    })
}

//GET CATEGORY TREE
const getCategoryTree = async (title) => {
    try {
        const catalogsRaw = await client.query(
            `    
            SELECT id, title, parent_id, kind FROM public.categories as cat
            WHERE cat.title like $1 
            UNION ALL
            SELECT id, title, parent_id, kind FROM public.categories as par
            WHERE par.id = (
            SELECT parent_id FROM public.categories as cat
            WHERE cat.title like $1 AND (cat.parent_id <> 0 AND cat.parent_id IS NOT NULL)
            ) 
            `, [title]);
        if (!catalogsRaw) {
            return;
        }
        return createCatalogTree(catalogsRaw.rows)
    } catch (error) {
        errors.catalogTree.push({
            date: new Date(),
            title,
            error: error
        })
    }
}

//GET PRODUCT OBJECTS ARRAY
const getProducts = async (category) => {
    const products = [];
    try {
        const productsRaw = await client.query(
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
        WHERE ((category_id IS NULL OR category_id = 0)AND category LIKE $1) OR (category_id = $2)`,
            [category.title, category.id])
        if (!productsRaw) {
            return;
        }
        for (const product of productsRaw.rows) {
            try {
                products.push(createProductObject(product))
            } catch (error) {
                errors.products.push({
                    date: new Date(),
                    id: product.id,
                    catalog: category,
                    error: error
                })
            }
        }
    } catch (error) {
        errors.productsRaw.push({
            date: new Date(),
            catalog: category,
            error: error
        })
    }
    return products;
}

//GET PRODUCT OBJECT
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

//FOR IMAGE
const getImageArray = (array) => {
    if (!array) {
        return null
    }
    return array.map((el) => el = 'https://www.barneo.ru' + el.replace(/\s/g, ''));
}

//FOR CHARS
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
//CATEGORIES TO PIM
const getCategoriesToPim = (req, res) => {
    res.status(200).json(moveObject)
}
//ERRORS
const getErrors = (req, res) => {
    res.status(200).json(errors)
}
// CREATE CATAGORY TREE
const createCatalogTree = (catalogs) => {
    let result = {}
    for (let i = 0; i < catalogs.length; i++) {
        if (i === 0) {
            result = {
                title: catalogs[i].title
            };
            continue;
        }
        result = {
            title: catalogs[i].title,
            children: result
        }
        if (i === catalogs.length - 1) {
            if (catalogs[i].kind) {
                result = {
                    title: catalogs[i].kind.slice(0, 1).toUpperCase() + catalogs[i].kind.slice(1).toLowerCase(),
                    children: result
                }
            }
        }
    }
    result = {
        title: 'Barneo catalog',
        children: result
    }
    return result;
}
//IN COMPLETE
const getInComplete = (req, res) => {
    res.status(200).json(inComplete)
}
// SEND REQ TO PIM
const moveToPim = async (req, res) => {
    if (!moveObject.categoriesToPim.length || !moveObject.isReady) {
        res.status(400).json({ error: 'Нет категорий или не готово' })
    }
    inComplete.total = moveObject.categoriesToPim.length;
    for (let i = 0; i < moveObject.categoriesToPim.length; i++) {
        inComplete.current = i + 1
        inComplete.percent = inComplete.current / inComplete.total
        await axios.post('https://dev-api-pim-products.barneo-tech.com/barneo-import', moveObject.categoriesToPim[i])
            .catch((error) => {
                inComplete.errors.push({
                    date: new Date(),
                    index: i,
                    error: error.stack
                })
            })
        if (i == moveObject.categoriesToPim.length - 1) {
            if (!inComplete.errors.length) {
                inComplete.uncompleted = [];
            }
            if (inComplete.errors.length) {
                inComplete.uncompleted = inComplete.errors.map((el) => el.index)
            }
            const categoriesLeft = [];

            for (let index = 0; index < inComplete.uncompleted.length; index++) {
                categoriesLeft.push(moveObject.categoriesToPim[inComplete.uncompleted[index]])
            }
            moveObject.categoriesToPim = categoriesLeft;
            res.json({
                rejectedIndex: inComplete.uncompleted
            })
        }
    }
}

const resetObjects = (req, res) => {
    if (req.query.errors == 'true') {
        errors.catalogTree = [];
        errors.productsRaw = [];
        errors.products = []
    }

    if (req.query.moveobject == 'true') {
        moveObject.isReady = false;
        moveObject.categoriesToPim = []
    }

    if (req.query.uncompleted == 'true') {
        inComplete.uncompleted = [];
    }

    if (req.query.incompleteerrors == 'true') {
        inComplete.errors = [];
    }
    res.json(true)
}

module.exports = {
    getCategoriesToPim,
    getErrors,
    moveToPim,
    getInComplete,
    fillAllCategoryTitles,
    getAllCategoryTitles,
    createOneCategoryWithProduct,
    resetObjects
}