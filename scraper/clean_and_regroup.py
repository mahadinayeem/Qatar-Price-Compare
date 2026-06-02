import re
import sqlite3
from difflib import SequenceMatcher

DB = '../data/products.db'
THRESHOLD = 0.82

COUNTRY_TOKENS = set([
    'qatar','china','india','egypt','uganda','italy','holland','australia','usa',
    'south','north','new','pakistan','bangladesh','morocco','spain','saudi','pakistan'
])
JUNK_TOKENS = set(['hover','image','hover image','kg','g','gm','pkt','packet','pcs','pc','pkt'])

weight_re = re.compile(r"\b\d+(?:[\.,]\d+)?\s*(?:kg|g|gm|gram|grams|kg)\b", flags=re.I)
paren_re = re.compile(r"\([^)]*\)")
multi_spaces = re.compile(r"\s+")


def normalize(name: str) -> str:
    if not name:
        return ""
    s = name.lower()
    s = paren_re.sub(' ', s)
    s = weight_re.sub(' ', s)
    for tok in list(COUNTRY_TOKENS) + list(JUNK_TOKENS):
        s = re.sub(r"\b" + re.escape(tok) + r"\b", ' ', s)
    s = s.replace('-', ' ')
    s = re.sub(r"[^a-z0-9\s]", ' ', s)
    s = multi_spaces.sub(' ', s).strip()
    return s


def is_junk_brand(name: str) -> bool:
    if not name:
        return True
    s = name.lower().strip()
    if any(tok in s for tok in ['hover','image']):
        return True
    if any(tok == s for tok in COUNTRY_TOKENS):
        return True
    if re.search(r"\d", s):
        return True
    if len(s) <= 2:
        return True
    return False


def similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Ensure Unknown brand exists
    cur.execute("SELECT id FROM brands WHERE name = 'Unknown'")
    row = cur.fetchone()
    if row:
        unknown_brand_id = row['id']
    else:
        cur.execute("INSERT INTO brands (name) VALUES ('Unknown')")
        unknown_brand_id = cur.lastrowid
        conn.commit()
    print('Unknown brand id =', unknown_brand_id)

    # Clean junk brands: reassign products to Unknown and delete brand rows
    cur.execute('SELECT id, name FROM brands')
    brands = cur.fetchall()
    junk_brand_ids = []
    for b in brands:
        name = b['name'] or ''
        if is_junk_brand(name) and b['id'] != unknown_brand_id:
            junk_brand_ids.append(b['id'])
    print('Found junk brand ids:', junk_brand_ids)

    for bid in junk_brand_ids:
        cur.execute('UPDATE products SET brand_id = ? WHERE brand_id = ?', (unknown_brand_id, bid))
        cur.execute('DELETE FROM brands WHERE id = ?', (bid,))
    conn.commit()
    print('Reassigned junk brands to Unknown')

    # Heuristic: assign probable brand from product_name for Unknown-brand products
    print('Assigning probable brands from product_name for Unknown entries...')
    stopwords = set(['fresh','packet','pkt','kg','g','gram','pcs','pc','mix','new'])
    cur.execute('SELECT id, product_name FROM products WHERE brand_id = ?', (unknown_brand_id,))
    unknown_products = cur.fetchall()
    for p in unknown_products:
        pid = p['id']
        name = (p['product_name'] or '').strip()
        if not name:
            continue
        first = name.split()[0].strip().strip('(),')
        if not first or len(first) <= 2:
            continue
        if first.lower() in stopwords or first.lower() in COUNTRY_TOKENS:
            continue
        # Create or get brand
        cur.execute('SELECT id FROM brands WHERE name = ?', (first,))
        r = cur.fetchone()
        if r:
            bid = r['id']
        else:
            cur.execute('INSERT INTO brands (name) VALUES (?)', (first,))
            bid = cur.lastrowid
            conn.commit()
        cur.execute('UPDATE products SET brand_id = ? WHERE id = ?', (bid, pid))
    conn.commit()
    print('Assigned brands from names where applicable')

    # Rebuild product groups by exact normalized name mapping
    print('Clearing existing product_groups...')
    cur.execute('DELETE FROM product_groups')
    conn.commit()

    # Build mapping normalized -> list of (id, original_name)
    cur.execute('SELECT id, product_name FROM products')
    products = cur.fetchall()
    norm_map = {}
    for p in products:
        pid = p['id']
        name = p['product_name'] or ''
        norm = normalize(name)
        if not norm:
            # fallback: use raw lowercase name
            norm = name.lower().strip()
        norm_map.setdefault(norm, []).append((pid, name))

    # Create a product_group per normalized key and assign products
    for norm, entries in norm_map.items():
        # choose canonical name as most common original name
        name_counts = {}
        for _, n in entries:
            name_counts[n] = name_counts.get(n, 0) + 1
        canonical = max(name_counts.items(), key=lambda x: x[1])[0]
        cur.execute('INSERT INTO product_groups (canonical_name) VALUES (?)', (canonical,))
        gid = cur.lastrowid
        # assign all products to this group
        ids = [str(pid) for pid, _ in entries]
        cur.execute(f"UPDATE products SET product_group_id = ? WHERE id IN ({','.join(['?']*len(ids))})", (gid, *ids))
    conn.commit()

    # After assigning, normalize canonical_name to most common product_name in group
    print('Normalizing canonical names...')
    cur.execute('SELECT id FROM product_groups')
    grows = cur.fetchall()
    for g in grows:
        gid = g['id']
        cur.execute('SELECT product_name, COUNT(*) as cnt FROM products WHERE product_group_id = ? GROUP BY product_name ORDER BY cnt DESC LIMIT 1', (gid,))
        r = cur.fetchone()
        if r:
            canonical = r['product_name']
            cur.execute('UPDATE product_groups SET canonical_name = ? WHERE id = ?', (canonical, gid))
    conn.commit()

    # Report summary
    cur.execute('SELECT COUNT(*) FROM product_groups')
    total_groups = cur.fetchone()[0]
    cur.execute('SELECT COUNT(*) FROM products WHERE brand_id = ?', (unknown_brand_id,))
    unknown_brands = cur.fetchone()[0]
    print(f'Total groups: {total_groups}, Products with Unknown brand: {unknown_brands}')

    conn.close()


if __name__ == '__main__':
    main()
