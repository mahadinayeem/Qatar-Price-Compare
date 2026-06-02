import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check sample products
print("Sample products (first 20):")
cursor.execute("""
    SELECT id, company_id, product_name, price FROM (
        SELECT p.id, p.company_id, p.product_name, 'no price' as price
        FROM products p
        LEFT JOIN price_history ph ON p.id = ph.product_id
        LIMIT 20
    )
""")

for row in cursor.fetchall():
    print(f"  ID {row[0]}: [{row[1]}] {row[2]}")

# Check category data
print("\nCategories:")
cursor.execute("SELECT * FROM categories")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

# Check if problem is that category_id is NULL
print("\nProducts missing category_id:")
cursor.execute("""
    SELECT COUNT(*) FROM products WHERE category_id IS NULL
""")
count = cursor.fetchone()[0]
print(f"  {count} products missing category_id")

# Check what the API query would return
print("\nTesting API query structure:")
cursor.execute("""
    SELECT
        p.product_name,
        b.name AS brand,
        cat.name AS category,
        p.image_url,
        COUNT(DISTINCT CASE WHEN co.name = 'Rawabi' THEN ph.id END) as rawabi_count
    FROM products p
    LEFT JOIN price_history ph ON p.id = ph.product_id
    LEFT JOIN companies co ON p.company_id = co.id
    LEFT JOIN categories cat ON p.category_id = cat.id
    LEFT JOIN brands b ON p.brand_id = b.id
    GROUP BY p.id
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"  {row[0]}: category={row[2]}, brand={row[1]}, rawabi_count={row[4]}")

conn.close()
