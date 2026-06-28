package com.hwo.service;

import com.hwo.entity.WorkloadRecord;
import com.hwo.repository.WorkloadRecordRepository;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Short-lived in-memory cache for workload rows so chart/summary/anomaly endpoints
 * do not each reload the full table on every request.
 */
@Service
public class WorkloadQueryService {

    private static final long CACHE_TTL_MS = 30_000L;

    private final WorkloadRecordRepository workloadRecordRepository;

    private volatile List<WorkloadRecord> orderedCache;
    private volatile List<WorkloadRecord> withDepartmentCache;
    private volatile long cacheExpiryMs;

    public WorkloadQueryService(WorkloadRecordRepository workloadRecordRepository) {
        this.workloadRecordRepository = workloadRecordRepository;
    }

    public List<WorkloadRecord> findAllOrdered() {
        long now = System.currentTimeMillis();
        List<WorkloadRecord> cached = orderedCache;
        if (cached != null && now < cacheExpiryMs) {
            return cached;
        }
        synchronized (this) {
            if (orderedCache != null && now < cacheExpiryMs) {
                return orderedCache;
            }
            orderedCache = workloadRecordRepository.findAllByOrderByDateAsc();
            withDepartmentCache = null;
            cacheExpiryMs = now + CACHE_TTL_MS;
            return orderedCache;
        }
    }

    public List<WorkloadRecord> findAllWithDepartment() {
        long now = System.currentTimeMillis();
        List<WorkloadRecord> cached = withDepartmentCache;
        if (cached != null && now < cacheExpiryMs) {
            return cached;
        }
        synchronized (this) {
            if (withDepartmentCache != null && now < cacheExpiryMs) {
                return withDepartmentCache;
            }
            withDepartmentCache = workloadRecordRepository.findAllWithDepartment();
            orderedCache = null;
            cacheExpiryMs = now + CACHE_TTL_MS;
            return withDepartmentCache;
        }
    }

    public void invalidate() {
        synchronized (this) {
            orderedCache = null;
            withDepartmentCache = null;
            cacheExpiryMs = 0;
        }
    }
}
