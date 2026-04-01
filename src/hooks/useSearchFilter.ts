import { useState, useMemo } from "react";

interface UseSearchFilterOptions<T> {
  items: T[];
  searchFields: (item: T) => string[];
  sortFn?: (a: T, b: T) => number;
}

export function useSearchFilter<T>({ items, searchFields, sortFn }: UseSearchFilterOptions<T>) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let result = q
      ? items.filter((item) => searchFields(item).some((field) => field.toLowerCase().includes(q)))
      : items;

    if (sortFn) {
      result = [...result].sort(sortFn);
    }

    return result;
  }, [items, query, searchFields, sortFn]);

  return { query, setQuery, filtered };
}
