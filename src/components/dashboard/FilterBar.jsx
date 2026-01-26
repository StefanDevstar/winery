import React, { useMemo, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { normalizeCountryCode } from "@/lib/utils";

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

  // Extract available countries, distributors/states and wine types from data
  const filterOptions = useMemo(() => {
    try {
      const distributorRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
      const salesMetadataRaw = localStorage.getItem("vc_sales_metadata");
  
      let distributorStock = [];
      let salesData = [];
      let metadata = null;
  
      if (distributorRaw) {
        distributorStock = JSON.parse(distributorRaw);
        if (!Array.isArray(distributorStock)) distributorStock = [];
      }
  
      if (distributorMetadataRaw) {
        metadata = JSON.parse(distributorMetadataRaw);
      }
  
      // Load sales data for USA state extraction
      if (salesMetadataRaw) {
        try {
          const salesMetadata = JSON.parse(salesMetadataRaw);
          if (salesMetadata?.sheetNames && Array.isArray(salesMetadata.sheetNames)) {
            salesMetadata.sheetNames.forEach((sheetName) => {
              if (sheetName.toUpperCase().includes("USA")) {
                const salesKey = `vc_sales_data_${sheetName}`;
                const salesSheetData = localStorage.getItem(salesKey);
                if (salesSheetData) {
                  try {
                    const parsed = JSON.parse(salesSheetData);
                    if (Array.isArray(parsed)) salesData.push(...parsed);
                  } catch {}
                }
              }
            });
          }
        } catch {}
      }
  
      if (distributorStock.length === 0 && salesData.length === 0) {
        return { countries: [], distributors: [], states: [], wineTypes: [], brands: [] };
      }
  
      // ---- Countries ----
      const countrySet = new Set();
  
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
  
      if (metadata?.sheetNames && Array.isArray(metadata.sheetNames)) {
        metadata.sheetNames.forEach((sheetName) => {
          const normalizedSheetName = sheetName.toUpperCase().trim();
          const countryCode = sheetNameToCountryCode[normalizedSheetName];
          if (countryCode) {
            countrySet.add(countryCode);
          } else {
            let fallbackCode = normalizedSheetName.toLowerCase();
            if (fallbackCode.includes("nz") && !fallbackCode.includes("nzl")) {
              fallbackCode = fallbackCode.replace(/nz/g, "nzl");
            }
            if (fallbackCode) countrySet.add(fallbackCode);
          }
        });
      }
  
      // Fallback if metadata didn't exist
      if (countrySet.size === 0) {
        distributorStock.forEach((r) => {
          const rawCountryCode = r.AdditionalAttribute2 || "";
          const cc = normalizeCountryCode(rawCountryCode).toLowerCase();
          if (cc) countrySet.add(cc);
        });
      }
  
      // ✅ Always include AU-C in the dropdown
      countrySet.add("au-c");
  
      const priorityCountries = ["usa", "au-b", "au-c", "nzl", "ire"];
      const countries = Array.from(countrySet)
        .map((code) => ({ code, name: countryDisplayNames[code] || code.toUpperCase() }))
        .sort((a, b) => {
          const ap = priorityCountries.indexOf(a.code);
          const bp = priorityCountries.indexOf(b.code);
          if (ap >= 0 && bp >= 0) return ap - bp;
          if (ap >= 0) return -1;
          if (bp >= 0) return 1;
          return a.name.localeCompare(b.name);
        });
  
      const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();
  
      const allData = [...distributorStock, ...salesData];
  
      const countryFilteredData = countryFilter
        ? allData.filter((r) => {
            const rawCountryCode = r.AdditionalAttribute2 || "";
            const countryCode = normalizeCountryCode(rawCountryCode).toLowerCase();
            const normalizedFilter = normalizeCountryCode(countryFilter).toLowerCase();
            return countryCode === normalizedFilter;
          })
        : allData;
  
      // ---- Sets/Maps ----
      const locationSet = new Set();
      const stateSet = new Set();
  
      const wineTypeMap = new Map();
      const wineNameToCodeMap = new Map();
  
      // ✅ Brands: define ONCE (outside loop)
      const brandNameMap = {
        JTW: "Jules Taylor",
        TBH: "The Better Half",
        BH: "The Better Half",
        OTQ: "On the Quiet",
      };
  
      const normalizeBrandCode = (c) => {
        const up = String(c || "").toUpperCase().trim();
        return up === "BH" ? "TBH" : up;
      };
  
      const brandMap = new Map(); // code -> name
      const brandNameToCodeMap = new Map(); // name -> code
  
      const checkAndAddBrand = (code) => {
        const normalized = normalizeBrandCode(code);
        const name = brandNameMap[normalized];
        if (!name) return;
  
        if (!brandNameToCodeMap.has(name)) {
          brandNameToCodeMap.set(name, normalized);
          brandMap.set(normalized, name);
        }
      };
  
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

      
  
      countryFilteredData.forEach((r) => {
        // ---- Location / State / Distributor ----
        const location = String(r.Location || "").trim();
        if (location && location !== "Unknown") {
          if (countryFilter === "usa") {
            const upperLocation = location.toUpperCase();
            if (upperLocation.includes("DIST") || (upperLocation.includes("STATE") && !upperLocation.match(/^[A-Z]{2}$/))) {
              // skip
            } else if (location.length >= 2 && !location.match(/^(dist|state|district)/i)) {
              stateSet.add(location);
            }
          } else {
            let cleaned = location.replace(/^[A-Z]{2,3}\s*-\s*/i, "").trim();
            if (!cleaned || cleaned === location) cleaned = location.replace(/^[A-Z]{2,3}\s+/i, "").trim();
            if (!cleaned) cleaned = location;
            locationSet.add(cleaned);
          }
        }
  
        // ---- Wine / Brand extraction ----
        const wineCode = String(r.AdditionalAttribute3 || "").toUpperCase().trim();
        const productName = String(r.ProductName || "").trim();
        const variety = String(r.Variety || "").trim();
  
        // ✅ Brand from AA3 like JTW_SAB_2023 (brand token can appear anywhere)
        if (wineCode) {
          const parts = wineCode.split("_").map((p) => p.toUpperCase().trim());
          const brandToken = parts.find((p) => ["JTW", "TBH", "BH", "OTQ"].includes(p));
          if (brandToken) checkAndAddBrand(brandToken);
        }
  
        // Wine type from AA3
        if (wineCode) {
          const parts = wineCode.split("_");
          const varietyCode = parts.find((p) => Object.keys(wineNameMap).includes(p.toUpperCase()));
          if (varietyCode) {
            const code = varietyCode.toUpperCase();
            const wineName = wineNameMap[code] || code;
  
            if (!wineNameToCodeMap.has(wineName)) {
              wineNameToCodeMap.set(wineName, code);
              wineTypeMap.set(code, wineName);
            }
          }
        }
  
        const checkAndAddWineType = (code, name) => {
          if (!wineNameToCodeMap.has(name)) {
            wineNameToCodeMap.set(name, code);
            wineTypeMap.set(code, name);
          }
        };
  
        if (productName) {
          const lower = productName.toLowerCase();
          if (lower.includes("sauvignon blanc") || lower.includes("sauvignon")) checkAndAddWineType("SAB", "Sauvignon Blanc");
          else if (lower.includes("pinot noir")) checkAndAddWineType("PIN", "Pinot Noir");
          else if (lower.includes("chardonnay")) checkAndAddWineType("CHR", "Chardonnay");
          else if (lower.includes("pinot gris") || lower.includes("pinot grigio")) checkAndAddWineType("PIG", "Pinot Gris");
          else if (lower.includes("rose") || lower.includes("rosé")) checkAndAddWineType("ROS", "Rose");
          else if (lower.includes("gruner veltliner") || lower.includes("gruner")) checkAndAddWineType("GRU", "Gruner Veltliner");
          else if (lower.includes("late harvest")) checkAndAddWineType("LHS", "Late Harvest Sauvignon");
          else if (lower.includes("riesling")) checkAndAddWineType("RIES", "Riesling");
        }
  
        if (variety) {
          const lower = variety.toLowerCase();
          if (lower.includes("sauvignon blanc") || lower.includes("sauvignon")) checkAndAddWineType("SAB", "Sauvignon Blanc");
          else if (lower.includes("pinot noir")) checkAndAddWineType("PIN", "Pinot Noir");
          else if (lower.includes("chardonnay")) checkAndAddWineType("CHR", "Chardonnay");
          else if (lower.includes("pinot gris") || lower.includes("pinot grigio")) checkAndAddWineType("PIG", "Pinot Gris");
          else if (lower.includes("rose") || lower.includes("rosé")) checkAndAddWineType("ROS", "Rose");
          else if (lower.includes("gruner veltliner") || lower.includes("gruner")) checkAndAddWineType("GRU", "Gruner Veltliner");
          else if (lower.includes("late harvest")) checkAndAddWineType("LHS", "Late Harvest Sauvignon");
          else if (lower.includes("riesling")) checkAndAddWineType("RIES", "Riesling");
        }
      });
  
      const distributors = Array.from(locationSet).filter(Boolean).sort();
      const states = Array.from(stateSet).filter(Boolean).sort();
  
      // ✅ Ensure these brands always exist in dropdown even if no rows
      ["JTW", "TBH", "OTQ"].forEach(checkAndAddBrand);
  
      const brands = Array.from(brandMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));
  
      const wineTypes = Array.from(wineTypeMap.entries())
        .map(([code, name]) => ({ code: code.toLowerCase(), name }))
        .sort((a, b) => a.name.localeCompare(b.name));
  
      return { countries, distributors, states, wineTypes, brands };
    } catch (err) {
      return { countries: [], distributors: [], states: [], wineTypes: [], brands: [] };
    }
  }, [filters.country]);
  

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
          <Select value={filters.country || "nzl"} onValueChange={(value) => {
            onFilterChange('country', value);
          }}>
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
                // Fallback options if no data is available
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

          {/* State filter for USA only */}
          {filters.country === "usa" && (
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
          <Select value={filters.brand || "all"} onValueChange={(value) => onFilterChange("brand", value)}>
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
              {/* Last Update Date */}
              {(() => {
                try {
                  const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_on_hand_metadata");
                  const distributorRaw = localStorage.getItem("vc_distributor_stock_on_hand_data");
                  let lastUpdate = null;
                  
                  if (distributorMetadataRaw) {
                    const metadata = JSON.parse(distributorMetadataRaw);
                    if (metadata.lastUpdate) {
                      lastUpdate = new Date(metadata.lastUpdate);
                    }
                  }
                  
                  // Fallback: use data timestamp if available
                  if (!lastUpdate && distributorRaw) {
                    const data = JSON.parse(distributorRaw);
                    if (data && data.length > 0 && data[0]._timestamp) {
                      lastUpdate = new Date(data[0]._timestamp);
                    }
                  }
                  
                  return lastUpdate ? (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span>Last updated: {format(lastUpdate, "MMM d, yyyy")}</span>
                      <span className="text-yellow-600 font-medium">⚠</span>
                      <span className="text-xs">Not all data aligned with dates</span>
                    </div>
                  ) : null;
                } catch (err) {
                  return null;
                }
              })()}
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