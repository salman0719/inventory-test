/**
 * Demo catalogue: 60 cafe ingredients and 160 retail lines (Gate A, A6).
 *
 * Tuple order: name, category, unit, cost, selling price (null when wholesale
 * only), reorder level, opening on-hand quantity.
 *
 * SKUs are derived from the row index (`CAF-001`, `RET-001`), so append new rows
 * at the end: reordering the list would renumber SKUs and make the seed look like a
 * different catalogue. Prices are deliberately plausible rather than exact.
 */
export type SeedProduct = [
  name: string,
  category: string,
  unit: string,
  cost: number,
  price: number | null,
  reorder: number,
  onHand: number,
];

export const CAFE_CATEGORIES = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Dry Goods",
  "Bakery",
  "Beverages",
  "Frozen",
  "Packaging",
  "Cleaning",
] as const;

export const CAFE_PRODUCTS: SeedProduct[] = [
  // Produce
  ["Tomatoes, truss", "Produce", "kg", 4.2, null, 6, 18],
  ["Brown onions", "Produce", "kg", 2.1, null, 6, 25],
  ["Baby spinach 120g", "Produce", "bag", 3.4, null, 8, 14],
  ["Potatoes, washed", "Produce", "kg", 2.6, null, 10, 40],
  ["Carrots", "Produce", "kg", 1.9, null, 5, 22],
  ["Avocados", "Produce", "ea", 1.35, null, 12, 30],
  ["Lemons", "Produce", "kg", 3.8, null, 4, 9],
  ["Bananas", "Produce", "kg", 2.9, null, 8, 26],
  ["Cos lettuce", "Produce", "ea", 2.3, null, 6, 10],
  ["Cucumbers", "Produce", "ea", 1.1, null, 6, 16],
  ["Garlic, peeled", "Produce", "kg", 9.8, null, 2, 4],
  ["Mushrooms, button", "Produce", "kg", 6.4, null, 4, 7],

  // Meat & Seafood
  ["Chicken thigh fillet", "Meat & Seafood", "kg", 11.5, null, 8, 22],
  ["Beef mince", "Meat & Seafood", "kg", 12.9, null, 8, 15],
  ["Bacon, streaky", "Meat & Seafood", "kg", 14.2, null, 4, 6],
  ["Salmon fillet, skin on", "Meat & Seafood", "kg", 32.0, null, 3, 5],
  ["Prawns, cooked", "Meat & Seafood", "kg", 29.5, null, 3, 4],
  ["Lamb shoulder", "Meat & Seafood", "kg", 18.6, null, 3, 6],
  ["Chorizo", "Meat & Seafood", "kg", 15.4, null, 2, 3],
  ["Pork belly", "Meat & Seafood", "kg", 16.8, null, 2, 0],

  // Dairy & Eggs
  ["Full cream milk 2L", "Dairy & Eggs", "bottle", 3.1, null, 12, 30],
  ["Eggs, free range 12pk", "Dairy & Eggs", "dozen", 7.8, null, 6, 12],
  ["Unsalted butter 250g", "Dairy & Eggs", "ea", 4.6, null, 6, 8],
  ["Tasty cheese block 1kg", "Dairy & Eggs", "ea", 12.4, null, 3, 5],
  ["Greek yoghurt 1kg", "Dairy & Eggs", "ea", 6.2, null, 4, 7],
  ["Thickened cream 600mL", "Dairy & Eggs", "ea", 4.1, null, 4, 9],
  ["Feta 200g", "Dairy & Eggs", "ea", 5.3, null, 3, 4],
  ["Almond milk 1L", "Dairy & Eggs", "ea", 5.6, null, 6, 10],

  // Dry Goods
  ["Plain flour 12.5kg", "Dry Goods", "bag", 16.9, null, 2, 4],
  ["White sugar 5kg", "Dry Goods", "bag", 9.4, null, 2, 5],
  ["Canola oil 20L", "Dry Goods", "ea", 48.0, null, 1, 2],
  ["Long grain rice 10kg", "Dry Goods", "bag", 24.5, null, 2, 3],
  ["Penne 10kg", "Dry Goods", "ea", 21.8, null, 2, 3],
  ["Cooking salt 5kg", "Dry Goods", "bag", 8.2, null, 1, 2],
  ["Black pepper, ground 500g", "Dry Goods", "ea", 9.6, null, 1, 2],
  ["Coffee beans, house blend 1kg", "Dry Goods", "bag", 32.0, null, 4, 9],
  ["Tomato passata 3kg", "Dry Goods", "ea", 12.3, null, 3, 6],
  ["Chicken stock paste 1kg", "Dry Goods", "ea", 18.4, null, 2, 3],
  ["Honey 1kg", "Dry Goods", "ea", 14.7, null, 1, 2],
  ["Cocoa powder 1kg", "Dry Goods", "ea", 15.2, null, 1, 1],

  // Bakery
  ["Sourdough loaf", "Bakery", "ea", 4.5, 9.0, 6, 9],
  ["Burger buns, 6pk", "Bakery", "pack", 3.2, null, 8, 12],
  ["Croissants, baked", "Bakery", "ea", 1.8, 4.5, 24, 30],
  ["Gluten free bread", "Bakery", "ea", 6.4, null, 3, 5],
  ["Pita bread 6pk", "Bakery", "pack", 2.9, null, 4, 6],

  // Beverages
  ["Coca-Cola 24x375mL", "Beverages", "case", 18.9, null, 4, 6],
  ["Sparkling water 24x330mL", "Beverages", "case", 12.6, null, 4, 7],
  ["Orange juice 2L", "Beverages", "bottle", 4.2, null, 6, 8],
  ["Pepsi Max 24x375mL", "Beverages", "case", 17.4, null, 3, 5],
  ["Green tea bags 100pk", "Beverages", "box", 7.2, null, 2, 3],
  ["Hot chocolate powder 1kg", "Beverages", "ea", 12.8, null, 2, 3],

  // Frozen
  ["Shoestring fries 5kg", "Frozen", "bag", 14.9, null, 3, 5],
  ["Frozen berries 1kg", "Frozen", "bag", 8.7, null, 4, 6],
  ["Puff pastry 2.5kg", "Frozen", "ea", 11.6, null, 2, 3],

  // Packaging
  ["Takeaway coffee cups 8oz 1000pk", "Packaging", "case", 78.0, null, 2, 5],
  ["Paper bags, brown 500pk", "Packaging", "pack", 32.0, null, 2, 4],
  ["Burger boxes 500pk", "Packaging", "case", 46.0, null, 2, 3],

  // Cleaning
  ["Dishwashing liquid 20L", "Cleaning", "ea", 42.0, null, 1, 2],
  ["Sanitiser 5L", "Cleaning", "ea", 24.0, null, 2, 3],
  ["Bin liners 240L 200pk", "Cleaning", "pack", 28.5, null, 2, 4],
];

export const RETAIL_CATEGORIES = [
  "Beverages",
  "Pantry",
  "Snacks",
  "Household",
  "Personal Care",
  "Fresh",
  "Frozen",
  "Pet",
  "Stationery",
  "Baby",
] as const;

export const RETAIL_PRODUCTS: SeedProduct[] = [
  // Beverages
  ["Coca-Cola 24x375mL", "Beverages", "case", 18.9, 29.0, 4, 8],
  ["Diet Coke 24x375mL", "Beverages", "case", 18.9, 29.0, 3, 6],
  ["Sprite 24x375mL", "Beverages", "case", 17.4, 27.0, 2, 4],
  ["Mount Franklin water 24pk", "Beverages", "case", 9.6, 16.0, 4, 10],
  ["Pump water 1L 12pk", "Beverages", "case", 12.0, 19.0, 2, 5],
  ["Gatorade 600mL 12pk", "Beverages", "case", 22.8, 34.0, 2, 3],
  ["Red Bull 250mL 24pk", "Beverages", "case", 38.4, 56.0, 2, 4],
  ["V Energy 500mL 12pk", "Beverages", "case", 26.4, 39.0, 2, 3],
  ["Nescafe Instant 200g", "Beverages", "ea", 9.8, 15.5, 4, 7],
  ["Moccona Classic 200g", "Beverages", "ea", 12.6, 19.0, 3, 5],
  ["Twinings English Breakfast 100pk", "Beverages", "ea", 6.4, 10.0, 3, 6],
  ["Lipton tea 100pk", "Beverages", "ea", 5.2, 8.5, 3, 5],
  ["Bickfords cordial 1L", "Beverages", "ea", 3.6, 6.0, 4, 9],
  ["Bundaberg ginger beer 4pk", "Beverages", "ea", 7.2, 11.0, 3, 5],
  ["Schweppes lemonade 1.1L", "Beverages", "ea", 2.4, 4.5, 4, 8],
  ["Orange juice 2L", "Beverages", "ea", 3.8, 6.5, 4, 7],
  ["Apple juice 2L", "Beverages", "ea", 3.6, 6.0, 3, 6],
  ["Almond milk 1L", "Beverages", "ea", 3.9, 6.0, 6, 10],
  ["Soy milk 1L", "Beverages", "ea", 3.4, 5.5, 6, 9],
  ["Iced coffee cans 24pk", "Beverages", "case", 27.6, 42.0, 2, 3],
  ["Hot chocolate 500g", "Beverages", "ea", 6.8, 11.0, 2, 4],
  ["Sports drink zero 12pk", "Beverages", "case", 21.6, 32.0, 2, 2],
  ["Sparkling water 24pk", "Beverages", "case", 11.4, 18.0, 3, 6],
  ["Iced tea 1.5L", "Beverages", "ea", 2.8, 4.8, 3, 5],

  // Pantry
  ["Pasta penne 500g", "Pantry", "ea", 1.6, 3.2, 12, 24],
  ["Pasta spirals 500g", "Pantry", "ea", 1.6, 3.2, 12, 20],
  ["White rice 5kg", "Pantry", "bag", 8.4, 14.0, 4, 7],
  ["Brown rice 1kg", "Pantry", "ea", 3.2, 5.5, 4, 6],
  ["Plain flour 2kg", "Pantry", "ea", 3.4, 6.0, 5, 9],
  ["Self raising flour 2kg", "Pantry", "ea", 3.6, 6.2, 4, 5],
  ["White sugar 2kg", "Pantry", "ea", 3.8, 6.5, 5, 8],
  ["Brown sugar 1kg", "Pantry", "ea", 2.6, 4.5, 4, 6],
  ["Olive oil 1L", "Pantry", "ea", 12.8, 21.0, 4, 6],
  ["Canola oil 2L", "Pantry", "ea", 9.6, 15.5, 3, 5],
  ["Tomato sauce 500mL", "Pantry", "ea", 2.4, 4.0, 6, 11],
  ["BBQ sauce 500mL", "Pantry", "ea", 2.6, 4.2, 4, 6],
  ["Mayonnaise 470g", "Pantry", "ea", 3.4, 5.8, 4, 5],
  ["White vinegar 2L", "Pantry", "ea", 2.8, 4.6, 3, 4],
  ["Baked beans 420g", "Pantry", "ea", 1.2, 2.3, 12, 26],
  ["Spaghetti 420g", "Pantry", "ea", 1.1, 2.2, 12, 18],
  ["Tuna in springwater 425g", "Pantry", "ea", 2.8, 4.8, 8, 14],
  ["Corn kernels 420g", "Pantry", "ea", 1.4, 2.6, 8, 12],
  ["Coconut milk 400mL", "Pantry", "ea", 1.6, 3.0, 8, 15],
  ["Peanut butter 500g", "Pantry", "ea", 4.2, 7.0, 4, 6],
  ["Vegemite 380g", "Pantry", "ea", 5.6, 9.0, 3, 5],
  ["Honey 500g", "Pantry", "ea", 6.8, 11.0, 3, 4],
  ["Table salt 1kg", "Pantry", "ea", 1.4, 2.6, 6, 9],
  ["Black pepper 100g", "Pantry", "ea", 3.2, 5.5, 3, 4],
  ["Curry powder 100g", "Pantry", "ea", 2.4, 4.2, 2, 3],
  ["Garlic powder 100g", "Pantry", "ea", 2.6, 4.4, 2, 2],

  // Snacks
  ["Smiths chips 175g", "Snacks", "ea", 2.6, 4.5, 10, 20],
  ["Thins chips 175g", "Snacks", "ea", 2.6, 4.5, 8, 16],
  ["Doritos 200g", "Snacks", "ea", 3.2, 5.5, 8, 12],
  ["Shapes 190g", "Snacks", "ea", 2.4, 4.2, 8, 14],
  ["Tim Tams 200g", "Snacks", "ea", 2.8, 4.8, 8, 15],
  ["Jatz 250g", "Snacks", "ea", 2.2, 3.8, 6, 9],
  ["CC's 150g", "Snacks", "ea", 2.4, 4.2, 6, 8],
  ["Red Rock Deli 165g", "Snacks", "ea", 3.2, 5.4, 6, 9],
  ["Sultanas 250g", "Snacks", "ea", 2.2, 3.8, 4, 6],
  ["Mixed nuts 400g", "Snacks", "ea", 6.4, 10.5, 4, 5],
  ["Chocolate block 180g", "Snacks", "ea", 2.6, 4.8, 10, 18],
  ["Muesli bars 6pk", "Snacks", "ea", 3.2, 5.5, 6, 10],
  ["Rice crackers 100g", "Snacks", "ea", 1.8, 3.2, 6, 8],
  ["Microwave popcorn 3pk", "Snacks", "ea", 2.2, 3.8, 4, 6],
  ["Party mix lollies 500g", "Snacks", "ea", 4.6, 8.0, 3, 4],
  ["Chewing gum 3pk", "Snacks", "ea", 2.2, 3.8, 6, 10],
  ["Pringles 134g", "Snacks", "ea", 3.4, 5.8, 6, 8],
  ["Pretzels 175g", "Snacks", "ea", 2.8, 4.6, 4, 5],
  ["Dried apricots 250g", "Snacks", "ea", 3.6, 6.0, 3, 4],
  ["Trail mix 400g", "Snacks", "ea", 6.8, 11.0, 3, 4],
  ["Corn chips 300g", "Snacks", "ea", 3.0, 5.2, 5, 7],
  ["Wagon Wheels 9pk", "Snacks", "ea", 3.2, 5.5, 4, 6],

  // Household
  ["Dish liquid 900mL", "Household", "ea", 3.2, 5.5, 6, 10],
  ["Laundry powder 2kg", "Household", "ea", 10.4, 17.0, 3, 5],
  ["Laundry liquid 2L", "Household", "ea", 12.8, 21.0, 3, 4],
  ["Fabric softener 2L", "Household", "ea", 7.2, 12.0, 2, 3],
  ["Toilet cleaner 750mL", "Household", "ea", 3.6, 6.0, 3, 5],
  ["Bleach 2L", "Household", "ea", 2.8, 4.8, 3, 4],
  ["Surface spray 500mL", "Household", "ea", 4.2, 7.0, 3, 4],
  ["Glass cleaner 500mL", "Household", "ea", 3.8, 6.5, 2, 3],
  ["Bin liners 80pk", "Household", "ea", 4.6, 7.8, 3, 5],
  ["Paper towels 4pk", "Household", "ea", 6.4, 10.5, 4, 6],
  ["Toilet paper 12pk", "Household", "ea", 8.8, 14.5, 6, 9],
  ["Cling wrap 30m", "Household", "ea", 3.2, 5.5, 3, 4],
  ["Aluminium foil 30m", "Household", "ea", 4.4, 7.2, 3, 5],
  ["Sponges 6pk", "Household", "ea", 2.8, 4.6, 4, 6],
  ["Air freshener 300g", "Household", "ea", 3.6, 6.0, 2, 3],
  ["Matches 10pk", "Household", "ea", 2.2, 3.8, 2, 3],
  ["Insect spray 400g", "Household", "ea", 5.6, 9.0, 2, 2],
  ["AA batteries 8pk", "Household", "ea", 6.8, 11.0, 3, 5],

  // Personal Care
  ["Shampoo 400mL", "Personal Care", "ea", 5.6, 9.5, 4, 6],
  ["Conditioner 400mL", "Personal Care", "ea", 5.6, 9.5, 4, 5],
  ["Body wash 1L", "Personal Care", "ea", 6.4, 10.5, 3, 5],
  ["Soap 4pk", "Personal Care", "ea", 3.2, 5.5, 6, 9],
  ["Toothpaste 110g", "Personal Care", "ea", 3.4, 5.8, 6, 10],
  ["Toothbrush 2pk", "Personal Care", "ea", 3.8, 6.5, 4, 6],
  ["Deodorant 150mL", "Personal Care", "ea", 4.2, 7.0, 4, 7],
  ["Razors 4pk", "Personal Care", "ea", 6.8, 11.5, 3, 4],
  ["Shaving cream 200g", "Personal Care", "ea", 4.4, 7.2, 2, 3],
  ["Hand sanitiser 500mL", "Personal Care", "ea", 4.6, 7.8, 4, 6],
  ["Facial cleanser 150mL", "Personal Care", "ea", 7.2, 12.0, 2, 3],
  ["Moisturiser 250mL", "Personal Care", "ea", 8.4, 14.0, 2, 3],
  ["Sunscreen SPF50 200mL", "Personal Care", "ea", 9.6, 16.0, 2, 2],
  ["Cotton buds 200pk", "Personal Care", "ea", 2.2, 3.8, 3, 5],
  ["Tissues 200pk", "Personal Care", "ea", 2.4, 4.0, 4, 7],
  ["Lip balm", "Personal Care", "ea", 2.8, 4.8, 4, 6],
  ["Hair ties 20pk", "Personal Care", "ea", 2.4, 4.0, 3, 4],
  ["Nail clippers", "Personal Care", "ea", 3.2, 5.5, 2, 3],

  // Fresh
  ["Full cream milk 2L", "Fresh", "ea", 2.2, 3.6, 10, 14],
  ["Lite milk 2L", "Fresh", "ea", 2.2, 3.6, 8, 10],
  ["Eggs 12pk", "Fresh", "ea", 5.6, 8.9, 6, 9],
  ["Butter 250g", "Fresh", "ea", 3.8, 6.2, 6, 8],
  ["Cheese slices 250g", "Fresh", "ea", 3.2, 5.5, 4, 6],
  ["Greek yoghurt 1kg", "Fresh", "ea", 5.2, 8.5, 4, 5],
  ["Sour cream 300mL", "Fresh", "ea", 2.2, 3.8, 3, 4],
  ["White bread 700g", "Fresh", "ea", 2.2, 3.8, 8, 10],
  ["Multigrain bread 700g", "Fresh", "ea", 2.8, 4.8, 6, 7],
  ["Bananas", "Fresh", "kg", 2.6, 3.9, 6, 12],
  ["Pink lady apples", "Fresh", "kg", 3.2, 5.4, 5, 9],
  ["Carrots 1kg", "Fresh", "ea", 1.8, 3.2, 5, 8],
  ["Potatoes 2kg", "Fresh", "ea", 3.4, 5.8, 4, 7],
  ["Tomatoes", "Fresh", "kg", 3.6, 5.9, 4, 6],
  ["Iceberg lettuce", "Fresh", "ea", 1.4, 2.6, 6, 8],
  ["Cucumber", "Fresh", "ea", 0.9, 1.8, 6, 7],
  ["Tasty cheese block 500g", "Fresh", "ea", 6.4, 10.5, 4, 5],
  ["Sliced ham 200g", "Fresh", "ea", 4.2, 7.0, 4, 5],
  ["Chicken breast", "Fresh", "kg", 8.8, 13.5, 4, 5],
  ["Beef sausages 500g", "Fresh", "ea", 5.2, 8.5, 3, 4],

  // Frozen
  ["Frozen peas 1kg", "Frozen", "ea", 2.6, 4.5, 4, 6],
  ["Frozen corn 1kg", "Frozen", "ea", 2.8, 4.8, 4, 5],
  ["Frozen berries 500g", "Frozen", "ea", 4.6, 7.8, 4, 6],
  ["Frozen chips 1kg", "Frozen", "ea", 3.4, 5.8, 5, 8],
  ["Vanilla ice cream 2L", "Frozen", "ea", 5.6, 9.0, 3, 5],
  ["Margherita pizza", "Frozen", "ea", 4.2, 7.0, 3, 4],
  ["Frozen fish fillets 500g", "Frozen", "ea", 6.8, 11.0, 2, 3],
  ["Puff pastry 1kg", "Frozen", "ea", 4.4, 7.2, 3, 4],
  ["Frozen mango 500g", "Frozen", "ea", 4.8, 8.0, 2, 2],
  ["Ice blocks 10pk", "Frozen", "ea", 3.2, 5.5, 3, 5],

  // Pet
  ["Dog food 3kg", "Pet", "ea", 9.6, 16.0, 3, 4],
  ["Cat food 1.2kg", "Pet", "ea", 7.2, 12.0, 3, 4],
  ["Dog treats 500g", "Pet", "ea", 5.6, 9.0, 3, 5],
  ["Cat treats 60g", "Pet", "ea", 2.4, 4.0, 4, 6],
  ["Cat litter 15L", "Pet", "ea", 8.8, 14.5, 3, 4],
  ["Pet shampoo 250mL", "Pet", "ea", 4.8, 8.0, 2, 3],
  ["Dog lead", "Pet", "ea", 8.4, 14.0, 1, 2],
  ["Pet bowls 2pk", "Pet", "ea", 5.2, 9.0, 1, 2],

  // Stationery
  ["A4 copy paper 500pk", "Stationery", "ea", 5.6, 9.5, 4, 6],
  ["Ballpoint pens 10pk", "Stationery", "ea", 3.2, 5.5, 4, 6],
  ["Sticky notes 3pk", "Stationery", "ea", 2.4, 4.0, 3, 5],
  ["Notebook A5", "Stationery", "ea", 2.8, 4.8, 3, 4],
  ["Highlighters 4pk", "Stationery", "ea", 4.4, 7.2, 2, 3],
  ["Stapler", "Stationery", "ea", 5.2, 9.0, 2, 2],
  ["Pencils 12pk", "Stationery", "ea", 2.6, 4.5, 3, 4],
  ["Scissors", "Stationery", "ea", 3.8, 6.5, 2, 2],

  // Baby
  ["Nappies 32pk", "Baby", "ea", 14.4, 24.0, 3, 4],
  ["Baby wipes 80pk", "Baby", "ea", 2.8, 4.8, 6, 9],
  ["Baby food 120g", "Baby", "ea", 1.6, 2.8, 8, 12],
  ["Infant formula 800g", "Baby", "ea", 21.6, 32.0, 2, 3],
  ["Baby bath 400mL", "Baby", "ea", 5.2, 9.0, 2, 3],
  ["Nappy cream 100g", "Baby", "ea", 4.8, 8.0, 2, 3],
];

/**
 * Suppliers are fictional businesses with reserved `.invalid` addresses and
 * Australian 5550-range numbers, so no seed row can reach a real person (Gate A).
 */
export type SeedSupplier = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

export const CAFE_SUPPLIERS: SeedSupplier[] = [
  {
    name: "Fresh Fields Produce",
    contactName: "Dana Whitfield",
    email: "orders@freshfields.invalid",
    phone: "02 5550 3142",
    address: "12 Kembla Rd, Alexandria NSW 2015",
    notes: "Delivers Mon, Wed and Fri before 7am.",
  },
  {
    name: "Harbour Line Meats",
    contactName: "Marco Bellini",
    email: "sales@harbourline.invalid",
    phone: "02 5550 8891",
    address: "4 Wharf St, Rozelle NSW 2039",
    notes: "Order cut-off 2pm the day before delivery.",
  },
  {
    name: "Coldstream Dairy",
    contactName: "Priya Raman",
    email: "hello@coldstreamdairy.invalid",
    phone: "02 5550 4470",
    address: "88 Dairy Flat Rd, Camden NSW 2570",
    notes: "Two deliveries a week; invoice monthly.",
  },
  {
    name: "Basin Dry Goods",
    contactName: "Trevor Nash",
    email: "trade@basindry.invalid",
    phone: "02 5550 6023",
    address: "5 Foundry Pl, Marrickville NSW 2204",
    notes: "Free delivery over $400.",
  },
  {
    name: "Loft Bakers",
    contactName: "Amelia Frost",
    email: "orders@loftbakers.invalid",
    phone: "02 5550 9917",
    address: "31 Peel St, Newtown NSW 2042",
    notes: "Bakes overnight; deliveries from 5am.",
  },
  {
    name: "Southern Beverage Co",
    contactName: "Hugo Lin",
    email: "accounts@southernbeverage.invalid",
    phone: "02 5550 7355",
    address: "9 Enterprise Dr, Smithfield NSW 2164",
    notes: "Crate deposit applies on returns.",
  },
  {
    name: "Cleanline Supplies",
    contactName: "Nadia Okafor",
    email: "orders@cleanline.invalid",
    phone: "02 5550 5180",
    address: "2 Industrial Ave, Bankstown NSW 2200",
    notes: "14-day account terms.",
  },
  {
    name: "PackRight",
    contactName: "Sam Ellery",
    email: "sales@packright.invalid",
    phone: "02 5550 2266",
    address: "17 Duramba Ct, Blacktown NSW 2148",
    notes: "Same-day dispatch before noon.",
  },
  {
    name: "Polar Line Frozen",
    contactName: "Ivy Chen",
    email: "orders@polarline.invalid",
    phone: "02 5550 8834",
    address: "21 Trench Rd, Wetherill Park NSW 2164",
    notes: "Frozen only; delivers Tuesday.",
  },
];

/** Which supplier a product gets, by category. */
export const CAFE_SUPPLIER_BY_CATEGORY: Record<string, string> = {
  Produce: "Fresh Fields Produce",
  "Meat & Seafood": "Harbour Line Meats",
  "Dairy & Eggs": "Coldstream Dairy",
  "Dry Goods": "Basin Dry Goods",
  Bakery: "Loft Bakers",
  Beverages: "Southern Beverage Co",
  Frozen: "Polar Line Frozen",
  Packaging: "PackRight",
  Cleaning: "Cleanline Supplies",
};

export const RETAIL_SUPPLIERS: SeedSupplier[] = [
  {
    name: "Metro Wholesale",
    contactName: "Erin Blake",
    email: "orders@metrowholesale.invalid",
    phone: "02 5550 3030",
    address: "40 Gipps St, Chatswood NSW 2067",
    notes: "Weekly order, Thursday cut-off.",
  },
  {
    name: "Coastline Fresh",
    contactName: "Jonah Reid",
    email: "hello@coastlinefresh.invalid",
    phone: "02 5550 7742",
    address: "6 Beach Rd, Brookvale NSW 2100",
    notes: "Fresh produce and dairy, daily before 6am.",
  },
  {
    name: "Northern Grocers",
    contactName: "Lena Krylov",
    email: "trade@northerngrocers.invalid",
    phone: "02 5550 6608",
    address: "22 Chifley Dr, Penrith NSW 2750",
    notes: "Pantry staples; free delivery over $500.",
  },
  {
    name: "Home Basics Supply",
    contactName: "Owen Hart",
    email: "sales@homebasics.invalid",
    phone: "02 5550 1184",
    address: "8 Alan St, Auburn NSW 2144",
    notes: "Household and personal care ranges.",
  },
  {
    name: "Playtime & Pet",
    contactName: "Rosa Nguyen",
    email: "orders@playtimepet.invalid",
    phone: "02 5550 4477",
    address: "3 Nyrang St, Lidcombe NSW 2141",
    notes: "Pet, baby and seasonal ranges.",
  },
  {
    name: "Office Lane",
    contactName: "Grace Fielding",
    email: "hello@officelane.invalid",
    phone: "02 5550 9512",
    address: "15 Kent Rd, Mascot NSW 2020",
    notes: "Stationery; next-day metro delivery.",
  },
];

export const RETAIL_SUPPLIER_BY_CATEGORY: Record<string, string> = {
  Beverages: "Metro Wholesale",
  Pantry: "Northern Grocers",
  Snacks: "Metro Wholesale",
  Household: "Home Basics Supply",
  "Personal Care": "Home Basics Supply",
  Fresh: "Coastline Fresh",
  Frozen: "Coastline Fresh",
  Pet: "Playtime & Pet",
  Stationery: "Office Lane",
  Baby: "Playtime & Pet",
};
