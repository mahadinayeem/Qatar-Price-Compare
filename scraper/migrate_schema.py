import sqlite3

db_path = '../data/products.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if product_group_id column exists
    cursor.execute("PRAGMA table_info(products)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'product_group_id' not in columns:
        print("Adding product_group_id column...")
        cursor.execute("ALTER TABLE products ADD COLUMN product_group_id INTEGER")
        conn.commit()
        print("✓ Column added successfully")
    else:
        print("✓ product_group_id column already exists")
    
    # Also add the foreign key constraint if it doesn't exist
    # Note: SQLite doesn't allow ALTER TABLE to add constraints directly,
    # but the column is what matters for now
    
    print("\nUpdated schema:")
    cursor.execute("PRAGMA table_info(products)")
    columns = cursor.fetchall()
    for col in columns:
        print(f"  {col[1]} - {col[2]}")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
