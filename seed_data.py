# seed_products.py
import sqlite3
products = [
  {"name":"Organic Apples", "brand":"NatureFarm", "category":"Produce", "price_inr":180.0, "unit":"kg", "stock":50},
  {"name":"Toothpaste - Colgate Germicheck", "brand":"Colgate", "category":"Household", "price_inr":120.0, "unit":"toothpaste", "stock":40},
  {"name":"Toothpaste - Dabur", "brand":"Dabur", "category":"Household", "price_inr":85.0, "unit":"toothpaste", "stock":25},
  {"name":"Milk (2L)", "brand":"Amul", "category":"Dairy", "price_inr":120.0, "unit":"2L", "stock":100},
  {"name":"Almond Milk 1L", "brand":"Alpro", "category":"Dairy", "price_inr":250.0, "unit":"1L", "stock":15},
  {"name":"Salt 1kg", "brand":"MDH", "category":"Spices", "price_inr":35.0, "unit":"1kg", "stock":80},
  {"name":"Chocolate Cookies Pack", "brand":"Parle", "category":"Snacks", "price_inr":45.0, "unit":"pkt", "stock":60},
  {"name":"Basmati Rice 5kg", "brand":"IndiaGate", "category":"Grocery", "price_inr":450.0, "unit":"5kg", "stock":20},
]
conn = sqlite3.connect("products.db")
c = conn.cursor()
c.execute("""
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  brand TEXT,
  category TEXT,
  price_inr REAL,
  unit TEXT,
  stock INTEGER
)
""")
c.execute("DELETE FROM products")
for p in products:
    c.execute("INSERT INTO products (name,brand,category,price_inr,unit,stock) VALUES (?,?,?,?,?,?)", (p["name"], p["brand"], p["category"], p["price_inr"], p["unit"], p["stock"]))
conn.commit()
conn.close()
print("Seeded products.db")
