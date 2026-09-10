import React from 'react';
import {
  Calendar,
  ChevronDown,
  RefreshCw,
  Printer,
  ShieldCheck,
} from 'lucide-react';

export interface FinanceMetricItem {
  label: string;
  value: React.ReactNode;
  color?: 'emerald' | 'sky' | 'teal' | 'indigo' | 'amber' | 'rose';
}

export interface FinancePageHeaderProps {
  title: string;
  subtitle?: string;
  currentSection: string;
  onNavigate?: (page: string) => void;
  statusBadge?: {
    label: string;
    variant?: 'emerald' | 'sky' | 'indigo' | 'amber';
    pulse?: boolean;
  };
  systemBadge?: string;
  metaBadge?: string;

  // Fiscal Year Capsule Selector
  fiscalYears?: Array<{ id: string; name?: string; code?: string; is_current?: boolean }>;
  fiscalYearId?: string;
  onFiscalYearChange?: (id: string) => void;
  fiscalYearLabel?: string;

  // Additional select capsule (e.g. Bank Account in Reconciliation)
  secondarySelect?: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: Array<{ value: string; label: string }>;
    icon?: React.ElementType;
  };

  // Actions
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onPrint?: () => void;
  primaryAction?: {
    label: string;
    icon?: React.ElementType;
    onClick: () => void;
    disabled?: boolean;
  };
  secondaryActions?: React.ReactNode;

  // Micro-metrics strip
  infoStrip?: FinanceMetricItem[];
}

export function FinancePageHeader({
  title,
  subtitle,
  currentSection,
  onNavigate,
  statusBadge,
  systemBadge = 'Sistem Akuntansi Ganda (Double-Entry)',
  metaBadge = 'Real-time GL',
  fiscalYears,
  fiscalYearId,
  onFiscalYearChange,
  fiscalYearLabel = 'Tahun Fiskal',
  secondarySelect,
  onRefresh,
  isRefreshing = false,
  onPrint,
  primaryAction,
  secondaryActions,
  infoStrip,
}: FinancePageHeaderProps) {
  const currentFiscalYear = fiscalYears?.find(fy => fy.id === fiscalYearId);

  // Badge styling helper
  const getBadgeStyle = (variant: 'emerald' | 'sky' | 'indigo' | 'amber' = 'emerald') => {
    switch (variant) {
      case 'sky':
        return 'bg-sky-50 text-sky-800 border-sky-200/80';
      case 'indigo':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200/80';
      case 'amber':
        return 'bg-amber-50 text-amber-800 border-amber-200/80';
      case 'emerald':
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
    }
  };

  const getDotColor = (color: 'emerald' | 'sky' | 'teal' | 'indigo' | 'amber' | 'rose' = 'emerald') => {
    switch (color) {
      case 'sky':
        return 'bg-sky-500';
      case 'teal':
        return 'bg-teal-500';
      case 'indigo':
        return 'bg-indigo-500';
      case 'amber':
        return 'bg-amber-500';
      case 'rose':
        return 'bg-rose-500';
      case 'emerald':
      default:
        return 'bg-emerald-500';
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs relative overflow-hidden">
      {/* Subtle top brand accent line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#144f6b] via-sky-400 to-emerald-400" />

      {/* Main Title & Action Cluster */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        {/* Left Title & Status */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight" title={title}>
              {title}
            </h1>

            {/* Refresh Button Sejajar dengan Judul */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-500 hover:text-[#144f6b] hover:border-[#144f6b] shadow-2xs transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#144f6b]/30"
                title="Segarkan Data Real-Time"
                aria-label="Segarkan Data Real-Time"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#144f6b]' : ''}`} />
              </button>
            )}

            {statusBadge ? (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${getBadgeStyle(
                  statusBadge.variant
                )}`}
              >
                {statusBadge.pulse !== false && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
                {statusBadge.label}
              </span>
            ) : currentFiscalYear?.is_current ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Tahun Anggaran Berjalan
              </span>
            ) : null}
          </div>

          <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-700">GPIB Jemaat Trinitas Jakarta</span>
            {subtitle ? (
              <>
                <span className="text-slate-300">&bull;</span>
                <span>{subtitle}</span>
              </>
            ) : null}
          </p>
        </div>

        {/* Right Controls: Capsules + Actions */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          {/* Secondary Selector (e.g., Bank Account) */}
          {secondarySelect && (
            <div className="relative flex items-center gap-2 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/90 rounded-xl px-3.5 py-2 transition-all shadow-2xs group focus-within:ring-2 focus-within:ring-[#144f6b]/20 focus-within:border-[#144f6b]">
              <div className="w-7 h-7 rounded-lg bg-teal-100/70 text-teal-700 flex items-center justify-center shrink-0">
                {secondarySelect.icon ? (
                  <secondarySelect.icon className="w-4 h-4" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
              </div>
              <div className="text-left pr-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5">
                  {secondarySelect.label}
                </span>
                <select
                  value={secondarySelect.value}
                  onChange={e => secondarySelect.onChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-4 appearance-none"
                >
                  {secondarySelect.options.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 pointer-events-none group-hover:text-slate-600 transition-colors" />
            </div>
          )}

          {/* Fiscal Year Selector Capsule */}
          {fiscalYears && fiscalYears.length > 0 && onFiscalYearChange && (
            <div className="relative flex items-center gap-2.5 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/90 rounded-xl px-3.5 py-2 transition-all shadow-2xs group focus-within:ring-2 focus-within:ring-[#144f6b]/20 focus-within:border-[#144f6b]">
              <div className="w-7 h-7 rounded-lg bg-sky-100/70 text-[#144f6b] flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="text-left pr-4">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none mb-0.5">
                  {fiscalYearLabel}
                </span>
                <select
                  value={fiscalYearId}
                  onChange={e => onFiscalYearChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-4 appearance-none"
                >
                  {fiscalYears.map(fy => (
                    <option key={fy.id} value={fy.id}>
                      {fy.name || fy.code} {fy.is_current ? '★ (Aktif)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 pointer-events-none group-hover:text-slate-600 transition-colors" />
            </div>
          )}

          {/* Print Button */}
          {onPrint && (
            <button
              onClick={onPrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-2xs text-xs font-semibold transition-all"
              title="Cetak Ringkasan Eksekutif"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Cetak</span>
            </button>
          )}

          {/* Additional Secondary Actions Slot */}
          {secondaryActions}

          {/* Primary Action Button */}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white shadow-sm hover:shadow-md text-xs font-bold transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #144f6b 0%, #115372 100%)' }}
            >
              {primaryAction.icon && (
                <primaryAction.icon className="w-4 h-4 stroke-[2.5]" />
              )}
              <span>{primaryAction.label}</span>
            </button>
          )}
        </div>
      </div>

      {/* Minimalist Informative Micro-Metrics Strip */}
      {infoStrip && infoStrip.length > 0 && (
        <div className="mt-5 pt-3.5 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {infoStrip.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 min-w-0">
              <div className={`w-2 h-2 rounded-full shrink-0 ${getDotColor(item.color)}`} />
              <span className="text-slate-500 shrink-0">{item.label}:</span>
              <span className="font-semibold text-slate-800 truncate">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
