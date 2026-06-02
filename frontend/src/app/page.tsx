"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  X,
  Sun,
  Moon,
  Grid,
  List,
  Crown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Product = {
  product_group_id: number;
  product_name: string;
  image_url: string;
  rawabi_price: number | null;
  family_price: number | null;
  lulu_price: number | null;
  avg_price: number | null;
  last_updated: string;
};

type PriceHistory = {
  date: string;
  company: string;
  price: number;
};

function fmt(price: number | null): string {
  if (price == null) return "-";
  return `${price.toFixed(2)} QAR`;
}

function lowestPrice(p: Product): "rawabi" | "family" | "lulu" | null {
  const vals = [
    ["rawabi", p.rawabi_price],
    ["family", p.family_price],
    ["lulu", p.lulu_price],
  ].filter(([, value]) => value != null) as [string, number][];

  if (!vals.length) return null;
  return vals.reduce((a, b) => (a[1] <= b[1] ? a : b))[0] as
    | "rawabi"
    | "family"
    | "lulu";
}

function exportToCSV(products: Product[]) {
  const headers = ["Product Name", "Rawabi (QAR)", "Family (QAR)", "Lulu (QAR)", "Avg Price (QAR)", "Last Updated"];
  const rows = products.map((p) => [
    `"${p.product_name.replace(/"/g, '""')}"`,
    p.rawabi_price ?? "",
    p.family_price ?? "",
    p.lulu_price ?? "",
    p.avg_price ?? "",
    p.last_updated?.split("T")[0] ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `qatar-prices-${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function PriceCell({
  price,
  isLowest,
}: {
  price: number | null;
  isLowest: boolean;
}) {
  if (price == null) {
    return <span className="text-sm text-slate-300 dark:text-slate-700 font-medium">-</span>;
  }

  return (
    <span
      className={`text-sm font-semibold tabular-nums px-2.5 py-1 rounded-lg transition-theme ${
        isLowest
          ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 border border-green-200/40 dark:border-green-500/20 font-bold"
          : "text-slate-800 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/20"
      }`}
    >
      {price.toFixed(2)}
    </span>
  );
}

function ProductModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/price-history?group=${product.product_group_id}`)
      .then((r) => r.json())
      .then((d) => {
        setHistory(d.history || []);
        setLoading(false);
      });
  }, [product.product_group_id]);

  const chartData = Object.entries(
    history.reduce<Record<string, Record<string, number>>>((acc, item) => {
      if (!acc[item.date]) acc[item.date] = {};
      acc[item.date][item.company] = item.price;
      return acc;
    }, {})
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  const lowest = lowestPrice(product);
  const numericPrices = [
    product.rawabi_price,
    product.family_price,
    product.lulu_price,
  ].filter((value): value is number => value != null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200/50 dark:border-slate-800/40 bg-white dark:bg-slate-900 shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
        >
          <X size={18} />
        </button>

        <div className="flex gap-5 mt-2 mb-6">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.product_name}
              className="h-20 w-20 rounded-2xl border dark:border-slate-800 object-cover bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <ShoppingCart className="text-slate-300 dark:text-slate-600" size={32} />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white leading-tight">
              {product.product_name}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 font-medium">
              Common product match across supermarkets
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Updated: {product.last_updated ? new Date(product.last_updated).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-"}
            </p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          {(
            [
              ["Rawabi", product.rawabi_price, "rawabi", "#16a34a"],
              ["Family", product.family_price, "family", "#2563eb"],
              ["Lulu", product.lulu_price, "lulu", "#dc2626"],
            ] as [string, number | null, string, string][]
          ).map(([name, price, key, color]) => (
            <div
              key={key}
              className="rounded-2xl border p-4 text-center transition-all bg-slate-50/50 dark:bg-slate-800/20"
              style={{
                borderColor: lowest === key ? color : "rgba(148, 163, 184, 0.15)",
                backgroundColor: lowest === key ? `${color}0c` : "",
              }}
            >
              <p className="mb-1 text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">{name}</p>
              <p
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: lowest === key ? color : "var(--text-color)" }}
              >
                {price != null ? price.toFixed(2) : "-"}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400 font-bold uppercase">QAR</p>
              {lowest === key && (
                <span className="inline-flex items-center gap-0.5 mt-2 bg-green-500/10 text-green-600 dark:text-green-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-green-500/20">
                  <Crown size={8} /> Lowest
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/20 p-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Average</p>
            <p className="text-base font-extrabold text-slate-850 dark:text-slate-200 mt-1">{fmt(product.avg_price)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/20 p-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Lowest</p>
            <p className="text-base font-extrabold text-green-600 dark:text-green-400 mt-1">
              {fmt(numericPrices.length ? Math.min(...numericPrices) : null)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/20 p-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Highest</p>
            <p className="text-base font-extrabold text-red-500 mt-1">
              {fmt(numericPrices.length ? Math.max(...numericPrices) : null)}
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-200">
            <TrendingUp size={18} className="text-brand-500" /> Price History Trend
          </h3>
          {loading ? (
            <div className="flex h-44 items-center justify-center text-sm text-slate-400 animate-pulse font-medium">
              Loading price history charts...
            </div>
          ) : chartData.length > 0 ? (
            <div className="bg-slate-50 dark:bg-slate-800/20 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/20">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94a3b8" }} stroke="rgba(148,163,184,0.15)" />
                  <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} unit=" Q" stroke="rgba(148,163,184,0.15)" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "12px",
                      color: "#fff",
                    }}
                    formatter={(value: number) => [`${value.toFixed(2)} QAR`]}
                  />
                  <Legend wrapperStyle={{ fontSize: "10px", marginTop: "10px" }} />
                  <Line
                    type="monotone"
                    dataKey="Rawabi"
                    stroke="#16a34a"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Family Food Centre"
                    stroke="#2563eb"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Lulu Hypermarket"
                    stroke="#dc2626"
                    strokeWidth={3}
                    dot={{ r: 2 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/20 text-sm text-slate-400 font-medium">
              No historical data available yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompanyChart({ products }: { products: Product[] }) {
  const data = [
    {
      name: "Rawabi",
      avg:
        products.filter((p) => p.rawabi_price != null).length > 0
          ? parseFloat(
              (
                products.reduce((sum, p) => sum + (p.rawabi_price ?? 0), 0) /
                products.filter((p) => p.rawabi_price != null).length
              ).toFixed(2)
            )
          : 0,
      fill: "#16a34a",
    },
    {
      name: "Family",
      avg:
        products.filter((p) => p.family_price != null).length > 0
          ? parseFloat(
              (
                products.reduce((sum, p) => sum + (p.family_price ?? 0), 0) /
                products.filter((p) => p.family_price != null).length
              ).toFixed(2)
            )
          : 0,
      fill: "#2563eb",
    },
    {
      name: "Lulu",
      avg:
        products.filter((p) => p.lulu_price != null).length > 0
          ? parseFloat(
              (
                products.reduce((sum, p) => sum + (p.lulu_price ?? 0), 0) /
                products.filter((p) => p.lulu_price != null).length
              ).toFixed(2)
            )
          : 0,
      fill: "#dc2626",
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} barSize={48}>
        <CartesianGrid stroke="rgba(148, 163, 184, 0.06)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} stroke="none" />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} unit=" Q" stroke="none" />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            color: "#fff",
          }}
          formatter={(value: number) => [`${value} QAR`, "Avg Price"]}
        />
        <Bar dataKey="avg" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <rect key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const LIMIT = 50;
  const searchRef = useRef<NodeJS.Timeout>();

  // Load Theme from LocalStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    const initialTheme = savedTheme || "light";
    setTheme(initialTheme);
    if (initialTheme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }
  };

  // Load View Mode from LocalStorage
  useEffect(() => {
    const savedViewMode = localStorage.getItem("viewMode") as "grid" | "table" | null;
    if (savedViewMode) setViewMode(savedViewMode);
  }, []);

  const toggleViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    localStorage.setItem("viewMode", mode);
  };

  const fetchProducts = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      const params = new URLSearchParams({
        search,
        page: String(nextPage),
        limit: String(LIMIT),
      });

      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setLoading(false);
    },
    [search]
  );

  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      fetchProducts(1);
    }, 350);
  }, [search, fetchProducts]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen transition-theme dark:bg-[#0b0f19]">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/[0.06] shadow-sm transition-theme">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 via-emerald-600 to-blue-600 shadow-md shadow-emerald-500/10">
              <ShoppingCart size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Qatar Price Compare
              </h1>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Smart Product Naming Match</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/20">
              <button
                onClick={() => toggleViewMode("grid")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-slate-700 shadow text-brand-600 dark:text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
                title="Grid View"
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => toggleViewMode("table")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-700 shadow text-brand-600 dark:text-white"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
                title="Table List View"
              >
                <List size={16} />
              </button>
            </div>

            {/* Dark Mode Toggler */}
            <button
              onClick={toggleTheme}
              className="rounded-xl border border-slate-200/50 dark:border-white/[0.06] bg-slate-50 dark:bg-slate-850 p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <button
              onClick={() => setShowChart(!showChart)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                showChart
                  ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20"
                  : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-white/[0.06]"
              }`}
            >
              <BarChart2 size={16} />
              <span className="hidden md:inline">Analytics</span>
            </button>

            <button
              onClick={() => exportToCSV(products)}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/10 hover:bg-green-700 transition"
            >
              <Download size={16} />
              <span className="hidden md:inline">Export CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 relative">
        {/* Statistics Charts */}
        {showChart && products.length > 0 && (
          <div className="mb-6 glass-card p-5 animate-fade-in">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              <BarChart2 size={18} className="text-brand-500" /> Average Fruit &amp; Vegetable Prices (Current Page)
            </h2>
            <CompanyChart products={products} />
          </div>
        )}

        {/* Search input container */}
        <div className="mb-6 glass-card p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
              <input
                type="text"
                placeholder="Search common produce... (e.g. Tomato, Lemon, Mango)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white rounded-xl border border-slate-200/50 dark:border-white/[0.06] py-3 pl-10 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 placeholder-slate-400 dark:placeholder-slate-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Meta comparison header indicators */}
        <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-1">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {loading ? (
              <span className="flex items-center gap-1.5 animate-pulse">
                <RefreshCw size={12} className="animate-spin text-brand-500" /> Loading products database...
              </span>
            ) : (
              <>
                Showing <span className="text-slate-850 dark:text-slate-200">{products.length}</span> of{" "}
                <span className="text-slate-850 dark:text-slate-200">{total}</span> unique matching products
              </>
            )}
          </p>

          <div className="flex items-center gap-3.5 text-xs font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
              Rawabi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
              Family
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
              Lulu
            </span>
          </div>
        </div>

        {/* -------------------- VIEW LAYOUT MODE 1: GRID CARDS -------------------- */}
        {viewMode === "grid" && (
          <div className="mb-6">
            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {Array.from({ length: 12 }).map((_, idx) => (
                  <div key={idx} className="glass-card h-80 p-5 flex flex-col justify-between">
                    <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
                    <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse my-2" />
                    <div className="space-y-1">
                      <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                      <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="glass-card py-20 text-center text-slate-400 dark:text-slate-500">
                <ShoppingCart size={48} className="mx-auto mb-4 opacity-25" />
                <p className="text-lg font-bold">No products matching filters found</p>
                {search && <p className="mt-1 text-sm">Try searching for &ldquo;Tomato&rdquo; or &ldquo;Mango&rdquo;</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => {
                  const low = lowestPrice(product);
                  return (
                    <div
                      key={product.product_group_id}
                      className="glass-card p-4 hover:-translate-y-1.5 hover:shadow-xl hover:border-brand-500/35 hover:dark:border-white/10 flex flex-col justify-between relative group cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                    >
                      {/* Product Card Top: Image & Name */}
                      <div>
                        <div className="w-full h-36 rounded-xl border dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 relative">
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.image_url}
                              alt={product.product_name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex w-full h-full items-center justify-center bg-slate-50 dark:bg-slate-800/40">
                              <ShoppingCart className="text-slate-200 dark:text-slate-700" size={32} />
                            </div>
                          )}
                          {low && (
                            <div className="absolute top-2 left-2 z-10">
                              <span className="flex items-center gap-0.5 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-md">
                                <Crown size={8} /> Cheapest at {low.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>

                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-3 leading-snug">
                          {product.product_name}
                        </h3>
                      </div>

                      {/* Store Comparisons and pricing */}
                      <div className="mt-4">
                        <div className="border-t border-slate-100 dark:border-slate-800/50 pt-3 space-y-2 text-xs font-semibold">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 dark:text-slate-500">Rawabi:</span>
                            <span className={low === "rawabi" ? "text-green-600 dark:text-green-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                              {product.rawabi_price ? `${product.rawabi_price.toFixed(2)} Q` : <span className="text-slate-300 dark:text-slate-700">-</span>}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 dark:text-slate-500">Family:</span>
                            <span className={low === "family" ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                              {product.family_price ? `${product.family_price.toFixed(2)} Q` : <span className="text-slate-300 dark:text-slate-700">-</span>}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 dark:text-slate-500">Lulu:</span>
                            <span className={low === "lulu" ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                              {product.lulu_price ? `${product.lulu_price.toFixed(2)} Q` : <span className="text-slate-300 dark:text-slate-700">-</span>}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                          }}
                          className="mt-4 w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-sm bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/40 dark:border-slate-700"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* -------------------- VIEW LAYOUT MODE 2: HIGH-DENSITY TABLE -------------------- */}
        {viewMode === "table" && (
          <div className="mb-6 overflow-hidden glass-card">
            <div className="overflow-x-auto">
              <table className="price-table w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50">
                    <th className="w-12 px-4 py-3.5 text-left font-bold text-slate-400" />
                    <th className="min-w-[220px] px-4 py-3.5 text-left font-bold text-slate-400">Common Product</th>
                    <th className="px-4 py-3.5 text-right font-bold text-green-600 dark:text-green-500">Rawabi</th>
                    <th className="px-4 py-3.5 text-right font-bold text-blue-600 dark:text-blue-500">Family</th>
                    <th className="px-4 py-3.5 text-right font-bold text-red-600 dark:text-red-500">Lulu</th>
                    <th className="px-4 py-3.5 text-right font-bold text-slate-400">Avg</th>
                    <th className="px-4 py-3.5 text-right font-bold text-slate-400">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, rowIndex) => (
                      <tr key={rowIndex}>
                        {Array.from({ length: 7 }).map((_, colIndex) => (
                          <td key={colIndex} className="px-4 py-3.5">
                            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-slate-400 dark:text-slate-500">
                        <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-bold">No products matching filters found</p>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => {
                      const low = lowestPrice(product);
                      return (
                        <tr
                          key={product.product_group_id}
                          className="cursor-pointer transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10"
                          onClick={() => setSelectedProduct(product)}
                        >
                          <td className="px-4 py-3">
                            {product.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.image_url}
                                alt={product.product_name}
                                className="h-9 w-9 rounded-lg border dark:border-slate-850 object-cover bg-white"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-850">
                                <ShoppingCart size={14} className="text-slate-300 dark:text-slate-600" />
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="line-clamp-2 font-bold text-slate-800 dark:text-slate-200">
                              {product.product_name}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PriceCell price={product.rawabi_price} isLowest={low === "rawabi"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PriceCell price={product.family_price} isLowest={low === "family"} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PriceCell price={product.lulu_price} isLowest={low === "lulu"} />
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-400">
                            {product.avg_price != null ? product.avg_price.toFixed(2) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-400 dark:text-slate-500 font-medium">
                            {product.last_updated
                              ? new Date(product.last_updated).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                })
                              : "-"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------- PAGINATION MODULE -------------------- */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-white/[0.06] bg-white/40 dark:bg-slate-900/10 px-4 py-4 rounded-2xl glass-card">
            <p className="text-xs md:text-sm font-semibold text-slate-400 dark:text-slate-500">
              Page <span className="text-slate-800 dark:text-slate-350">{page}</span> of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  fetchProducts(nextPage);
                }}
                disabled={page === 1}
                className="rounded-xl border border-slate-200/50 dark:border-white/[0.06] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2.5 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => {
                  const nextPage = Math.min(totalPages, page + 1);
                  setPage(nextPage);
                  fetchProducts(nextPage);
                }}
                disabled={page === totalPages}
                className="rounded-xl border border-slate-200/50 dark:border-white/[0.06] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 p-2.5 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
          Prices parsed and updated dynamically every 6 hours via GitHub Actions workflow scheduler. All prices shown in QAR.
        </p>
      </main>

      {/* Selected Product modal */}
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
