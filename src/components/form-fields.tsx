export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800"
      />
    </label>
  );
}

import { SearchableSelect } from "@/components/searchable-select";
import type { SearchableOption } from "@/lib/searchable-options";

export { SearchableSelect };
export type { SearchableOption };

export function SearchableSelectField({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder,
  pageSize,
}: {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  pageSize?: number;
}) {
  return (
    <SearchableSelect
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      hint={hint}
      placeholder={placeholder}
      pageSize={pageSize}
    />
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
