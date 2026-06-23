package com.hwo.service;

import com.hwo.entity.Department;
import com.hwo.entity.Staff;
import com.hwo.entity.User;
import com.hwo.entity.UserProfile;
import com.hwo.repository.DepartmentRepository;
import com.hwo.repository.StaffRepository;
import com.hwo.repository.UserProfileRepository;
import com.hwo.repository.UserRepository;
import com.hwo.util.MapValueUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static com.hwo.util.MapValueUtils.booleanValue;
import static com.hwo.util.MapValueUtils.integerValue;
import static com.hwo.util.MapValueUtils.stringValue;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final UserProfileRepository userProfileRepository;
    private final DepartmentRepository departmentRepository;
    private final StaffRepository staffRepository;
    private final StaffRoleService staffRoleService;
    private final SettingsService settingsService;
    private final PermissionService permissionService;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository,
                       UserProfileRepository userProfileRepository,
                       DepartmentRepository departmentRepository,
                       StaffRepository staffRepository,
                       StaffRoleService staffRoleService,
                       SettingsService settingsService,
                       PermissionService permissionService,
                       PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.userProfileRepository = userProfileRepository;
        this.departmentRepository = departmentRepository;
        this.staffRepository = staffRepository;
        this.staffRoleService = staffRoleService;
        this.settingsService = settingsService;
        this.permissionService = permissionService;
        this.passwordEncoder = passwordEncoder;
    }

    public Map<String, Object> getManagementMeta() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("organization", settingsService.getOrganizationName());
        body.put("userRoles", settingsService.getSection("userRoles"));
        body.put("userTypes", settingsService.getUserTypeMeta());
        return body;
    }

    /** Meta + aggregate summary only (no full user list). */
    public Map<String, Object> getOverview() {
        Map<String, Object> overview = new LinkedHashMap<>(getManagementMeta());
        overview.put("summary", buildSummary());
        return overview;
    }

    /** Server-side paginated user list for the management table. */
    public Map<String, Object> listUsersPage(int page, int size, String search, String userType, String status) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        String trimmedSearch = search != null ? search.trim() : "";
        String normalizedStatus = normalizeStatusFilter(status);
        PageRequest pageable = PageRequest.of(safePage - 1, safeSize);

        Page<User> resultPage = queryUsers(trimmedSearch, userType, normalizedStatus, pageable);
        List<Map<String, Object>> items = toUserDtos(resultPage.getContent());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("page", safePage);
        body.put("pageSize", safeSize);
        body.put("totalItems", resultPage.getTotalElements());
        body.put("totalPages", Math.max(1, resultPage.getTotalPages()));
        return body;
    }

    public List<Map<String, Object>> listUsers() {
        Map<String, Object> page = listUsersPage(1, 100, null, null, "all");
        Object items = page.get("items");
        if (items instanceof List<?> list) {
            return list.stream().filter(Map.class::isInstance).map(m -> (Map<String, Object>) m).toList();
        }
        return List.of();
    }

    public Map<String, Object> getUser(String id) {
        User user = requireUser(id);
        UserProfile profile = userProfileRepository.findByUserId(id).orElse(null);
        Staff staff = user.getStaffId() != null
            ? staffRepository.findById(user.getStaffId()).orElse(null)
            : null;
        return toUserDto(user, profile, staff);
    }

    public Map<String, Object> toSessionMap(User user) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", user.getId() != null ? user.getId() : "");
        map.put("email", user.getEmail() != null ? user.getEmail() : "");
        map.put("name", user.getName() != null ? user.getName() : "");
        map.put("role", user.getRole() != null ? user.getRole() : "");
        map.put("organization", user.getOrganization() != null ? user.getOrganization() : "");
        map.put("staffId", user.getStaffId() != null ? user.getStaffId() : "");
        map.putAll(permissionService.forUser(user));
        return map;
    }

    @Transactional
    public User createUserEntity(Map<String, Object> body, boolean adminCreated) {
        String email = stringValue(body.get("email"));
        String password = stringValue(body.get("password"));
        String name = stringValue(body.get("name"));
        if (email == null || email.isBlank()) throw new IllegalArgumentException("Email is required");
        if (password == null || password.isBlank()) throw new IllegalArgumentException("Password is required");
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Name is required");
        if (userRepository.findByEmailIgnoreCase(email).isPresent()) {
            throw new IllegalArgumentException("Email already registered");
        }

        User user = new User();
        user.setId(UUID.randomUUID().toString());
        user.setEmail(email.toLowerCase());
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setRole(resolveRole(stringValue(body.get("role")), adminCreated));
        user.setOrganization(resolveOrganization(body));
        user.setActive(booleanValue(body.get("active"), true));
        validateRoleProfile(user.getRole(), body, null);
        user = userRepository.save(user);

        UserProfile profile = upsertProfile(user.getId(), body, null);
        syncStaffLink(user, profile);
        return userRepository.save(user);
    }

    @Transactional
    public Map<String, Object> createUser(Map<String, Object> body, boolean adminCreated) {
        return toUserDto(createUserEntity(body, adminCreated));
    }

    @Transactional
    public Map<String, Object> updateUser(String id, Map<String, Object> body, String actorUserId) {
        User user = requireUser(id);
        UserProfile existingProfile = userProfileRepository.findByUserId(id).orElse(null);

        if (body.get("email") != null) {
            String email = stringValue(body.get("email"));
            if (email == null || email.isBlank()) throw new IllegalArgumentException("Email cannot be empty");
            userRepository.findByEmailIgnoreCase(email).ifPresent(other -> {
                if (!other.getId().equals(id)) throw new IllegalArgumentException("Email already in use");
            });
            user.setEmail(email.toLowerCase());
        }
        if (body.get("name") != null) user.setName(stringValue(body.get("name")));
        if (body.get("role") != null) user.setRole(resolveRole(stringValue(body.get("role")), true));
        if (body.get("organization") != null) user.setOrganization(stringValue(body.get("organization")));
        if (body.get("active") != null) {
            boolean active = booleanValue(body.get("active"), true);
            if (!active && id.equals(actorUserId)) {
                throw new IllegalArgumentException("You cannot deactivate your own account");
            }
            user.setActive(active);
        }
        if (body.get("password") != null) {
            String password = stringValue(body.get("password"));
            if (password != null && !password.isBlank()) {
                user.setPassword(passwordEncoder.encode(password));
            }
        }

        userRepository.save(user);
        UserProfile profile = upsertProfile(id, body, existingProfile);
        validateRoleProfile(user.getRole(), body, profile);
        syncStaffLink(user, profile);
        return toUserDto(userRepository.save(user));
    }

    @Transactional
    public void deactivateUser(String id, String actorUserId) {
        if (id.equals(actorUserId)) {
            throw new IllegalArgumentException("You cannot deactivate your own account");
        }
        User user = requireUser(id);
        user.setActive(false);
        userRepository.save(user);
    }

    public boolean isAdmin(User user) {
        return permissionService.hasAction(user, com.hwo.domain.RolePermissions.ALL)
            || permissionService.hasAction(user, com.hwo.domain.RolePermissions.ACTION_USERS_MANAGE);
    }

    public Map<String, Object> toUserDto(User user) {
        UserProfile profile = userProfileRepository.findByUserId(user.getId()).orElse(null);
        Staff staff = user.getStaffId() != null
            ? staffRepository.findById(user.getStaffId()).orElse(null)
            : null;
        return toUserDto(user, profile, staff);
    }

    private List<Map<String, Object>> toUserDtos(List<User> users) {
        if (users.isEmpty()) return List.of();

        List<String> userIds = users.stream().map(User::getId).toList();
        Set<String> staffIds = users.stream()
            .map(User::getStaffId)
            .filter(Objects::nonNull)
            .filter(id -> !id.isBlank())
            .collect(Collectors.toSet());

        Map<String, UserProfile> profilesByUserId = userProfileRepository.findByUserIdIn(userIds).stream()
            .collect(Collectors.toMap(UserProfile::getUserId, p -> p, (a, b) -> a));
        Map<String, Staff> staffById = staffIds.isEmpty()
            ? Map.of()
            : staffRepository.findAllById(staffIds).stream()
                .collect(Collectors.toMap(Staff::getId, s -> s, (a, b) -> a));

        return users.stream()
            .sorted((a, b) -> String.valueOf(a.getName()).compareToIgnoreCase(String.valueOf(b.getName())))
            .map(user -> toUserDto(
                user,
                profilesByUserId.get(user.getId()),
                user.getStaffId() != null ? staffById.get(user.getStaffId()) : null))
            .toList();
    }

    private Page<User> queryUsers(String search, String userType, String status, PageRequest pageable) {
        List<String> roles = roleNamesForUserType(userType);
        if (roles != null && roles.isEmpty()) {
            return Page.empty(pageable);
        }
        String querySearch = search.isBlank() ? null : search;
        if (roles == null) {
            return userRepository.searchUsers(querySearch, status, pageable);
        }
        return userRepository.searchUsersByRoles(querySearch, status, roles, pageable);
    }

    private String normalizeStatusFilter(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status)) {
            return "all";
        }
        if ("inactive".equalsIgnoreCase(status)) return "inactive";
        if ("active".equalsIgnoreCase(status)) return "active";
        return "all";
    }

    @SuppressWarnings("unchecked")
    private List<String> roleNamesForUserType(String userType) {
        if (userType == null || userType.isBlank() || "all".equalsIgnoreCase(userType)) {
            return null;
        }
        Set<String> matching = new java.util.LinkedHashSet<>();
        for (Object[] row : userRepository.countGroupedByRole()) {
            String role = row[0] != null ? String.valueOf(row[0]) : "";
            if (role.isBlank()) continue;
            if (userType.equals(settingsService.userTypeForRole(role))) {
                matching.add(role);
            }
        }
        for (Map<String, Object> meta : settingsService.getUserTypeMeta()) {
            if (!userType.equals(meta.get("id"))) continue;
            Object roles = meta.get("roles");
            if (roles instanceof List<?> list) {
                list.stream().map(String::valueOf).filter(r -> !r.isBlank()).forEach(matching::add);
            }
            break;
        }
        return new ArrayList<>(matching);
    }

    private Map<String, Object> buildSummary() {
        Map<String, Object> summary = new LinkedHashMap<>();
        long total = userRepository.count();
        long active = userRepository.countActiveUsers();
        summary.put("total", total);
        summary.put("active", active);
        summary.put("inactive", userRepository.countInactiveUsers());
        summary.put("linkedToScheduling", userRepository.countByStaffIdIsNotNull());

        Map<String, Long> byRole = new LinkedHashMap<>();
        for (Object[] row : userRepository.countGroupedByRole()) {
            String role = row[0] != null ? String.valueOf(row[0]) : "Unknown";
            long count = row[1] instanceof Number n ? n.longValue() : 0L;
            byRole.put(role, count);
        }
        summary.put("byRole", byRole);

        Map<String, Long> byUserType = new LinkedHashMap<>();
        for (Map.Entry<String, Long> entry : byRole.entrySet()) {
            String type = settingsService.userTypeForRole(entry.getKey());
            byUserType.merge(type, entry.getValue(), Long::sum);
        }
        summary.put("byUserType", byUserType);
        return summary;
    }

    public Map<String, Object> toUserDto(User user, UserProfile profile, Staff staff) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", user.getId());
        dto.put("email", user.getEmail());
        dto.put("name", user.getName());
        dto.put("role", user.getRole());
        dto.put("organization", user.getOrganization());
        dto.put("active", user.isActive());
        dto.put("staffId", user.getStaffId());
        dto.put("userType", settingsService.userTypeForRole(user.getRole()));

        if (profile != null) {
            dto.put("phone", profile.getPhone());
            dto.put("department", profile.getDepartment());
            dto.put("departmentId", profile.getDepartmentId());
            dto.put("staffRole", profile.getStaffRole());
            dto.put("targetWorkload", profile.getTargetWorkload());
        }

        if (staff != null) {
            dto.put("staffName", staff.getName());
            dto.put("linkedToScheduling", true);
            if (!dto.containsKey("staffRole") || dto.get("staffRole") == null) {
                dto.put("staffRole", staff.getRole());
            }
        } else {
            dto.put("linkedToScheduling", false);
        }

        return dto;
    }

    private User requireUser(String id) {
        return userRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("User not found"));
    }

    private UserProfile upsertProfile(String userId, Map<String, Object> body, UserProfile existing) {
        boolean hasProfileFields = body.containsKey("phone")
            || body.containsKey("departmentId")
            || body.containsKey("staffRole")
            || body.containsKey("targetWorkload")
            || body.containsKey("department");
        if (!hasProfileFields && existing == null) return null;

        UserProfile profile = existing != null ? existing : new UserProfile();
        if (existing == null) {
            profile.setId(UUID.randomUUID().toString());
            profile.setUserId(userId);
        }

        if (body.get("phone") != null) profile.setPhone(stringValue(body.get("phone")));
        if (body.get("staffRole") != null) profile.setStaffRole(stringValue(body.get("staffRole")));
        if (body.get("targetWorkload") != null) {
            profile.setTargetWorkload(integerValue(body.get("targetWorkload"), profile.getTargetWorkload()));
        }

        if (body.get("departmentId") != null) {
            String departmentId = stringValue(body.get("departmentId"));
            if (departmentId == null || departmentId.isBlank()) {
                profile.setDepartmentId(null);
                profile.setDepartment(null);
            } else {
                Department dept = departmentRepository.findById(departmentId)
                    .orElseThrow(() -> new IllegalArgumentException("Invalid department"));
                profile.setDepartmentId(dept.getId());
                profile.setDepartment(dept.getName());
            }
        } else if (body.get("department") != null) {
            profile.setDepartment(stringValue(body.get("department")));
        }

        profile.setUpdatedAt(LocalDateTime.now());
        return userProfileRepository.save(profile);
    }

    private void syncStaffLink(User user, UserProfile profile) {
        if (profile == null) return;
        boolean shouldLink = settingsService.roleRequiresStaffLink(user.getRole())
            || (profile.getStaffRole() != null && !profile.getStaffRole().isBlank());
        if (!shouldLink) return;
        if (profile.getDepartmentId() == null || profile.getDepartmentId().isBlank()) {
            if (settingsService.roleRequiresStaffLink(user.getRole())) {
                throw new IllegalArgumentException("Department is required for " + user.getRole() + " users (used in scheduling)");
            }
            return;
        }
        String staffRole = profile.getStaffRole();
        if (staffRole == null || staffRole.isBlank()) {
            staffRole = staffRoleService.defaultRoleName();
        }
        staffRoleService.requireValidRole(staffRole);
        String resolvedRole = staffRoleService.resolveRoleName(staffRole);

        Staff staff;
        if (user.getStaffId() != null && staffRepository.findById(user.getStaffId()).isPresent()) {
            staff = staffRepository.findById(user.getStaffId()).orElseThrow();
        } else {
            staff = staffRepository.findByEmailIgnoreCase(user.getEmail())
                .orElseGet(Staff::new);
            if (staff.getId() == null) staff.setId(UUID.randomUUID().toString());
            user.setStaffId(staff.getId());
        }
        staff.setName(user.getName());
        staff.setEmail(user.getEmail());
        staff.setRole(resolvedRole);
        staff.setDepartmentId(profile.getDepartmentId());
        staffRepository.save(staff);
    }

    private String resolveRole(String requested, boolean adminCreated) {
        String role = settingsService.resolveUserRole(requested, adminCreated);
        if (!adminCreated && !settingsService.isSelfRegisterAllowed(role)) {
            return settingsService.getDefaultUserRole();
        }
        return role;
    }

    private void validateRoleProfile(String role, Map<String, Object> body, UserProfile profile) {
        String departmentId = body.containsKey("departmentId")
            ? stringValue(body.get("departmentId"))
            : profile != null ? profile.getDepartmentId() : null;
        if (settingsService.roleRequiresDepartment(role)
            && (departmentId == null || departmentId.isBlank())) {
            throw new IllegalArgumentException(
                "Department is required for " + role + " users (used in scheduling & workload)");
        }
    }

    private String resolveOrganization(Map<String, Object> body) {
        String org = stringValue(body.get("organization"));
        return org != null && !org.isBlank() ? org : settingsService.getOrganizationName();
    }
}
