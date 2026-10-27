import type { Namespace } from './types';

const stock: Namespace = {
  lt: {
    title: 'Sandėlis ir atsargos (prekių likučiai)', totalItems: 'Iš viso nomenklatūroje: {count} pozicijų.', addNew: 'Pridėti naują prekę', searchPlaceholder: 'Paieška pagal pavadinimą, kodą, brūkšninį kodą...',
    warehouse: 'Sandėlis', allWarehouses: 'Visi sandėliai', remainder: 'Likutis', all: 'Visi', inStockOnly: 'Tik su likučiu (> 0)', soldOut: 'Išparduota (= 0)',
    filters: 'Filtrai', clearFilters: 'Išvalyti filtrus', reset: 'Atstatyti', priceFrom: 'Kaina nuo (€):', priceTo: 'Kaina iki (€):', found: 'Rasta prekių: {shown} iš {total}',
    totalRemainder: 'Bendras likutis', units: '{count} vnt.', cost: 'Savikaina', saleValue: 'Pardavimo vertė',
    itemName: 'Prekės pavadinimas', codeSku: 'Kodas / Artikulas', warehouseCol: 'Sandėlis', remainderCol: 'Likutis (vnt.)', costCol: 'Savikaina (€)', priceCol: 'Pardavimo kaina (€)', supplier: 'Tiekėjas', actions: 'Veiksmai',
    barcodeLabel: 'Brūkšninis kodas: {code}', edit: 'Redaguoti', delete: 'Ištrinti', noneFound: 'Pagal nurodytus filtrus prekių nerasta.',
    csvName: 'Pavadinimas', csvCode: 'Kodas', barcode: 'Brūkšninis kodas', price: 'Kaina',
    editTitle: 'Redaguoti prekę', newTitle: 'Nauja prekė sandėlyje', itemNameReq: 'Prekės pavadinimas *', namePlaceholder: 'pvz. Prekė A', remainderQty: 'Likutis (kiekis)', supplierPlaceholder: 'UAB Tiekėjas',
    cancel: 'Atšaukti', saving: 'Išsaugoma...', save: 'Išsaugoti', addItem: 'Pridėti prekę',
    errName: 'Nurodykite prekės pavadinimą', errUpdate: 'Klaida atnaujinant prekę', errCreate: 'Klaida kuriant prekę', errDelete: 'Klaida trinant prekę', confirmDelete: 'Ar tikrai norite ištrinti prekę "{name}"?',
  },
  ru: {
    title: 'Склад и запасы (остатки товаров)', totalItems: 'Всего в номенклатуре: {count} позиций.', addNew: 'Добавить новый товар', searchPlaceholder: 'Поиск по названию, коду, штрихкоду...',
    warehouse: 'Склад', allWarehouses: 'Все склады', remainder: 'Остаток', all: 'Все', inStockOnly: 'Только с остатком (> 0)', soldOut: 'Распродано (= 0)',
    filters: 'Фильтры', clearFilters: 'Сбросить фильтры', reset: 'Сбросить', priceFrom: 'Цена от (€):', priceTo: 'Цена до (€):', found: 'Найдено товаров: {shown} из {total}',
    totalRemainder: 'Общий остаток', units: '{count} шт.', cost: 'Себестоимость', saleValue: 'Стоимость продажи',
    itemName: 'Название товара', codeSku: 'Код / Артикул', warehouseCol: 'Склад', remainderCol: 'Остаток (шт.)', costCol: 'Себестоимость (€)', priceCol: 'Цена продажи (€)', supplier: 'Поставщик', actions: 'Действия',
    barcodeLabel: 'Штрихкод: {code}', edit: 'Редактировать', delete: 'Удалить', noneFound: 'По заданным фильтрам товаров не найдено.',
    csvName: 'Название', csvCode: 'Код', barcode: 'Штрихкод', price: 'Цена',
    editTitle: 'Редактировать товар', newTitle: 'Новый товар на складе', itemNameReq: 'Название товара *', namePlaceholder: 'напр. Товар A', remainderQty: 'Остаток (количество)', supplierPlaceholder: 'UAB Поставщик',
    cancel: 'Отмена', saving: 'Сохранение...', save: 'Сохранить', addItem: 'Добавить товар',
    errName: 'Укажите название товара', errUpdate: 'Ошибка при обновлении товара', errCreate: 'Ошибка при создании товара', errDelete: 'Ошибка при удалении товара', confirmDelete: 'Вы уверены, что хотите удалить товар "{name}"?',
  },
  en: {
    title: 'Stock and inventory (item balances)', totalItems: 'Total in the catalogue: {count} items.', addNew: 'Add new item', searchPlaceholder: 'Search by name, code, barcode...',
    warehouse: 'Warehouse', allWarehouses: 'All warehouses', remainder: 'Balance', all: 'All', inStockOnly: 'In stock only (> 0)', soldOut: 'Sold out (= 0)',
    filters: 'Filters', clearFilters: 'Clear filters', reset: 'Reset', priceFrom: 'Price from (€):', priceTo: 'Price to (€):', found: 'Items found: {shown} of {total}',
    totalRemainder: 'Total balance', units: '{count} pcs.', cost: 'Cost', saleValue: 'Sales value',
    itemName: 'Item name', codeSku: 'Code / SKU', warehouseCol: 'Warehouse', remainderCol: 'Balance (pcs.)', costCol: 'Cost (€)', priceCol: 'Sales price (€)', supplier: 'Supplier', actions: 'Actions',
    barcodeLabel: 'Barcode: {code}', edit: 'Edit', delete: 'Delete', noneFound: 'No items found for the selected filters.',
    csvName: 'Name', csvCode: 'Code', barcode: 'Barcode', price: 'Price',
    editTitle: 'Edit item', newTitle: 'New stock item', itemNameReq: 'Item name *', namePlaceholder: 'e.g. Item A', remainderQty: 'Balance (quantity)', supplierPlaceholder: 'Supplier Ltd',
    cancel: 'Cancel', saving: 'Saving...', save: 'Save', addItem: 'Add item',
    errName: 'Enter the item name', errUpdate: 'Error updating the item', errCreate: 'Error creating the item', errDelete: 'Error deleting the item', confirmDelete: 'Are you sure you want to delete item "{name}"?',
  },
};
export default stock;
