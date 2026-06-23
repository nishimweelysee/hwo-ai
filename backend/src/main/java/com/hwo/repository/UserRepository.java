package com.hwo.repository;

import com.hwo.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, String> {

    Optional<User> findByEmail(String email);

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByStaffId(String staffId);

    List<User> findByStaffIdIsNotNull();

    long countByStaffIdIsNotNull();

    @Query("SELECT COUNT(u) FROM User u WHERE u.active IS NULL OR u.active = TRUE")
    long countActiveUsers();

    @Query("SELECT COUNT(u) FROM User u WHERE u.active = FALSE")
    long countInactiveUsers();

    @Query("SELECT u.role, COUNT(u) FROM User u GROUP BY u.role")
    List<Object[]> countGroupedByRole();

    @Query("""
        SELECT u FROM User u
        LEFT JOIN UserProfile p ON p.userId = u.id
        WHERE (:search IS NULL OR :search = '' OR
               LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(u.role, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(u.organization, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(p.department, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', :search, '%')))
          AND (:status IS NULL OR :status = '' OR :status = 'all' OR
               (:status = 'active' AND (u.active IS NULL OR u.active = TRUE)) OR
               (:status = 'inactive' AND u.active = FALSE))
        ORDER BY LOWER(u.name) ASC
        """)
    Page<User> searchUsers(@Param("search") String search,
                         @Param("status") String status,
                         Pageable pageable);

    @Query("""
        SELECT u FROM User u
        LEFT JOIN UserProfile p ON p.userId = u.id
        WHERE u.role IN :roles
          AND (:search IS NULL OR :search = '' OR
               LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(u.role, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(u.organization, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(p.department, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
               LOWER(COALESCE(p.phone, '')) LIKE LOWER(CONCAT('%', :search, '%')))
          AND (:status IS NULL OR :status = '' OR :status = 'all' OR
               (:status = 'active' AND (u.active IS NULL OR u.active = TRUE)) OR
               (:status = 'inactive' AND u.active = FALSE))
        ORDER BY LOWER(u.name) ASC
        """)
    Page<User> searchUsersByRoles(@Param("search") String search,
                                  @Param("status") String status,
                                  @Param("roles") List<String> roles,
                                  Pageable pageable);
}
