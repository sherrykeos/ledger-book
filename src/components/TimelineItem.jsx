import React from 'react';
import { Trash2, PlusCircle, CheckCircle2 } from 'lucide-react';

const TimelineItem = ({ activity, formatTimestamp }) => {
  if (!activity) return null;

  const isDelete = activity.action === 'DELETE';
  const isStatus = activity.action === 'STATUS';
  
  const Icon = isDelete ? Trash2 : (isStatus ? CheckCircle2 : PlusCircle);
  const iconColor = isDelete ? 'text-red-500' : (isStatus ? 'text-blue-500' : 'text-emerald-500');
  const bgColor = isDelete ? 'bg-red-50 dark:bg-red-500/20' : (isStatus ? 'bg-blue-50 dark:bg-blue-500/20' : 'bg-emerald-50 dark:bg-emerald-500/20');

  return (
    <div className="flex gap-6 items-start relative transition-colors">
      <div className={`z-10 p-1.5 rounded-full border-2 border-white dark:border-slate-900 shadow-sm shrink-0 ${bgColor} ${iconColor} transition-colors`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 pb-8">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-bold text-slate-900 dark:text-white">{activity.actor || 'Unknown'}</span>{' '}
            <span>{activity.description}</span>
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium whitespace-nowrap ml-2">
            {typeof formatTimestamp === 'function' ? formatTimestamp(activity.createdAt) : '...'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TimelineItem;