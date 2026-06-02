import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get all products with mismatched brand/category
print("Products with short names:")
cursor.execute("""
    SELECT p.id, p.product_name, b.name, cat.name
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    JOIN categories cat ON p.category_id = cat.id
    WHERE LENGTH(p.product_name) < 30
    ORDER BY LENGTH(p.product_name)
    LIMIT 20
""")

for row in cursor.fetchall():
    print(f"  [{row[1]}] brand={row[2]}")

# Check if the issue is null values
print("\nProducts with brand = 'Unknown':")
cursor.execute("""
    SELECT COUNT(*)
    FROM products p
    JOIN brands b ON p.brand_id = b.id
    WHERE b.name = 'Unknown'
""")
count = cursor.fetchone()[0]
print(f"  {count} products with 'Unknown' brand")

# Check raw data - which products have issues?
print("\nShort product names (possibly truncated):")
cursor.execute("""
    SELECT product_name FROM products
    WHERE LENGTH(product_name) < 15
    GROUP BY product_name
    ORDER BY product_name
""")

for row in cursor.fetchall():
    print(f"  '{row[0]}'")

conn.close()
