package com.hwo.repository;

import com.hwo.entity.Staff;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface StaffRepository extends JpaRepository<Staff, String> {

    List<Staff> findByDepartmentId(String departmentId);

    long countByDepartmentId(String departmentId);

    long countByRole(String role);

    @Query("SELECT s.departmentId, COUNT(s) FROM Staff s WHERE s.departmentId IS NOT NULL GROUP BY s.departmentId")
    List<Object[]> countStaffGroupedByDepartment();

    @Query("""
        SELECT s FROM Staff s
        WHERE (:departmentId IS NULL OR s.departmentId = :departmentId)
          AND (
            :search IS NULL OR :search = '' OR
            LOWER(s.name) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(COALESCE(s.email, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(COALESCE(s.role, '')) LIKE LOWER(CONCAT('%', :search, '%'))
          )
        ORDER BY s.name ASC
        """)
    List<Staff> searchOptions(@Param("departmentId") String departmentId,
                              @Param("search") String search,
                              Pageable pageable);

    @Query("""
        SELECT s FROM Staff s
        WHERE (:departmentId IS NULL OR s.departmentId = :departmentId)
          AND (
            :search IS NULL OR :search = '' OR
            LOWER(s.name) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(COALESCE(s.email, '')) LIKE LOWER(CONCAT('%', :search, '%')) OR
            LOWER(COALESCE(s.role, '')) LIKE LOWER(CONCAT('%', :search, '%'))
          )
        """)
    Page<Staff> searchOptionsPage(@Param("departmentId") String departmentId,
                                  @Param("search") String search,
                                  Pageable pageable);

    java.util.Optional<Staff> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    @org.springframework.data.jpa.repository.Query("SELECT lower(s.email) FROM Staff s WHERE s.email IS NOT NULL AND s.email <> ''")
    java.util.List<String> findAllEmailsLowerCase();
}
