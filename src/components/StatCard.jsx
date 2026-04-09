import React from 'react';

const StatCard = ({ title, value, colorClass, icon: Icon }) => (
  <div className={`bg-gray-900 p-4 rounded-xl border border-slate-600 shadow-sm border-l-4 ${colorClass}`}>
    <div className="flex justify-between items-start">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className={`text-2xl font-bold mt-1 ${colorClass.replace('border-l-', 'text-')}`}>{value}</p>
      </div>
      <Icon className="w-5 h-5 text-slate-300" />
    </div>
  </div>
);

export default StatCard;