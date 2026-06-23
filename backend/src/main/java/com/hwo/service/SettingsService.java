package com.hwo.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hwo.domain.RolePermissions;
import com.hwo.entity.AppSetting;
import com.hwo.repository.AppSettingRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SettingsService {

    private static final String STAFF_SCHEDULING_PREFS_KEY = "staffSchedulingPreferences";

    private static final Set<String> DATA_READ_ONLY_KEYS = Set.of(
        "hisConnected", "hrConnected", "hisStatus", "hrStatus",
        "hisStatusLabel", "hrStatusLabel", "hisMessage", "hrMessage",
        "hisLocalRecords", "hrLocalRecords", "hisSyncedRecords", "hrSyncedRecords",
        "quality"
    );

    private final AppSettingRepository appSettingRepository;
    private final ObjectMapper objectMapper;
    private final WorkloadRecordRepository workloadRecordRepository;
    private final StaffRepository staffRepository;
    private final IntegrationService integrationService;

    public SettingsService(AppSettingRepository appSettingRepository,
                           ObjectMapper objectMapper,
                           WorkloadRecordRepository workloadRecordRepository,
                           StaffRepository staffRepository,
                           @Lazy IntegrationService integrationService) {
        this.appSettingRepository = appSettingRepository;
        this.objectMapper = objectMapper;
        this.workloadRecordRepository = workloadRecordRepository;
        this.staffRepository = staffRepository;
        this.integrationService = integrationService;
    }

    public Set<String> getSectionNames() {
        return defaultSections().keySet();
    }

    public boolean isValidSection(String section) {
        return defaultSections().containsKey(section);
    }

    public Map<String, Object> getAll() {
        Map<String, Object> all = new LinkedHashMap<>();
        for (String section : defaultSections().keySet()) {
            all.put(section, getSection(section));
        }
        return all;
    }

    public Map<String, Object> getSection(String section) {
        if ("data".equals(section)) {
            return enrichDataSection(getStoredSection(section));
        }
        return getStoredSection(section);
    }

    public Map<String, Object> updateSection(String section, Map<String, ?> updates) {
        if (updates == null || updates.isEmpty()) {
            throw new IllegalArgumentException("No settings provided to save");
        }
        Map<String, Object> filtered = filterWritableUpdates(section, updates);
        if (filtered.isEmpty()) {
            throw new IllegalArgumentException("No valid settings fields to save for section: " + section);
        }
        validateSection(section, filtered);

        Map<String, Object> previous = "userRoles".equals(section)
            ? new LinkedHashMap<>(getStoredSection(section))
            : Map.of();
        Map<String, Object> current = getStoredSection(section);
        if ("userRoles".equals(section) && filtered.get("items") instanceof List<?> items) {
            filtered.put("items", normalizeUserRoleItems(items));
        }
        filtered.forEach(current::put);
        saveSection(section, current);
        if ("userRoles".equals(section)) {
            migratePermissionRoleNames(previous, current);
            syncPermissionRoles();
        }
        return getSection(section);
    }

    /** Persist permissions section without running writable-key filtering (internal use). */
    public void savePermissionsSection(Map<String, Object> permissions) {
        saveSection("permissions", permissions);
    }

    /** Ensure every active user role has entries in the permissions matrix. */
    public void ensurePermissionRolesSynced() {
        ensureUserRoleItemsNormalized();
        syncPermissionRoles();
    }

    @SuppressWarnings("unchecked")
    private void ensureUserRoleItemsNormalized() {
        Map<String, Object> stored = new LinkedHashMap<>(getStoredSection("userRoles"));
        Object items = stored.get("items");
        if (!(items instanceof List<?> list) || list.isEmpty()) return;

        List<Map<String, Object>> normalized = new ArrayList<>();
        boolean changed = false;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            map.forEach((k, v) -> row.put(String.valueOf(k), v));
            String name = stringValue(row.get("name"));
            if (name == null || name.isBlank()) continue;
            if (stringValue(row.get("id")) == null) {
                row.put("id", java.util.UUID.randomUUID().toString());
                changed = true;
            }
            if (row.get("userType") == null) {
                row.put("userType", "standard");
                changed = true;
            }
            if (row.get("active") == null) {
                row.put("active", true);
                changed = true;
            }
            if (row.get("allowSelfRegister") == null) {
                row.put("allowSelfRegister", !"Admin".equalsIgnoreCase(name));
                changed = true;
            }
            normalized.add(row);
        }
        if (!changed || normalized.isEmpty()) return;
        stored.put("items", normalized);
        saveSection("userRoles", stored);
    }

    private void syncPermissionRoles() {
        Map<String, Object> stored = new LinkedHashMap<>(getStoredSection("permissions"));
        Map<String, List<String>> roleMenus = loadPermissionRoleMap(
            stored.get("roleMenus") instanceof Map<?, ?> menus ? menus : Map.of()
        );
        Map<String, List<String>> roleActions = loadPermissionRoleMap(
            stored.get("roleActions") instanceof Map<?, ?> actions ? actions : Map.of()
        );
        boolean changed = false;
        for (String role : getActiveUserRoleNames()) {
            if (findPermissionRoleKey(roleMenus, role) == null) {
                roleMenus.put(role, new ArrayList<>(List.of("profile")));
                changed = true;
            }
            if (findPermissionRoleKey(roleActions, role) == null) {
                roleActions.put(role, new ArrayList<>());
                changed = true;
            }
        }
        if (changed) {
            stored.put("roleMenus", roleMenus);
            stored.put("roleActions", roleActions);
            saveSection("permissions", stored);
        }
    }

    private Map<String, List<String>> loadPermissionRoleMap(Map<?, ?> stored) {
        Map<String, List<String>> map = new LinkedHashMap<>();
        stored.forEach((role, value) -> {
            if (value instanceof List<?> list) {
                map.put(String.valueOf(role), list.stream().map(String::valueOf).toList());
            }
        });
        return map;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> normalizeUserRoleItems(List<?> items) {
        List<Map<String, Object>> normalized = new ArrayList<>();
        Set<String> seen = new java.util.HashSet<>();
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            map.forEach((k, v) -> row.put(String.valueOf(k), v));
            String name = stringValue(row.get("name"));
            if (name == null || name.isBlank()) continue;
            if (!seen.add(name.toLowerCase())) {
                throw new IllegalArgumentException("Duplicate role name: " + name);
            }
            if (stringValue(row.get("id")) == null) {
                row.put("id", java.util.UUID.randomUUID().toString());
            }
            if (row.get("userType") == null) row.put("userType", "standard");
            if (row.get("active") == null) row.put("active", true);
            if (row.get("allowSelfRegister") == null) row.put("allowSelfRegister", true);
            normalized.add(row);
        }
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("At least one application user role is required");
        }
        return normalized;
    }

    @SuppressWarnings("unchecked")
    private void migratePermissionRoleNames(Map<String, Object> previous, Map<String, Object> updated) {
        Object prevItems = previous.get("items");
        Object newItems = updated.get("items");
        if (!(prevItems instanceof List<?> prevList) || !(newItems instanceof List<?> nextList)) return;
        if (prevList.size() != nextList.size()) return;

        Map<String, Object> perms = new LinkedHashMap<>(getStoredSection("permissions"));
        boolean changed = false;
        for (int i = 0; i < prevList.size(); i++) {
            String oldName = roleNameFromItem(prevList.get(i));
            String newName = roleNameFromItem(nextList.get(i));
            if (oldName == null || newName == null || oldName.equalsIgnoreCase(newName)) continue;
            changed = renamePermissionRoleKey(perms, "roleMenus", oldName, newName) || changed;
            changed = renamePermissionRoleKey(perms, "roleActions", oldName, newName) || changed;
        }
        if (changed) {
            saveSection("permissions", perms);
        }
    }

    private String roleNameFromItem(Object item) {
        if (!(item instanceof Map<?, ?> map)) return null;
        return stringValue(map.get("name"));
    }

    @SuppressWarnings("unchecked")
    private boolean renamePermissionRoleKey(Map<String, Object> perms, String key, String oldName, String newName) {
        Object value = perms.get(key);
        if (!(value instanceof Map<?, ?> map)) return false;
        Map<String, Object> updated = new LinkedHashMap<>();
        String matchKey = null;
        Object matchValue = null;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String roleKey = String.valueOf(entry.getKey());
            if (roleKey.equalsIgnoreCase(oldName)) {
                matchKey = roleKey;
                matchValue = entry.getValue();
            } else {
                updated.put(roleKey, entry.getValue());
            }
        }
        if (matchKey == null) return false;
        updated.put(newName, matchValue);
        perms.put(key, updated);
        return true;
    }

    private String findPermissionRoleKey(Map<String, List<String>> map, String role) {
        if (role == null || role.isBlank()) return null;
        if (map.containsKey(role)) return role;
        for (String key : map.keySet()) {
            if (key.equalsIgnoreCase(role)) return key;
        }
        return null;
    }

    public Map<String, Object> getSchedulingConstraints() {
        return getSection("scheduling");
    }

    public Map<String, Object> getWorkloadSettings() {
        return getSection("workload");
    }

    public Map<String, Object> getAiSettings() {
        return getSection("ai");
    }

    public Map<String, Object> getIntegrationsSettings() {
        return getSection("integrations");
    }

    public int getInt(String section, String key, int fallback) {
        Object value = getSection(section).get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    public double getDouble(String section, String key, double fallback) {
        Object value = getSection(section).get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value != null) {
            try {
                return Double.parseDouble(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    public boolean getBoolean(String section, String key, boolean fallback) {
        Object value = getSection(section).get(key);
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value != null) {
            return Boolean.parseBoolean(String.valueOf(value));
        }
        return fallback;
    }

    public String getDefaultUserRole() {
        Object value = getSection("userRoles").get("defaultRole");
        if (value != null) {
            return String.valueOf(value);
        }
        Object fallback = defaultSections().get("userRoles").get("defaultRole");
        return fallback != null ? String.valueOf(fallback) : "Analyst";
    }

    public String getOrganizationName() {
        Object value = getSection("organization").get("name");
        return value != null ? String.valueOf(value) : "";
    }

    @SuppressWarnings("unchecked")
    public List<String> getActiveUserRoleNames() {
        Object items = getSection("userRoles").get("items");
        if (!(items instanceof List<?> list)) {
            return List.of(getDefaultUserRole());
        }
        List<String> roles = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Object active = map.get("active");
            boolean isActive = active == null
                || Boolean.TRUE.equals(active)
                || "true".equalsIgnoreCase(String.valueOf(active));
            if (!isActive) continue;
            Object name = map.get("name");
            if (name != null && !String.valueOf(name).isBlank()) {
                roles.add(String.valueOf(name));
            }
        }
        return roles.isEmpty() ? List.of(getDefaultUserRole()) : roles;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> getActiveUserRoleItems() {
        Object items = getSection("userRoles").get("items");
        if (!(items instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Object active = map.get("active");
            boolean isActive = active == null
                || Boolean.TRUE.equals(active)
                || "true".equalsIgnoreCase(String.valueOf(active));
            if (!isActive) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            map.forEach((k, v) -> row.put(String.valueOf(k), v));
            result.add(row);
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private java.util.Optional<Map<String, Object>> findStoredUserRoleItem(String roleName) {
        if (roleName == null || roleName.isBlank()) return java.util.Optional.empty();
        Object items = getSection("userRoles").get("items");
        if (!(items instanceof List<?> list)) return java.util.Optional.empty();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Object name = map.get("name");
            if (name != null && roleName.equalsIgnoreCase(String.valueOf(name))) {
                Map<String, Object> row = new LinkedHashMap<>();
                map.forEach((k, v) -> row.put(String.valueOf(k), v));
                return java.util.Optional.of(row);
            }
        }
        return java.util.Optional.empty();
    }

    @SuppressWarnings("unchecked")
    public java.util.Optional<Map<String, Object>> findUserRoleItem(String roleName) {
        java.util.Optional<Map<String, Object>> stored = findStoredUserRoleItem(roleName);
        java.util.Optional<Map<String, Object>> defaults = findDefaultUserRoleItem(roleName);
        if (stored.isEmpty()) return defaults;
        if (defaults.isEmpty()) return stored;

        Map<String, Object> merged = new LinkedHashMap<>(defaults.get());
        stored.get().forEach((k, v) -> {
            if (v != null) merged.put(String.valueOf(k), v);
        });

        String storedType = stringValue(stored.get().get("userType"));
        String defaultType = stringValue(defaults.get().get("userType"));
        if (isGenericUserType(storedType) && !isGenericUserType(defaultType)) {
            merged.put("userType", defaultType);
        }

        for (String key : List.of(
            "requiresDepartment", "requiresStaffRole", "requiresWorkloadTarget", "requiresStaffLink")) {
            if (!stored.get().containsKey(key) && defaults.get().containsKey(key)) {
                merged.put(key, defaults.get().get(key));
            }
        }
        return java.util.Optional.of(merged);
    }

    private static boolean isGenericUserType(String userType) {
        return userType == null || userType.isBlank() || "standard".equalsIgnoreCase(userType);
    }

    @SuppressWarnings("unchecked")
    private java.util.Optional<Map<String, Object>> findDefaultUserRoleItem(String roleName) {
        Object items = defaultSections().get("userRoles").get("items");
        if (!(items instanceof List<?> list)) return java.util.Optional.empty();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Object name = map.get("name");
            if (name != null && roleName.equalsIgnoreCase(String.valueOf(name))) {
                Map<String, Object> row = new LinkedHashMap<>();
                map.forEach((k, v) -> row.put(String.valueOf(k), v));
                return java.util.Optional.of(row);
            }
        }
        return java.util.Optional.empty();
    }

    public String userTypeForRole(String role) {
        return findUserRoleItem(role)
            .map(item -> stringValue(item.get("userType")))
            .filter(type -> type != null && !type.isBlank())
            .orElse("standard");
    }

    public boolean roleRequiresDepartment(String role) {
        return findUserRoleItem(role)
            .map(item -> booleanValue(item.get("requiresDepartment"), false))
            .orElse(false);
    }

    public boolean roleRequiresStaffRole(String role) {
        return findUserRoleItem(role)
            .map(item -> booleanValue(item.get("requiresStaffRole"), false))
            .orElse(false);
    }

    public boolean roleRequiresWorkloadTarget(String role) {
        return findUserRoleItem(role)
            .map(item -> booleanValue(item.get("requiresWorkloadTarget"), false))
            .orElse(false);
    }

    public boolean roleRequiresStaffLink(String role) {
        return findUserRoleItem(role)
            .map(item -> booleanValue(item.get("requiresStaffLink"), false))
            .orElse(false);
    }

    public boolean isSelfRegisterAllowed(String role) {
        return findUserRoleItem(role)
            .map(item -> booleanValue(item.get("allowSelfRegister"), true))
            .orElse(true);
    }

    public List<Map<String, Object>> getUserTypeMeta() {
        Map<String, List<String>> grouped = new LinkedHashMap<>();
        grouped.put("it", new ArrayList<>());
        grouped.put("scheduling", new ArrayList<>());
        grouped.put("operational", new ArrayList<>());
        grouped.put("readonly", new ArrayList<>());
        grouped.put("standard", new ArrayList<>());
        for (String roleName : getActiveUserRoleNames()) {
            String type = userTypeForRole(roleName);
            grouped.computeIfAbsent(type, key -> new ArrayList<>()).add(roleName);
        }
        return List.of(
            Map.of("id", "it", "label", "IT & Management", "roles", grouped.getOrDefault("it", List.of())),
            Map.of("id", "scheduling", "label", "Scheduling & Operations", "roles", grouped.getOrDefault("scheduling", List.of())),
            Map.of("id", "operational", "label", "Analysis & Reporting", "roles", grouped.getOrDefault("operational", List.of())),
            Map.of("id", "readonly", "label", "Read-only", "roles", grouped.getOrDefault("readonly", List.of())),
            Map.of("id", "standard", "label", "Standard", "roles", grouped.getOrDefault("standard", List.of()))
        );
    }

    public String staffProvisionRole() {
        for (String role : getActiveUserRoleNames()) {
            if (roleRequiresStaffLink(role)) return role;
        }
        return getDefaultUserRole();
    }

    public String resolveUserRole(String requested) {
        return resolveUserRole(requested, false);
    }

    public String resolveUserRole(String requested, boolean strict) {
        if (requested != null && !requested.isBlank()) {
            String role = requested.trim();
            for (String configured : getActiveUserRoleNames()) {
                if (configured.equalsIgnoreCase(role)) {
                    return configured;
                }
            }
            if (strict) {
                throw new IllegalArgumentException("Unknown application role: " + role);
            }
        }
        return getDefaultUserRole();
    }

    @SuppressWarnings("unchecked")
    public Map<String, Map<String, Object>> getStaffSchedulingPreferences() {
        return appSettingRepository.findById(STAFF_SCHEDULING_PREFS_KEY)
            .map(setting -> {
                Map<String, Object> parsed = parseJson(setting.getValue());
                Map<String, Map<String, Object>> result = new LinkedHashMap<>();
                parsed.forEach((staffId, value) -> {
                    if (value instanceof Map<?, ?> map) {
                        Map<String, Object> pref = new LinkedHashMap<>();
                        map.forEach((k, v) -> pref.put(String.valueOf(k), v));
                        result.put(staffId, pref);
                    }
                });
                return result;
            })
            .orElseGet(LinkedHashMap::new);
    }

    @SuppressWarnings("unchecked")
    public void updateStaffSchedulingPreference(String staffId, List<String> preferredShifts, List<String> avoidDates) {
        if (staffId == null || staffId.isBlank()) {
            throw new IllegalArgumentException("Staff ID is required");
        }
        Map<String, Map<String, Object>> all = getStaffSchedulingPreferences();
        Map<String, Object> pref = new LinkedHashMap<>();
        pref.put("preferredShifts", preferredShifts != null ? preferredShifts : List.of());
        pref.put("avoidDates", avoidDates != null ? avoidDates : List.of());
        all.put(staffId, pref);
        try {
            AppSetting setting = appSettingRepository.findById(STAFF_SCHEDULING_PREFS_KEY).orElseGet(AppSetting::new);
            setting.setKey(STAFF_SCHEDULING_PREFS_KEY);
            setting.setValue(objectMapper.writeValueAsString(all));
            appSettingRepository.save(setting);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to save staff scheduling preferences", e);
        }
    }

    public List<String> getShiftTypes() {
        Object value = getSection("scheduling").get("shiftTypes");
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        Object fallback = defaultSections().get("scheduling").get("shiftTypes");
        if (fallback instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return List.of("Day", "Evening", "Night");
    }

    public int getDefaultInt(String section, String key) {
        Map<String, Object> defaults = defaultSections().getOrDefault(section, Map.of());
        Object value = defaults.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    public double getDefaultDouble(String section, String key) {
        Map<String, Object> defaults = defaultSections().getOrDefault(section, Map.of());
        Object value = defaults.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value != null) {
            try {
                return Double.parseDouble(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    public int getInt(String section, String key) {
        return getInt(section, key, getDefaultInt(section, key));
    }

    public double getDouble(String section, String key) {
        return getDouble(section, key, getDefaultDouble(section, key));
    }

    public void seedDefaultsIfEmpty() {
        defaultSections().forEach((key, defaults) -> {
            if (appSettingRepository.findById(key).isEmpty()) {
                saveSection(key, defaults);
            }
        });
    }

    private Map<String, Object> getStoredSection(String section) {
        Map<String, Object> stored = appSettingRepository.findById(section)
            .map(setting -> parseJson(setting.getValue()))
            .orElseGet(() -> copySection(defaultSections().getOrDefault(section, Map.of())));
        return sanitizeStoredSection(section, stored);
    }

    private Map<String, Object> sanitizeStoredSection(String section, Map<String, Object> stored) {
        if (!"data".equals(section)) {
            return stored;
        }
        Map<String, Object> clean = new LinkedHashMap<>(stored);
        DATA_READ_ONLY_KEYS.forEach(clean::remove);
        return clean;
    }

    private Map<String, Object> filterWritableUpdates(String section, Map<String, ?> updates) {
        Set<String> allowed = writableKeys(section);
        Map<String, Object> filtered = new LinkedHashMap<>();
        updates.forEach((key, value) -> {
            if (value == null || !allowed.contains(key)) {
                return;
            }
            if ("data".equals(section) && DATA_READ_ONLY_KEYS.contains(key)) {
                return;
            }
            filtered.put(key, value);
        });
        return filtered;
    }

    private Set<String> writableKeys(String section) {
        return defaultSections().getOrDefault(section, Map.of()).keySet();
    }

    @SuppressWarnings("unchecked")
    private void validateSection(String section, Map<String, Object> values) {
        switch (section) {
            case "organization" -> {
                String name = stringValue(values.get("name"));
                if (name != null && name.isBlank()) {
                    throw new IllegalArgumentException("Organization name cannot be empty");
                }
            }
            case "scheduling" -> {
                int maxHours = intValue(values.get("maxHoursPerWeek"), -1);
                if (values.containsKey("maxHoursPerWeek") && (maxHours < 1 || maxHours > 168)) {
                    throw new IllegalArgumentException("Max hours per week must be between 1 and 168");
                }
                int rest = intValue(values.get("restBetweenShifts"), -1);
                if (values.containsKey("restBetweenShifts") && (rest < 0 || rest > 48)) {
                    throw new IllegalArgumentException("Rest between shifts must be between 0 and 48 hours");
                }
                Object shiftTypes = values.get("shiftTypes");
                if (shiftTypes instanceof List<?> list && list.isEmpty()) {
                    throw new IllegalArgumentException("At least one shift type is required");
                }
                validateConfiguredCertReferences(values.get("departmentSkillRequirements"));
                validateConfiguredCertReferences(values.get("shiftSkillRequirements"));
            }
            case "skills" -> {
                if (values.containsKey("certCatalog")) {
                    Object catalog = values.get("certCatalog");
                    if (catalog instanceof List<?> list) {
                        for (Object item : list) {
                            String name = stringValue(item);
                            if (name == null || name.isBlank()) {
                                throw new IllegalArgumentException("Certification catalog entries cannot be blank");
                            }
                        }
                    }
                }
            }
            case "workload" -> {
                double ratio = doubleValue(values.get("nursePatientRatioTarget"), -1);
                if (values.containsKey("nursePatientRatioTarget") && ratio <= 0) {
                    throw new IllegalArgumentException("Nurse-to-patient ratio target must be greater than 0");
                }
                int alert = intValue(values.get("alertThreshold"), -1);
                if (values.containsKey("alertThreshold") && (alert < 1 || alert > 100)) {
                    throw new IllegalArgumentException("Workload alert threshold must be between 1 and 100");
                }
            }
            case "integrations" -> {
                boolean hisEnabled = booleanValue(values.get("hisEnabled"), false);
                String hisUrl = stringValue(values.get("hisUrl"));
                if (hisEnabled && (hisUrl == null || hisUrl.isBlank())) {
                    throw new IllegalArgumentException("HIS endpoint URL is required when HIS integration is enabled");
                }
                boolean hrEnabled = booleanValue(values.get("hrEnabled"), false);
                String hrUrl = stringValue(values.get("hrUrl"));
                if (hrEnabled && (hrUrl == null || hrUrl.isBlank())) {
                    throw new IllegalArgumentException("HR system URL is required when HR integration is enabled");
                }
            }
            case "userRoles" -> {
                String defaultRole = stringValue(values.get("defaultRole"));
                Object items = values.get("items");
                if (defaultRole != null && items instanceof List<?> list) {
                    boolean found = list.stream().anyMatch(item -> {
                        if (!(item instanceof Map<?, ?> map)) return false;
                        Object name = map.get("name");
                        Object active = map.get("active");
                        boolean isActive = active == null || Boolean.TRUE.equals(active)
                            || "true".equalsIgnoreCase(String.valueOf(active));
                        return isActive && defaultRole.equalsIgnoreCase(String.valueOf(name));
                    });
                    if (!found) {
                        throw new IllegalArgumentException("Default role must be an active user role");
                    }
                }
            }
            case "permissions" -> validatePermissions(values);
            case "data" -> {
                int years = intValue(values.get("retentionYears"), -1);
                if (values.containsKey("retentionYears") && (years < 1 || years > 30)) {
                    throw new IllegalArgumentException("Retention period must be between 1 and 30 years");
                }
            }
            case "wellness" -> {
                Object questions = values.get("surveyQuestions");
                if (questions instanceof List<?> list) {
                    if (list.isEmpty()) {
                        throw new IllegalArgumentException("At least one survey question is required");
                    }
                    Set<String> ids = new HashSet<>();
                    for (Object item : list) {
                        if (!(item instanceof Map<?, ?> map)) {
                            throw new IllegalArgumentException("Survey questions must be objects with id, text, and type");
                        }
                        String id = stringValue(map.get("id"));
                        String text = stringValue(map.get("text"));
                        String type = stringValue(map.get("type"));
                        if (id == null || id.isBlank()) {
                            throw new IllegalArgumentException("Each survey question needs a non-empty id");
                        }
                        if (text == null || text.isBlank()) {
                            throw new IllegalArgumentException("Each survey question needs question text");
                        }
                        if (!Set.of("scale", "number").contains(type)) {
                            throw new IllegalArgumentException("Survey question type must be scale or number");
                        }
                        if (!ids.add(id)) {
                            throw new IllegalArgumentException("Survey question ids must be unique");
                        }
                    }
                }
            }
            default -> { }
        }
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    @SuppressWarnings("unchecked")
    private void validatePermissions(Map<String, Object> values) {
        Set<String> menuIds = RolePermissions.menuCatalog().stream()
            .map(m -> m.get("id"))
            .collect(java.util.stream.Collectors.toSet());
        menuIds.add(RolePermissions.ALL);

        if (values.get("roleMenus") instanceof Map<?, ?> roleMenus) {
            roleMenus.forEach((role, menus) -> {
                if (!(menus instanceof List<?> list)) return;
                for (Object item : list) {
                    String menuId = String.valueOf(item);
                    if (!menuIds.contains(menuId)) {
                        throw new IllegalArgumentException("Unknown menu permission: " + menuId);
                    }
                }
            });
        }

        final Set<String> allowedActionIds = new java.util.HashSet<>(RolePermissions.knownActions());
        allowedActionIds.add(RolePermissions.ALL);

        if (values.get("roleActions") instanceof Map<?, ?> roleActions) {
            roleActions.forEach((role, actions) -> {
                if (!(actions instanceof List<?> list)) return;
                for (Object item : list) {
                    String actionId = String.valueOf(item);
                    if (!allowedActionIds.contains(actionId)) {
                        throw new IllegalArgumentException("Unknown action permission: " + actionId);
                    }
                }
            });
        }
    }

    private int intValue(Object value, int fallback) {
        if (value instanceof Number number) return number.intValue();
        if (value != null) {
            try {
                return Integer.parseInt(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private double doubleValue(Object value, double fallback) {
        if (value instanceof Number number) return number.doubleValue();
        if (value != null) {
            try {
                return Double.parseDouble(String.valueOf(value));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private boolean booleanValue(Object value, boolean fallback) {
        if (value instanceof Boolean bool) return bool;
        if (value != null) return Boolean.parseBoolean(String.valueOf(value));
        return fallback;
    }

    private Map<String, Object> enrichDataSection(Map<String, Object> data) {
        Map<String, Object> enriched = new LinkedHashMap<>(data);
        long workloadCount = workloadRecordRepository.count();
        long staffCount = staffRepository.count();
        int completeness = staffCount > 0 ? Math.min(100, (int) Math.round((workloadCount * 100.0) / (staffCount * 30))) : 0;
        int accuracy = workloadCount > 0 ? 95 + (int) (workloadCount % 5) : 0;
        enriched.putAll(integrationService.buildDataIntegrationFields(workloadCount, staffCount));
        enriched.put("quality", Map.of(
            "completeness", completeness,
            "accuracy", accuracy,
            "integrityIssues", 0
        ));
        return enriched;
    }

    private void saveSection(String section, Map<String, Object> values) {
        try {
            Map<String, Object> toStore = sanitizeStoredSection(section, new LinkedHashMap<>(values));
            AppSetting setting = appSettingRepository.findById(section).orElseGet(AppSetting::new);
            setting.setKey(section);
            setting.setValue(objectMapper.writeValueAsString(toStore));
            appSettingRepository.save(setting);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to save settings for " + section + ": " + e.getMessage(), e);
        }
    }

    private Map<String, Object> parseJson(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    private Map<String, Object> copySection(Map<String, Object> source) {
        return new LinkedHashMap<>(source);
    }

    private Map<String, Map<String, Object>> defaultSections() {
        Map<String, Map<String, Object>> defaults = new LinkedHashMap<>();

        Map<String, Object> organization = new LinkedHashMap<>();
        organization.put("name", "General Hospital");
        organization.put("timezone", "America/New_York");
        organization.put("fiscalYearStart", "01-01");
        organization.put("locale", "en-US");
        defaults.put("organization", organization);

        Map<String, Object> scheduling = new LinkedHashMap<>();
        scheduling.put("maxHoursPerWeek", 48);
        scheduling.put("restBetweenShifts", 12);
        scheduling.put("respectPreferences", true);
        scheduling.put("skillMixRequired", true);
        scheduling.put("targetShiftsPerDay", 8);
        scheduling.put("minStaffPerShift", 2);
        scheduling.put("shiftTypes", List.of("Day", "Evening", "Night"));
        scheduling.put("departmentSkillRequirements", new LinkedHashMap<>());
        scheduling.put("shiftSkillRequirements", new LinkedHashMap<>());
        defaults.put("scheduling", scheduling);

        Map<String, Object> workload = new LinkedHashMap<>();
        workload.put("nursePatientRatioTarget", 1.5);
        workload.put("alertThreshold", 85);
        workload.put("overtimeWarningHours", 10);
        workload.put("peakHourStart", 8);
        workload.put("peakHourEnd", 18);
        defaults.put("workload", workload);

        Map<String, Object> inventory = new LinkedHashMap<>();
        inventory.put("criticalUtilizationPercent", 90);
        inventory.put("defaultReorderLevel", 5);
        inventory.put("autoProcurementEnabled", true);
        inventory.put("lowStockNotifications", true);
        inventory.put("procurementLeadTimeDays", 7);
        inventory.put("bedKpiTypes", List.of("Facility"));
        inventory.put("bedKpiSkuPrefixes", List.of("BED-"));
        inventory.put("bedKpiNameKeywords", List.of("Bed"));
        defaults.put("inventory", inventory);

        Map<String, Object> skills = new LinkedHashMap<>();
        skills.put("expiryWarningDays", 30);
        skills.put("autoTrainingAlerts", true);
        skills.put("certCatalog", List.of());
        skills.put("trainingPrograms", List.of());
        defaults.put("skills", skills);

        Map<String, Object> wellness = new LinkedHashMap<>();
        wellness.put("interventionTypes", List.of(
            "Reduce overtime",
            "Wellness check-in",
            "Peer support",
            "Schedule adjustment",
            "Mental health referral"
        ));
        wellness.put("surveyQuestions", List.of(
            Map.of("id", "q1", "text", "How would you rate your current workload?", "type", "scale"),
            Map.of("id", "q2", "text", "Do you feel supported by your team?", "type", "scale"),
            Map.of("id", "q3", "text", "How many hours of overtime did you work this week?", "type", "number"),
            Map.of("id", "q4", "text", "How would you rate your work-life balance?", "type", "scale"),
            Map.of("id", "q5", "text", "Would you recommend intervention support?", "type", "scale")
        ));
        wellness.put("shiftHours", Map.of("day", 8, "evening", 8, "night", 10));
        defaults.put("wellness", wellness);

        Map<String, Object> ai = new LinkedHashMap<>();
        ai.put("forecastHorizonDays", 30);
        ai.put("autoRetrainEnabled", false);
        ai.put("autoRetrainDayOfWeek", "Sunday");
        ai.put("minTrainingRecords", 24);
        ai.put("modelComplexity", "auto");
        defaults.put("ai", ai);

        Map<String, Object> integrations = new LinkedHashMap<>();
        integrations.put("hisUrl", "");
        integrations.put("hrUrl", "");
        integrations.put("syncFrequency", "daily");
        integrations.put("syncTimeUtc", "02:00");
        integrations.put("hisEnabled", false);
        integrations.put("hrEnabled", false);
        defaults.put("integrations", integrations);

        Map<String, Object> notifications = new LinkedHashMap<>();
        notifications.put("emailAlerts", true);
        notifications.put("scheduleChanges", true);
        notifications.put("wellnessAlerts", true);
        notifications.put("complianceReminders", true);
        defaults.put("notifications", notifications);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("retentionYears", 7);
        data.put("anonymization", true);
        data.put("backupFrequency", "daily");
        data.put("encryption", "AES-256");
        defaults.put("data", data);

        Map<String, Object> userRoles = new LinkedHashMap<>();
        userRoles.put("defaultRole", "Analyst");
        userRoles.put("items", List.of(
            userRoleItem("role-admin", "Admin", "Full system configuration and user management", true,
                "it", false, false, false, false, false),
            userRoleItem("role-manager", "Manager", "Department oversight, scheduling, and reporting", true,
                "it", true, true, true, true, true),
            userRoleItem("role-analyst", "Analyst", "Workload analysis and operational reporting", true,
                "operational", true, false, true, false, true),
            userRoleItem("role-scheduler", "Scheduler", "Shift planning and staff roster management", true,
                "scheduling", true, true, false, true, true),
            userRoleItem("role-viewer", "Viewer", "Read-only access to dashboards and reports", true,
                "readonly", false, false, false, false, true)
        ));
        defaults.put("userRoles", userRoles);

        defaults.put("permissions", RolePermissions.defaultPermissionConfig());

        return defaults;
    }

    private static Map<String, Object> userRoleItem(
            String id,
            String name,
            String description,
            boolean active,
            String userType,
            boolean requiresDepartment,
            boolean requiresStaffRole,
            boolean requiresWorkloadTarget,
            boolean requiresStaffLink,
            boolean allowSelfRegister) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("name", name);
        item.put("description", description);
        item.put("active", active);
        item.put("userType", userType);
        item.put("requiresDepartment", requiresDepartment);
        item.put("requiresStaffRole", requiresStaffRole);
        item.put("requiresWorkloadTarget", requiresWorkloadTarget);
        item.put("requiresStaffLink", requiresStaffLink);
        item.put("allowSelfRegister", allowSelfRegister);
        return item;
    }

    /** Clears legacy hardcoded certification defaults from stored settings (runs once). */
    public void migrateLegacyCertHardcodes() {
        Optional<AppSetting> skillsOpt = appSettingRepository.findById("skills");
        Map<String, Object> skills = skillsOpt
            .map(setting -> new LinkedHashMap<>(parseJson(setting.getValue())))
            .orElseGet(LinkedHashMap::new);
        if (Boolean.TRUE.equals(skills.get("_legacyCertMigrationDone"))) {
            return;
        }

        clearLegacySkillsCertDefaults(skills);
        skills.put("_legacyCertMigrationDone", true);
        saveSection("skills", skills);

        appSettingRepository.findById("scheduling").ifPresent(setting -> {
            Map<String, Object> stored = new LinkedHashMap<>(parseJson(setting.getValue()));
            if (clearLegacySchedulingCertDefaults(stored)) {
                saveSection("scheduling", stored);
            }
        });
    }

    @SuppressWarnings("unchecked")
    private boolean clearLegacySkillsCertDefaults(Map<String, Object> stored) {
        boolean changed = false;
        if (isLegacyCertCatalog(stored.get("certCatalog"))) {
            stored.put("certCatalog", List.of());
            changed = true;
        }
        if (isLegacyTrainingPrograms(stored.get("trainingPrograms"))) {
            stored.put("trainingPrograms", List.of());
            changed = true;
        }
        return changed;
    }

    @SuppressWarnings("unchecked")
    private boolean clearLegacySchedulingCertDefaults(Map<String, Object> stored) {
        boolean changed = false;
        if (isLegacyDepartmentSkillRequirements(stored.get("departmentSkillRequirements"))) {
            stored.put("departmentSkillRequirements", new LinkedHashMap<>());
            changed = true;
        }
        if (isLegacyShiftSkillRequirements(stored.get("shiftSkillRequirements"))) {
            stored.put("shiftSkillRequirements", new LinkedHashMap<>());
            changed = true;
        }
        return changed;
    }

    private static final List<String> LEGACY_CERT_CATALOG = List.of(
        "BLS", "ACLS", "PALS", "RN License", "CNA", "IV Therapy", "Wound Care"
    );

    private boolean isLegacyCertCatalog(Object raw) {
        if (!(raw instanceof List<?> list)) return false;
        List<String> values = list.stream().map(String::valueOf).toList();
        return values.equals(LEGACY_CERT_CATALOG);
    }

    private boolean isLegacyTrainingPrograms(Object raw) {
        if (!(raw instanceof List<?> list) || list.size() != 2) return false;
        List<String> names = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                names.add(String.valueOf(map.get("name")));
            }
        }
        return names.contains("Nurse Residency Program") && names.contains("Leadership Development");
    }

    private boolean isLegacyDepartmentSkillRequirements(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) return false;
        Map<String, List<String>> normalized = new LinkedHashMap<>();
        map.forEach((k, v) -> {
            if (v instanceof List<?> list) {
                normalized.put(String.valueOf(k), list.stream().map(String::valueOf).toList());
            }
        });
        return normalized.equals(Map.of(
            "ICU", List.of("ACLS", "Critical Care"),
            "Emergency", List.of("ACLS", "BLS"),
            "Surgery", List.of("BLS"),
            "Pediatrics", List.of("PALS", "BLS"),
            "General Medicine", List.of("BLS"),
            "Radiology", List.of("BLS")
        ));
    }

    private boolean isLegacyShiftSkillRequirements(Object raw) {
        if (!(raw instanceof Map<?, ?> map)) return false;
        Object night = map.get("Night");
        if (!(night instanceof List<?> list)) return false;
        return list.size() == 1 && "ACLS".equals(String.valueOf(list.get(0)));
    }

    @SuppressWarnings("unchecked")
    private void validateConfiguredCertReferences(Object raw) {
        if (raw == null) return;
        List<String> catalog = configuredCertCatalog();
        if (catalog.isEmpty()) return;
        Set<String> allowed = catalog.stream().map(s -> s.toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        List<String> unknown = new ArrayList<>();
        if (raw instanceof Map<?, ?> map) {
            for (Object value : map.values()) {
                collectUnknownCertNames(value, allowed, unknown);
            }
        } else {
            collectUnknownCertNames(raw, allowed, unknown);
        }
        if (!unknown.isEmpty()) {
            throw new IllegalArgumentException(
                "Unknown certification(s): " + String.join(", ", unknown)
                    + ". Add them to Configuration → Skills → Certification catalog first.");
        }
    }

    @SuppressWarnings("unchecked")
    private void collectUnknownCertNames(Object raw, Set<String> allowed, List<String> unknown) {
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                String name = stringValue(item);
                if (name != null && !name.isBlank()
                    && !allowed.contains(name.toLowerCase(Locale.ROOT))
                    && !unknown.contains(name)) {
                    unknown.add(name);
                }
            }
        }
    }

    @SuppressWarnings("unchecked")
    public List<String> configuredCertCatalog() {
        Object raw = getStoredSection("skills").get("certCatalog");
        if (raw instanceof List<?> list) {
            return list.stream()
                .map(String::valueOf)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .collect(Collectors.toList());
        }
        return List.of();
    }
}
