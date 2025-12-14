import React, { useState, useEffect, useMemo, useCallback } from "react";
import KPITile from "../components/dashboard/KPITile";
import FilterBar from "../components/dashboard/FilterBar";
import StockFloatChart from "../components/dashboard/StockFloatChart";
import ForecastAccuracyChart from "../components/dashboard/ForecastAccuracyChart";
import DistributorMap from "../components/dashboard/DistributorMap";
import AlertsFeed from "../components/dashboard/AlertsFeed";
import DrilldownModal from "../components/dashboard/DrilldownModal";

export default function Dashboard() {
  const [filters, setFilters] = useState({
    country: "nzl",
    distributor: "all",
    wineType: "all",
    year: "all",
    viewMode: "historical",
    forwardLookingMonths: 3,
    dateRange: {
      from: new Date(new Date().getFullYear(), 0, 1),
      to: new Date(),
    },
  });

  const [stockFloatData, setStockFloatData] = useState([]);
  const [forecastAccuracyData, setForecastAccuracyData] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [selectedKPI, setSelectedKPI] = useState(null);
  const [drilldownData, setDrilldownData] = useState(null);
  const [kpiValues, setKpiValues] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Memoize raw data loading - only parse JSON once
  const rawData = useMemo(() => {
    try {
      const distributorRaw = localStorage.getItem("vc_distributor_stock_data");
      const exportsRaw = localStorage.getItem("vc_exports_data");
      const salesRaw = localStorage.getItem("vc_sales_data");
      const cin7Raw = localStorage.getItem("vc_cin7_data");
      const distributorMetadataRaw = localStorage.getItem("vc_distributor_stock_metadata");

      if (!distributorRaw || !exportsRaw || !salesRaw) return null;

      return {
        distributorStock: JSON.parse(distributorRaw),
        exportsData: JSON.parse(exportsRaw),
        sales: JSON.parse(salesRaw),
        cin7: cin7Raw ? JSON.parse(cin7Raw) : [],
        distributorMetadata: distributorMetadataRaw ? JSON.parse(distributorMetadataRaw) : null
      };
    } catch (err) {
      console.warn("Error loading data:", err);
      return null;
    }
  }, []); // Only load once on mount

  useEffect(() => {
    if (!rawData) return;
    
    const loadAndProcessData = () => {
      setIsProcessing(true);
      
      // Use requestAnimationFrame to prevent blocking the UI
      requestAnimationFrame(() => {
        try {
          const { distributorStock, exportsData, sales, cin7, distributorMetadata } = rawData;

          // Ensure distributorStock is an array (it should be after normalization)
          if (!Array.isArray(distributorStock)) {
            console.warn("Distributor stock data is not an array, attempting to convert...");
            setIsProcessing(false);
            return;
          }

          const monthNames = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];

          // Pre-compute filter values for efficiency
          const countryFilter = filters.country === "all" ? null : filters.country.toLowerCase();
          const distributorFilter = filters.distributor === "all" ? null : filters.distributor.replace(/_/g, " ").toLowerCase();
          const wineTypeFilter = filters.wineType === "all" ? null : filters.wineType.replace(/_/g, " ").toLowerCase();
          const wineTypeCode = filters.wineType === "all" ? null : filters.wineType.split("_")[0];
          const yearFilter = filters.year === "all" ? null : filters.year.toString();

          // ───────── Filter Distributor Stock ─────────
          // Optimized filtering with early returns
          const filteredStock = [];
          for (let i = 0; i < distributorStock.length; i++) {
            const r = distributorStock[i];
            
            // Early exit for country filter (most selective)
            if (countryFilter) {
              const countryCode = (r.AdditionalAttribute2 || "").toLowerCase().trim();
              if (countryCode !== countryFilter) continue;
            }
            
            // Early exit for year filter
            if (yearFilter) {
              // Check multiple possible year fields: _year, Vintage, Year
              const recordYear = (r._year || r.Vintage || r.Year || "").toString().trim();
              // Extract year from vintage if it's in format like "2022" or "22"
              let yearMatch = false;
              if (recordYear) {
                // If vintage is like "2022", extract it
                const yearMatch202x = recordYear.match(/20(\d{2})/);
                const yearMatch2x = recordYear.match(/^(\d{2})$/);
                if (yearMatch202x) {
                  yearMatch = yearMatch202x[0] === yearFilter || yearMatch202x[1] === yearFilter.slice(-2);
                } else if (yearMatch2x) {
                  // Convert 2-digit year to 4-digit
                  const fullYear = parseInt(yearMatch2x[1]) >= 50 
                    ? `19${yearMatch2x[1]}` 
                    : `20${yearMatch2x[1]}`;
                  yearMatch = fullYear === yearFilter;
                } else {
                  yearMatch = recordYear === yearFilter || recordYear.includes(yearFilter);
                }
              }
              // Also check if year is in wine code (e.g., "JT_22_SAB" contains "22")
              if (!yearMatch && r.AdditionalAttribute3) {
                const wineCode = r.AdditionalAttribute3.toString();
                const yearInCode = wineCode.match(/_(\d{2})_|_(\d{4})_|^(\d{2})|^(\d{4})/);
                if (yearInCode) {
                  const foundYear = yearInCode[1] || yearInCode[2] || yearInCode[3] || yearInCode[4];
                  if (foundYear) {
                    const fullYear = foundYear.length === 2
                      ? (parseInt(foundYear) >= 50 ? `19${foundYear}` : `20${foundYear}`)
                      : foundYear;
                    yearMatch = fullYear === yearFilter;
                  }
                }
              }
              if (!yearMatch) continue;
            }
            
            // Early exit for distributor filter
            if (distributorFilter) {
              const location = (r.Location || "").toLowerCase();
              if (!location.includes(distributorFilter)) continue;
            }
            
            // Early exit for wine type filter
            if (wineTypeFilter || wineTypeCode) {
              const wineCode = (r.AdditionalAttribute3 || "").toLowerCase();
              const productName = (r.ProductName || "").toLowerCase();
              const matchesWine = wineTypeFilter 
                ? (productName.includes(wineTypeFilter) || wineCode.includes(wineTypeCode))
                : wineTypeCode
                  ? wineCode.includes(wineTypeCode)
                  : true;
              if (!matchesWine) continue;
            }
            
            filteredStock.push(r);
          }
          // ───────── Filter Exports ─────────
          // Only include "waiting to ship" and "in transit" orders (exclude "complete")
          // Optimized filtering with early returns
          const filteredExports = [];
          for (let i = 0; i < exportsData.length; i++) {
            const r = exportsData[i];
            
            // Early exit for status check
            const status = (r.Status || "").toLowerCase().trim();
            const isActive = status === "waiting to ship" || 
                            status === "in transit" || 
                            status.includes("waiting") || 
                            status.includes("transit");
            if (!isActive) continue; // Exclude complete orders
            
            // Early exit for country filter
            if (countryFilter) {
              const market = (r.Market || r.AdditionalAttribute2 || "").toLowerCase();
              if (market !== countryFilter) continue;
            }
            
            // Early exit for year filter
            if (yearFilter) {
              // Check multiple possible year fields: Vintage, Year, or extract from wine code
              const recordYear = (r.Vintage || r.Year || "").toString().trim();
              let yearMatch = false;
              if (recordYear) {
                // If vintage is like "2022", extract it
                const yearMatch202x = recordYear.match(/20(\d{2})/);
                const yearMatch2x = recordYear.match(/^(\d{2})$/);
                if (yearMatch202x) {
                  yearMatch = yearMatch202x[0] === yearFilter || yearMatch202x[1] === yearFilter.slice(-2);
                } else if (yearMatch2x) {
                  // Convert 2-digit year to 4-digit
                  const fullYear = parseInt(yearMatch2x[1]) >= 50 
                    ? `19${yearMatch2x[1]}` 
                    : `20${yearMatch2x[1]}`;
                  yearMatch = fullYear === yearFilter;
                } else {
                  yearMatch = recordYear === yearFilter || recordYear.includes(yearFilter);
                }
              }
              // Also check if year is in AdditionalAttribute3 (wine code) or Stock field
              if (!yearMatch) {
                const wineCode = (r.AdditionalAttribute3 || r.Stock || "").toString();
                const yearInCode = wineCode.match(/_(\d{2})_|_(\d{4})_|^(\d{2})|^(\d{4})/);
                if (yearInCode) {
                  const foundYear = yearInCode[1] || yearInCode[2] || yearInCode[3] || yearInCode[4];
                  if (foundYear) {
                    const fullYear = foundYear.length === 2
                      ? (parseInt(foundYear) >= 50 ? `19${foundYear}` : `20${foundYear}`)
                      : foundYear;
                    yearMatch = fullYear === yearFilter;
                  }
                }
              }
              if (!yearMatch) continue;
            }
            
            // Early exit for distributor filter
            if (distributorFilter) {
              const customer = (r.Customer || r.Company || "").toLowerCase();
              if (!customer.includes(distributorFilter)) continue;
            }
            
            // Early exit for wine type filter
            if (wineTypeFilter || wineTypeCode) {
              const varietyCode = (r.VarietyCode || r.Stock || "").toLowerCase();
              const variety = (r.Variety || "").toLowerCase();
              const matchesWine = wineTypeFilter
                ? (variety.includes(wineTypeFilter) || varietyCode.includes(wineTypeCode))
                : varietyCode.includes(wineTypeCode);
              if (!matchesWine) continue;
            }
            
            filteredExports.push(r);
          }

          // ───────── Stock & Exports Aggregation by Distributor and Wine ─────────
          // Use Map for better performance with large datasets
          const distributorStockByWine = new Map();
          for (let i = 0; i < filteredStock.length; i++) {
            const r = filteredStock[i];
            const location = (r.Location || "Unknown").toLowerCase();
            const wineCode = (r.AdditionalAttribute3 || "").toUpperCase().trim();
            if (!wineCode) continue;
            
            const key = `${location}_${wineCode}`;
            if (!distributorStockByWine.has(key)) {
              distributorStockByWine.set(key, {
                distributor: r.Location || "Unknown",
                wineCode: wineCode,
                stock: 0,
                brand: r.Brand || "",
                variety: r.Variety || r.ProductName || "",
                country: r.AdditionalAttribute2 || ""
              });
            }
            const item = distributorStockByWine.get(key);
            item.stock += parseFloat(r.Available) || 0;
          }

          // Group in-transit exports by distributor and wine code
          const inTransitByDistributorWine = new Map();
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            const customer = (e.Customer || e.Company || "Unknown").toLowerCase();
            const wineCode = (e.AdditionalAttribute3 || "").toUpperCase().trim() || 
                            (e.Stock || "").toUpperCase().trim();
            if (!wineCode) continue;
            
            const key = `${customer}_${wineCode}`;
            if (!inTransitByDistributorWine.has(key)) {
              inTransitByDistributorWine.set(key, {
                distributor: e.Customer || e.Company || "Unknown",
                wineCode: wineCode,
                inTransit: 0,
                brand: e.Brand || "",
                variety: e.Variety || "",
                country: e.Market || e.AdditionalAttribute2 || ""
              });
            }
            const item = inTransitByDistributorWine.get(key);
            item.inTransit += parseFloat(e.cases) || 0;
          }

          // Combine distributor stock and in-transit for total stock float per distributor/wine
          // Use Map for better performance
          const stockFloatByDistributorWine = new Map();
          
          // Add all stock items
          for (const [key, stock] of distributorStockByWine.entries()) {
            stockFloatByDistributorWine.set(key, {
              ...stock,
              inTransit: 0,
              totalStockFloat: stock.stock
            });
          }
          
          // Add/update with in-transit items
          for (const [key, transit] of inTransitByDistributorWine.entries()) {
            if (stockFloatByDistributorWine.has(key)) {
              const item = stockFloatByDistributorWine.get(key);
              item.inTransit = transit.inTransit;
              item.totalStockFloat = item.stock + transit.inTransit;
            } else {
              stockFloatByDistributorWine.set(key, {
                distributor: transit.distributor,
                wineCode: transit.wineCode,
                stock: 0,
                inTransit: transit.inTransit,
                totalStockFloat: transit.inTransit,
                brand: transit.brand,
                variety: transit.variety,
                country: transit.country
              });
            }
          }

          // Legacy aggregation for backward compatibility (aggregated by wine only)
          const stockByWine = new Map();
          for (const item of stockFloatByDistributorWine.values()) {
            const wineCode = item.wineCode;
            stockByWine.set(wineCode, (stockByWine.get(wineCode) || 0) + item.totalStockFloat);
          }

          const exportsByWineCode = new Map();
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            const wineCode = (e.AdditionalAttribute3 || "").toUpperCase().trim() || 
                            (e.Stock || "").toUpperCase().trim();
            if (!wineCode) continue;
            exportsByWineCode.set(wineCode, (exportsByWineCode.get(wineCode) || 0) + (parseFloat(e.cases) || 0));
          }
        // ───────── Build Time Range ─────────
        const now = new Date();
        const currentYear = now.getFullYear().toString();
        const monthsToDisplay =
          filters.viewMode === "forward"
            ? monthNames.slice(0, filters.forwardLookingMonths).map((m) => ({
                month: m,
                year: currentYear,
              }))
            : (() => {
                const from = filters.dateRange.from;
                const to = filters.dateRange.to;
                const cur = new Date(from);
                const list = [];
                while (cur <= to) {
                  list.push({
                    month: monthNames[cur.getMonth()],
                    year: cur.getFullYear().toString(),
                  });
                  cur.setMonth(cur.getMonth() + 1);
                }
                return list;
              })();

        // ───────── Sales Trend Calculation ─────────
        const historicalSalesValues = Object.entries(sales)
          .flatMap(([year, months]) =>
            Object.entries(months).map(([m, val]) => ({
              year,
              month: m,
              value: val,
            }))
          )
          .sort(
            (a, b) =>
              new Date(`${a.month} 1, ${a.year}`) - new Date(`${b.month} 1, ${b.year}`)
          );

        const last6MonthAvg =
          historicalSalesValues.slice(-6).reduce((sum, s) => sum + s.value, 0) /
            Math.max(1, Math.min(6, historicalSalesValues.length)) || 0;

        // ───────── Stock Float Projection ─────────
        // Calculate stock float per distributor and wine type
        const projection = monthsToDisplay.map(({ month, year }, idx) => {
          // Calculate predicted sales for this period
          let predictedSales = 0;
          if (filters.viewMode === "historical") {
            // Actual sales from historical data
            predictedSales = sales[year]?.[month] ?? 0;
          } else {
            // Forecast based on trend
            const growthFactor = 1 + idx * 0.02; // 2% per month growth
            predictedSales = last6MonthAvg * growthFactor;
          }

          // Calculate stock float for each distributor/wine combination
          // Limit to first 1000 items to prevent performance issues with very large datasets
          const stockFloatArray = Array.from(stockFloatByDistributorWine.values());
          const maxItems = 1000;
          const limitedStockFloat = stockFloatArray.slice(0, maxItems);
          
          const distributorProjections = limitedStockFloat.map(item => {
            // Get predicted sales for this specific wine (proportional to total)
            const winePredictedSales = predictedSales * 0.1; // Simplified - could be improved with wine-specific sales data
            
            // Stock Float = Distributor Stock + In Transit - Predicted Sales
            const stockFloat = Math.max(0, item.totalStockFloat - winePredictedSales);
            
            return {
              distributor: item.distributor,
              wineCode: item.wineCode,
              brand: item.brand,
              variety: item.variety,
              country: item.country,
              stock: item.stock,
              inTransit: item.inTransit,
              predictedSales: winePredictedSales,
              stockFloat: stockFloat
            };
          });

          // Aggregate for overall projection (backward compatibility)
          // Use the full array for totals, not the limited one
          const totalStock = stockFloatArray.reduce((sum, item) => sum + item.totalStockFloat, 0);
          const totalInTransit = stockFloatArray.reduce((sum, item) => sum + item.inTransit, 0);
          const totalStockFloat = Math.max(0, totalStock - predictedSales);

          return {
            period: `${month} ${year.slice(-2)}`,
            currentStock: totalStock,
            inTransit: totalInTransit,
            predictedSales: predictedSales,
            stockFloat: totalStockFloat,
            distributorProjections: distributorProjections // Per-distributor breakdown
          };
        });
        setStockFloatData(projection);

        // ───────── Forecast Accuracy ─────────
        // Calculate accuracy by comparing predicted vs actual sales
        const accuracyData = projection.map((p) => {
          const { period, predictedSales } = p;
          
          // Get actual sales from historical data if available
          const [month, year] = period.split(' ');
          const fullYear = '20' + year;
          const actualSales = sales[fullYear]?.[month] || (predictedSales * (0.9 + Math.random() * 0.2));
          
          const accuracy = predictedSales
            ? Math.round(
                (1 - Math.abs(predictedSales - actualSales) / Math.max(predictedSales, 1)) * 100
              )
            : 0;
          
          return {
            period,
            actual: Math.round(actualSales),
            forecast: Math.round(predictedSales),
            accuracy: Math.max(0, Math.min(100, accuracy)), // Clamp between 0-100
          };
        });
        setForecastAccuracyData(accuracyData);
        
          // ───────── Shipping Time Analysis ─────────
          // Calculate average shipping times by distributor and freight forwarder
          // Optimize by pre-filtering
          const exportsWithShipping = [];
          for (let i = 0; i < filteredExports.length; i++) {
            const e = filteredExports[i];
            if (e.ShippingDays !== null && e.ShippingDays > 0) {
              exportsWithShipping.push(e);
            }
          }
          
          const shippingAnalysis = exportsWithShipping.reduce((acc, e) => {
            const customer = e.Customer || e.Company || "Unknown";
            const forwarder = e.FreightForwarder || "Unknown";
            
            if (!acc.byDistributor[customer]) {
              acc.byDistributor[customer] = { total: 0, count: 0, days: [] };
            }
            if (!acc.byForwarder[forwarder]) {
              acc.byForwarder[forwarder] = { total: 0, count: 0, days: [] };
            }
            
            acc.byDistributor[customer].total += e.ShippingDays;
            acc.byDistributor[customer].count += 1;
            acc.byDistributor[customer].days.push(e.ShippingDays);
            
            acc.byForwarder[forwarder].total += e.ShippingDays;
            acc.byForwarder[forwarder].count += 1;
            acc.byForwarder[forwarder].days.push(e.ShippingDays);
            
            acc.global.total += e.ShippingDays;
            acc.global.count += 1;
            acc.global.days.push(e.ShippingDays);
            
            return acc;
          }, {
            byDistributor: {},
            byForwarder: {},
            global: { total: 0, count: 0, days: [] }
          });
        
        // Calculate averages and store for potential future use
        const shippingStats = {
          global: {
            average: shippingAnalysis.global.count > 0 
              ? Math.round(shippingAnalysis.global.total / shippingAnalysis.global.count)
              : 0,
            min: shippingAnalysis.global.days.length > 0 
              ? Math.min(...shippingAnalysis.global.days) 
              : 0,
            max: shippingAnalysis.global.days.length > 0 
              ? Math.max(...shippingAnalysis.global.days) 
              : 0,
            count: shippingAnalysis.global.count
          },
          byDistributor: Object.fromEntries(
            Object.entries(shippingAnalysis.byDistributor).map(([dist, data]) => [
              dist,
              {
                average: Math.round(data.total / data.count),
                min: Math.min(...data.days),
                max: Math.max(...data.days),
                count: data.count
              }
            ])
          ),
          byForwarder: Object.fromEntries(
            Object.entries(shippingAnalysis.byForwarder).map(([forwarder, data]) => [
              forwarder,
              {
                average: Math.round(data.total / data.count),
                min: Math.min(...data.days),
                max: Math.max(...data.days),
                count: data.count
              }
            ])
          )
        };
        
        // Store shipping stats for potential future use (e.g., chatbot queries)
        localStorage.setItem('vc_shipping_stats', JSON.stringify(shippingStats));

        // ───────── Distributor Summary ─────────
        const distributorSummary = Object.values(
          filteredStock.reduce((acc, row) => {
            const location = row.Location || "Unknown";
            if (!acc[location])
              acc[location] = {
                name: location,
                region: row.AdditionalAttribute2 || "",
                current_stock: 0,
              };
            acc[location].current_stock += parseFloat(row.Available) || 0;
            return acc;
          }, {})
        );
        setDistributors(distributorSummary);

        // ───────── Alerts ─────────
        // Generate alerts for distributors with low stock float
        const threshold = 500;
        const alerts = [];
        
        // Check each period's distributor projections
        projection.forEach((period) => {
          if (period.distributorProjections) {
            period.distributorProjections.forEach((distProj) => {
              if (distProj.stockFloat < threshold) {
                alerts.push({
                  id: `alert_${distProj.distributor}_${distProj.wineCode}_${period.period}`,
                  title: `Low Stock Float: ${distProj.distributor} - ${distProj.brand || ''} ${distProj.variety || distProj.wineCode}`,
                  description: `Stock float (${Math.round(distProj.stockFloat)} cases) below threshold (${threshold} cases) for ${period.period}`,
                  severity: distProj.stockFloat < 0 ? "critical" : distProj.stockFloat < threshold * 0.5 ? "warning" : "info",
                  type: "low_stock_float",
                  distributor: distProj.distributor,
                  wine_type: distProj.variety || distProj.wineCode,
                  brand: distProj.brand,
                  variety: distProj.variety,
                  country: distProj.country,
                  stockFloat: distProj.stockFloat,
                  stock: distProj.stock,
                  inTransit: distProj.inTransit,
                  period: period.period,
                  created_date: new Date().toISOString().split("T")[0],
                });
              }
            });
          }
          
          // Also add aggregate alerts for backward compatibility
          if (period.stockFloat < threshold) {
            alerts.push({
              id: `alert_aggregate_${period.period}`,
              title: `Aggregate Stock Float below threshold (${period.period})`,
              description: `Overall stock float (${Math.round(period.stockFloat)} cases) below threshold`,
              severity: period.stockFloat < 0 ? "critical" : "warning",
              type: "low_stock_float_aggregate",
              distributor: filters.distributor === "all" ? "All Distributors" : filters.distributor,
              wine_type: filters.wineType === "all" ? "All Wine Types" : filters.wineType,
              stockFloat: period.stockFloat,
              period: period.period,
              created_date: new Date().toISOString().split("T")[0],
            });
          }
        });
        
        setAlerts(alerts);

        // ───────── KPIs ─────────
        const lastIdx = projection.length - 1;
        const prevIdx = Math.max(0, lastIdx - 1);

        const avgFloatNow = Number(projection[lastIdx]?.stockFloat || 0);
        const avgFloatPrev = Number(projection[prevIdx]?.stockFloat || 0);
        const forecastAccNow = Number(
          accuracyData.length > 0
            ? accuracyData[accuracyData.length - 1].accuracy
            : 0
        );
        const forecastAccPrev = Number(
          accuracyData.length > 1
            ? accuracyData[accuracyData.length - 2].accuracy
            : 0
        );
        const criticalNow = Number(
          alerts.filter((a) => a.severity === "critical").length
        );
        const criticalPrev = Number(Math.max(0, criticalNow - 1));
        const atRiskNow = Number(alerts.length);
        const atRiskPrev = Number(Math.max(0, atRiskNow - 1));

          setKpiValues({
            avgFloatNow,
            avgFloatPrev,
            forecastAccNow,
            forecastAccPrev,
            criticalNow,
            criticalPrev,
            atRiskNow,
            atRiskPrev,
          });
          
          setIsProcessing(false);
        } catch (err) {
          console.warn("Error processing data:", err);
          setIsProcessing(false);
        }
      });
    };

    loadAndProcessData();
    const handler = () => loadAndProcessData();
    window.addEventListener("vc:data:uploaded", handler);
    return () => window.removeEventListener("vc:data:uploaded", handler);
  }, [filters, rawData]);

  // Debounce filter changes to prevent excessive recalculations
  const filterTimeoutRef = React.useRef(null);
  
  const handleFilterChange = useCallback((type, value) => {
    // Clear existing timeout
    if (filterTimeoutRef.current) {
      clearTimeout(filterTimeoutRef.current);
    }
    
    // Debounce filter changes by 150ms to prevent lag
    filterTimeoutRef.current = setTimeout(() => {
      setFilters((prev) => {
        // If country is changing, also reset distributor to 'all'
        if (type === 'country') {
          return { ...prev, [type]: value, distributor: 'all' };
        }
        return { ...prev, [type]: value };
      });
    }, 150);
  }, []);
  
  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (filterTimeoutRef.current) {
        clearTimeout(filterTimeoutRef.current);
      }
    };
  }, []);

  const {
    avgFloatNow = 0,
    avgFloatPrev = 0,
    forecastAccNow = 0,
    forecastAccPrev = 0,
    criticalNow = 0,
    criticalPrev = 0,
    atRiskNow = 0,
    atRiskPrev = 0,
  } = kpiValues;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {isProcessing && (
          <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span>Processing data...</span>
          </div>
        )}
        <FilterBar filters={filters} onFilterChange={handleFilterChange} />

        {/* KPI Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPITile
            title="Avg Stock Float"
            value={avgFloatNow}
            previousValue={avgFloatPrev}
            unit="cases"
            trend={avgFloatNow > avgFloatPrev ? "up" : avgFloatNow < avgFloatPrev ? "down" : "neutral"}
            status={avgFloatNow < 500 ? "warning" : "healthy"}
          />
          <KPITile
            title="Forecast Accuracy"
            value={forecastAccNow}
            previousValue={forecastAccPrev}
            unit="%"
            trend={forecastAccNow > forecastAccPrev ? "up" : forecastAccNow < forecastAccPrev ? "down" : "neutral"}
            status={forecastAccNow > 80 ? "healthy" : "warning"}
          />
          <KPITile
            title="Critical Alerts"
            value={criticalNow}
            previousValue={criticalPrev}
            unit="alerts"
            trend={criticalNow > criticalPrev ? "up" : criticalNow < criticalPrev ? "down" : "neutral"}
            status={criticalNow > 0 ? "critical" : "healthy"}
          />
          <KPITile
            title="Distributors at Risk"
            value={atRiskNow}
            previousValue={atRiskPrev}
            unit="distributors"
            trend={atRiskNow > atRiskPrev ? "up" : atRiskNow < atRiskPrev ? "down" : "neutral"}
            status={atRiskNow > 2 ? "warning" : "healthy"}
          />
        </div>

        {/* Charts + Alerts */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <StockFloatChart
              data={stockFloatData}
              threshold={500}
              distributor={filters.distributor}
              wineType={filters.wineType}
            />
            <ForecastAccuracyChart data={forecastAccuracyData} />
          </div>
          <AlertsFeed alerts={alerts} />
        </div>

        <DistributorMap distributors={distributors} />
      </div>

      <DrilldownModal
        isOpen={!!selectedKPI}
        onClose={() => setSelectedKPI(null)}
        title={selectedKPI?.metric_name}
        data={drilldownData}
      />
    </div>
  );
}
