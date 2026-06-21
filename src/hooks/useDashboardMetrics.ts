import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export interface DashboardMetric {
  name: string;
  value: number;
}

export function useDashboardMetrics() {
  const [data, setData] = useState<DashboardMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: result, error } = await (supabase.from("dashboard_metrics") as any)
        .select("name,value");

      if (error) throw error;
      setData(result ?? []);
    } catch (err) {
      setError((err as Error).message || "فشل في تحميل بيانات لوحة القيادة");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
