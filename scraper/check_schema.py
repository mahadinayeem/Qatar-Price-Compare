import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check if products table exists
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'")
result = cursor.fetchone()

if result:
    print("Current products table schema:")
    print(result[0])
    print("\n")
    
    # Check columns
    cursor.execute("PRAGMA table_info(products)")
    columns = cursor.fetchall()
    print("Columns:")
    for col in columns:
        print(f"  {col[1]} - {col[2]}")
else:
    print("No products table found")

# Check if product_groups table exists
cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_groups'")
result = cursor.fetchone()

if result:
    print("\nProduct groups table exists:")
    print(result[0])
else:
    print("\nNo product_groups table found")

conn.close()
