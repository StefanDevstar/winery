import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, AlertTriangle, CheckCircle, Clock } from "lucide-react";

export default function DistributorMap({ distributors = [] }) {
  const statusIcons = {
    healthy: <CheckCircle className="w-3 h-3" />,
    warning: <Clock className="w-3 h-3" />,
    critical: <AlertTriangle className="w-3 h-3" />
  };

  const statusColors = {
    healthy: "bg-green-100 text-green-700 border-green-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    critical: "bg-red-100 text-red-700 border-red-200"
  };

  return (
    <Card className="glass-effect">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold text-slate-900">
          Global Distributor Network
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Simplified world view with distributor cards */}
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {distributors.map((distributor, index) => {
              const status = distributor?.stock_status || 'healthy';
              const name = distributor?.name || distributor?.id || 'Unknown Distributor';
              const currentStock = Number(distributor?.current_stock ?? distributor?.stock ?? 0);
              const daysOfCover = distributor?.days_of_cover ?? distributor?.cover_days ?? 0;
              const region = distributor?.region || distributor?.country || 'Unknown';

              return (
                <div 
                  key={index}
                  className={`border rounded-lg p-3 sm:p-4 ${statusColors[status]}`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <h3 className="font-medium text-sm sm:text-base truncate">{name}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {statusIcons[status]}
                      <span className="text-xs font-medium">
                        {String(status).toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs sm:text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Stock:</span>
                      <span className="font-medium">{currentStock.toLocaleString()} cases</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Region:</span>
                      <span className="font-medium uppercase">{region}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}