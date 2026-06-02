import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print("Tables in database:")
for table in tables:
    cursor.execute(f"SELECT COUNT(*) FROM {table[0]}")
    count = cursor.fetchone()[0]
    print(f"  {table[0]}: {count} rows")

# Check price_history
print("\nChecking price_history:")
cursor.execute("SELECT COUNT(*) FROM price_history")
count = cursor.fetchone()[0]
print(f"  Total records: {count}")

# Check sample price_history data
cursor.execute("""
    SELECT ph.id, p.product_name, ph.price, c.name
    FROM price_history ph
    JOIN products p ON ph.product_id = p.id
    JOIN companies c ON p.company_id = c.id
    LIMIT 5
""")
print("\nSample price_history data:")
for row in cursor.fetchall():
    print(f"  {row[1]}: ${row[2]} ({row[3]})")

# Check if there are any products with prices
cursor.execute("""
    SELECT COUNT(DISTINCT p.id)
    FROM products p
    WHERE EXISTS (SELECT 1 FROM price_history WHERE product_id = p.id)
""")
with_prices = cursor.fetchone()[0]
print(f"\nProducts with price history: {with_prices}")

# The issue: we're saving products but not to price_history
# Let's check what database.py is doing
cursor.execute("""
    SELECT p.id, p.product_name, COUNT(ph.id) as price_count
    FROM products p
    LEFT JOIN price_history ph ON p.id = ph.product_id
    GROUP BY p.id
    LIMIT 10
""")
print("\nProduct prices check:")
for row in cursor.fetchall():
    print(f"  {row[1]}: {row[2]} prices")

conn.close()
