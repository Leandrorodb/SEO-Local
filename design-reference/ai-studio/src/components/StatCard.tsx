import React from 'react';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  note?: string;
  trend?: string;
  accent?: 'default' | 'teal' | 'emerald' | 'amber';
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  note,
  trend,
  accent = 'default',
}) => {
  const accentBgs = {
    default: 'bg-white border-slate-200',
    teal: 'bg-white border-teal-200/80',
    emerald: 'bg-white border-emerald-200/80',
    amber: 'bg-white border-amber-200/80',
  };

  const iconBgs = {
    default: 'bg-slate-100 text-slate-700',
    teal: 'bg-teal-50 text-teal-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden flex flex-col justify-between ${accentBgs[accent]}`}>
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${iconBgs[accent]}`}>
          {icon}
        </div>
        {trend && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {trend}
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          {typeof value === 'number' ? new Intl.NumberFormat('pt-BR').format(value) : value}
        </div>
        {note && <div className="text-xs text-slate-400 mt-1 font-normal">{note}</div>}
      </div>

      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-slate-50/50 pointer-events-none" />
    </div>
  );
};
