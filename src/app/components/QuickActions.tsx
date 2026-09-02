import React from 'react';
import { Plus, UserPlus, Calendar, Megaphone, DollarSign, ClipboardList } from 'lucide-react';

interface QuickActionsProps {
  onNavigate: (page: string) => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions = [
    {
      icon: UserPlus,
      label: 'Tambah Jemaat',
      color: 'bg-[#1A77A3]',
      hoverColor: 'hover:bg-[#1A77A3]',
      page: 'members'
    },
    {
      icon: Calendar,
      label: 'Buat Acara',
      color: 'bg-[#3a7fa0]',
      hoverColor: 'hover:bg-[#3a7fa0]',
      page: 'events'
    },
    {
      icon: Megaphone,
      label: 'Buat Pengumuman',
      color: 'bg-[#9c9486]',
      hoverColor: 'hover:bg-orange-600',
      page: 'announcements'
    },
    {
      icon: DollarSign,
      label: 'Catat Keuangan',
      color: 'bg-green-500',
      hoverColor: 'hover:bg-green-600',
      page: 'financial'
    },
    {
      icon: ClipboardList,
      label: 'Catat Kehadiran',
      color: 'bg-[#1A77A3]',
      hoverColor: 'hover:bg-[#1A77A3]',
      page: 'attendance'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => onNavigate(action.page)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg text-white ${action.color} ${action.hoverColor} transition-colors`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium text-center">{action.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
