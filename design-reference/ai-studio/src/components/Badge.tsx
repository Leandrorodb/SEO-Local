import React from 'react';
import { MeasurementStatus } from '../types/nexus';

interface BadgeProps {
  status?: MeasurementStatus | string | null;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status, className = '' }) => {
  if (!status) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 ${className}`}>
        Não medido
      </span>
    );
  }

  const labels: Record<string, string> = {
    QUEUED: 'Na fila',
    RUNNING: 'Em execução',
    COMPLETE: 'Concluído',
    BLOCKED: 'Interrompido',
    FAILED: 'Falhou',
    VERIFIED: 'Confirmado',
    REVIEW: 'Revisar',
    NO_LIST: 'Sem lista',
    NOT_FOUND: 'Não localizado',
    ERROR: 'Erro',
    PENDING: 'Pendente',
    REJECTED: 'Rejeitado',
  };

  const styles: Record<string, string> = {
    COMPLETE: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    VERIFIED: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    RUNNING: 'bg-sky-50 text-sky-700 border border-sky-200 animate-pulse',
    QUEUED: 'bg-slate-100 text-slate-700 border border-slate-200',
    REVIEW: 'bg-amber-50 text-amber-700 border border-amber-200',
    BLOCKED: 'bg-rose-50 text-rose-700 border border-rose-200',
    FAILED: 'bg-rose-50 text-rose-700 border border-rose-200',
    ERROR: 'bg-rose-50 text-rose-700 border border-rose-200',
    REJECTED: 'bg-slate-100 text-slate-500 line-through',
    NO_LIST: 'bg-slate-100 text-slate-600',
    NOT_FOUND: 'bg-slate-100 text-slate-600',
  };

  const style = styles[status] || 'bg-slate-100 text-slate-600';
  const label = labels[status] || status;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tracking-tight ${style} ${className}`}>
      {status === 'VERIFIED' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
      {status === 'REVIEW' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
      {status === 'RUNNING' && <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />}
      {label}
    </span>
  );
};
