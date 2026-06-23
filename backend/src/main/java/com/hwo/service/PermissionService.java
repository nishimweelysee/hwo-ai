package com.hwo.service;

import com.hwo.domain.RolePermissions;
import com.hwo.entity.User;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PermissionService {

    private final SettingsService settingsService;

    public PermissionService(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    public List<Map<String, String>> getMenuCatalog() {
        return RolePermissions.menuCatalog();
    }

    public List<Map<String, String>> getActionCatalog() {
        return RolePermissions.actionCatalog();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getPermissionConfig() {
        Map<String, Object> stored = settingsService.getSection("permissions");
        Map<String, List<String>> roleMenus = loadRoleMap(
            stored.get("roleMenus") instanceof Map<?, ?> menus ? menus : Map.of()
        );
        Map<String, List<String>> roleActions = loadRoleMap(
            stored.get("roleActions") instanceof Map<?, ?> actions ? actions : Map.of()
        );
        ensureActiveRoles(roleMenus, roleActions);

        List<String> activeRoles = settingsService.getActiveUserRoleNames();
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("roleMenus", filterToRoles(roleMenus, activeRoles, List.of("profile")));
        config.put("roleActions", filterToRoles(roleActions, activeRoles, List.of()));
        config.put("menus", getMenuCatalog());
        config.put("actions", getActionCatalog());
        config.put("roles", settingsService.getActiveUserRoleItems());
        return config;
    }

    public Map<String, Object> forUser(User user) {
        String role = user != null && user.getRole() != null ? user.getRole() : "";
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("role", role);
        body.put("menus", menuIdsForRole(role));
        body.put("actions", actionIdsForRole(role));
        body.put("canManageUsers", hasAction(user, RolePermissions.ACTION_USERS_MANAGE));
        body.put("canManageSettings", hasAction(user, RolePermissions.ACTION_SETTINGS_MANAGE));
        return body;
    }

    public boolean hasMenu(User user, String menuId) {
        if (user == null || menuId == null) return false;
        List<String> allowed = menuIdsForRole(user.getRole());
        return allowed.contains(RolePermissions.ALL) || allowed.contains(menuId);
    }

    public boolean hasAction(User user, String action) {
        if (user == null || action == null) return false;
        List<String> allowed = actionIdsForRole(user.getRole());
        return allowed.contains(RolePermissions.ALL) || allowed.contains(action);
    }

    public void requireAction(User user, String action) {
        if (!hasAction(user, action)) {
            throw new SecurityException("Permission denied: " + action);
        }
    }

    /** Ensure every active user role has assignable menu/action entries. */
    public void syncActiveRoles() {
        Map<String, Object> stored = new LinkedHashMap<>(settingsService.getSection("permissions"));
        Map<String, List<String>> roleMenus = loadRoleMap(
            stored.get("roleMenus") instanceof Map<?, ?> menus ? menus : Map.of()
        );
        Map<String, List<String>> roleActions = loadRoleMap(
            stored.get("roleActions") instanceof Map<?, ?> actions ? actions : Map.of()
        );
        if (ensureActiveRoles(roleMenus, roleActions)) {
            stored.put("roleMenus", roleMenus);
            stored.put("roleActions", roleActions);
            settingsService.savePermissionsSection(stored);
        }
    }

    private boolean ensureActiveRoles(Map<String, List<String>> roleMenus, Map<String, List<String>> roleActions) {
        boolean changed = false;
        for (String role : settingsService.getActiveUserRoleNames()) {
            if (findRoleKey(roleMenus, role) == null) {
                roleMenus.put(role, new ArrayList<>(List.of("profile")));
                changed = true;
            }
            if (findRoleKey(roleActions, role) == null) {
                roleActions.put(role, new ArrayList<>());
                changed = true;
            }
        }
        return changed;
    }

    private List<String> menuIdsForRole(String role) {
        Map<String, Object> stored = settingsService.getSection("permissions");
        Object roleMenus = stored.get("roleMenus");
        if (!(roleMenus instanceof Map<?, ?> map)) {
            return List.of("profile");
        }
        List<String> values = valuesForRole(role, map);
        return values != null ? values : List.of("profile");
    }

    private List<String> actionIdsForRole(String role) {
        Map<String, Object> stored = settingsService.getSection("permissions");
        Object roleActions = stored.get("roleActions");
        if (!(roleActions instanceof Map<?, ?> map)) {
            return List.of();
        }
        List<String> values = valuesForRole(role, map);
        return values != null ? values : List.of();
    }

    private List<String> valuesForRole(String role, Map<?, ?> map) {
        String key = findRoleKey(map, role);
        if (key == null) return null;
        Object value = map.get(key);
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return null;
    }

    private String findRoleKey(Map<?, ?> map, String role) {
        if (role == null || role.isBlank() || map == null) return null;
        if (map.containsKey(role)) return role;
        for (Object key : map.keySet()) {
            if (key != null && role.equalsIgnoreCase(String.valueOf(key))) {
                return String.valueOf(key);
            }
        }
        return null;
    }

    private Map<String, List<String>> loadRoleMap(Map<?, ?> stored) {
        Map<String, List<String>> map = new LinkedHashMap<>();
        stored.forEach((role, value) -> {
            if (value instanceof List<?> list) {
                map.put(String.valueOf(role), list.stream().map(String::valueOf).toList());
            }
        });
        return map;
    }

    private Map<String, List<String>> filterToRoles(
            Map<String, List<String>> source,
            List<String> roles,
            List<String> fallback) {
        Map<String, List<String>> filtered = new LinkedHashMap<>();
        for (String role : roles) {
            String key = findRoleKey(source, role);
            if (key != null) {
                filtered.put(key, source.get(key));
            } else {
                filtered.put(role, new ArrayList<>(fallback));
            }
        }
        return filtered;
    }
}
