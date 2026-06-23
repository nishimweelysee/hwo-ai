package com.hwo.service;

import com.hwo.domain.RolePermissions;
import com.hwo.entity.*;
import com.hwo.repository.*;
import com.hwo.util.MapValueUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ResourceService {

    private static final Set<String> RESOURCE_TYPES = Set.of("Equipment", "Facility", "Supply");
    private static final Set<String> MAINTENANCE_STATUSES = Set.of("operational", "maintenance", "retired");
    private static final Set<String> ADJUSTMENT_TYPES = Set.of("receive", "issue", "return", "adjust");
    private static final Set<String> TRANSFER_STATUSES = Set.of("pending", "approved", "in_transit", "completed", "cancelled");
    private static final Set<String> PROCUREMENT_STATUSES = Set.of("pending", "approved", "ordered", "received", "rejected", "cancelled");
    private static final Set<String> PROCUREMENT_PRIORITIES = Set.of("low", "medium", "high", "urgent");

    private final ResourceRepository resourceRepository;
    private final ResourceTransferRepository transferRepository;
    private final ProcurementRequestRepository procurementRepository;
    private final ResourceStockMovementRepository movementRepository;
    private final DepartmentRepository departmentRepository;
    private final AuditLogRepository auditLogRepository;
    private final SettingsService settingsService;
    private final CurrentUserService currentUserService;
    private final ResourceAiService resourceAiService;

    public ResourceService(ResourceRepository resourceRepository,
                           ResourceTransferRepository transferRepository,
                           ProcurementRequestRepository procurementRepository,
                           ResourceStockMovementRepository movementRepository,
                           DepartmentRepository departmentRepository,
                           AuditLogRepository auditLogRepository,
                           SettingsService settingsService,
                           CurrentUserService currentUserService,
                           ResourceAiService resourceAiService) {
        this.resourceRepository = resourceRepository;
        this.transferRepository = transferRepository;
        this.procurementRepository = procurementRepository;
        this.movementRepository = movementRepository;
        this.departmentRepository = departmentRepository;
        this.auditLogRepository = auditLogRepository;
        this.settingsService = settingsService;
        this.currentUserService = currentUserService;
        this.resourceAiService = resourceAiService;
    }

    public Map<String, Object> getDashboard() {
        List<Resource> resources = resourceRepository.findAll();
        Map<String, String> deptNames = departmentNames();

        int totalBeds = resources.stream()
            .filter(this::isBedKpiResource)
            .mapToInt(Resource::getAvailable)
            .sum();
        int totalInUse = resources.stream()
            .filter(this::isBedKpiResource)
            .mapToInt(Resource::getInUse)
            .sum();
        int occupancyRate = totalBeds > 0 ? (int) Math.round((totalInUse * 100.0) / totalBeds) : 0;
        long shortageCount = resources.stream().filter(this::isCritical).count();
        int utilizationScore = resources.isEmpty() ? 0
            : (int) Math.round(resources.stream()
                .filter(r -> r.getAvailable() > 0)
                .mapToDouble(r -> (r.getInUse() * 100.0) / r.getAvailable())
                .average().orElse(0));

        List<Map<String, Object>> resourceList = resources.stream()
            .map(r -> toInventoryDto(r, deptNames))
            .collect(Collectors.toList());

        List<Map<String, Object>> transfers = transferRepository.findAllByOrderByCreatedAtDesc().stream()
            .map(t -> toTransferDto(t, deptNames, resourceName(t.getResourceId())))
            .collect(Collectors.toList());

        List<Map<String, Object>> procurement = resourceAiService.rankProcurement(
            procurementRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(p -> toProcurementDto(p, resourceName(p.getResourceId())))
                .collect(Collectors.toList())
        );

        List<Map<String, Object>> reorderAlerts = resources.stream()
            .filter(this::needsReorder)
            .map(r -> Map.<String, Object>of(
                "id", r.getId(),
                "name", r.getName(),
                "freeStock", freeStock(r),
                "reorderLevel", r.getReorderLevel(),
                "department", deptNames.getOrDefault(r.getDepartmentId(), "")
            ))
            .collect(Collectors.toList());

        long openProcurementCost = procurementRepository.findAllByOrderByCreatedAtDesc().stream()
            .filter(p -> !Set.of("received", "rejected", "cancelled").contains(p.getStatus()))
            .mapToLong(p -> (long) p.getQuantity() * p.getEstimatedUnitCost())
            .sum();
        long criticalCost = resources.stream()
            .filter(this::isCritical)
            .mapToLong(r -> {
                int unit = r.getUnitCost();
                int reorder = r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel();
                return unit > 0 ? (long) unit * reorder : 0L;
            })
            .sum();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("resources", resourceList);
        result.put("totalBeds", totalBeds);
        result.put("occupancyRate", occupancyRate);
        result.put("shortageCount", shortageCount);
        result.put("utilizationScore", utilizationScore);
        result.put("transfers", transfers);
        result.put("procurement", procurement);
        result.put("reorderAlerts", reorderAlerts);
        result.put("reorderSuggestions", getReorderSuggestions());
        result.put("aiHealth", resourceAiService.getAiHealth());
        result.put("aiPortfolio", resourceAiService.analyzePortfolio(resources));
        result.put("budgetImpact", Map.of(
            "estimatedCost", openProcurementCost > 0 ? openProcurementCost : criticalCost,
            "description", openProcurementCost > 0
                ? "Open procurement requests"
                : shortageCount + " critical resource(s) requiring replenishment"
        ));
        result.put("canManage", canManage());
        return result;
    }

    public Map<String, Object> getMeta() {
        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("types", RESOURCE_TYPES);
        meta.put("maintenanceStatuses", MAINTENANCE_STATUSES);
        meta.put("adjustmentTypes", ADJUSTMENT_TYPES);
        meta.put("transferStatuses", TRANSFER_STATUSES);
        meta.put("procurementStatuses", PROCUREMENT_STATUSES);
        meta.put("procurementPriorities", PROCUREMENT_PRIORITIES);
        meta.put("departments", departmentRepository.findAll().stream()
            .map(d -> Map.of("id", d.getId(), "name", d.getName()))
            .collect(Collectors.toList()));
        meta.put("inventorySettings", inventorySettingsMap());
        meta.put("canManage", canManage());
        return meta;
    }

    public List<Map<String, Object>> listInventory(String search, String type, String departmentId) {
        Map<String, String> deptNames = departmentNames();
        return resourceRepository.findAll().stream()
            .filter(r -> type == null || type.isBlank() || type.equals(r.getType()))
            .filter(r -> departmentId == null || departmentId.isBlank() || departmentId.equals(r.getDepartmentId()))
            .filter(r -> search == null || search.isBlank()
                || (r.getName() != null && r.getName().toLowerCase().contains(search.toLowerCase()))
                || (r.getSku() != null && r.getSku().toLowerCase().contains(search.toLowerCase())))
            .map(r -> toInventoryDto(r, deptNames))
            .collect(Collectors.toList());
    }

    public Map<String, Object> getInventoryItem(String id) {
        Resource resource = resourceRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
        Map<String, Object> dto = toInventoryDto(resource, departmentNames());
        dto.put("movements", listMovements(id));
        return dto;
    }

    public String exportInventoryCsv() {
        StringBuilder csv = new StringBuilder("name,type,department,available,inUse,freeStock,reorderLevel,unitCost,status,location,supplier,sku\n");
        Map<String, String> deptNames = departmentNames();
        for (Resource r : resourceRepository.findAll()) {
            Map<String, Object> dto = toInventoryDto(r, deptNames);
            csv.append(csvCell(r.getName())).append(",")
                .append(csvCell(r.getType())).append(",")
                .append(csvCell(String.valueOf(dto.get("department")))).append(",")
                .append(r.getAvailable()).append(",")
                .append(r.getInUse()).append(",")
                .append(dto.get("freeStock")).append(",")
                .append(r.getReorderLevel()).append(",")
                .append(r.getUnitCost()).append(",")
                .append(csvCell(String.valueOf(dto.get("status")))).append(",")
                .append(csvCell(r.getLocation())).append(",")
                .append(csvCell(r.getSupplier())).append(",")
                .append(csvCell(r.getSku())).append("\n");
        }
        return csv.toString();
    }

    public Map<String, Object> getAiHealth() {
        return resourceAiService.getAiHealth();
    }

    public Map<String, Object> getDemandForecast(String resourceId) {
        Resource resource = resourceRepository.findById(resourceId)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
        return resourceAiService.predictDemand(resource);
    }

    public List<Map<String, Object>> getReorderSuggestions() {
        if (!settingsService.getBoolean("inventory", "lowStockNotifications", true)) {
            return List.of();
        }
        List<Resource> resources = resourceRepository.findAll();
        Map<String, String> deptNames = departmentNames();
        List<Resource> candidates = resources.stream()
            .filter(r -> needsReorder(r) || isCritical(r))
            .collect(Collectors.toList());
        if (!candidates.isEmpty() && resourceAiService.isActive()) {
            List<Map<String, Object>> aiSuggestions = resourceAiService.optimizeReorders(candidates, deptNames);
            if (!aiSuggestions.isEmpty()) {
                return aiSuggestions;
            }
        }
        return buildReorderSuggestions(resources, deptNames);
    }

    @Transactional
    public List<Map<String, Object>> createProcurementFromSuggestions(List<String> resourceIds) {
        requireManageAccess();
        if (!settingsService.getBoolean("inventory", "autoProcurementEnabled", true)) {
            throw new IllegalStateException("Auto-procurement is disabled in settings");
        }
        List<Map<String, Object>> created = new ArrayList<>();
        List<Map<String, Object>> suggestions = getReorderSuggestions();
        for (Map<String, Object> suggestion : suggestions) {
            String resourceId = String.valueOf(suggestion.get("resourceId"));
            if (resourceIds != null && !resourceIds.isEmpty() && !resourceIds.contains(resourceId)) {
                continue;
            }
            boolean alreadyOpen = procurementRepository.findAllByOrderByCreatedAtDesc().stream()
                .anyMatch(p -> resourceId.equals(p.getResourceId())
                    && !Set.of("received", "rejected", "cancelled").contains(p.getStatus()));
            if (alreadyOpen) continue;

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("resourceId", resourceId);
            body.put("quantity", suggestion.get("suggestedQuantity"));
            body.put("estimatedUnitCost", suggestion.get("unitCost"));
            body.put("supplier", suggestion.get("supplier"));
            body.put("priority", suggestion.get("priority"));
            body.put("departmentId", suggestion.get("departmentId"));
            body.put("notes", Boolean.TRUE.equals(suggestion.get("aiPowered"))
                ? "Auto-generated from AI reorder suggestion"
                : "Auto-generated from reorder suggestion");
            created.add(createProcurement(body));
        }
        return created;
    }

    public List<Map<String, Object>> listMovements(String resourceId) {
        List<ResourceStockMovement> movements = resourceId != null && !resourceId.isBlank()
            ? movementRepository.findByResourceIdOrderByCreatedAtDesc(resourceId)
            : movementRepository.findAllByOrderByCreatedAtDesc();
        return movements.stream().map(this::toMovementDto).collect(Collectors.toList());
    }

    @Transactional
    public Map<String, Object> createResource(Map<String, Object> body) {
        requireManageAccess();
        String name = MapValueUtils.stringValue(body.get("name"));
        String type = MapValueUtils.stringValue(body.get("type"));
        String departmentId = MapValueUtils.stringValue(body.get("departmentId"));
        if (name == null || name.isBlank()) throw new IllegalArgumentException("Name is required");
        if (type == null || !RESOURCE_TYPES.contains(type)) throw new IllegalArgumentException("Valid type is required");
        if (departmentId == null || departmentRepository.findById(departmentId).isEmpty()) {
            throw new IllegalArgumentException("Valid department is required");
        }

        int available = Math.max(0, MapValueUtils.intValue(body.get("available"), 0));
        int inUse = Math.max(0, MapValueUtils.intValue(body.get("inUse"), 0));
        if (inUse > available) throw new IllegalArgumentException("In use cannot exceed available");

        Resource resource = new Resource();
        resource.setId(UUID.randomUUID().toString());
        resource.setName(name.trim());
        resource.setType(type);
        resource.setDepartmentId(departmentId);
        resource.setAvailable(available);
        resource.setInUse(inUse);
        applyOptionalFields(resource, body);
        resourceRepository.save(resource);
        logAudit("create", resource.getName(), "Created inventory item");
        return toInventoryDto(resource, departmentNames());
    }

    @Transactional
    public Map<String, Object> updateResource(String id, Map<String, Object> body) {
        requireManageAccess();
        Resource resource = resourceRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));

        String name = MapValueUtils.stringValue(body.get("name"));
        if (name != null && !name.isBlank()) resource.setName(name.trim());
        String type = MapValueUtils.stringValue(body.get("type"));
        if (type != null) {
            if (!RESOURCE_TYPES.contains(type)) throw new IllegalArgumentException("Invalid type");
            resource.setType(type);
        }
        String departmentId = MapValueUtils.stringValue(body.get("departmentId"));
        if (departmentId != null) {
            if (departmentRepository.findById(departmentId).isEmpty()) {
                throw new IllegalArgumentException("Invalid department");
            }
            resource.setDepartmentId(departmentId);
        }
        applyOptionalFields(resource, body);
        resourceRepository.save(resource);
        logAudit("update", resource.getName(), "Updated inventory metadata");
        return toInventoryDto(resource, departmentNames());
    }

    @Transactional
    public void deleteResource(String id) {
        requireManageAccess();
        Resource resource = resourceRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
        if (resource.getInUse() > 0) {
            throw new IllegalArgumentException("Cannot delete resource while items are in use");
        }
        resourceRepository.delete(resource);
        logAudit("delete", resource.getName(), "Deleted inventory item");
    }

    @Transactional
    public Map<String, Object> adjustStock(String id, Map<String, Object> body) {
        requireManageAccess();
        Resource resource = resourceRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
        String type = MapValueUtils.stringValue(body.get("type"));
        int quantity = MapValueUtils.intValue(body.get("quantity"), 0);
        String notes = MapValueUtils.stringValue(body.get("notes"));
        if (type == null || !ADJUSTMENT_TYPES.contains(type)) {
            throw new IllegalArgumentException("Valid adjustment type is required");
        }
        if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");

        int prevAvailable = resource.getAvailable();
        int prevInUse = resource.getInUse();

        switch (type) {
            case "receive" -> resource.setAvailable(prevAvailable + quantity);
            case "issue" -> {
                if (freeStock(resource) < quantity) {
                    throw new IllegalArgumentException("Insufficient free stock to issue");
                }
                resource.setInUse(prevInUse + quantity);
            }
            case "return" -> {
                if (prevInUse < quantity) throw new IllegalArgumentException("Cannot return more than in use");
                resource.setInUse(prevInUse - quantity);
            }
            case "adjust" -> {
                int next = prevAvailable + quantity;
                if (next < resource.getInUse()) {
                    throw new IllegalArgumentException("Available cannot fall below in-use count");
                }
                resource.setAvailable(next);
            }
            default -> throw new IllegalArgumentException("Unsupported adjustment type");
        }

        resourceRepository.save(resource);
        recordMovement(resource, type, quantity, prevAvailable, prevInUse, null, notes);
        logAudit("adjust", resource.getName(), type + " qty " + quantity);
        return toInventoryDto(resource, departmentNames());
    }

    @Transactional
    public Map<String, Object> createTransfer(Map<String, Object> body) {
        requireManageAccess();
        String resourceId = MapValueUtils.stringValue(body.get("resourceId"));
        String toDepartmentId = MapValueUtils.stringValue(body.get("toDepartmentId"));
        int quantity = MapValueUtils.intValue(body.get("quantity"), 0);
        String notes = MapValueUtils.stringValue(body.get("notes"));

        Resource resource = resourceRepository.findById(resourceId)
            .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
        if (toDepartmentId == null || departmentRepository.findById(toDepartmentId).isEmpty()) {
            throw new IllegalArgumentException("Valid destination department is required");
        }
        if (resource.getDepartmentId() != null && resource.getDepartmentId().equals(toDepartmentId)) {
            throw new IllegalArgumentException("Source and destination must differ");
        }
        if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");
        if (freeStock(resource) < quantity) {
            throw new IllegalArgumentException("Insufficient free stock for transfer");
        }

        ResourceTransfer transfer = new ResourceTransfer();
        transfer.setId(UUID.randomUUID().toString());
        transfer.setResourceId(resource.getId());
        transfer.setFromDepartmentId(resource.getDepartmentId());
        transfer.setToDepartmentId(toDepartmentId);
        transfer.setQuantity(quantity);
        transfer.setStatus("pending");
        transfer.setRequestedBy(currentUserService.currentUserId().orElse(null));
        transfer.setNotes(notes);
        transfer.setCreatedAt(LocalDateTime.now());
        transferRepository.save(transfer);
        logAudit("transfer_create", resource.getName(), "Transfer " + quantity + " units");
        return toTransferDto(transfer, departmentNames(), resource.getName());
    }

    @Transactional
    public Map<String, Object> updateTransfer(String id, Map<String, Object> body) {
        if (body.containsKey("status")) {
            return updateTransferStatus(id, body);
        }
        requireManageAccess();
        ResourceTransfer transfer = transferRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Transfer not found"));
        if (!"pending".equals(transfer.getStatus())) {
            throw new IllegalArgumentException("Only pending transfers can be edited");
        }
        if (body.containsKey("quantity")) {
            int quantity = MapValueUtils.intValue(body.get("quantity"), transfer.getQuantity());
            if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");
            Resource resource = resourceRepository.findById(transfer.getResourceId())
                .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
            if (freeStock(resource) < quantity) {
                throw new IllegalArgumentException("Insufficient free stock for transfer");
            }
            transfer.setQuantity(quantity);
        }
        String toDepartmentId = MapValueUtils.stringValue(body.get("toDepartmentId"));
        if (toDepartmentId != null) {
            if (departmentRepository.findById(toDepartmentId).isEmpty()) {
                throw new IllegalArgumentException("Invalid destination department");
            }
            transfer.setToDepartmentId(toDepartmentId);
        }
        String notes = MapValueUtils.stringValue(body.get("notes"));
        if (notes != null) transfer.setNotes(notes);
        transferRepository.save(transfer);
        return toTransferDto(transfer, departmentNames(), resourceName(transfer.getResourceId()));
    }

    @Transactional
    public void deleteTransfer(String id) {
        requireManageAccess();
        ResourceTransfer transfer = transferRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Transfer not found"));
        if (!Set.of("pending", "cancelled").contains(transfer.getStatus())) {
            throw new IllegalArgumentException("Only pending or cancelled transfers can be deleted");
        }
        transferRepository.delete(transfer);
        logAudit("transfer_delete", resourceName(transfer.getResourceId()), "Deleted transfer request");
    }

    @Transactional
    public Map<String, Object> updateProcurement(String id, Map<String, Object> body) {
        if (body.containsKey("status")) {
            return updateProcurementStatus(id, body);
        }
        requireManageAccess();
        ProcurementRequest request = procurementRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Procurement request not found"));
        if (!"pending".equals(request.getStatus())) {
            throw new IllegalArgumentException("Only pending procurement requests can be edited");
        }
        if (body.containsKey("quantity")) {
            int quantity = MapValueUtils.intValue(body.get("quantity"), request.getQuantity());
            if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");
            request.setQuantity(quantity);
        }
        if (body.containsKey("estimatedUnitCost")) {
            request.setEstimatedUnitCost(Math.max(0, MapValueUtils.intValue(body.get("estimatedUnitCost"), 0)));
        }
        String supplier = MapValueUtils.stringValue(body.get("supplier"));
        if (supplier != null) request.setSupplier(supplier);
        String priority = MapValueUtils.stringValue(body.get("priority"));
        if (priority != null) {
            if (!PROCUREMENT_PRIORITIES.contains(priority)) throw new IllegalArgumentException("Invalid priority");
            request.setPriority(priority);
        }
        String notes = MapValueUtils.stringValue(body.get("notes"));
        if (notes != null) request.setNotes(notes);
        request.setUpdatedAt(LocalDateTime.now());
        procurementRepository.save(request);
        return toProcurementDto(request, resourceName(request.getResourceId()));
    }

    @Transactional
    public void deleteProcurement(String id) {
        requireManageAccess();
        ProcurementRequest request = procurementRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Procurement request not found"));
        if (!Set.of("pending", "cancelled", "rejected").contains(request.getStatus())) {
            throw new IllegalArgumentException("Only pending, cancelled, or rejected requests can be deleted");
        }
        procurementRepository.delete(request);
        logAudit("procurement_delete", request.getResourceName(), "Deleted procurement request");
    }

    @Transactional
    public Map<String, Object> updateTransferStatus(String id, Map<String, Object> body) {
        requireManageAccess();
        String status = MapValueUtils.stringValue(body.get("status"));
        if (status == null || !TRANSFER_STATUSES.contains(status)) {
            throw new IllegalArgumentException("Valid status is required");
        }

        ResourceTransfer transfer = transferRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Transfer not found"));
        String current = transfer.getStatus();
        if ("completed".equals(current) || "cancelled".equals(current)) {
            throw new IllegalArgumentException("Transfer is already closed");
        }

        validateTransferTransition(current, status);
        if ("completed".equals(status)) {
            completeTransfer(transfer);
            transfer.setCompletedAt(LocalDateTime.now());
        }
        transfer.setStatus(status);
        transferRepository.save(transfer);

        Resource resource = resourceRepository.findById(transfer.getResourceId()).orElse(null);
        String resourceName = resource != null ? resource.getName() : transfer.getResourceId();
        logAudit("transfer_" + status, resourceName, "Transfer " + transfer.getQuantity() + " units");
        return toTransferDto(transfer, departmentNames(), resourceName);
    }

    @Transactional
    public Map<String, Object> createProcurement(Map<String, Object> body) {
        requireManageAccess();
        String resourceId = MapValueUtils.stringValue(body.get("resourceId"));
        String resourceName = MapValueUtils.stringValue(body.get("resourceName"));
        int quantity = MapValueUtils.intValue(body.get("quantity"), 0);
        if (quantity <= 0) throw new IllegalArgumentException("Quantity must be positive");

        Resource linked = null;
        if (resourceId != null && !resourceId.isBlank()) {
            linked = resourceRepository.findById(resourceId)
                .orElseThrow(() -> new IllegalArgumentException("Resource not found"));
            if (resourceName == null || resourceName.isBlank()) resourceName = linked.getName();
        } else if (resourceName == null || resourceName.isBlank()) {
            throw new IllegalArgumentException("Resource name or linked resource is required");
        }

        String priority = MapValueUtils.stringValue(body.get("priority"));
        if (priority == null || !PROCUREMENT_PRIORITIES.contains(priority)) priority = "medium";

        String departmentId = MapValueUtils.stringValue(body.get("departmentId"));
        if ((departmentId == null || departmentId.isBlank()) && linked != null) {
            departmentId = linked.getDepartmentId();
        }
        if (departmentId == null || departmentId.isBlank()
            || departmentRepository.findById(departmentId).isEmpty()) {
            throw new IllegalArgumentException("Valid department is required for procurement");
        }

        ProcurementRequest request = new ProcurementRequest();
        request.setId(UUID.randomUUID().toString());
        request.setResourceId(resourceId);
        request.setResourceName(resourceName.trim());
        request.setDepartmentId(departmentId);
        request.setQuantity(quantity);
        request.setEstimatedUnitCost(Math.max(0, MapValueUtils.intValue(body.get("estimatedUnitCost"), 0)));
        request.setSupplier(MapValueUtils.stringValue(body.get("supplier")));
        request.setPriority(priority);
        request.setStatus("pending");
        request.setRequestedBy(currentUserService.currentUserId().orElse(null));
        request.setNotes(MapValueUtils.stringValue(body.get("notes")));
        request.setCreatedAt(LocalDateTime.now());
        request.setUpdatedAt(LocalDateTime.now());
        procurementRepository.save(request);
        logAudit("procurement_create", request.getResourceName(), "Qty " + quantity);
        return toProcurementDto(request, resourceName(request.getResourceId()));
    }

    @Transactional
    public Map<String, Object> updateProcurementStatus(String id, Map<String, Object> body) {
        requireManageAccess();
        String status = MapValueUtils.stringValue(body.get("status"));
        if (status == null || !PROCUREMENT_STATUSES.contains(status)) {
            throw new IllegalArgumentException("Valid status is required");
        }

        ProcurementRequest request = procurementRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Procurement request not found"));
        String current = request.getStatus();
        if (Set.of("received", "rejected", "cancelled").contains(current)) {
            throw new IllegalArgumentException("Procurement request is already closed");
        }

        validateProcurementTransition(current, status);
        if ("received".equals(status)) {
            receiveProcurement(request);
        }
        request.setStatus(status);
        request.setUpdatedAt(LocalDateTime.now());
        procurementRepository.save(request);
        logAudit("procurement_" + status, request.getResourceName(), "Qty " + request.getQuantity());
        return toProcurementDto(request, resourceName(request.getResourceId()));
    }

    private void completeTransfer(ResourceTransfer transfer) {
        Resource source = resourceRepository.findById(transfer.getResourceId())
            .orElseThrow(() -> new IllegalArgumentException("Source resource not found"));
        if (freeStock(source) < transfer.getQuantity()) {
            throw new IllegalArgumentException("Insufficient free stock to complete transfer");
        }

        int prevSourceAvailable = source.getAvailable();
        int prevSourceInUse = source.getInUse();
        source.setAvailable(prevSourceAvailable - transfer.getQuantity());
        resourceRepository.save(source);
        recordMovement(source, "transfer_out", transfer.getQuantity(),
            prevSourceAvailable, prevSourceInUse, transfer.getId(), "Transfer to department");

        Resource target = resourceRepository
            .findByDepartmentIdAndName(transfer.getToDepartmentId(), source.getName())
            .orElseGet(() -> {
                Resource created = new Resource();
                created.setId(UUID.randomUUID().toString());
                created.setName(source.getName());
                created.setType(source.getType());
                created.setDepartmentId(transfer.getToDepartmentId());
                created.setSku(source.getSku());
                created.setLocation(source.getLocation());
                created.setSupplier(source.getSupplier());
                created.setReorderLevel(source.getReorderLevel());
                created.setUnitCost(source.getUnitCost());
                created.setMaintenanceStatus(source.getMaintenanceStatus());
                created.setAvailable(0);
                created.setInUse(0);
                return created;
            });

        int prevTargetAvailable = target.getAvailable();
        int prevTargetInUse = target.getInUse();
        target.setAvailable(prevTargetAvailable + transfer.getQuantity());
        resourceRepository.save(target);
        recordMovement(target, "transfer_in", transfer.getQuantity(),
            prevTargetAvailable, prevTargetInUse, transfer.getId(), "Transfer from department");
    }

    private void receiveProcurement(ProcurementRequest request) {
        Resource resource;
        if (request.getResourceId() != null && !request.getResourceId().isBlank()) {
            resource = resourceRepository.findById(request.getResourceId())
                .orElseThrow(() -> new IllegalArgumentException("Linked resource not found"));
        } else {
            String deptId = request.getDepartmentId();
            if (deptId == null || deptId.isBlank()
                || departmentRepository.findById(deptId).isEmpty()) {
                throw new IllegalArgumentException("Department is required to receive procurement for new stock");
            }
            resource = resourceRepository.findByDepartmentIdAndName(deptId, request.getResourceName())
                .orElseGet(() -> {
                    Resource created = new Resource();
                    created.setId(UUID.randomUUID().toString());
                    created.setName(request.getResourceName());
                    created.setType("Supply");
                    created.setDepartmentId(deptId);
                    created.setSupplier(request.getSupplier());
                    created.setUnitCost(request.getEstimatedUnitCost());
                    created.setReorderLevel(defaultReorderLevel());
                    created.setMaintenanceStatus("operational");
                    created.setAvailable(0);
                    created.setInUse(0);
                    return created;
                });
            request.setResourceId(resource.getId());
        }

        int prevAvailable = resource.getAvailable();
        int prevInUse = resource.getInUse();
        resource.setAvailable(prevAvailable + request.getQuantity());
        if (request.getSupplier() != null && !request.getSupplier().isBlank()) {
            resource.setSupplier(request.getSupplier());
        }
        if (request.getEstimatedUnitCost() > 0) resource.setUnitCost(request.getEstimatedUnitCost());
        resourceRepository.save(resource);
        recordMovement(resource, "receive", request.getQuantity(),
            prevAvailable, prevInUse, request.getId(), "Procurement received");
    }

    private void applyOptionalFields(Resource resource, Map<String, Object> body) {
        String sku = MapValueUtils.stringValue(body.get("sku"));
        if (sku != null) resource.setSku(sku);
        String location = MapValueUtils.stringValue(body.get("location"));
        if (location != null) resource.setLocation(location);
        String supplier = MapValueUtils.stringValue(body.get("supplier"));
        if (supplier != null) resource.setSupplier(supplier);
        if (body.containsKey("reorderLevel")) {
            resource.setReorderLevel(Math.max(0, MapValueUtils.intValue(body.get("reorderLevel"), 0)));
        } else if (resource.getReorderLevel() <= 0) {
            resource.setReorderLevel(defaultReorderLevel());
        }
        if (body.containsKey("unitCost")) {
            resource.setUnitCost(Math.max(0, MapValueUtils.intValue(body.get("unitCost"), 0)));
        }
        String maintenanceStatus = MapValueUtils.stringValue(body.get("maintenanceStatus"));
        if (maintenanceStatus != null) {
            if (!MAINTENANCE_STATUSES.contains(maintenanceStatus)) {
                throw new IllegalArgumentException("Invalid maintenance status");
            }
            resource.setMaintenanceStatus(maintenanceStatus);
        } else if (resource.getMaintenanceStatus() == null) {
            resource.setMaintenanceStatus("operational");
        }
        String notes = MapValueUtils.stringValue(body.get("notes"));
        if (notes != null) resource.setNotes(notes);
    }

    private void validateTransferTransition(String current, String next) {
        boolean valid = switch (current) {
            case "pending" -> Set.of("approved", "cancelled").contains(next);
            case "approved" -> Set.of("in_transit", "cancelled").contains(next);
            case "in_transit" -> Set.of("completed", "cancelled").contains(next);
            default -> false;
        };
        if (!valid) throw new IllegalArgumentException("Invalid transfer status transition");
    }

    private void validateProcurementTransition(String current, String next) {
        boolean valid = switch (current) {
            case "pending" -> Set.of("approved", "rejected", "cancelled").contains(next);
            case "approved" -> Set.of("ordered", "cancelled").contains(next);
            case "ordered" -> Set.of("received", "cancelled").contains(next);
            default -> false;
        };
        if (!valid) throw new IllegalArgumentException("Invalid procurement status transition");
    }

    private void recordMovement(Resource resource, String type, int quantity,
                                int prevAvailable, int prevInUse, String referenceId, String notes) {
        ResourceStockMovement movement = new ResourceStockMovement();
        movement.setId(UUID.randomUUID().toString());
        movement.setResourceId(resource.getId());
        movement.setType(type);
        movement.setQuantity(quantity);
        movement.setPreviousAvailable(prevAvailable);
        movement.setNewAvailable(resource.getAvailable());
        movement.setPreviousInUse(prevInUse);
        movement.setNewInUse(resource.getInUse());
        movement.setReferenceId(referenceId);
        movement.setNotes(notes);
        movement.setPerformedBy(currentUserService.currentUserId().orElse(null));
        movement.setCreatedAt(LocalDateTime.now());
        movementRepository.save(movement);
    }

    private void logAudit(String action, String resourceName, String details) {
        AuditLog entry = new AuditLog();
        entry.setId(UUID.randomUUID().toString());
        entry.setUserId(currentUserService.currentUserId().orElse(null));
        entry.setAction(action);
        entry.setType("inventory");
        entry.setResource(resourceName);
        entry.setDetails(details);
        entry.setCreatedAt(LocalDateTime.now());
        auditLogRepository.save(entry);
    }

    private Map<String, Object> toInventoryDto(Resource r, Map<String, String> deptNames) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", r.getId());
        dto.put("name", r.getName());
        dto.put("type", r.getType());
        dto.put("available", r.getAvailable());
        dto.put("inUse", r.getInUse());
        dto.put("freeStock", freeStock(r));
        dto.put("departmentId", r.getDepartmentId());
        dto.put("department", r.getDepartmentId() != null ? deptNames.getOrDefault(r.getDepartmentId(), "") : "");
        dto.put("sku", r.getSku());
        dto.put("location", r.getLocation());
        dto.put("supplier", r.getSupplier());
        dto.put("reorderLevel", r.getReorderLevel());
        dto.put("unitCost", r.getUnitCost());
        dto.put("maintenanceStatus", r.getMaintenanceStatus() != null ? r.getMaintenanceStatus() : "operational");
        dto.put("notes", r.getNotes());
        dto.put("status", inventoryStatus(r));
        dto.put("needsReorder", needsReorder(r));
        return dto;
    }

    private Map<String, Object> toTransferDto(ResourceTransfer t, Map<String, String> deptNames, String resourceName) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", t.getId());
        dto.put("resourceId", t.getResourceId());
        dto.put("resource", resourceName);
        dto.put("fromDepartmentId", t.getFromDepartmentId());
        dto.put("fromDepartment", deptNames.getOrDefault(t.getFromDepartmentId(), ""));
        dto.put("toDepartmentId", t.getToDepartmentId());
        dto.put("toDepartment", deptNames.getOrDefault(t.getToDepartmentId(), ""));
        dto.put("quantity", t.getQuantity());
        dto.put("available", t.getQuantity());
        dto.put("status", t.getStatus());
        dto.put("notes", t.getNotes());
        dto.put("requestedBy", t.getRequestedBy());
        dto.put("createdAt", t.getCreatedAt());
        dto.put("completedAt", t.getCompletedAt());
        return dto;
    }

    private Map<String, Object> toProcurementDto(ProcurementRequest p, String linkedName) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", p.getId());
        dto.put("resourceId", p.getResourceId());
        dto.put("departmentId", p.getDepartmentId());
        dto.put("resource", p.getResourceName() != null ? p.getResourceName() : linkedName);
        dto.put("quantity", p.getQuantity());
        dto.put("estimatedUnitCost", p.getEstimatedUnitCost());
        dto.put("estimatedTotal", (long) p.getQuantity() * p.getEstimatedUnitCost());
        dto.put("supplier", p.getSupplier());
        dto.put("priority", p.getPriority());
        dto.put("status", p.getStatus());
        dto.put("recommendation", procurementRecommendation(p));
        dto.put("notes", p.getNotes());
        dto.put("requestedBy", p.getRequestedBy());
        dto.put("createdAt", p.getCreatedAt());
        dto.put("updatedAt", p.getUpdatedAt());
        return dto;
    }

    private Map<String, Object> toMovementDto(ResourceStockMovement m) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", m.getId());
        dto.put("resourceId", m.getResourceId());
        dto.put("resource", resourceName(m.getResourceId()));
        dto.put("type", m.getType());
        dto.put("quantity", m.getQuantity());
        dto.put("previousAvailable", m.getPreviousAvailable());
        dto.put("newAvailable", m.getNewAvailable());
        dto.put("previousInUse", m.getPreviousInUse());
        dto.put("newInUse", m.getNewInUse());
        dto.put("referenceId", m.getReferenceId());
        dto.put("notes", m.getNotes());
        dto.put("performedBy", m.getPerformedBy());
        dto.put("createdAt", m.getCreatedAt());
        return dto;
    }

    private String procurementRecommendation(ProcurementRequest p) {
        return switch (p.getStatus()) {
            case "pending" -> "Awaiting approval";
            case "approved" -> "Ready to order";
            case "ordered" -> "Awaiting delivery";
            case "received" -> "Stock received";
            case "rejected" -> "Rejected";
            case "cancelled" -> "Cancelled";
            default -> p.getStatus();
        };
    }

    private String inventoryStatus(Resource r) {
        if ("maintenance".equals(r.getMaintenanceStatus())) return "Maintenance";
        if ("retired".equals(r.getMaintenanceStatus())) return "Retired";
        if (isCritical(r)) return "Critical";
        if (needsReorder(r)) return "Low Stock";
        return "Adequate";
    }

    private boolean isCritical(Resource r) {
        double threshold = criticalUtilizationRatio();
        return r.getAvailable() > 0 && (r.getInUse() * 1.0 / r.getAvailable()) >= threshold;
    }

    private boolean needsReorder(Resource r) {
        int reorder = r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel();
        return reorder > 0 && freeStock(r) <= reorder;
    }

    private double criticalUtilizationRatio() {
        int percent = settingsService.getInt("inventory", "criticalUtilizationPercent", 90);
        return Math.max(0.5, Math.min(1.0, percent / 100.0));
    }

    private int defaultReorderLevel() {
        return Math.max(0, settingsService.getInt("inventory", "defaultReorderLevel", 5));
    }

    private Map<String, Object> inventorySettingsMap() {
        Map<String, Object> settings = new LinkedHashMap<>();
        settings.put("criticalUtilizationPercent", settingsService.getInt("inventory", "criticalUtilizationPercent", 90));
        settings.put("defaultReorderLevel", defaultReorderLevel());
        settings.put("autoProcurementEnabled", settingsService.getBoolean("inventory", "autoProcurementEnabled", true));
        settings.put("lowStockNotifications", settingsService.getBoolean("inventory", "lowStockNotifications", true));
        settings.put("procurementLeadTimeDays", settingsService.getInt("inventory", "procurementLeadTimeDays", 7));
        settings.put("bedKpiTypes", bedKpiTypes());
        settings.put("bedKpiSkuPrefixes", bedKpiSkuPrefixes());
        settings.put("bedKpiNameKeywords", bedKpiNameKeywords());
        return settings;
    }

    @SuppressWarnings("unchecked")
    private List<String> stringListSetting(String key, List<String> fallback) {
        Object raw = settingsService.getSection("inventory").get(key);
        if (raw instanceof List<?> list && !list.isEmpty()) {
            return list.stream().map(String::valueOf).filter(s -> !s.isBlank()).collect(Collectors.toList());
        }
        return fallback;
    }

    private List<String> bedKpiTypes() {
        return stringListSetting("bedKpiTypes", List.of("Facility"));
    }

    private List<String> bedKpiSkuPrefixes() {
        return stringListSetting("bedKpiSkuPrefixes", List.of("BED-"));
    }

    private List<String> bedKpiNameKeywords() {
        return stringListSetting("bedKpiNameKeywords", List.of("Bed"));
    }

    private boolean isBedKpiResource(Resource r) {
        if (r == null) return false;
        List<String> types = bedKpiTypes();
        if (!types.isEmpty() && (r.getType() == null || !types.contains(r.getType()))) {
            return false;
        }
        String sku = r.getSku() != null ? r.getSku().toUpperCase(Locale.ROOT) : "";
        for (String prefix : bedKpiSkuPrefixes()) {
            if (prefix != null && !prefix.isBlank()
                && sku.startsWith(prefix.toUpperCase(Locale.ROOT))) {
                return true;
            }
        }
        String name = r.getName() != null ? r.getName() : "";
        for (String keyword : bedKpiNameKeywords()) {
            if (keyword != null && !keyword.isBlank()
                && name.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private List<Map<String, Object>> buildReorderSuggestions(List<Resource> resources, Map<String, String> deptNames) {
        if (!settingsService.getBoolean("inventory", "lowStockNotifications", true)) {
            return List.of();
        }
        List<Map<String, Object>> suggestions = new ArrayList<>();
        for (Resource r : resources) {
            if (!needsReorder(r) && !isCritical(r)) continue;
            int reorder = r.getReorderLevel() > 0 ? r.getReorderLevel() : defaultReorderLevel();
            int suggestedQty = Math.max(reorder, reorder * 2 - freeStock(r));
            if (isCritical(r)) suggestedQty = Math.max(suggestedQty, reorder + r.getInUse());
            String priority = isCritical(r) ? "urgent" : freeStock(r) <= reorder / 2 ? "high" : "medium";
            long estimatedCost = (long) suggestedQty * Math.max(0, r.getUnitCost());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("resourceId", r.getId());
            row.put("name", r.getName());
            row.put("departmentId", r.getDepartmentId());
            row.put("department", deptNames.getOrDefault(r.getDepartmentId(), ""));
            row.put("freeStock", freeStock(r));
            row.put("reorderLevel", reorder);
            row.put("suggestedQuantity", suggestedQty);
            row.put("priority", priority);
            row.put("unitCost", r.getUnitCost());
            row.put("supplier", r.getSupplier());
            row.put("estimatedCost", estimatedCost);
            row.put("rationale", isCritical(r)
                ? "Critical utilization — expedite replenishment"
                : "Free stock at or below reorder level");
            suggestions.add(row);
        }
        suggestions.sort((a, b) -> {
            int pa = priorityRank(String.valueOf(a.get("priority")));
            int pb = priorityRank(String.valueOf(b.get("priority")));
            return Integer.compare(pa, pb);
        });
        return suggestions;
    }

    private int priorityRank(String priority) {
        return switch (priority) {
            case "urgent" -> 0;
            case "high" -> 1;
            case "medium" -> 2;
            default -> 3;
        };
    }

    private String csvCell(String value) {
        if (value == null) return "";
        String escaped = value.replace("\"", "\"\"");
        return "\"" + escaped + "\"";
    }

    private int freeStock(Resource r) {
        return Math.max(0, r.getAvailable() - r.getInUse());
    }

    private String resourceName(String resourceId) {
        if (resourceId == null) return "";
        return resourceRepository.findById(resourceId).map(Resource::getName).orElse("");
    }

    private Map<String, String> departmentNames() {
        return departmentRepository.findAll().stream()
            .collect(Collectors.toMap(Department::getId, Department::getName, (a, b) -> a));
    }

    private boolean canManage() {
        return currentUserService.hasAction(RolePermissions.ALL)
            || currentUserService.hasAction(RolePermissions.ACTION_DATA_MANAGE)
            || currentUserService.hasAction(RolePermissions.ACTION_SETTINGS_MANAGE);
    }

    private void requireManageAccess() {
        if (!canManage()) throw new IllegalArgumentException("Insufficient permissions to manage inventory");
    }
}
