import sqlite3

def main():
    conn = sqlite3.connect("../frontend/data/products.db")
    conn.row_factory = sqlite3.Row
    print("=== Companies ===")
    for row in conn.execute("SELECT * FROM companies"):
        print(dict(row))
        
    print("\n=== Categories ===")
    for row in conn.execute("SELECT * FROM categories"):
        print(dict(row))
        
    print("\n=== Brands ===")
    for row in conn.execute("SELECT id, name FROM brands LIMIT 5"):
        print(dict(row))
        
    print("\n=== Products (sample of 10) ===")
    for row in conn.execute("""
        SELECT p.id, co.name AS company, cat.name AS category, b.name AS brand, p.product_name, ph.price
        FROM products p
        JOIN companies co ON p.company_id = co.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN price_history ph ON ph.product_id = p.id
        ORDER BY p.id DESC
        LIMIT 10
    """):
        print(dict(row))
        
    # Count of products per store
    print("\n=== Product counts per store ===")
    for row in conn.execute("""
        SELECT co.name, COUNT(*) AS count
        FROM products p
        JOIN companies co ON p.company_id = co.id
        GROUP BY co.name
    """):
        print(dict(row))

    conn.close()

if __name__ == "__main__":
    main()
