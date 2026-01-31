import React, { useMemo, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeCountryCode } from "@/lib/utils";

// ---------------- Brand helpers ----------------
const ALLOWED_BRANDS = new Set(["jtw", "otq", "tbh", "bh"]);
const sanitizeBrandValue = (v) => {
  const s = String(v || "").toLowerCase();
  return ALLOWED_BRANDS.has(s) ? s : "all";
};

const normalizeBrandFilter = (b) => {
  const up = String(b || "").toUpperCase().trim();
  if (!up) return "";
  if (up === "BH") return "TBH";
  return up;
};

const brandCodeToNames = {
  JTW: ["jules taylor", "jules", "jt", "jtw"],
  OTQ: ["on the quiet", "on-the-quiet", "otq"],
  TBH: ["the better half", "better half", "tbh", "bh"],
};

const detectBrandCode = (row) => {
  const fields = [
    row.AdditionalAttribute3,
    row.BrandCode,
    row.Brand,
    row.ProductName,
    row.Product,
    row.Stock,
    row.SKU,
    row.Code,
    row.ProductDescription,
    row["Product Description (SKU)"],
    row["Wine Name"],
    row["Wines"],
  ]
    .filter(Boolean)
    .map((v) => String(v).trim());

  const hay = fields.join(" | ");
  const hayLower = hay.toLowerCase();
  const hayUpper = hay.toUpperCase();

  const hasCodeToken = (code) =>
    hayUpper === code ||
    hayUpper.includes(`_${code}_`) ||
    hayUpper.startsWith(`${code}_`) ||
    hayUpper.endsWith(`_${code}`) ||
    new RegExp(`\\b${code}\\b`, "i").test(hay);

  if (
    hasCodeToken("OTQ") ||
    hayLower.includes("on the quiet") ||
    new RegExp(`\\botq\\b`, "i").test(hay)
  ) {
    return "OTQ";
  }

  if (hasCodeToken("TBH") || hasCodeToken("BH")) return "TBH";
  if (hayLower.includes("the better half") || hayLower.includes("better half"))
    return "TBH";

  if (hasCodeToken("JTW")) return "JTW";
  if (hayLower.includes("jules taylor")) return "JTW";

  return "";
};

const matchesBrand = (row, brandFilter) => {
  if (!brandFilter || brandFilter === "all") return true;
  const target = normalizeBrandFilter(brandFilter).toUpperCase();
  if (!target) return true;

  const detected = detectBrandCode(row);
  if (detected) return detected === target;

  const fields = [
    row.AdditionalAttribute3,
    row.BrandCode,
    row.Brand,
    row.ProductName,
    row.Product,
    row.Stock,
    row.SKU,
    row.Code,
    row.ProductDescription,
    row["Product Description (SKU)"],
    row["Wine Name"],
    row["Wines"],
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  const text = fields.join(" | ");

  const names = brandCodeToNames[target] || [];
  for (const name of names) {
    const variations = [
      name,
      name.replace(/\s+/g, ""),
      name.replace(/\s+/g, "_"),
      name.toUpperCase(),
      name.toUpperCase().replace(/\s+/g, "_"),
    ];
    for (const v of variations) {
      if (text.includes(String(v).toLowerCase())) return true;
    }
  }

  if (text.includes(target.toLowerCase())) return true;
  return false;
};

// ---------------- NZ Channel helpers (FilterBar-only) ----------------
const CANON_NZ_CHANNELS = ["grocery", "on premise", "off premise"];

function normalizeChannel(v) {
  const s0 = String(v ?? "").trim();
  if (!s0 || s0 === "-" || s0.toLowerCase() === "na" || s0.toLowerCase() === "n/a") return "-";

  const s = s0
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (s.includes("grocery")) return "Grocery";
  if (s.replace(/\s+/g, "").includes("onpremise")) return "On premise";
  if (s.replace(/\s+/g, "").includes("offpremise")) return "Off premise";

  // keep unknowns (still normalized)
  return s;
}

function pickChannelKeyFromRows(rows) {
  const candidates = ["_channel", "Channel", "channel", "Sales Channel", "CHANNEL"];
  for (const k of candidates) {
    if (rows?.some(r => r && r[k] != null && String(r[k]).trim() !== "")) return k;
  }
  return null;
}

// ---------------- Component ----------------
export default function FilterBar({ filters, onFilterChange }) {
  const [dateRange, setDateRange] = React.useState({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date(),
  });

  const [viewMode, setViewMode] = React.useState("historical");

  useEffect(() => {
    if (filters.year && filters.year !== "all") {
      const selectedYear = parseInt(filters.year);
      if (!isNaN(selectedYear)) {
        const newDateRange = {
          from: new Date(selectedYear, 0, 1),
          to: new Date(selectedYear, 11, 31),
        };
        setDateRange(newDateRange);
        onFilterChange("dateRange", newDateRange);
      }
    }
  }, [filters.year]);

  const filterOptions = useMemo(() => {
    const DEBUG = true;
    const dbg = (...args) => DEBUG && console.log("[FilterBar]", ...args);

    try {
      const safeJson = (s) => {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      };

      // ---------- Distributor stock ----------
      const distributorRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
      const metadata = distributorMetadataRaw ? safeJson(distributorMetadataRaw) : null;

      let distributorStock = distributorRaw ? safeJson(distributorRaw) : [];
      if (!Array.isArray(distributorStock)) distributorStock = [];

      // ---------- Sales (depletion) ----------
      const salesMetadataRaw = localStorage.getItem("vc_sales_metadata");
      const salesMeta = salesMetadataRaw ? safeJson(salesMetadataRaw) : null; // ✅ FIX: defined once, in scope

      let salesData = [];
      const selectedCountry = String(filters.country || "").toLowerCase();
      const needNZ = selectedCountry === "nzl";

      dbg("COUNTRY for options:", { selectedCountry, needNZ });
      dbg("salesMeta.sheetNames:", salesMeta?.sheetNames || []);

      if (salesMeta?.sheetNames && Array.isArray(salesMeta.sheetNames)) {
        salesMeta.sheetNames.forEach((sheetName) => {
          const sn = String(sheetName).toUpperCase().trim();
          const wantUSA = sn.includes("USA");
          const wantNZ = needNZ && (sn === "NZ" || sn === "NZL" || sn.includes("NZ"));

          if (!wantUSA && !wantNZ) return;

          const key = `vc_sales_data_${sheetName}`;
          const sheetData = localStorage.getItem(key);
          const parsed = sheetData ? safeJson(sheetData) : null;

          dbg("sheet check", { sheetName, key, rows: Array.isArray(parsed) ? parsed.length : "not-array" });

          if (Array.isArray(parsed)) salesData.push(...parsed);
        });
      }

      if (distributorStock.length === 0 && salesData.length === 0) {
        return { countries: [], distributors: [], states: [], wineTypes: [], brands: [], channels: [] };
      }

      // ---------- Countries ----------
      const countryDisplayNames = {
        usa: "USA",
        "au-b": "AU-B",
        "au-c": "AU-C",
        nzl: "New Zealand",
        ire: "Ireland",
      };

      const sheetNameToCountryCode = {
        NZ: "nzl",
        NZL: "nzl",
        AUB: "au-b",
        "AU-B": "au-b",
        AUC: "au-c",
        "AU-C": "au-c",
        USA: "usa",
        IRE: "ire",
      };

      const countrySet = new Set();

      if (metadata?.sheetNames && Array.isArray(metadata.sheetNames)) {
        metadata.sheetNames.forEach((sheetName) => {
          const sn = String(sheetName).toUpperCase().trim();
          const cc = sheetNameToCountryCode[sn];
          if (cc) countrySet.add(cc);
        });
      }

      // Force AU-C always
      countrySet.add("au-c");

      if (countrySet.size === 0) {
        distributorStock.forEach((r) => {
          const raw = r.AdditionalAttribute2 || r.Market || "";
          const cc = normalizeCountryCode(raw).toLowerCase();
          if (cc) countrySet.add(cc);
        });
        countrySet.add("au-c");
      }

      const priorityCountries = ["usa", "au-b", "au-c", "nzl", "ire"];
      const countries = Array.from(countrySet)
        .map((code) => ({
          code,
          name: countryDisplayNames[code] || String(code).toUpperCase(),
        }))
        .sort((a, b) => {
          const ap = priorityCountries.indexOf(a.code);
          const bp = priorityCountries.indexOf(b.code);
          if (ap >= 0 && bp >= 0) return ap - bp;
          if (ap >= 0) return -1;
          if (bp >= 0) return 1;
          return a.name.localeCompare(b.name);
        });

      // ---------- Filter base ----------
      const allData = [...distributorStock, ...salesData];

      const countryFilter =
        filters.country === "all" ? null : String(filters.country || "").toLowerCase();

      const countryFilteredData = countryFilter
        ? allData.filter((r) => {
            const raw = r.AdditionalAttribute2 || r.Country || r.Market || "";
            const cc = normalizeCountryCode(raw).toLowerCase();
            const want = normalizeCountryCode(countryFilter).toLowerCase();
            return cc === want;
          })
        : allData;

      const brandValue = sanitizeBrandValue(filters.brand);
      const brandFilter = brandValue === "all" ? "" : brandValue;

      const brands = [
        { code: "jtw", name: "Jules Taylor" },
        { code: "otq", name: "On the Quiet" },
        { code: "tbh", name: "The Better Half" },
      ];

      const brandFilteredData = brandFilter
        ? countryFilteredData.filter((r) => matchesBrand(r, brandFilter))
        : countryFilteredData;

      // ---------- Wine types ----------
      const wineNameMap = {
        SAB: "Sauvignon Blanc",
        PIN: "Pinot Noir",
        CHR: "Chardonnay",
        ROS: "Rose",
        PIG: "Pinot Gris",
        GRU: "Gruner Veltliner",
        LHS: "Late Harvest Sauvignon",
        RIES: "Riesling",
      };

      const normalizeVarietyToCode = (text) => {
        const s = String(text || "").toUpperCase();

        for (const code of Object.keys(wineNameMap)) {
          if (s === code) return code;
        }

        const tokens = s.split(/[_\s/-]+/).filter(Boolean);
        for (const t of tokens) {
          if (wineNameMap[t]) return t;
          if (t === "ROSE" || t === "ROSÉ") return "ROS";
        }

        if (s.includes("SAUVIGNON")) return "SAB";
        if (s.includes("PINOT NOIR")) return "PIN";
        if (s.includes("CHARDONNAY")) return "CHR";
        if (s.includes("PINOT GRIS") || s.includes("PINOT GRIGIO")) return "PIG";
        if (s.includes("GRUNER")) return "GRU";
        if (s.includes("LATE HARVEST")) return "LHS";
        if (s.includes("RIESLING")) return "RIES";
        if (s.includes("ROSE") || s.includes("ROSÉ")) return "ROS";
        return "";
      };

      const wineTypeMap = new Map();
      const wineNameToCodeMap = new Map();

      const addWineType = (code) => {
        if (!code) return;
        const name = wineNameMap[code] || code;
        if (!wineNameToCodeMap.has(name)) {
          wineNameToCodeMap.set(name, code);
          wineTypeMap.set(code, name);
        }
      };

      brandFilteredData.forEach((r) => {
        const v1 = normalizeVarietyToCode(r.Variety);
        if (v1) addWineType(v1);

        const v2 = normalizeVarietyToCode(r.VarietyCode || r.AdditionalAttribute3);
        if (v2) addWineType(v2);

        const v3 = normalizeVarietyToCode(
          r.Stock || r["Wine Name"] || r["Wines"] || r.ProductName || r.Product
        );
        if (v3) addWineType(v3);
      });

      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // ---------- Channels (NZ only) ----------
      let channels = [];
      const wantNZ = normalizeCountryCode(countryFilter || "").toLowerCase() === "nzl";

      if (wantNZ) {
        const nzSalesRows = (salesData || []).filter((r) => {
          const raw = r.AdditionalAttribute2 || r.Country || r.Market || "";
          return normalizeCountryCode(raw).toLowerCase() === "nzl";
        });

        function pickChannelKeyFromRows(rows) {
          const candidates = ["_channel", "Channel", "channel", "Sales Channel", "CHANNEL"];
          for (const k of candidates) {
            if (rows?.some(r => r && r[k] != null && String(r[k]).trim() !== "")) return k;
          }
          return null;
        }

        const channelKey = pickChannelKeyFromRows(nzSalesRows);
        dbg("NZ channelKey:", channelKey);

        const set = new Set();
        nzSalesRows.forEach((r) => {
          const raw =
            r?._channel ??
            r?.Channel ??
            r?.channel ??
            r?.["Sales Channel"] ??
            r?.["CHANNEL"];

            if (raw == null || String(raw).trim() === "") return;
            const norm = normalizeChannel(raw);
            if (!norm) return;
            set.add(norm);

        });

        // fallback: if nothing OR only "-" exists, add canonical list
        if (set.size === 0 || (set.size === 1 && set.has("-"))) {
          NZ_CHANNELS.forEach((c) => set.add(c));
        }

        channels = Array.from(set).sort((a, b) => a.localeCompare(b));


        dbg("NZ channels options:", channels);
        dbg("NZ salesData rows:", nzSalesRows.length);

        // extra debug (super useful)
        dbg("NZ raw _channel sample:", nzSalesRows.slice(0, 10).map(r => r?._channel));
      }


      dbg("selected", { countryFilter, brandFilter });
      dbg("rows", {
        distributorStock: distributorStock.length,
        salesData: salesData.length,
        country: countryFilteredData.length,
        brand: brandFilteredData.length,
      });

      // Keep shape stable
      return {
        countries,
        distributors: [],
        states: [],
        wineTypes,
        brands,
        channels,
      };
    } catch (err) {
      console.error("FilterBar filterOptions error:", err);
      return { countries: [], distributors: [], states: [], wineTypes: [], brands: [], channels: [] };
    }
  }, [filters.country, filters.brand]);

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    onFilterChange("dateRange", range);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    onFilterChange("viewMode", mode);
  };

  const handleForwardLookingChange = (months) => {
    onFilterChange("forwardLookingMonths", months);
  };

  return (
    <div className="glass-effect rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 space-y-3 sm:space-y-4">
      {/* View Mode Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 border-b pb-3 sm:pb-4">
        <div className="flex items-center gap-2 text-slate-600">
          <Filter className="w-4 h-4" />
          <span className="text-sm font-medium">View:</span>
        </div>

        <Tabs value={viewMode} onValueChange={handleViewModeChange} className="w-full sm:w-auto">
          <TabsList className="bg-slate-100 w-full sm:w-auto">
            <TabsTrigger value="historical" className="flex-1 sm:flex-none text-xs sm:text-sm">
              Historical Data
            </TabsTrigger>
            <TabsTrigger value="forward" className="flex-1 sm:flex-none text-xs sm:text-sm">
              <TrendingUp className="w-3 h-3 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Forward Predictions</span>
              <span className="sm:hidden">Forward</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Primary Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3">
          {/* ✅ Country (reset channel when leaving NZ) */}
          <Select
            value={filters.country || "nzl"}
            onValueChange={(value) => {
              onFilterChange("country", value);
              if (value !== "nzl") onFilterChange("channel", "all");
            }}
          >
            <SelectTrigger className="w-full sm:w-40 text-sm">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.countries.length > 0 ? (
                filterOptions.countries.map((country) => (
                  <SelectItem key={country.code} value={country.code}>
                    {country.name}
                  </SelectItem>
                ))
              ) : (
                <>
                  <SelectItem value="usa">USA</SelectItem>
                  <SelectItem value="au-b">AU-B</SelectItem>
                  <SelectItem value="au-c">AU-C</SelectItem>
                  <SelectItem value="nzl">New Zealand</SelectItem>
                  <SelectItem value="ire">Ireland</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {/* ✅ Channel (NZ only) */}
          {filters.country === "nzl" && (
            <Select value={filters.channel || "all"} onValueChange={(value) => onFilterChange("channel", value)}>
              <SelectTrigger className="w-full sm:w-48 text-sm">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {(filterOptions.channels || []).map((ch) => (
                  <SelectItem key={ch} value={ch}>
                    {ch === "-" ? "Unspecified (-)" : ch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Brand */}
          <Select
            value={sanitizeBrandValue(filters.brand)}
            onValueChange={(value) => {
              onFilterChange("brand", value);
            }}
          >
            <SelectTrigger className="w-full sm:w-48 text-sm">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {filterOptions.brands?.length ? (
                filterOptions.brands.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.name}
                  </SelectItem>
                ))
              ) : (
                <>
                  <SelectItem value="jtw">Jules Taylor</SelectItem>
                  <SelectItem value="tbh">The Better Half</SelectItem>
                  <SelectItem value="otq">On the Quiet</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {/* Wine Type */}
          <Select value={filters.wineType} onValueChange={(value) => onFilterChange("wineType", value)}>
            <SelectTrigger className="w-full sm:w-48 text-sm">
              <SelectValue placeholder="Wine Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Wine Types</SelectItem>
              {filterOptions.wineTypes.length > 0 ? (
                filterOptions.wineTypes.map((wine, index) => (
                  <SelectItem key={`${wine.code}-${index}`} value={wine.code}>
                    {wine.name}
                  </SelectItem>
                ))
              ) : (
                <>
                  <SelectItem value="sab">Sauvignon Blanc</SelectItem>
                  <SelectItem value="pin">Pinot Noir</SelectItem>
                  <SelectItem value="chr">Chardonnay</SelectItem>
                  <SelectItem value="pig">Pinot Gris</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          {/* Year */}
          <Select value={filters.year || "all"} onValueChange={(value) => onFilterChange("year", value)}>
            <SelectTrigger className="w-full sm:w-32 text-sm">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {Array.from({ length: 10 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date/Prediction Range Filters */}
      <div className="border-t pt-3 sm:pt-4">
        {viewMode === "historical" ? (
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Historical Period:</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="text-xs w-full sm:w-auto justify-start">
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          <span className="hidden sm:inline">
                            {format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}
                          </span>
                          <span className="sm:hidden">
                            {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}
                          </span>
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      "Select Date Range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={1}
                    className="sm:block"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Prediction Range:</span>
            </div>

            <div className="grid grid-cols-3 sm:flex gap-2">
              {[1, 2, 3, 6, 12].map((months) => (
                <Button
                  key={months}
                  variant={filters.forwardLookingMonths === months ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleForwardLookingChange(months)}
                  className="text-xs"
                >
                  {months}M
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
