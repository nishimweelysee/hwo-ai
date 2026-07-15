"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  filterSearchableOptions,
  paginateItems,
  type SearchableOption,
} from "@/lib/searchable-options";

export type LoadOptionsResult = {
  options: SearchableOption[];
  totalItems: number;
  totalPages: number;
};

type SearchableSelectProps = {
  label?: string;
  value: string;
  options?: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  pageSize?: number;
  emptyMessage?: string;
  /** Compact trigger without block label wrapper */
  inline?: boolean;
  /**
   * When set, options are loaded from the server with search + pagination
   * instead of filtering a local `options` array.
   */
  loadOptions?: (args: {
    search: string;
    page: number;
    pageSize: number;
  }) => Promise<LoadOptionsResult>;
  /** Optional label/subtitle for the currently selected value (remote mode). */
  selectedOption?: SearchableOption | null;
};

export function SearchableSelect({
  label,
  value,
  options = [],
  onChange,
  placeholder = "Select…",
  hint,
  disabled = false,
  className = "",
  pageSize = 10,
  emptyMessage = "No matches",
  inline = false,
  loadOptions,
  selectedOption: selectedOptionProp,
}: SearchableSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [remoteOptions, setRemoteOptions] = useState<SearchableOption[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedCache, setSelectedCache] = useState<SearchableOption | null>(null);
  const requestIdRef = useRef(0);

  const isRemote = Boolean(loadOptions);

  useEffect(() => {
    if (!isRemote) return;
    const t = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(t);
  }, [search, isRemote]);

  const fetchRemote = useCallback(async () => {
    if (!loadOptions) return;
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await loadOptions({
        search: debouncedSearch,
        page,
        pageSize,
      });
      if (reqId !== requestIdRef.current) return;
      setRemoteOptions(result.options);
      setTotalItems(result.totalItems);
      setTotalPages(Math.max(1, result.totalPages));
    } catch {
      if (reqId !== requestIdRef.current) return;
      setRemoteOptions([]);
      setTotalItems(0);
      setTotalPages(1);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [loadOptions, debouncedSearch, page, pageSize]);

  useEffect(() => {
    if (!isRemote) return;
    setPage(1);
  }, [debouncedSearch, isRemote]);

  useEffect(() => {
    if (!open || !isRemote) return;
    void fetchRemote();
  }, [open, isRemote, fetchRemote]);

  const localFiltered = useMemo(
    () => filterSearchableOptions(options, search),
    [options, search]
  );

  const localTotalPages = Math.max(1, Math.ceil(localFiltered.length / pageSize));

  useEffect(() => {
    if (isRemote) return;
    setPage(1);
  }, [search, options.length, isRemote]);

  useEffect(() => {
    if (isRemote) {
      if (page > totalPages) setPage(totalPages);
    } else if (page > localTotalPages) {
      setPage(localTotalPages);
    }
  }, [page, totalPages, localTotalPages, isRemote]);

  const pageItems = useMemo(() => {
    if (isRemote) return remoteOptions;
    return paginateItems(localFiltered, page, pageSize);
  }, [isRemote, remoteOptions, localFiltered, page, pageSize]);

  const resultCount = isRemote ? totalItems : localFiltered.length;
  const pages = isRemote ? totalPages : localTotalPages;

  const selected =
    selectedOptionProp
    ?? selectedCache
    ?? (isRemote ? remoteOptions.find((o) => o.value === value) : undefined)
    ?? options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch("");
      setDebouncedSearch("");
      setPage(1);
    }
  }, [open]);

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((v) => !v)}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 ${inline ? "" : "mt-1"}`}
    >
      <span className={selected ? "truncate" : "truncate text-slate-400"}>
        {selected ? (
          <>
            <span className="font-medium">{selected.label}</span>
            {selected.subtitle && (
              <span className="ml-1 text-xs text-slate-500">({selected.subtitle})</span>
            )}
          </>
        ) : (
          placeholder
        )}
      </span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
    </button>
  );

  const panel = open && (
    <div className="absolute z-50 mt-1 w-full min-w-[16rem] rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="border-b border-slate-100 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role, department…"
            className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-2 text-sm"
          />
        </div>
        <p className="mt-1 px-1 text-xs text-slate-500">
          {loading ? "Loading…" : `${resultCount} result${resultCount === 1 ? "" : "s"}`}
        </p>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {placeholder && (
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setSelectedCache(null);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${!value ? "bg-teal-50 text-teal-800" : "text-slate-500"}`}
            >
              {placeholder}
            </button>
          </li>
        )}
        {pageItems.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            {loading ? "Loading…" : emptyMessage}
          </li>
        ) : (
          pageItems.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setSelectedCache(o);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  o.value === value ? "bg-teal-50 text-teal-900" : "text-slate-800"
                }`}
              >
                <div className="font-medium">{o.label}</div>
                {o.subtitle && <div className="text-xs text-slate-500">{o.subtitle}</div>}
              </button>
            </li>
          ))
        )}
      </ul>
      {resultCount > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5 text-xs text-slate-600">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            className="rounded px-2 py-1 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );

  if (inline) {
    return (
      <div ref={rootRef} className={`relative ${className}`}>
        {trigger}
        {panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative block ${className}`}>
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      {trigger}
      {panel}
    </div>
  );
}
