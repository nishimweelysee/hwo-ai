package com.hwo.domain;

import com.hwo.entity.User;

import java.util.List;
import java.util.Map;
import java.util.Set;

/** @deprecated Use SettingsService role metadata — kept for legacy references only. */
@Deprecated
public final class UserTypes {

    public static final Set<String> IT_ROLES = Set.of("Admin", "Manager");
    public static final Set<String> SCHEDULING_ROLES = Set.of("Scheduler", "Manager", "Admin");
    public static final Set<String> SELF_REGISTER_BLOCKED = Set.of("Admin");

    private UserTypes() {}

    public static String labelForRole(String role) {
        if (role == null) return "standard";
        if (IT_ROLES.contains(role)) return "it";
        if ("Viewer".equalsIgnoreCase(role)) return "readonly";
        if (SCHEDULING_ROLES.contains(role)) return "scheduling";
        return "operational";
    }

    public static boolean requiresStaffLink(String role) {
        return role != null && SCHEDULING_ROLES.contains(role);
    }

    public static boolean requiresDepartment(String role) {
        return role != null && (SCHEDULING_ROLES.contains(role) || "Analyst".equalsIgnoreCase(role));
    }

    public static boolean isAdmin(User user) {
        return user != null && "Admin".equalsIgnoreCase(user.getRole());
    }

    public static List<Map<String, Object>> metaDefinitions() {
        return List.of(
            Map.of("id", "it", "label", "IT & Management", "roles", List.of("Admin", "Manager")),
            Map.of("id", "scheduling", "label", "Scheduling & Operations", "roles", List.of("Scheduler", "Manager")),
            Map.of("id", "operational", "label", "Analysis & Reporting", "roles", List.of("Analyst")),
            Map.of("id", "readonly", "label", "Read-only", "roles", List.of("Viewer"))
        );
    }
}
