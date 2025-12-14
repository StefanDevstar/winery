import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function KPITile({ 
  title, 
  value, 
  previousValue, 
  unit, 
  trend, 
  status, 
  onClick 
}) {
  const percentChange = previousValue ? 
    ((value - previousValue) / previousValue * 100).toFixed(1) : 0;
  
  const isPositive = percentChange > 0;
  const isNeutral = percentChange == 0;

  const statusColors = {
    healthy: "border-l-green-500",
    warning: "border-l-amber-500", 
    critical: "border-l-red-500"
  };

  const TrendIcon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const trendColor = isNeutral ? "text-gray-400" : isPositive ? "text-green-600" : "text-red-600";

  return (
    <Card 
      className={`glass-effect border-l-4 ${statusColors[status]} cursor-pointer 
                 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] p-6`}
      onClick={onClick}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wider">
            {title}
          </h3>
          <div className={`flex items-center gap-1 text-sm ${trendColor}`}>
            <TrendIcon className="w-4 h-4" />
            <span className="font-medium">{Math.abs(percentChange)}%</span>
          </div>
        </div>
        
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900">
            {value.toLocaleString()}
          </span>
          <span className="text-lg text-slate-500 font-medium">
            {unit}
          </span>
        </div>
        
        <div className="text-xs text-slate-500">
          vs previous period: {previousValue?.toLocaleString() || 'N/A'} {unit}
        </div>
      </div>
    </Card>
  );
}