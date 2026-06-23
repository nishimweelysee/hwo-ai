"use client";

import { Search } from "lucide-react";

type ListSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function ListSearchBar({
  value,
  onChange,
  placeholder = "Search name, email, role, department, ID…",
  className = "",
}: ListSearchBarProps) {
  return (
    <div className={`relative min-w-[14rem] flex-1 sm:max-w-xs ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm"
      />
    </div>
  );
}
