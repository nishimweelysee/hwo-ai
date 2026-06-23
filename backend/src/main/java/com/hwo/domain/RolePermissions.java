package com.hwo.domain;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Menu and action permission catalog — mirrored in frontend permissions.ts */
public final class RolePermissions {

    public static final String ALL = "*";

    public static final String ACTION_USERS_MANAGE = "users:manage";
    public static final String ACTION_SETTINGS_MANAGE = "settings:manage";
    public static final String ACTION_AUDIT_EXPORT = "audit:export";
    public static final String ACTION_DATA_MANAGE = "data:manage";

    private RolePermissions() {}

    public static List<Map<String, String>> menuCatalog() {
        return List.of(
            menu("dashboard", "Dashboard", "/dashboard"),
            menu("data-collection", "Data Collection", "/data-collection"),
            menu("workload-analysis", "Workload Analysis", "/workload-analysis"),
            menu("ai-prediction", "AI Prediction", "/ai-prediction"),
            menu("scheduling", "Scheduling", "/scheduling"),
            menu("reporting", "Reporting", "/reporting"),
            menu("wellness", "Staff Wellness", "/wellness"),
            menu("resources", "Resources", "/resources"),
            menu("skills", "Skills & Competency", "/skills"),
            menu("mobile", "Mobile", "/mobile"),
            menu("compliance", "Compliance", "/compliance"),
            menu("user-management", "User Management", "/user-management"),
            menu("configuration", "Configuration", "/configuration"),
            menu("data-management", "Data Management", "/data-management"),
            menu("audit", "Audit & Logging", "/audit"),
            menu("profile", "Profile", "/profile")
        );
    }

    public static Map<String, Object> defaultPermissionConfig() {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("roleMenus", seedRoleMenus());
        config.put("roleActions", seedRoleActions());
        return config;
    }

    /** Initial DB seed only — runtime roles come from Configuration → Application user roles. */
    public static Map<String, List<String>> seedRoleMenus() {
        Map<String, List<String>> roles = new LinkedHashMap<>();
        roles.put("Admin", List.of(ALL));
        roles.put("Manager", List.of(
            "dashboard", "data-collection", "workload-analysis", "ai-prediction", "scheduling",
            "reporting", "wellness", "resources", "skills", "mobile", "compliance", "profile"
        ));
        roles.put("Analyst", List.of(
            "dashboard", "workload-analysis", "ai-prediction", "reporting", "wellness", "compliance", "profile"
        ));
        roles.put("Scheduler", List.of(
            "dashboard", "scheduling", "wellness", "mobile", "profile"
        ));
        roles.put("Viewer", List.of("dashboard", "reporting", "profile"));
        return roles;
    }

    public static Map<String, List<String>> seedRoleActions() {
        Map<String, List<String>> roles = new LinkedHashMap<>();
        roles.put("Admin", List.of(ALL));
        roles.put("Manager", List.of(ACTION_SETTINGS_MANAGE));
        roles.put("Analyst", List.of());
        roles.put("Scheduler", List.of());
        roles.put("Viewer", List.of());
        return roles;
    }

    public static String menuIdForRoute(String route) {
        if (route == null || route.isBlank()) return null;
        String normalized = route.startsWith("/") ? route : "/" + route;
        return menuCatalog().stream()
            .filter(m -> normalized.equals(m.get("route")) || normalized.startsWith(m.get("route") + "/"))
            .map(m -> m.get("id"))
            .findFirst()
            .orElse(null);
    }

    public static Set<String> knownRoles() {
        return seedRoleMenus().keySet();
    }

    public static List<Map<String, String>> actionCatalog() {
        return List.of(
            action(ACTION_USERS_MANAGE, "Manage users", "Create, edit, and deactivate application users"),
            action(ACTION_SETTINGS_MANAGE, "Manage settings", "Edit configuration and role permission matrix"),
            action(ACTION_AUDIT_EXPORT, "Export audit logs", "Download audit and activity exports"),
            action(ACTION_DATA_MANAGE, "Manage data", "Import, purge, and manage operational data sets")
        );
    }

    public static Set<String> knownActions() {
        return Set.of(ACTION_USERS_MANAGE, ACTION_SETTINGS_MANAGE, ACTION_AUDIT_EXPORT, ACTION_DATA_MANAGE);
    }

    private static Map<String, String> action(String id, String label, String description) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("label", label);
        row.put("description", description);
        return row;
    }

    private static Map<String, String> menu(String id, String label, String route) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("label", label);
        row.put("route", route);
        return row;
    }
}
