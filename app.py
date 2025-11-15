# app.py
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import math
import re

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app)  # allow cross-origin requests (useful in dev)

# -------------------------
# Mock product catalog
# -------------------------
# price_inr is an integer/float in Indian Rupees
PRODUCTS = [
    {"id": 1, "name": "Amul Gold Milk 1L", "brand": "Amul", "category": "Dairy", "price_inr": 65.0},
    {"id": 2, "name": "Britannia White Bread 400g", "brand": "Britannia", "category": "Bakery", "price_inr": 35.0},
    {"id": 3, "name": "Parle G Biscuits 300g", "brand": "Parle", "category": "Snacks", "price_inr": 25.0},
    {"id": 4, "name": "Tata Salt Iodized 1kg", "brand": "Tata", "category": "Spices", "price_inr": 28.0},
    {"id": 5, "name": "Colgate Toothpaste 100g", "brand": "Colgate", "category": "Household", "price_inr": 90.0},
    {"id": 6, "name": "Dove Shampoo 340ml", "brand": "Dove", "category": "Household", "price_inr": 250.0},
    {"id": 7, "name": "Almond Milk (Alpro) 1L", "brand": "Alpro", "category": "Dairy", "price_inr": 240.0},
    {"id": 8, "name": "Apple - Red Delicious (1kg)", "brand": "FreshFarm", "category": "Produce", "price_inr": 180.0},
    {"id": 9, "name": "Minute Maid Orange Juice 1L", "brand": "Minute Maid", "category": "Drinks", "price_inr": 145.0},
    {"id": 10, "name": "Organic Bananas (1 dozen)", "brand": "GreenLeaf", "category": "Produce", "price_inr": 60.0},
    {"id": 11, "name": "Maggi Masala Noodles 2x70g", "brand": "Maggi", "category": "Snacks", "price_inr": 20.0},
    {"id": 12, "name": "Saffola Gold Oil 1L", "brand": "Saffola", "category": "Household", "price_inr": 220.0},
    {"id": 13, "name": "Bread - Whole Wheat 400g", "brand": "LocalBakery", "category": "Bakery", "price_inr": 40.0},
    {"id": 14, "name": "Paneer 200g", "brand": "LocalDairy", "category": "Dairy", "price_inr": 110.0},
    {"id": 15, "name": "Oreo Chocolate Biscuits 150g", "brand": "Oreo", "category": "Snacks", "price_inr": 60.0},
]

# -------------------------
# Helper search functions
# -------------------------
def normalize_text(s: str) -> str:
    return (s or "").strip().lower()

def score_match(product, q):
    """
    Simple scoring:
    - +100 if q appears in name start
    - +50 if substring in name
    - +30 if in brand
    - +20 if in category
    - small fuzzy by splitting words
    """
    if not q:
        return 0
    q = normalize_text(q)
    name = normalize_text(product["name"])
    brand = normalize_text(product.get("brand", ""))
    category = normalize_text(product.get("category", ""))

    score = 0
    if name.startswith(q): score += 100
    if q in name and not name.startswith(q): score += 50
    if q in brand: score += 30
    if q in category: score += 20

    # word-level partial matches
    q_words = re.split(r"\s+", q)
    for w in q_words:
        if w and w in name: score += 6
        if w and w in brand: score += 3
    return score

def filter_products(q=None, min_price=None, max_price=None, brand=None, limit=20):
    """
    Return list of matching products sorted by score & price.
    """
    # Normalize filters
    q_norm = normalize_text(q) if q else ""
    brand_norm = normalize_text(brand) if brand else ""

    # Filter by brand and price first
    candidates = []
    for p in PRODUCTS:
        price = p.get("price_inr")
        if min_price is not None and price is not None and price < min_price: 
            continue
        if max_price is not None and price is not None and price > max_price:
            continue
        if brand_norm and brand_norm not in normalize_text(p.get("brand","")):
            # brand filter applied and doesn't match
            continue
        # If q present, compute score, else keep baseline score
        s = score_match(p, q_norm) if q_norm else 1
        candidates.append((s, p))
    # Sort by score descending, then by lower price
    candidates.sort(key=lambda sp: (-sp[0], sp[1].get("price_inr", math.inf)))
    return [p for _, p in candidates][:limit]

# -------------------------
# Routes
# -------------------------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/products/search")
def api_products_search():
    """
    Query params:
      - q (string) search term
      - min_price (number) in INR
      - max_price (number) in INR
      - brand (string)
      - limit (int)
      - currency (optional) - ignored by mock (we return price_inr)
    Response: JSON array or { items: [...] }
    """
    q = request.args.get("q", default="", type=str)
    brand = request.args.get("brand", default="", type=str)
    limit = request.args.get("limit", default=12, type=int)
    currency = request.args.get("currency", default="INR", type=str)

    # parse prices (accept decimals)
    def parse_price(v):
        if v is None or v == '':
            return None
        try:
            return float(v)
        except:
            # try remove currency symbols etc.
            try:
                return float(re.sub(r"[^\d.]", "", v))
            except:
                return None

    min_price = parse_price(request.args.get("min_price", None))
    max_price = parse_price(request.args.get("max_price", None))

    results = filter_products(q=q, min_price=min_price, max_price=max_price, brand=brand, limit=limit)

    # Optionally enrich results: add price_inr and a simple availability flag & suggestions
    enriched = []
    for p in results:
        enriched.append({
            "id": p["id"],
            "name": p["name"],
            "brand": p.get("brand"),
            "category": p.get("category"),
            "price_inr": p.get("price_inr"),
            "available": True,
            # simple substitute example: use same substitutes mapping as frontend
            "substitutes": ["almond milk", "soy milk"] if "milk" in p["name"].lower() else []
        })

    # Return a consistent object with items key
    return jsonify({"items": enriched, "query": {"q": q, "min_price": min_price, "max_price": max_price, "brand": brand, "currency": currency}}), 200

# small health endpoint
@app.route("/api/ping")
def ping():
    return jsonify({"ok": True, "msg": "pong"})

# -------------------------
# Run server (dev)
# -------------------------
if __name__ == "__main__":
    # For local testing use: python app.py
    app.run(host="127.0.0.1", port=5000, debug=True)
