import { ChurchAsset } from '../app/types';

// Straight-line depreciation. Shared by AssetManagement (per-asset breakdown)
// and ReportCenter (consolidated report totals) so both stay in sync.
export function calcDep(asset: ChurchAsset) {
  if (!asset.usefulLifeYears) {
    return { annual: 0, accumulated: 0, bookValue: asset.acquisitionValue, rate: 0, remaining: 0 };
  }
  const annual = asset.acquisitionValue / asset.usefulLifeYears;
  const years = (Date.now() - new Date(asset.acquisitionDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const accumulated = Math.min(asset.acquisitionValue, annual * years);
  const bookValue = Math.max(0, asset.acquisitionValue - accumulated);
  const rate = (1 / asset.usefulLifeYears) * 100;
  const remaining = Math.max(0, asset.usefulLifeYears - years);
  return { annual, accumulated, bookValue, rate, remaining };
}
