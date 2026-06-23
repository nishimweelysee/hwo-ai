package com.hwo.repository;

import com.hwo.entity.LeaveRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, String> {

    List<LeaveRequest> findAllByOrderByCreatedAtDesc();

    List<LeaveRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("SELECT l FROM LeaveRequest l WHERE l.status = 'approved' "
        + "AND l.startDate <= :dayEnd AND l.endDate >= :dayStart")
    List<LeaveRequest> findApprovedOverlapping(@Param("dayStart") LocalDateTime dayStart,
                                               @Param("dayEnd") LocalDateTime dayEnd);
}
