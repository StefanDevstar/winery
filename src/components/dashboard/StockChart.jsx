import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function StockChart({ data, comparisonData, comparisonPeriod, onExport }) {
  const calculateStockGrowth = () => {
    if (!data || !comparisonData || data.length === 0 || comparisonData.length === 0) return 0;
    
    const currentAvg = data.reduce((sum, item) => 
      sum + (item.sauvignon_blanc || 0) + (item.pinot_noir || 0) + (item.chardonnay || 0), 0) / data.length;
    const previousAvg = comparisonData.reduce((sum, item) => 
      sum + (item.sauvignon_blanc || 0) + (item.pinot_noir || 0) + (item.chardonnay || 0), 0) / comparisonData.length;
    
    return previousAvg > 0 ? ((currentAvg - previousAvg) / previousAvg * 100).toFixed(1) : 0;
  };

  const growth = calculateStockGrowth();
  const isPositiveGrowth = growth > 0;

  const customTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum, entry) => sum + entry.value, 0);
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value?.toLocaleString()}k cases
            </p>
          ))}
          <p className="border-t pt-1 mt-1 font-medium">Total: {total.toLocaleString()}k cases</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="glass-effect">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold text-slate-900">
            Stock Float Trend
          </CardTitle>
          {growth !== 0 && (
            <Badge variant={isPositiveGrowth ? "default" : "destructive"} className="flex items-center gap-1">
              {isPositiveGrowth ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(growth)}% vs {comparisonPeriod.replace('_', ' ')}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => onExport('stock')}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis 
                dataKey="month" 
                stroke="#64748b"
                fontSize={12}
              />
              <YAxis 
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(value) => `${value}k`}
              />
              <Tooltip content={customTooltip} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="sauvignon_blanc" 
                stackId="1" 
                stroke="#22543d" 
                fill="#22543d"
                fillOpacity={0.6}
                name="Sauvignon Blanc"
              />
              <Area 
                type="monotone" 
                dataKey="pinot_noir" 
                stackId="1" 
                stroke="#c9a96e" 
                fill="#c9a96e"
                fillOpacity={0.6}
                name="Pinot Noir"
              />
              <Area 
                type="monotone" 
                dataKey="chardonnay" 
                stackId="1" 
                stroke="#d69e2e" 
                fill="#d69e2e"
                fillOpacity={0.6}
                name="Chardonnay"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 text-xs text-slate-500 border-t pt-2">
          <div className="flex justify-between">
            <span>Average monthly stock: {data?.length > 0 ? 
              (data.reduce((sum, item) => sum + (item.sauvignon_blanc || 0) + (item.pinot_noir || 0) + (item.chardonnay || 0), 0) / data.length).toFixed(0) 
              : 0}k cases</span>
            {comparisonData && comparisonData.length > 0 && (
              <span>{comparisonPeriod.replace('_', ' ')} average: {
                (comparisonData.reduce((sum, item) => sum + (item.sauvignon_blanc || 0) + (item.pinot_noir || 0) + (item.chardonnay || 0), 0) / comparisonData.length).toFixed(0)
              }k cases</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}