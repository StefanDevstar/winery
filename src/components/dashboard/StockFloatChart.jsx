import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, AlertTriangle, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function StockFloatChart({
  data = [],
  threshold = 0,
  distributor,
  wineType,
  onExport,
  coverageDays,
  predictedStockoutDate,
}) {
  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0]?.payload || {};
      const isBelow = (d.stockFloat ?? 0) < threshold;

      return (
        <div className="bg-white p-3 border rounded-lg shadow-md text-sm">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1 text-xs">
            <p>
              <span className="font-medium">Distributor Stock on Hand:</span>{" "}
              {(d.currentStock ?? 0).toLocaleString()} cases
            </p>
            <p>
              <span className="font-medium">In Transit:</span>{" "}
              {(d.inTransit ?? 0).toLocaleString()} cases
            </p>
            <p>
              <span className="font-medium">Projected Sales:</span>{" "}
              {(d.predictedSales ?? 0).toLocaleString()} cases
            </p>
            <div className="border-t pt-1 mt-1">
              <p className={`font-semibold ${isBelow ? "text-red-600" : "text-green-600"}`}>
                Stock Float: {(d.stockFloat ?? 0).toLocaleString()} cases
              </p>
            </div>
            {coverageDays !== null && coverageDays !== undefined && (
              <div className="border-t pt-1 mt-1">
                <p>
                  <span className="font-medium">Coverage:</span>{" "}
                  <span className={
                    coverageDays < 90 ? "text-red-600 font-semibold" :
                    coverageDays < 180 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"
                  }>
                    {coverageDays} days
                  </span>
                </p>
              </div>
            )}
            {predictedStockoutDate && (
              <p className="mt-1">
                <span className="font-medium">Predicted Stockout:</span>{" "}
                <span className="text-red-600 font-semibold">{predictedStockoutDate}</span>
              </p>
            )}
          </div>

          {isBelow && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Below threshold!
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const criticalCount = data.filter((d) => (d.stockFloat ?? 0) < threshold).length;

  const safeAvg =
    data.length > 0
      ? (data.reduce((sum, d) => sum + (d.stockFloat ?? 0), 0) / data.length).toFixed(0)
      : "0";

  const safeMin =
    data.length > 0
      ? Math.min(...data.map((d) => d.stockFloat ?? 0)).toFixed(0)
      : "0";

  // Find the predicted stockout period on the chart (first period at or below 0)
  const stockoutPeriodOnChart = useMemo(() => {
    if (!data || data.length < 2) return null;
    return data.find(d => (d.stockFloat ?? 0) <= 0)?.period || null;
  }, [data]);

  return (
    <Card className="glass-effect">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <CardTitle className="text-base sm:text-lg">
            Distributor Stock Float Projection
          </CardTitle>
          <p className="text-xs sm:text-sm text-slate-500">
            {distributor !== "all" && `${distributor} • `}
            {wineType !== "all" && wineType}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {criticalCount > 0 && (
            <Badge variant="destructive" className="flex items-center gap-1 text-xs">
              <AlertTriangle className="w-3 h-3" />
              <span className="hidden sm:inline">
                {criticalCount} {criticalCount > 1 ? "months" : "month"} below threshold
              </span>
              <span className="sm:hidden">{criticalCount}</span>
            </Badge>
          )}

          {predictedStockoutDate && (
            <Badge variant="outline" className="flex items-center gap-1 text-xs border-red-300 text-red-700 bg-red-50">
              <Calendar className="w-3 h-3" />
              <span className="hidden sm:inline">Stockout: {predictedStockoutDate}</span>
              <span className="sm:hidden">{predictedStockoutDate}</span>
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport?.("stock_float")}
            className="text-xs flex-1 sm:flex-none"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Export
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                label={{
                  value: "Cases",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12 },
                }}
              />
              <Tooltip content={customTooltip} />
              <Legend />
              <ReferenceLine
                y={threshold}
                stroke="#ef4444"
                strokeDasharray="3 3"
                label={{
                  value: `Threshold (${threshold})`,
                  position: "right",
                  fill: "#ef4444",
                  fontSize: 11,
                }}
              />

              {/* Stockout date vertical line */}
              {stockoutPeriodOnChart && (
                <ReferenceLine
                  x={stockoutPeriodOnChart}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  label={{
                    value: "Predicted Stockout",
                    position: "top",
                    fill: "#ef4444",
                    fontSize: 11,
                  }}
                />
              )}

              <Line
                type="monotone"
                dataKey="stockFloat"
                stroke="#22543d"
                strokeWidth={3}
                name="Stock Float"
                dot={(props) => {
                  const { cx, cy, payload, index } = props || {};
                  if (cx == null || cy == null) return null;

                  const val = payload?.stockFloat ?? 0;
                  const isCritical = val < threshold;

                  const key = `dot-${payload?.period ?? index ?? `${cx}-${cy}`}`;

                  return (
                    <circle
                      key={key}
                      cx={cx}
                      cy={cy}
                      r={5}
                      fill={isCritical ? "#ef4444" : "#22543d"}
                      stroke="white"
                      strokeWidth={2}
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 text-xs text-slate-500 border-t pt-3">
          <p className="mb-2">
            <strong>Formula:</strong> Stock Float = Distributor Stock on Hand - Distributor
            Projected Sales + Stock in Transit
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4 text-xs border-t pt-3 sm:pt-4">
          <div>
            <p className="text-slate-500 text-xs">Avg Stock Float</p>
            <p className="font-semibold text-base sm:text-lg">{safeAvg} cases</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Minimum Float</p>
            <p className="font-semibold text-base sm:text-lg">{safeMin} cases</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs">Threshold</p>
            <p className="font-semibold text-base sm:text-lg text-red-600">
              {threshold} cases
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
