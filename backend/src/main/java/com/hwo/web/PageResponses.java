package com.hwo.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public final class PageResponses {

    private PageResponses() {}

    public static <T> Map<String, Object> of(List<T> all, int page, int pageSize) {
        return of(all, page, pageSize, null, null);
    }

    public static <T> Map<String, Object> of(
            List<T> all,
            int page,
            int pageSize,
            String search,
            Function<T, String> searchableText) {
        List<T> safe = all != null ? all : List.of();
        if (search != null && !search.isBlank() && searchableText != null) {
            String q = search.trim().toLowerCase(Locale.ROOT);
            String[] tokens = q.split("\\s+");
            safe = safe.stream()
                .filter(item -> {
                    String hay = searchableText.apply(item);
                    if (hay == null) return false;
                    String lower = hay.toLowerCase(Locale.ROOT);
                    for (String token : tokens) {
                        if (!lower.contains(token)) return false;
                    }
                    return true;
                })
                .collect(Collectors.toList());
        }
        int size = Math.min(Math.max(pageSize, 1), 100);
        int pageIndex = Math.max(page, 1) - 1;
        int total = safe.size();
        int totalPages = Math.max(1, (int) Math.ceil(total / (double) size));
        if (pageIndex >= totalPages) pageIndex = totalPages - 1;
        int from = Math.min(pageIndex * size, total);
        int to = Math.min(from + size, total);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", new ArrayList<>(safe.subList(from, to)));
        body.put("page", pageIndex + 1);
        body.put("pageSize", size);
        body.put("totalItems", total);
        body.put("totalPages", totalPages);
        return body;
    }
}
