# app.py
from flask import Flask, render_template, request, jsonify, g
import re
from collections import defaultdict
import sqlite3
import os
from datetime import datetime

DB = "shopping.db"
app = Flask(__name__)

def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB)
        db.row_factory = sqlite3.Row
    return db

def init_db():
    if not os.path.exists(DB):
        db = sqlite3.connect(DB)
        c = db.cursor()
        c.execute("""
            CREATE TABLE items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item TEXT NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                category TEXT,
                created_at TEXT
            )
        """)
        c.execute("""
            CREATE TABLE history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item TEXT NOT NULL,
                created_at TEXT
            )
        """)
        db.commit()
        db.close()

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()

CATEGORY_MAP = {
    "milk": "dairy", "cheese": "dairy", "yogurt": "dairy",
    "apple": "produce", "apples": "produce", "banana": "produce",
    "bread": "bakery", "eggs": "dairy", "water": "beverages",
    "toothpaste": "personal care", "almond milk": "dairy-alternative", "butter":"dairy"
}
SUBSTITUTES = {"milk": ["almond milk", "soya milk"], "butter": ["margarine"]}

def categorize(item):
    key = item.lower()
    for k, v in CATEGORY_MAP.items():
        if k in key:
            return v
    return "misc"

def parse_command_text_rulebased(text):
    t = text.lower().strip()
    result = {"intent": "unknown", "item": None, "quantity": 1}
    if any(word in t for word in ["suggest", "recommend", "what should i buy"]):
        result["intent"] = "suggest"
        return result
    if t.startswith("find") or t.startswith("search") or "find me" in t or "search for" in t:
        result["intent"] = "search"
        m = re.search(r'(find|search)( me| for)? (.+)', t)
        if m:
            result["item"] = m.group(3).strip()
        return result
    if any(word in t for word in ["add", "buy", "i need", "i want", "get", "please add"]):
        result["intent"] = "add"
    elif any(word in t for word in ["remove", "delete", "drop", "take off"]):
        result["intent"] = "remove"
    q = re.search(r'(\d+)', t)
    if q:
        try:
            result["quantity"] = int(q.group(1))
        except:
            pass
    item = t
    for word in ["add", "buy", "i need", "i want", "get", "please", "remove", "delete", "drop", "from my list", "from my", "from"]:
        item = item.replace(word, "")
    item = re.sub(r'\b(of|some|a|an|please)\b', '', item).strip()
    result["item"] = item if item else None
    return result

def add_item_db(item, quantity=1):
    db = get_db()
    c = db.cursor()
    cat = categorize(item)
    c.execute("INSERT INTO items (item, quantity, category, created_at) VALUES (?, ?, ?, ?)",
              (item, quantity, cat, datetime.now().isoformat()))
    c.execute("INSERT INTO history (item, created_at) VALUES (?, ?)", (item, datetime.now().isoformat()))
    db.commit()

def remove_item_db(item):
    db = get_db()
    c = db.cursor()
    c.execute("SELECT id FROM items WHERE LOWER(item)=? ORDER BY id LIMIT 1", (item.lower(),))
    row = c.fetchone()
    if row:
        c.execute("DELETE FROM items WHERE id=?", (row["id"],))
        db.commit()
        return True
    return False

def list_items_db():
    db = get_db()
    c = db.cursor()
    c.execute("SELECT item, quantity, category FROM items ORDER BY id")
    rows = c.fetchall()
    return [{"item": r["item"], "quantity": r["quantity"], "category": r["category"]} for r in rows]

def history_freq_top(n=5):
    db = get_db()
    c = db.cursor()
    c.execute("SELECT item, COUNT(*) as cnt FROM history GROUP BY item ORDER BY cnt DESC LIMIT ?", (n,))
    return [r["item"] for r in c.fetchall()]

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json() or {}
    text = (data.get('command') or "").strip()
    if not text:
        return jsonify({"status":"error", "message":"Empty command"})
    parsed = parse_command_text_rulebased(text)
    intent = parsed.get("intent")
    item = parsed.get("item")
    quantity = parsed.get("quantity", 1)

    if intent == "add" and item:
        add_item_db(item, quantity)
        return jsonify({"status":"ok", "message": f"Added {quantity} × {item}", "list": list_items_db()})

    if intent == "remove" and item:
        removed = remove_item_db(item)
        if removed:
            return jsonify({"status":"ok", "message": f"Removed {item}", "list": list_items_db()})
        else:
            return jsonify({"status":"not_found", "message": f"{item} not in list", "list": list_items_db()})

    if intent == "search" and item:
        products = ["organic apples", "apple juice 1L", "whole wheat bread", "almond milk", "toothpaste mint"]
        results = [p for p in products if item.lower() in p.lower()]
        return jsonify({"status":"ok", "results": results})

    if intent == "suggest":
        suggestions = []
        suggestions += history_freq_top(3)
        staples = ["bread", "milk", "eggs"]
        for st in staples:
            if st not in suggestions:
                suggestions.append(st)
        for e in list_items_db():
            key = e["item"].lower()
            if key in SUBSTITUTES:
                suggestions += SUBSTITUTES[key]
        seen = set(); uniq=[]
        for it in suggestions:
            if it and it not in seen:
                seen.add(it); uniq.append(it)
        return jsonify({"status":"ok", "suggestions": uniq[:8]})

    return jsonify({"status":"error", "message":"Could not parse command", "parsed": parsed})

@app.route('/list', methods=['GET'])
def get_list():
    return jsonify({"list": list_items_db()})

@app.route('/clear', methods=['POST'])
def clear_list():
    db = get_db()
    c = db.cursor()
    c.execute("DELETE FROM items")
    db.commit()
    return jsonify({"status":"ok", "message":"List cleared", "list": list_items_db()})

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
