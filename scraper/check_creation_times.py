import sqlite3
from collections import Counter

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check creation times
cursor.execute("""
    SELECT DATE(created_at) as date, COUNT(*) FROM products
    GROUP BY DATE(created_at)
    ORDER BY date DESC
""")
print("Products by creation date:")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]} products")

# The issue might be from old data. Let me check if we should just delete and recreate
# First, let's see if the problem products are all from Lulu/Family or all from Rawabi
cursor.execute("""
    SELECT co.name, COUNT(*) FROM products p
    JOIN companies co ON p.company_id = co.id
    WHERE LENGTH(p.product_name) < 20
    GROUP BY co.name
""")
print("\nShort product names by company:")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]} products")

# Sample short names from each company
for company in ['Rawabi', 'Family Food Centre', 'Lulu Hypermarket']:
    cursor.execute("""
        SELECT COUNT(*) FROM products p
        JOIN companies co ON p.company_id = co.id
        WHERE co.name = ? AND LENGTH(p.product_name) < 20
    """, (company,))
    count = cursor.fetchone()[0]
    if count > 0:
        print(f"\nSample short names from {company}:")
        cursor.execute("""
            SELECT p.product_name FROM products p
            JOIN companies co ON p.company_id = co.id
            WHERE co.name = ? AND LENGTH(p.product_name) < 20
            LIMIT 5
        """, (company,))
        for row in cursor.fetchall():
            print(f"  '{row[0]}'")

conn.close()
