import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check product counts
cursor.execute("SELECT COUNT(*) FROM products")
product_count = cursor.fetchone()[0]
print(f"Total products in database: {product_count}")

# Check by company
cursor.execute("""
    SELECT c.name, COUNT(p.id) as count
    FROM products p
    JOIN companies c ON p.company_id = c.id
    GROUP BY c.id
    ORDER BY count DESC
""")
print("\nProducts by company:")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

# Check product groups
cursor.execute("SELECT COUNT(*) FROM product_groups")
group_count = cursor.fetchone()[0]
print(f"\nTotal product groups created: {group_count}")

# Check some grouped products
cursor.execute("""
    SELECT pg.canonical_name, COUNT(p.id) as count
    FROM product_groups pg
    LEFT JOIN products p ON p.product_group_id = pg.id
    GROUP BY pg.id
    ORDER BY count DESC
    LIMIT 10
""")
print("\nTop 10 product groups:")
for row in cursor.fetchall():
    if row[1]:
        print(f"  {row[0]}: {row[1]} products")

conn.close()
