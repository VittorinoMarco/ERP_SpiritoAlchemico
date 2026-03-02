export interface Kpi {
  label: string;
  valore: string;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
}

