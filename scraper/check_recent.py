import sqlite3
from datetime import datetime, timedelta

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get the most recent product creation time
cursor.execute("SELECT MAX(created_at) FROM products")
most_recent = cursor.fetchone()[0]
print(f"Most recent product created: {most_recent}")

# Count products created in last hour
one_hour_ago = (datetime.fromisoformat(most_recent.split('.')[0]) - timedelta(hours=1)).isoformat()
cursor.execute("""
    SELECT COUNT(*) FROM products WHERE created_at > ?
""", (one_hour_ago,))
recent_count = cursor.fetchone()[0]
print(f"Products created in last hour: {recent_count}")

# Show recent products
print("\nMost recent products:")
cursor.execute("""
    SELECT product_name, b.name as brand FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    ORDER BY p.created_at DESC
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"  '{row[0]}' (brand: {row[1]})")

conn.close()
