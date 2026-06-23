package com.hwo.service;

import com.hwo.domain.RolePermissions;
import com.hwo.entity.User;
import com.hwo.repository.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class CurrentUserService {

    private final UserRepository userRepository;
    private final PermissionService permissionService;
    private final SchedulingService schedulingService;

    public CurrentUserService(UserRepository userRepository,
                              PermissionService permissionService,
                              SchedulingService schedulingService) {
        this.userRepository = userRepository;
        this.permissionService = permissionService;
        this.schedulingService = schedulingService;
    }

    public Optional<String> currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return Optional.empty();
        return Optional.of(auth.getPrincipal().toString());
    }

    public Optional<User> currentUser() {
        return currentUserId().flatMap(userRepository::findById);
    }

    public Optional<User> currentAdmin() {
        return currentUser()
            .filter(User::isActive)
            .filter(u -> permissionService.hasAction(u, RolePermissions.ACTION_USERS_MANAGE)
                || permissionService.hasAction(u, RolePermissions.ALL));
    }

    public boolean hasAction(String action) {
        return currentUser().map(u -> permissionService.hasAction(u, action)).orElse(false);
    }

    public boolean canManageSettings() {
        return hasAction(RolePermissions.ACTION_SETTINGS_MANAGE) || hasAction(RolePermissions.ALL);
    }

    public boolean canManageUsers() {
        return hasAction(RolePermissions.ACTION_USERS_MANAGE) || hasAction(RolePermissions.ALL);
    }

    public boolean canManageData() {
        return hasAction(RolePermissions.ACTION_DATA_MANAGE) || canManageSettings();
    }

    public boolean canExportAudit() {
        return hasAction(RolePermissions.ACTION_AUDIT_EXPORT) || canManageSettings();
    }

    public boolean canAccessMenu(String menuId) {
        return currentUser().map(u -> permissionService.hasMenu(u, menuId)).orElse(false);
    }

    /** Mobile staff: request swap on a shift assigned to the signed-in user's staff profile. */
    public boolean canRequestSwapOnOwnShift(String scheduleId) {
        Optional<User> user = currentUser().filter(User::isActive);
        if (user.isEmpty()) return false;
        String staffId = user.get().getStaffId();
        return schedulingService.isScheduleOwnedByStaff(scheduleId, staffId);
    }
}
