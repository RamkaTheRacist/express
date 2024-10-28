const { default: axios } = require('axios')

const Pool = require('pg').Pool
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: '123',
    port: 5432,
})
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
            result = {
                title: catalogs[i].kind.slice(0, 1).toUpperCase() + catalogs[i].kind.slice(1).toLowerCase(),
                children: result
            }
        }
    }
    result = {
        title: 'Barneo catalog',
        children: result
    }
    return result;
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

const moveObject = {
    isReady: false,
    categoriesToPim: []
}
let errorsFromMove = []

const inComplete = {
    current: 0,
    total: moveObject.categoriesToPim.length,
    percent: this.current / this.total,
    errors: []
}

const getCategoriesToPim = (req, res) => {
    res.status(200).json(moveObject)
}
const getErrorsFromMove = (req, res) => {
    res.status(200).json([errorsFromMove.length, errorsFromMove])
}

const getInComplete = (req, res) => {
    res.status(200).json(inComplete)
}

const moveToPim = async (req, res) => {
    const errors = []
    if (!moveObject.categoriesToPim.length || !moveObject.isReady) {
        res.status(400).json({ message: 'No data to move OR not ready' })
    }
    for (let i = 0; i < moveObject.categoriesToPim.length; i++) {
        inComplete.current = i
        inComplete.percent = inComplete.current / inComplete.total
        await axios.post('https://dev-api-pim-products.barneo-tech.com/barneo-import', moveObject.categoriesToPim[i])
            .catch((error) => {
                inComplete.errors = errors
                errors.push(error)
            })
        if (i == moveObject.categoriesToPim.length - 1) {

            moveObject.categoriesToPim = [];
            errorsFromMove = []
            res.json({ errors: errors })
        }
    }

}

const getCategories = async (req, res) => {

    const categories = await pool.query(
        `
        SELECT 
        DISTINCT
        category
        FROM public.products 
        WHERE category IS NOT NULL
        `)
        .catch((error) => {
            res.status(501).json(error);
        });
    if (!categories) { return; }
    for (let i = 0; i < categories.rows.length; i++) {
        const objectToUse = await getProductsWithCatalog(categories.rows[i]['category'], errorsFromMove)
        if (objectToUse) {
            moveObject.categoriesToPim.push(objectToUse);
        }
        if (i == categories.rows.length - 1) {
            inComplete.total = categories.rows.length;
            inComplete.percent = inComplete.current / inComplete.total;
            moveObject.isReady = true
        }
    }
    res.status(200).send(true)
}


const getProductsWithCatalog = async (title, errorsFromMove) => {
    const catalogsRaw = await pool.query(
        `    
        SELECT id, title, parent_id, kind FROM public.categories as cat
        WHERE cat.title like $1 
        UNION ALL
        SELECT id, title, parent_id, kind FROM public.categories as par
        WHERE par.id = (
        SELECT parent_id FROM public.categories as cat
        WHERE cat.title like $1 AND (cat.parent_id <> 0 AND cat.parent_id IS NOT NULL)
        ) 
        `, [title]).catch((error) => errorsFromMove.push(error))
    if (!catalogsRaw) {
        return;
    }
    const catalogTree = createCatalogTree(catalogsRaw.rows)
    const products = await getProducts(title, errorsFromMove);
    if (!products) {
        return;
    }
    return {
        catalog: catalogTree,
        products
    }
}

const getProducts = async (catalogTitle, errorsFromMove) => {
    const products = [];
    const productsRaw = await pool.query(
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
        [catalogTitle]).catch((error) => errorsFromMove.push(error))
    if (!productsRaw) {
        return;
    }
    for (const product of productsRaw.rows) {
        try {
            products.push(createProductObject(product))
        } catch (error) {
            (error) => errorsFromMove.push(error.stack)
        }
    }
    return products;
}



module.exports = {
    getCategories,
    getCategoriesToPim,
    getErrorsFromMove,
    moveToPim,
    getInComplete,
}