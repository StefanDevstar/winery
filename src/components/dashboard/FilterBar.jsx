import React, { useMemo, useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeCountryCode, loadAllMonthlyData, getMonthsIndex } from "@/lib/utils";

const AUS_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

function normalizeAusState(loc) {
  const s = String(loc || "").trim().toUpperCase();

  // ✅ handle AU-B special codes seen in your logs
  if (s === "HO") return "NSW";      // your data uses HO a lot; treat as NSW
  if (s === "ZZNS") return "NSW";    // zzNS -> NSW

  // existing logic...
  for (const code of AUS_STATES) {
    if (new RegExp(`\\b${code}\\b`).test(s)) return code;
  }
  if (s.includes("NEW SOUTH WALES")) return "NSW";
  if (s.includes("VICTORIA")) return "VIC";
  if (s.includes("QUEENSLAND")) return "QLD";
  // ...
  return "";
}




// ---------------- NZ Channel helpers (NZ only) ----------------
const CANON_NZ_CHANNELS = ["grocery", "on premise", "off premise"];

function normalizeChannel(v) {
  const s0 = String(v ?? "").trim();
  if (!s0 || s0 === "-" || s0.toLowerCase() === "na" || s0.toLowerCase() === "n/a") return "-";

  const s = s0
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (s.includes("grocery")) return "grocery";
  if (s.replace(/\s+/g, "").includes("onpremise")) return "on premise";
  if (s.replace(/\s+/g, "").includes("offpremise")) return "off premise";

  return s; // keep unknowns (still normalized)
}

const ALLOWED_BRANDS = new Set(["jtw", "otq", "tbh", "bh"]);
const sanitizeBrandValue = (v) => {
  const s = String(v || "").toLowerCase();
  return ALLOWED_BRANDS.has(s) ? s : "all";
};

// ---- Brand filtering (same pattern as wineType) ----
const normalizeBrandFilter = (b) => {
  const up = String(b || "").toUpperCase().trim();
  if (!up) return "";
  if (up === "BH") return "TBH"; // treat BH as TBH
  return up;
};

const brandCodeToNames = {
  JTW: ["jules taylor", "jules", "jt", "jtw"],
  OTQ: ["on the quiet", "on-the-quiet", "otq"],
  TBH: ["the better half", "better half", "tbh", "bh"],
};

// Precedence: if OTQ appears, treat it as OTQ even if "Jules Taylor" also appears
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

  // 1) Token / underscore-code detection (common for codes like "JTW_SAB_2023")
  const hasCodeToken = (code) =>
    hayUpper === code ||
    hayUpper.includes(`_${code}_`) ||
    hayUpper.startsWith(`${code}_`) ||
    hayUpper.endsWith(`_${code}`) ||
    new RegExp(`\\b${code}\\b`, "i").test(hay);

  // OTQ first (because OTQ rows often still contain "Jules Taylor")
  if (
    hasCodeToken("OTQ") ||
    hayLower.includes("on the quiet") ||
    new RegExp(`\\botq\\b`, "i").test(hay)
  ) {
    return "OTQ";
  }

  // TBH
  if (hasCodeToken("TBH") || hasCodeToken("BH")) return "TBH";
  if (hayLower.includes("the better half") || hayLower.includes("better half")) return "TBH";

  // JTW
  if (hasCodeToken("JTW")) return "JTW";
  if (hayLower.includes("jules taylor")) return "JTW";

  return "";
};

const matchesBrand = (row, brandFilter /* string like "jtw"/"otq"/"tbh" */) => {
  if (!brandFilter || brandFilter === "all") return true;
  const target = normalizeBrandFilter(brandFilter).toUpperCase();
  if (!target) return true;

  const detected = detectBrandCode(row);
  if (detected) return detected === target;

  // If detection fails, do a wineType-style “variations” match across fields
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

  // fallback variations
  const names = brandCodeToNames[target] || [];
  for (const name of names) {
    const variations = [
      name,
      name.replace(/\s+/g, ""),      // "thebetterhalf"
      name.replace(/\s+/g, "_"),     // "the_better_half"
      name.toUpperCase(),
      name.toUpperCase().replace(/\s+/g, "_"),
    ];
    for (const v of variations) {
      if (text.includes(String(v).toLowerCase())) return true;
    }
  }

  // also accept raw code matches in the joined text
  if (text.includes(target.toLowerCase())) return true;

  return false;
};



export default function FilterBar({ filters, onFilterChange }) {
  const [dateRange, setDateRange] = React.useState({
    from: new Date(new Date().getFullYear(), 0, 1),
    to: new Date()
  });
  
  const [viewMode, setViewMode] = React.useState("historical");
  
  // Update dateRange when year filter changes
  useEffect(() => {
    if (filters.year && filters.year !== "all") {
      const selectedYear = parseInt(filters.year);
      if (!isNaN(selectedYear)) {
        const newDateRange = {
          from: new Date(selectedYear, 0, 1), // January 1st
          to: new Date(selectedYear, 11, 31) // December 31st
        };
        setDateRange(newDateRange);
        onFilterChange('dateRange', newDateRange);
      }
    }
  }, [filters.year]); // Only depend on filters.year

  useEffect(() => {
    if (filters.country !== "nzl" && filters.channel !== "all") {
      onFilterChange("channel", "all");
    }
  }, [filters.country]); // runs AFTER country updates
  

  // Extract available countries, distributors/states and wine types from data
  // Async data for filter options (loaded from IndexedDB)
  const [filterSourceData, setFilterSourceData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const monthlyData = await loadAllMonthlyData();
      if (cancelled) return;
      setFilterSourceData(monthlyData);
    }
    load();

    const handler = () => { load(); };
    window.addEventListener("vc:data:uploaded", handler);
    return () => { cancelled = true; window.removeEventListener("vc:data:uploaded", handler); };
  }, []);

  const filterOptions = useMemo(() => {
    const DEBUG = true;
    const dbg = (...args) => DEBUG && console.log("[FilterBar]", ...args);
  
    try {
      let distributorStock = [];
      let salesData = [];
      let metadata = null;

      if (filterSourceData) {
        distributorStock = filterSourceData.stock_on_hand_distributors || [];
        salesData = filterSourceData.sales || [];
        const sheetNames = new Set();
        [...distributorStock, ...salesData].forEach(r => {
          const sn = r._sheetName || r.AdditionalAttribute2 || r.Market || '';
          if (sn) sheetNames.add(String(sn).trim());
        });
        metadata = { sheetNames: Array.from(sheetNames) };
      }

      if (distributorStock.length === 0 && salesData.length === 0) {
        return { countries: [], distributors: [], states: [], wineTypes: [], brands: [], channels: [] };
      }
  
      // ---------- Countries (from distributor metadata sheet names, plus force AU-C) ----------
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
  
      // Force AU-C to always appear in dropdown
      countrySet.add("au-c");
  
      // Fallback if metadata missing: infer from data
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
  
      // ---------- Selected filters ----------
      // Combine data so options work even if one dataset is missing
      const allData = [...distributorStock, ...salesData];

      // ---------- Selected filters ----------
      const countryFilter =
        filters.country === "all" ? null : String(filters.country || "").toLowerCase();

        // ---------- Channels (NZ only) ----------
        let channels = [];
        const wantNZ = normalizeCountryCode(countryFilter || "").toLowerCase() === "nzl";

        if (wantNZ) {
          const nzSalesRows = (salesData || []).filter((r) => {
            const raw = r.AdditionalAttribute2 || r.Country || r.Market || "";
            return normalizeCountryCode(raw).toLowerCase() === "nzl";
          });

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
            CANON_NZ_CHANNELS.forEach((c) => set.add(c));
          }

          channels = Array.from(set).sort((a, b) => a.localeCompare(b));
        }


      // filter by country FIRST
      const countryFilteredData = countryFilter
        ? allData.filter((r) => {
            const raw = r.AdditionalAttribute2 || r.Country || r.Market || "";
            const cc = normalizeCountryCode(raw).toLowerCase();
            const want = normalizeCountryCode(countryFilter).toLowerCase();
            return cc === want;
          })
        : allData;

      // IMPORTANT: brand filter can be stale (old numeric IDs) -> sanitize
      const brandValue = sanitizeBrandValue(filters.brand);
      const brandFilter = brandValue === "all" ? "" : brandValue;

      // ---------- Brand dropdown (ONLY these 3) ----------
      const brands = [
        { code: "jtw", name: "Jules Taylor" },
        { code: "otq", name: "On the Quiet" },
        { code: "tbh", name: "The Better Half" },
      ];

      // ---------- Apply brand filter before wine types ----------
      const brandFilteredData = brandFilter
        ? countryFilteredData.filter((r) => matchesBrand(r, brandFilter))
        : countryFilteredData;



      // ---------- Distributor + State options ----------
      const locationSet = new Set();
      const stateSet = new Set();
      const wineTypeSet = new Set();
      const brandSet = new Set();

  
      countryFilteredData.forEach((r) => {
        // inside the loop that builds dropdown sets
        const loc = String(r.Location ?? r.location ?? "").trim();

        // ✅ ALWAYS add brand/wine-type first (so early returns don't break brand filter)
        const bc = String(r.BrandCode ?? r.brandCode ?? "").trim().toLowerCase();
        if (bc) brandSet.add(bc);

        const wt = String(r.AdditionalAttribute3 ?? r.VarietyCode ?? r.varietyCode ?? "").trim().toUpperCase();
        if (wt) wineTypeSet.add(wt);

        // ---------------- USA: state list from Location ----------------
        if (countryFilter === "usa") {
          const upper = loc.toUpperCase();
          if (upper.includes("DIST")) return;
          if (upper.includes("STATE") && !upper.match(/^[A-Z]{2}$/)) return;
          if (loc.length >= 2 && !loc.match(/^(dist|state|district)/i)) stateSet.add(loc);
          return;
        }

        // ---------------- AU-B: state list from State (fallback from Location prefix) ----------------
        if (countryFilter === "au-b") {
          const rawState =
            r.State ??
            r.state ??
            r._state ??                              // your normalizer sets _state
            (typeof loc === "string" ? loc.split("_")[0] : "") ?? // fallback: "NSW_customer" -> "NSW"
            "";

          const st = normalizeAusState(rawState);

          // only allow these in dropdown
          if (st && ["NSW", "VIC", "QLD"].includes(st)) stateSet.add(st);

          // ✅ IMPORTANT: still populate distributor/customer list if you use it
          // If you don't want a distributor dropdown for AU-B, delete this block.
          const customer =
            r._customer ??
            r.Customer ??
            r["Customer/Project"] ??
            (typeof loc === "string" && loc.includes("_") ? loc.split("_").slice(1).join("_") : "");

          const custClean = String(customer || "").trim();
          if (custClean) locationSet.add(custClean);

          return;
        }

        // ---------------- other countries: treat Location as distributor-ish ----------------
        let cleaned = loc.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
        if (!cleaned || cleaned === loc) cleaned = loc.replace(/^[A-Z]{2,3}\s+/i, "").trim();
        if (!cleaned) cleaned = loc;
        if (cleaned) locationSet.add(cleaned);
              });
       
  
      const distributors = Array.from(locationSet).sort((a, b) => a.localeCompare(b));
      const states = Array.from(stateSet).sort((a, b) => a.localeCompare(b));
  


      // ---------- Variety / Wine type parsing ----------
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
  
        // exact code present
        for (const code of Object.keys(wineNameMap)) {
          if (s === code) return code;
        }
  
        // code inside tokens
        const tokens = s.split(/[_\s/-]+/).filter(Boolean);
        for (const t of tokens) {
          if (wineNameMap[t]) return t;
          if (t === "ROSE" || t === "ROSÉ") return "ROS";
        }
  
        // full name match
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
  
      const wineTypeMap = new Map(); // code -> name
      const wineNameToCodeMap = new Map(); // name -> code (dedupe by name)
  
      const addWineType = (code) => {
        if (!code) return;
        const name = wineNameMap[code] || code;
        if (!wineNameToCodeMap.has(name)) {
          wineNameToCodeMap.set(name, code);
          wineTypeMap.set(code, name);
        }
      };
  
      brandFilteredData.forEach((r) => {
        // Depletion Summary format (has Variety column)
        const v1 = normalizeVarietyToCode(r.Variety);
        if (v1) addWineType(v1);
  
        // Normalized stock format might store VarietyCode or AdditionalAttribute3 (variety)
        const v2 = normalizeVarietyToCode(r.VarietyCode || r.AdditionalAttribute3);
        if (v2) addWineType(v2);
  
        // Exports often has "Stock" like "JT SAB 24"
        const v3 = normalizeVarietyToCode(r.Stock || r["Wine Name"] || r["Wines"] || r.ProductName || r.Product);
        if (v3) addWineType(v3);
      });
  
      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));
  
      // ---------- Debug logs ----------
      dbg("selected", { countryFilter, brandFilter });
      dbg("rows", { all: allData.length, country: countryFilteredData.length, brand: brandFilteredData.length });
      dbg("brands", brands);
      dbg("wineTypes", wineTypes);
  
      return { countries, distributors, states, wineTypes, brands, channels };

    } catch (err) {
      console.error("FilterBar filterOptions error:", err);
      return { countries: [], distributors: [], states: [], wineTypes: [], brands: [], channels: [] };

    }
  }, [filters.country, filters.brand, filterSourceData]);
  

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    onFilterChange('dateRange', range);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    onFilterChange('viewMode', mode);
  };

  const handleForwardLookingChange = (months) => {
    onFilterChange('forwardLookingMonths', months);
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
            <TabsTrigger value="historical" className="flex-1 sm:flex-none text-xs sm:text-sm">Historical Data</TabsTrigger>
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
          <Select value={filters.country || "all"} onValueChange={(value) => {
            onFilterChange('country', value);
          }}>
            <SelectTrigger className="w-full sm:w-40 text-sm">
              <SelectValue placeholder="Market" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
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
            <Select
              value={filters.channel || "all"}
              onValueChange={(value) => onFilterChange("channel", value)}
            >
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


          {/* State filter for USA only */}
          {(filters.country === "usa" || filters.country === "au-b") && (
            <Select value={filters.state || "all"} onValueChange={(value) => onFilterChange('state', value)}>
              <SelectTrigger className="w-full sm:w-48 text-sm">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {filterOptions.states && filterOptions.states.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={sanitizeBrandValue(filters.brand)}
            onValueChange={(value) => {
              console.log("[UI] brand changed ->", value);
              console.log("[UI] filters BEFORE ->", filters);
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


          <Select value={filters.wineType} onValueChange={(value) => onFilterChange('wineType', value)}>
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
                // Fallback options if no data is available
                <>
                  <SelectItem value="sab">Sauvignon Blanc</SelectItem>
                  <SelectItem value="pin">Pinot Noir</SelectItem>
                  <SelectItem value="chardonnay">Chardonnay</SelectItem>
                  <SelectItem value="pig">Pinot Gris</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>

          <Select value={filters.year || "all"} onValueChange={(value) => onFilterChange('year', value)}>
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Historical Period:</span>
              </div>
              {/* Last Update Date — derived from loaded filter data */}
              {filterSourceData ? (
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span>Data loaded from monthly snapshots</span>
                </div>
              ) : null}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="text-xs w-full sm:w-auto justify-start">
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          <span className="hidden sm:inline">{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</span>
                          <span className="sm:hidden">{format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd")}</span>
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

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth() - 12, 1);
                    handleDateRangeChange({ from, to: now });
                  }}
                  className="text-xs flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Last 12 Months</span>
                  <span className="sm:hidden">12M</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const now = new Date();
                    const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
                    handleDateRangeChange({ from, to: now });
                  }}
                  className="text-xs flex-1 sm:flex-none"
                >
                  <span className="hidden sm:inline">Last 6 Months</span>
                  <span className="sm:hidden">6M</span>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs sm:text-sm font-medium">Prediction Range:</span>
            </div>
            
            <div className="grid grid-cols-3 sm:flex gap-2">
              {[1, 2, 3, 6, 12].map(months => (
                <Button
                  key={months}
                  variant={filters.forwardLookingMonths === months ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleForwardLookingChange(months)}
                  className="text-xs"
                >
                  {months} {months === 1 ? 'M' : 'M'}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}