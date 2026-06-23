"use client";

import { useEffect, useState } from "react";
import { formatCommaSeparatedList, parseCommaSeparatedList } from "@/lib/comma-separated-list";

type CommaSeparatedFieldProps = {
  label: string;
  value: string[];
  onChange: (items: string[]) => void;
  hint?: string;
  placeholder?: string;
  className?: string;
};

export function CommaSeparatedField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  className = "",
}: CommaSeparatedFieldProps) {
  const formatted = formatCommaSeparatedList(value);
  const [text, setText] = useState(formatted);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(formatted);
    }
  }, [formatted, focused]);

  const commit = () => {
    onChange(parseCommaSeparatedList(text));
  };

  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      <input
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-500"
      />
      {value.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {value.length} item{value.length === 1 ? "" : "s"}: {value.join(" · ")}
        </p>
      )}
    </label>
  );
}

/** Blur the active field so comma-separated inputs commit before save. */
export function commitFocusedCommaField() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
}
