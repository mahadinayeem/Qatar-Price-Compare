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
  AlertTriangle,
  TrendingDown,
  ArrowUpRight,
  Apple,
  Leaf,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Product = {
  product_group_id: number;
  product_name: string;
  product_type: string | null;
  sku: string | null;
  origin_country: string | null;
  standard_weight: number | null;
  standard_unit: string | null;
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

type CompareRow = {
  sku: string;
  product_name: string;
  category: string;
  origin: string;
  unit: string;
  our_price: number | null;
  lulu_price: number | null;
  rawabi_price: number | null;
  family_price: number | null;
  avg_competitor_price: number | null;
  cheapest_competitor: string | null;
  cheapest_competitor_price: number | null;
  status: "Overpriced" | "Margin Opportunity" | "Competitive" | "No Match";
  potential_saving: number | null;
  potential_gain: number | null;
  image_url: string | null;
  product_group_id: number | null;
};

type CompareSummary = {
  overpriced: number;
  margin: number;
  competitive: number;
  no_match: number;
};

function fmt(price: number | null): string {
  if (price == null) return "-";
  return `${price.toFixed(2)} QAR`;
}

function formatProductUnit(weight: number | null, unit: string | null): string {
  if (weight == null || !unit) return "-";
  const u = unit.toLowerCase();
  if (u === "g") {
    if (weight >= 1000 && weight % 1000 === 0) {
      return `${weight / 1000}kg`;
    }
    return `${weight}g`;
  }
  if (u === "ml") {
    if (weight >= 1000 && weight % 1000 === 0) {
      return `${weight / 1000}ltr`;
    }
    return `${weight}ml`;
  }
  return `${weight}${unit}`;
}

// Mirrors Python get_display_name() — strips origin country and unit from canonical product name.
const COUNTRY_TOKENS = [
  "qatar", "china", "india", "egypt", "uganda", "italy", "holland",
  "australia", "usa", "south africa", "pakistan", "bangladesh",
  "morocco", "spain", "saudi", "ecuador", "brazil", "france", "kenya", "oman",
  "lebanon", "jordan", "iran", "vietnam", "thailand", "philippines", "mexico",
  "chile", "peru", "sri lanka", "turkey",
];

function getCleanProductName(name: string): string {
  if (!name) return "";
  let cleaned = name;
  // Remove weight/unit patterns (e.g. "250gm", "1kg", "500ml")
  cleaned = cleaned.replace(/(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|ml|ltr|l|pcs|pc|pkt)\b/gi, " ");
  // Remove country tokens (longest first to avoid partial matches)
  const sortedCountries = [...COUNTRY_TOKENS].sort((a, b) => b.length - a.length);
  for (const country of sortedCountries) {
    cleaned = cleaned.replace(new RegExp(`\\b${country}\\b`, "gi"), " ");
  }
  // Collapse extra spaces and title-case
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned
    ? cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
    : name.trim();
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
  const headers = ["Product Name", "Product Type", "SKU", "Rawabi (QAR)", "Family (QAR)", "Lulu (QAR)", "Avg Price (QAR)", "Last Updated"];
  const rows = products.map((p) => [
    `"${p.product_name.replace(/"/g, '""')}"`,
    `"${(p.product_type || "Other").replace(/"/g, '""')}"`,
    `"${(p.sku || "").replace(/"/g, '""')}"`,
    p.rawabi_price ?? "",
    p.family_price ?? "",
    p.lulu_price ?? "",
    p.avg_price ?? "",
    p.last_updated?.replace(" ", "T")?.split("T")[0] ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `product-prices-${new Date().toISOString().split("T")[0]}.csv`;
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
              {getCleanProductName(product.product_name)}
            </h2>
            {product.sku && (
              <p className="mt-0.5 text-xs font-bold text-brand-600 dark:text-brand-400">
                SKU: {product.sku}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2">
              {product.origin_country && (
                <span className="inline-flex items-center bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
                  {product.origin_country}
                </span>
              )}
              {product.standard_weight && (
                <span className="inline-flex items-center bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/20">
                  {product.standard_weight} {product.standard_unit}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 font-medium">
              Common product match across supermarkets
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Updated: {formatProductDate(product.last_updated)}
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

function CompanyChart({ storeCounts }: { storeCounts: { name: string; count: number }[] }) {
  const data = storeCounts.map(item => {
    let displayName = item.name;
    let fill = "#64748b";
    if (item.name.toLowerCase().includes("rawabi")) {
      displayName = "Rawabi";
      fill = "#16a34a";
    } else if (item.name.toLowerCase().includes("family")) {
      displayName = "Family";
      fill = "#2563eb";
    } else if (item.name.toLowerCase().includes("lulu")) {
      displayName = "Lulu";
      fill = "#dc2626";
    }
    return {
      name: displayName,
      count: item.count,
      fill: fill
    };
  });

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={56}>
        <CartesianGrid stroke="rgba(148, 163, 184, 0.06)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} stroke="none" />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="none" />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            color: "#fff",
          }}
          formatter={(value: number) => [`${value} items`, "Products Found"]}
        />
        <Bar dataKey="count" radius={[8, 8, 0, 0]}>
          {data.map((entry, index) => (
            <rect key={index} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function formatLastUpdated(dateStr: string | null) {
  if (!dateStr) return "-";
  // Convert "YYYY-MM-DD HH:MM:SS" to ISO "YYYY-MM-DDTHH:MM:SSZ" (assuming UTC)
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatProductDate(dateStr: string | null, includeTime: boolean = false, includeYear: boolean = true) {
  if (!dateStr) return "-";
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  });
}

export default function Dashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [showAllTypes, setShowAllTypes] = useState(false);
  const [productTypes, setProductTypes] = useState<{ product_type: string | null; count: number }[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [exporting, setExporting] = useState(false);
  const [lastScraped, setLastScraped] = useState<string | null>(null);
  const [storeCounts, setStoreCounts] = useState<{ name: string; count: number }[]>([]);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  // Compare tab state
  const [activeTab, setActiveTab] = useState<"market" | "compare">("market");
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [compareSummary, setCompareSummary] = useState<CompareSummary | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareCategoryFilter, setCompareCategoryFilter] = useState<"All" | "Fruits" | "Vegetables">("All");
  const [compareStatusFilter, setCompareStatusFilter] = useState<string>("All");

  const LIMIT = 50;
  const searchRef = useRef<NodeJS.Timeout>();

  // Initial load on component mount
  useEffect(() => {
    fetchProducts(1);
  }, []);

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
        t: Date.now().toString(), // Cache buster!
      });
      if (selectedTypes.length > 0) {
        params.append("types", selectedTypes.join(","));
      }

      const res = await fetch(`/api/products?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setProducts(data.products || []);
      setTotal(data.total || 0);
      setProductTypes(data.productTypes || []);
      setLastScraped(data.lastScraped || null);
      setStoreCounts(data.storeCounts || []);
      setLoading(false);
    },
    [search, selectedTypes]
  );

  const fetchCompare = useCallback(async () => {
    setCompareLoading(true);
    try {
      const res = await fetch("/api/compare", { cache: "no-store" });
      const data = await res.json();
      setCompareRows(data.compare || []);
      setCompareSummary(data.summary || null);
    } catch (err) {
      console.error("Failed to fetch compare data:", err);
    } finally {
      setCompareLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "compare" && compareRows.length === 0) {
      fetchCompare();
    }
  }, [activeTab, fetchCompare, compareRows.length]);

  const handleRefresh = async () => {
    try {
      setScraping(true);
      setScrapeError(null);
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Scraper execution failed");
      }
      await fetchProducts(page);
    } catch (err: any) {
      console.error("Failed to run scraper:", err);
      setScrapeError(err.message || "Failed to update prices.");
    } finally {
      setScraping(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchProducts(1);
  }, [selectedTypes]);

  useEffect(() => {
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setPage(1);
      fetchProducts(1);
    }, 350);
  }, [search]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams({
        search,
        page: "1",
        limit: "100000",
      });
      if (selectedTypes.length > 0) {
        params.append("types", selectedTypes.join(","));
      }

      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();
      const allProducts = data.products || [];
      exportToCSV(allProducts);
    } catch (err) {
      console.error("Failed to export products:", err);
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen transition-theme dark:bg-[#0b0f19]">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200/50 dark:border-white/[0.06] shadow-sm transition-theme">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 via-emerald-600 to-blue-600 shadow-md shadow-emerald-500/10">
              <ShoppingCart size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                Product Price Compare
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
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-2 rounded-xl bg-green-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/10 hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              <span className="hidden md:inline">
                {exporting ? "Exporting..." : "Export CSV"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Banner Section */}
      <div className="relative h-56 sm:h-64 w-full overflow-hidden bg-slate-900 shadow-inner">
        {/* Background Image with overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-60 dark:opacity-40 transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: "url('/hero_banner.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-7xl h-full px-4 sm:px-6 flex flex-col justify-center text-white">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-500/35 text-emerald-350 text-xs font-semibold w-fit mb-3.5 backdrop-blur-md shadow-sm">
              <ShoppingCart size={12} className="text-emerald-400" /> Live Supermarket Price Comparison
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-none drop-shadow-md text-white">
              Product Price Compare
            </h2>
            <p className="mt-2.5 text-sm sm:text-base md:text-lg text-slate-200 font-medium drop-shadow max-w-xl">
              Compare fresh fruit and vegetable prices across Rawabi, Family Food Centre, and Lulu Hypermarket. Shop smart and save on your daily produce.
            </p>
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="sticky top-[65px] z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/50 dark:border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-1 pt-2">
            <button
              onClick={() => setActiveTab("market")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-all border-b-2 ${
                activeTab === "market"
                  ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-500/5"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <ShoppingCart size={15} /> Market Prices
            </button>
            <button
              onClick={() => setActiveTab("compare")}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-all border-b-2 ${
                activeTab === "compare"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-500/5"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <BarChart2 size={15} /> Price Compare
              {compareSummary && compareSummary.overpriced > 0 && (
                <span className="ml-1 bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {compareSummary.overpriced}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Body container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 relative">
        {/* ═══════════════════════════════════════════════════════
             PRICE COMPARE TAB
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "compare" && (
          <div className="animate-fade-in">
            {/* Summary Alert Cards */}
            {compareSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="glass-card p-4 border-l-4 border-red-500">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overpriced</span>
                  </div>
                  <p className="text-3xl font-black text-red-500">{compareSummary.overpriced}</p>
                  <p className="text-xs text-slate-400 mt-1">Products priced above competitors</p>
                </div>
                <div className="glass-card p-4 border-l-4 border-amber-500">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowUpRight size={16} className="text-amber-500" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Margin Boost</span>
                  </div>
                  <p className="text-3xl font-black text-amber-500">{compareSummary.margin}</p>
                  <p className="text-xs text-slate-400 mt-1">Can raise price & stay cheapest</p>
                </div>
                <div className="glass-card p-4 border-l-4 border-emerald-500">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown size={16} className="text-emerald-500" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Competitive</span>
                  </div>
                  <p className="text-3xl font-black text-emerald-500">{compareSummary.competitive}</p>
                  <p className="text-xs text-slate-400 mt-1">Priced competitively</p>
                </div>
                <div className="glass-card p-4 border-l-4 border-slate-400">
                  <div className="flex items-center gap-2 mb-1">
                    <Search size={16} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">No Match</span>
                  </div>
                  <p className="text-3xl font-black text-slate-400">{compareSummary.no_match}</p>
                  <p className="text-xs text-slate-400 mt-1">Not found in scraped data</p>
                </div>
              </div>
            )}
            {/* ── Analytics Charts Section ── */}
            {compareRows.length > 0 && (
              <div className="mb-6 space-y-4">
                {/* Row 1: KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(() => {
                    const totalSaving = compareRows
                      .filter(r => r.status === "Overpriced" && r.potential_saving != null)
                      .reduce((s, r) => s + (r.potential_saving ?? 0), 0);
                    const totalGain = compareRows
                      .filter(r => r.status === "Margin Opportunity" && r.potential_gain != null)
                      .reduce((s, r) => s + (r.potential_gain ?? 0), 0);
                    const fruitsCount = compareRows.filter(r => r.category === "Fruits" && r.status !== "No Match").length;
                    const vegCount = compareRows.filter(r => r.category === "Vegetables" && r.status !== "No Match").length;
                    return (
                      <>
                        <div className="glass-card p-4 flex flex-col gap-1">
                          <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Total Overprice Gap</p>
                          <p className="text-2xl font-black text-red-500">{totalSaving.toFixed(2)} <span className="text-xs font-bold">QAR</span></p>
                          <p className="text-[10px] text-slate-400">Sum of over-charged amounts</p>
                        </div>
                        <div className="glass-card p-4 flex flex-col gap-1">
                          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Margin Opportunity</p>
                          <p className="text-2xl font-black text-amber-500">{totalGain.toFixed(2)} <span className="text-xs font-bold">QAR</span></p>
                          <p className="text-[10px] text-slate-400">Potential revenue uplift</p>
                        </div>
                        <div className="glass-card p-4 flex flex-col gap-1">
                          <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Fruits Matched</p>
                          <p className="text-2xl font-black text-orange-500">{fruitsCount}</p>
                          <p className="text-[10px] text-slate-400">Fruit products found in market</p>
                        </div>
                        <div className="glass-card p-4 flex flex-col gap-1">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Vegetables Matched</p>
                          <p className="text-2xl font-black text-emerald-500">{vegCount}</p>
                          <p className="text-[10px] text-slate-400">Vegetable products found in market</p>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Row 2: Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {/* Chart 1: Status Breakdown Donut */}
                  {(() => {
                    const matched = compareRows.filter(r => r.status !== "No Match");
                    const statusData = [
                      { name: "Overpriced", value: matched.filter(r => r.status === "Overpriced").length, color: "#ef4444" },
                      { name: "Margin Boost", value: matched.filter(r => r.status === "Margin Opportunity").length, color: "#f59e0b" },
                      { name: "Competitive", value: matched.filter(r => r.status === "Competitive").length, color: "#10b981" },
                      { name: "No Match", value: compareRows.filter(r => r.status === "No Match").length, color: "#94a3b8" },
                    ].filter(d => d.value > 0);
                    return (
                      <div className="glass-card p-4 col-span-1">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <BarChart2 size={13} className="text-orange-500" /> Price Status Breakdown
                        </h3>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={statusData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                              {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "10px", color: "#fff", fontSize: 11 }}
                              formatter={(v: number, name: string) => [`${v} products`, name]}
                            />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* Chart 2: Category Split */}
                  {(() => {
                    const catData = [
                      { name: "Fruits", Overpriced: compareRows.filter(r => r.category === "Fruits" && r.status === "Overpriced").length, Competitive: compareRows.filter(r => r.category === "Fruits" && r.status === "Competitive").length, "Margin Boost": compareRows.filter(r => r.category === "Fruits" && r.status === "Margin Opportunity").length },
                      { name: "Vegetables", Overpriced: compareRows.filter(r => r.category === "Vegetables" && r.status === "Overpriced").length, Competitive: compareRows.filter(r => r.category === "Vegetables" && r.status === "Competitive").length, "Margin Boost": compareRows.filter(r => r.category === "Vegetables" && r.status === "Margin Opportunity").length },
                    ];
                    return (
                      <div className="glass-card p-4 col-span-1">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Apple size={13} className="text-orange-500" /> Category Breakdown
                        </h3>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={catData} barSize={26}>
                            <CartesianGrid stroke="rgba(148,163,184,0.07)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="none" />
                            <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} stroke="none" />
                            <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "10px", color: "#fff", fontSize: 11 }} />
                            <Bar dataKey="Overpriced" stackId="a" fill="#ef4444" radius={[0,0,0,0]} />
                            <Bar dataKey="Margin Boost" stackId="a" fill="#f59e0b" />
                            <Bar dataKey="Competitive" stackId="a" fill="#10b981" radius={[4,4,0,0]} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* Chart 3: Top Origins */}
                  {(() => {
                    const originMap: Record<string, number> = {};
                    compareRows.filter(r => r.status !== "No Match" && r.origin).forEach(r => {
                      const o = r.origin || "Unknown";
                      originMap[o] = (originMap[o] || 0) + 1;
                    });
                    const originData = Object.entries(originMap)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 6)
                      .map(([name, value]) => ({ name, value }));
                    return (
                      <div className="glass-card p-4 col-span-1">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Leaf size={13} className="text-emerald-500" /> Top Origins
                        </h3>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={originData} layout="vertical" barSize={10}>
                            <CartesianGrid stroke="rgba(148,163,184,0.07)" strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} stroke="none" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} width={56} stroke="none" />
                            <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "10px", color: "#fff", fontSize: 11 }} formatter={(v: number) => [`${v} products`]} />
                            <Bar dataKey="value" fill="#6366f1" radius={[0,4,4,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}

                  {/* Chart 4: Cheapest Competitor */}
                  {(() => {
                    const storeMap: Record<string, number> = { Lulu: 0, Rawabi: 0, Family: 0 };
                    compareRows.filter(r => r.cheapest_competitor).forEach(r => {
                      const s = r.cheapest_competitor || "";
                      if (s in storeMap) storeMap[s] = (storeMap[s] || 0) + 1;
                    });
                    const storeColors: Record<string, string> = { Lulu: "#ef4444", Rawabi: "#16a34a", Family: "#2563eb" };
                    const storeData = Object.entries(storeMap).map(([name, value]) => ({ name, value, fill: storeColors[name] || "#64748b" }));
                    return (
                      <div className="glass-card p-4 col-span-1">
                        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Crown size={13} className="text-yellow-500" /> Cheapest Competitor Wins
                        </h3>
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart data={storeData} barSize={36}>
                            <CartesianGrid stroke="rgba(148,163,184,0.07)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} stroke="none" />
                            <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} stroke="none" />
                            <Tooltip contentStyle={{ backgroundColor: "rgba(15,23,42,0.95)", borderColor: "rgba(255,255,255,0.1)", borderRadius: "10px", color: "#fff", fontSize: 11 }} formatter={(v: number) => [`${v} times cheapest`]} />
                            <Bar dataKey="value" radius={[6,6,0,0]}>
                              {storeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Filters Row */}
            <div className="glass-card p-4 mb-6 flex flex-wrap gap-3 items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category:</span>
              {(["All", "Fruits", "Vegetables"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCompareCategoryFilter(cat)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                    compareCategoryFilter === cat
                      ? cat === "Fruits" ? "bg-orange-500 border-orange-500 text-white" : cat === "Vegetables" ? "bg-emerald-600 border-emerald-600 text-white" : "bg-slate-700 border-slate-700 text-white"
                      : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200/50 dark:border-white/[0.06] hover:bg-slate-100"
                  }`}
                >
                  {cat === "Fruits" ? <Apple size={12} /> : cat === "Vegetables" ? <Leaf size={12} /> : null}
                  {cat}
                </button>
              ))}
              <span className="ml-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
              {(["All", "Overpriced", "Margin Opportunity", "Competitive"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setCompareStatusFilter(st)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                    compareStatusFilter === st
                      ? st === "Overpriced" ? "bg-red-500 border-red-500 text-white" : st === "Margin Opportunity" ? "bg-amber-500 border-amber-500 text-white" : st === "Competitive" ? "bg-emerald-500 border-emerald-500 text-white" : "bg-slate-700 border-slate-700 text-white"
                      : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200/50 dark:border-white/[0.06] hover:bg-slate-100"
                  }`}
                >
                  {st}
                </button>
              ))}
              <button
                onClick={fetchCompare}
                disabled={compareLoading}
                className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-white/[0.06] transition disabled:opacity-50"
              >
                <RefreshCw size={12} className={compareLoading ? "animate-spin" : ""} />
                {compareLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {/* Comparison Table */}
            <div className="glass-card overflow-hidden mb-6">
              <div className="overflow-x-auto">
                {compareLoading ? (
                  <div className="py-20 text-center">
                    <RefreshCw size={32} className="mx-auto animate-spin text-orange-400 mb-3" />
                    <p className="text-sm text-slate-400 font-medium">Loading comparison data...</p>
                  </div>
                ) : (
                  <table className="price-table w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200/50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50">
                        <th className="px-4 py-3.5 text-left font-bold text-slate-400">Product</th>
                        <th className="px-4 py-3.5 text-left font-bold text-slate-400">Category</th>
                        <th className="px-4 py-3.5 text-left font-bold text-slate-400">Origin / Unit</th>
                        <th className="px-4 py-3.5 text-right font-bold text-orange-600 dark:text-orange-400">Our Price</th>
                        <th className="px-4 py-3.5 text-right font-bold text-green-600 dark:text-green-400">Rawabi</th>
                        <th className="px-4 py-3.5 text-right font-bold text-blue-600 dark:text-blue-400">Family</th>
                        <th className="px-4 py-3.5 text-right font-bold text-red-600 dark:text-red-400">Lulu</th>
                        <th className="px-4 py-3.5 text-center font-bold text-slate-400">Status</th>
                        <th className="px-4 py-3.5 text-right font-bold text-slate-400">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                      {compareRows
                        .filter((r) => compareCategoryFilter === "All" || r.category === compareCategoryFilter)
                        .filter((r) => compareStatusFilter === "All" || r.status === compareStatusFilter)
                        .sort((a, b) => {
                          const order = { "Overpriced": 0, "Margin Opportunity": 1, "Competitive": 2, "No Match": 3 };
                          return (order[a.status] ?? 4) - (order[b.status] ?? 4);
                        })
                        .map((row, idx) => (
                          <tr key={idx} className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/10 ${
                            row.status === "Overpriced" ? "bg-red-50/30 dark:bg-red-500/5" :
                            row.status === "Margin Opportunity" ? "bg-amber-50/30 dark:bg-amber-500/5" : ""
                          }`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {row.image_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={row.image_url} alt={row.product_name} className="h-9 w-9 rounded-lg object-cover bg-white border dark:border-slate-800" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                ) : (
                                  <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><ShoppingCart size={14} className="text-slate-300" /></div>
                                )}
                                <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-2 max-w-[160px]">{row.product_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                row.category === "Fruits"
                                  ? "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200/40 dark:border-orange-500/20"
                                  : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200/40 dark:border-emerald-500/20"
                              }`}>
                                {row.category === "Fruits" ? <Apple size={9} /> : <Leaf size={9} />}
                                {row.category || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {row.origin && <span className="font-medium">{row.origin}</span>}
                                {row.origin && row.unit && " · "}
                                {row.unit && <span>{row.unit}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-extrabold text-orange-600 dark:text-orange-400 tabular-nums">
                                {row.our_price != null ? `${row.our_price.toFixed(2)} Q` : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                                {row.rawabi_price != null ? `${row.rawabi_price.toFixed(2)}` : <span className="text-slate-300 dark:text-slate-700">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                                {row.family_price != null ? `${row.family_price.toFixed(2)}` : <span className="text-slate-300 dark:text-slate-700">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                                {row.lulu_price != null ? `${row.lulu_price.toFixed(2)}` : <span className="text-slate-300 dark:text-slate-700">—</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                                row.status === "Overpriced"
                                  ? "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200/50 dark:border-red-500/20"
                                  : row.status === "Margin Opportunity"
                                  ? "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/50 dark:border-amber-500/20"
                                  : row.status === "Competitive"
                                  ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-500/20"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200/50 dark:border-slate-700"
                              }`}>
                                {row.status === "Overpriced" && <AlertTriangle size={9} />}
                                {row.status === "Margin Opportunity" && <ArrowUpRight size={9} />}
                                {row.status === "Competitive" && <TrendingDown size={9} />}
                                {row.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {row.status === "Overpriced" && row.potential_saving != null && (
                                <span className="text-xs font-bold text-red-500">↓ {row.potential_saving.toFixed(2)} Q too high</span>
                              )}
                              {row.status === "Margin Opportunity" && row.potential_gain != null && (
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">↑ Raise by {row.potential_gain.toFixed(2)} Q</span>
                              )}
                              {row.status === "Competitive" && (
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Good</span>
                              )}
                              {row.status === "No Match" && (
                                <span className="text-xs text-slate-400">Not scraped</span>
                              )}
                            </td>
                          </tr>
                        ))
                      }
                      {!compareLoading && compareRows.filter((r) => compareCategoryFilter === "All" || r.category === compareCategoryFilter).filter((r) => compareStatusFilter === "All" || r.status === compareStatusFilter).length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-slate-500">
                            <ShoppingCart size={36} className="mx-auto mb-3 opacity-25" />
                            <p className="font-bold">No items found. Make sure your Google Sheet has data and the scraper has run today.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <p className="text-center text-xs text-slate-400 dark:text-slate-500 font-medium mb-4">
              Comparison is based on today&apos;s scraped data vs your Google Sheet prices. Run the scraper to get fresh data.
            </p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════
             MARKET VIEW TAB (existing content wrapped)
        ═══════════════════════════════════════════════════════ */}
        {activeTab === "market" && (
          <div className="animate-fade-in">
        {/* Statistics Charts */}
        {showChart && storeCounts.length > 0 && (
          <div className="mb-6 glass-card p-5 animate-fade-in">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
              <BarChart2 size={18} className="text-brand-500" /> Total Products Scraped per Store
            </h2>
            <CompanyChart storeCounts={storeCounts} />
          </div>
        )}

        {/* Search input container */}
        <div className="mb-6 glass-card p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
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

            {/* Refresh Button & Last Updated Time */}
            <div className="flex flex-col items-center sm:items-end gap-1 select-none">
              <button
                onClick={handleRefresh}
                disabled={loading || scraping}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-slate-250 dark:border-white/[0.08] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-4 py-3 text-sm font-semibold transition text-slate-700 dark:text-slate-350 cursor-pointer shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={16} className={loading || scraping ? "animate-spin" : ""} />
                <span>{scraping ? "Scraping Sites... (1-2 mins)" : "Refresh Data"}</span>
              </button>
              {scrapeError && (
                <span className="text-[10px] text-rose-500 font-bold max-w-[200px] text-right">
                  Error: {scrapeError}
                </span>
              )}
              {lastScraped && !scrapeError && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap">
                  Last updated: {formatLastUpdated(lastScraped)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Category Filters Panel (Horizontal checkbox layout) */}
        {productTypes.length > 0 && (
          <div className="mb-6 glass-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  Filter by Category
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Select one or multiple categories to compare prices.
                </p>
              </div>
              {selectedTypes.length > 0 && (
                <button
                  onClick={() => setSelectedTypes([])}
                  className="text-xs text-rose-500 hover:text-rose-650 font-bold transition flex items-center gap-1.5 w-fit"
                >
                  <X size={14} /> Clear active filters ({selectedTypes.length})
                </button>
              )}
            </div>

            {/* Horizontal checkboxes flex-wrap */}
            <div className="flex flex-wrap gap-2.5">
              {/* Select All / All Products pill */}
              <button
                onClick={() => setSelectedTypes([])}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 border ${
                  selectedTypes.length === 0
                    ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/15"
                    : "bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200/50 dark:border-white/[0.06] hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div className={`h-4.5 w-4.5 rounded border flex items-center justify-center transition-colors ${
                  selectedTypes.length === 0
                    ? "bg-white border-white text-emerald-500"
                    : "border-slate-350 dark:border-slate-600 bg-white dark:bg-slate-800"
                }`}>
                  {selectedTypes.length === 0 && (
                    <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                      <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                    </svg>
                  )}
                </div>
                <span>All Products</span>
              </button>

              {/* Individual category checkboxes */}
              {(showAllTypes ? productTypes : productTypes.slice(0, 8)).map((type) => {
                const typeName = type.product_type || "Other";
                const isSelected = selectedTypes.includes(typeName);

                return (
                  <button
                    key={typeName}
                    onClick={() => {
                      setSelectedTypes((prev) => {
                        if (prev.includes(typeName)) {
                          return prev.filter((t) => t !== typeName);
                        } else {
                          return [...prev, typeName];
                        }
                      });
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 border ${
                      isSelected
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/15"
                        : "bg-slate-550/50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-450 border-slate-200/50 dark:border-white/[0.06] hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className={`h-4.5 w-4.5 rounded border flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-white border-white text-emerald-500"
                        : "border-slate-350 dark:border-slate-600 bg-white dark:bg-slate-800"
                    }`}>
                      {isSelected && (
                        <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                          <path d="M0 11l2-2 5 5L18 3l2 2L7 18z" />
                        </svg>
                      )}
                    </div>
                    <span>{typeName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                      isSelected
                        ? "bg-white/20 text-white"
                        : "bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}>
                      {type.count}
                    </span>
                  </button>
                );
              })}

              {/* See More Toggle Button */}
              {productTypes.length > 8 && (
                <button
                  onClick={() => setShowAllTypes(!showAllTypes)}
                  className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-emerald-600 dark:text-emerald-450 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all flex items-center gap-1"
                >
                  {showAllTypes ? "Show Less" : `See More (${productTypes.length - 8} more)`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area (Full Width Grid/Table) */}
        <div className="w-full">
          {/* Comparison Indicators */}
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-1">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {scraping ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 animate-pulse font-bold">
                  <RefreshCw size={12} className="animate-spin" /> Scraping supermarkets for fresh prices (takes 1-2 mins)...
                </span>
              ) : loading ? (
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

          {/* GRID VIEW */}
          {viewMode === "grid" && (
            <div className="mb-6">
              {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 15 }).map((_, idx) => (
                    <div key={idx} className="glass-card h-80 p-5 flex flex-col justify-between animate-pulse">
                      <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                      <div className="h-4 w-3/4 bg-slate-100 dark:bg-slate-800 rounded my-2" />
                      <div className="space-y-1">
                        <div className="h-3 w-1/2 bg-slate-100 dark:bg-slate-800 rounded" />
                        <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800 rounded" />
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {products.map((product) => {
                    const low = lowestPrice(product);
                    return (
                      <div
                        key={product.product_group_id}
                        className="glass-card p-4 hover:-translate-y-1.5 hover:shadow-xl hover:border-brand-500/35 hover:dark:border-white/10 flex flex-col justify-between relative group cursor-pointer"
                        onClick={() => setSelectedProduct(product)}
                      >
                        <div>
                          <div className="w-full h-36 rounded-xl border dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 relative">
                            {product.image_url ? (
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
                                  <Crown size={8} /> Cheapest
                                </span>
                              </div>
                            )}
                            {product.product_type && (
                              <div className="absolute top-2 right-2 z-10">
                                <span className="bg-slate-900/60 backdrop-blur-sm text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider">
                                  {product.product_type}
                                </span>
                              </div>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 mt-3 leading-snug">
                            {getCleanProductName(product.product_name)}
                          </h3>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {product.origin_country && (
                              <span className="inline-flex items-center bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
                                {product.origin_country}
                              </span>
                            )}
                            {(product.standard_weight || product.standard_unit) && (
                              <span className="inline-flex items-center bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/20">
                                {formatProductUnit(product.standard_weight, product.standard_unit)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="border-t border-slate-100 dark:border-slate-800/50 pt-3 space-y-2 text-xs font-semibold">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 dark:text-slate-500">Rawabi:</span>
                              <span className={low === "rawabi" ? "text-green-600 dark:text-green-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                                {product.rawabi_price ? `${product.rawabi_price.toFixed(2)} Q` : <span className="text-slate-350 dark:text-slate-700">-</span>}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 dark:text-slate-500">Family:</span>
                              <span className={low === "family" ? "text-blue-600 dark:text-blue-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                                {product.family_price ? `${product.family_price.toFixed(2)} Q` : <span className="text-slate-350 dark:text-slate-700">-</span>}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400 dark:text-slate-500">Lulu:</span>
                              <span className={low === "lulu" ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-700 dark:text-slate-300"}>
                                {product.lulu_price ? `${product.lulu_price.toFixed(2)} Q` : <span className="text-slate-350 dark:text-slate-700">-</span>}
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

          {/* TABLE VIEW */}
          {viewMode === "table" && (
            <div className="mb-6 overflow-hidden glass-card">
              <div className="overflow-x-auto">
                <table className="price-table w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/50 dark:border-white/[0.06] bg-slate-50/50 dark:bg-slate-900/50">
                      <th className="w-12 px-4 py-3.5 text-left font-bold text-slate-400" />
                      <th className="min-w-[200px] px-4 py-3.5 text-left font-bold text-slate-400">Common Product</th>
                      <th className="px-4 py-3.5 text-left font-bold text-slate-400">SKU</th>
                      <th className="px-4 py-3.5 text-left font-bold text-slate-400">Type</th>
                      <th className="px-4 py-3.5 text-left font-bold text-slate-400">Origin</th>
                      <th className="px-4 py-3.5 text-left font-bold text-slate-400">Unit</th>
                      <th className="px-4 py-3.5 text-right font-bold text-green-600 dark:text-green-500">Rawabi</th>
                      <th className="px-4 py-3.5 text-right font-bold text-blue-600 dark:text-blue-500">Family</th>
                      <th className="px-4 py-3.5 text-right font-bold text-red-600 dark:text-red-500">Lulu</th>
                      <th className="px-4 py-3.5 text-right font-bold text-slate-400">Avg</th>
                      <th className="px-4 py-3.5 text-right font-bold text-slate-400">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                    {loading ? (
                      Array.from({ length: 10 }).map((_, rowIndex) => (
                        <tr key={rowIndex}>
                          {Array.from({ length: 11 }).map((_, colIndex) => (
                            <td key={colIndex} className="px-4 py-3.5">
                              <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : products.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-20 text-center text-slate-400 dark:text-slate-500">
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
                                {getCleanProductName(product.product_name)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                                {product.sku || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-left">
                              <span className="inline-flex items-center bg-slate-100 dark:bg-slate-800 text-slate-650 dark:text-slate-350 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                {product.product_type || "Other"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-left">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                                {product.origin_country || "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-left">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-350">
                                {formatProductUnit(product.standard_weight, product.standard_unit)}
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
                              {formatProductDate(product.last_updated, false, false)}
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

          {/* PAGINATION */}
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
                  className="rounded-xl border border-slate-200/50 dark:border-white/[0.06] bg-white dark:bg-slate-800 text-slate-650 dark:text-slate-300 p-2.5 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="rounded-xl border border-slate-200/50 dark:border-white/[0.06] bg-white dark:bg-slate-800 text-slate-650 dark:text-slate-300 p-2.5 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
          Prices parsed and updated dynamically every 6 hours via GitHub Actions workflow scheduler. All prices shown in QAR.
        </p>
          </div>
        )}
      </main>
      {/* Selected Product modal */}
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </div>
  );
}
