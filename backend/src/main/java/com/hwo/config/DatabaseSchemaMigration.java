package com.hwo.config;

import com.hwo.service.SettingsService;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(0)
public class DatabaseSchemaMigration implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final SettingsService settingsService;

    public DatabaseSchemaMigration(JdbcTemplate jdbcTemplate, SettingsService settingsService) {
        this.jdbcTemplate = jdbcTemplate;
        this.settingsService = settingsService;
    }

    @Override
    public void run(String... args) {
        patchLegacySchema();
        settingsService.migrateLegacyCertHardcodes();
    }

    private void patchLegacySchema() {
        backfillBooleanColumn("department", "active", true);
        backfillBooleanColumn("staff_role", "active", true);
        backfillResourceColumns();
        patchPredictionModelColumns();
        patchWellnessFeedbackColumns();
        ensureMobilePushTable();
        patchCertificationColumns();
        ensureSkillsTables();
        ensureInventoryTables();
        ensureDataCollectionTables();
        patchComplianceRecordColumns();
    }

    private void patchComplianceRecordColumns() {
        if (!tableExists("compliance_record")) return;
        addColumnIfMissing("compliance_record", "record_type", "VARCHAR(32)");
        addColumnIfMissing("compliance_record", "category", "VARCHAR(64)");
        addColumnIfMissing("compliance_record", "submission_id", "VARCHAR(64)");
        addColumnIfMissing("compliance_record", "regulator", "VARCHAR(128)");
        addColumnIfMissing("compliance_record", "submitted_by", "VARCHAR(255)");
        addColumnIfMissing("compliance_record", "details", "TEXT");
        widenVarcharColumnToText("compliance_record", "details");
        if (columnExists("compliance_record", "record_type")) {
            jdbcTemplate.update(
                "UPDATE compliance_record SET record_type = 'legacy' WHERE record_type IS NULL");
        }
    }

    private void ensureDataCollectionTables() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS data_import (
                id VARCHAR(255) PRIMARY KEY,
                filename VARCHAR(512),
                type VARCHAR(32) NOT NULL,
                valid_count INTEGER NOT NULL DEFAULT 0,
                duplicate_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0,
                quality INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(32) NOT NULL DEFAULT 'completed',
                imported_by VARCHAR(255),
                error_details TEXT,
                imported_at TIMESTAMP
            )
            """);
        if (tableExists("workload_record")) {
            addColumnIfMissing("workload_record", "staff_on_duty", "INTEGER");
        }
    }

    private void ensureSkillsTables() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS training_program (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS training_enrollment (
                id VARCHAR(255) PRIMARY KEY,
                program_id VARCHAR(255) NOT NULL,
                staff_id VARCHAR(255) NOT NULL,
                status VARCHAR(32) NOT NULL DEFAULT 'enrolled',
                enrolled_at TIMESTAMP,
                completed_at TIMESTAMP,
                notes TEXT
            )
            """);
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS wellness_survey_response (
                id VARCHAR(255) PRIMARY KEY,
                staff_id VARCHAR(255) NOT NULL,
                session_id VARCHAR(255) NOT NULL,
                question_id VARCHAR(255) NOT NULL,
                value TEXT,
                submitted_at TIMESTAMP
            )
            """);
        if (tableExists("procurement_request")) {
            addColumnIfMissing("procurement_request", "department_id", "VARCHAR(255)");
        }
    }

    private void patchCertificationColumns() {
        if (!tableExists("certification")) return;
        addColumnIfMissing("certification", "issued_date", "TIMESTAMP");
        addColumnIfMissing("certification", "credential_id", "VARCHAR(255)");
        addColumnIfMissing("certification", "notes", "TEXT");
    }

    private void patchWellnessFeedbackColumns() {
        if (!tableExists("wellness_feedback")) return;
        addColumnIfMissing("wellness_feedback", "sentiment", "VARCHAR(32)");
        addColumnIfMissing("wellness_feedback", "urgency", "VARCHAR(32)");
        addColumnIfMissing("wellness_feedback", "themes", "TEXT");
    }

    private void ensureMobilePushTable() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS mobile_push_token (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                token VARCHAR(512) NOT NULL,
                platform VARCHAR(32),
                updated_at TIMESTAMP
            )
            """);
    }

    private void patchPredictionModelColumns() {
        if (!tableExists("prediction_model")) return;

        addColumnIfMissing("prediction_model", "active", "BOOLEAN DEFAULT true");
        addColumnIfMissing("prediction_model", "department_id", "VARCHAR(255)");
        addColumnIfMissing("prediction_model", "scope", "VARCHAR(64)");
        addColumnIfMissing("prediction_model", "version", "VARCHAR(32)");
        addColumnIfMissing("prediction_model", "granularity", "VARCHAR(32)");
        addColumnIfMissing("prediction_model", "r2", "DOUBLE PRECISION");
        addColumnIfMissing("prediction_model", "training_data_points", "INTEGER");
        addColumnIfMissing("prediction_model", "horizon", "INTEGER");

        if (columnExists("prediction_model", "active")) {
            jdbcTemplate.update(
                "UPDATE prediction_model SET active = true WHERE active IS NULL");
            jdbcTemplate.execute(
                "ALTER TABLE prediction_model ALTER COLUMN active SET DEFAULT true");
            jdbcTemplate.execute(
                "ALTER TABLE prediction_model ALTER COLUMN active SET NOT NULL");
        }
        if (columnExists("prediction_model", "scope")) {
            jdbcTemplate.update(
                "UPDATE prediction_model SET scope = 'global' WHERE scope IS NULL");
        }
        if (columnExists("prediction_model", "version")) {
            jdbcTemplate.update(
                "UPDATE prediction_model SET version = '1.0.0' WHERE version IS NULL AND active = true");
            jdbcTemplate.update(
                "UPDATE prediction_model SET version = 'legacy' WHERE version IS NULL AND active = false");
        }
        if (columnExists("prediction_model", "granularity")) {
            jdbcTemplate.update(
                "UPDATE prediction_model SET granularity = 'monthly' WHERE granularity IS NULL");
        }
    }

    private void backfillResourceColumns() {
        if (!tableExists("resource")) return;

        addColumnIfMissing("resource", "sku", "VARCHAR(255)");
        addColumnIfMissing("resource", "location", "VARCHAR(255)");
        addColumnIfMissing("resource", "supplier", "VARCHAR(255)");
        addColumnIfMissing("resource", "reorder_level", "INTEGER DEFAULT 0");
        addColumnIfMissing("resource", "unit_cost", "INTEGER DEFAULT 0");
        addColumnIfMissing("resource", "maintenance_status", "VARCHAR(32) DEFAULT 'operational'");
        addColumnIfMissing("resource", "notes", "TEXT");

        if (columnExists("resource", "maintenance_status")) {
            jdbcTemplate.update(
                "UPDATE resource SET maintenance_status = 'operational' WHERE maintenance_status IS NULL");
        }
        if (columnExists("resource", "unit_cost")) {
            jdbcTemplate.update("UPDATE resource SET unit_cost = 0 WHERE unit_cost IS NULL");
            jdbcTemplate.execute("ALTER TABLE resource ALTER COLUMN unit_cost SET DEFAULT 0");
            jdbcTemplate.execute("ALTER TABLE resource ALTER COLUMN unit_cost SET NOT NULL");
        }
        if (columnExists("resource", "reorder_level")) {
            jdbcTemplate.update("UPDATE resource SET reorder_level = 5 WHERE reorder_level IS NULL");
            jdbcTemplate.execute("ALTER TABLE resource ALTER COLUMN reorder_level SET DEFAULT 5");
            jdbcTemplate.execute("ALTER TABLE resource ALTER COLUMN reorder_level SET NOT NULL");
        }
    }

    private void ensureInventoryTables() {
        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS resource_transfer (
                id VARCHAR(255) PRIMARY KEY,
                resource_id VARCHAR(255),
                from_department_id VARCHAR(255),
                to_department_id VARCHAR(255),
                quantity INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(32),
                requested_by VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP,
                completed_at TIMESTAMP
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS procurement_request (
                id VARCHAR(255) PRIMARY KEY,
                resource_id VARCHAR(255),
                resource_name VARCHAR(255),
                quantity INTEGER NOT NULL DEFAULT 0,
                estimated_unit_cost INTEGER NOT NULL DEFAULT 0,
                supplier VARCHAR(255),
                priority VARCHAR(32),
                status VARCHAR(32),
                requested_by VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
            """);

        jdbcTemplate.execute("""
            CREATE TABLE IF NOT EXISTS resource_stock_movement (
                id VARCHAR(255) PRIMARY KEY,
                resource_id VARCHAR(255),
                type VARCHAR(32),
                quantity INTEGER NOT NULL DEFAULT 0,
                previous_available INTEGER NOT NULL DEFAULT 0,
                new_available INTEGER NOT NULL DEFAULT 0,
                previous_in_use INTEGER NOT NULL DEFAULT 0,
                new_in_use INTEGER NOT NULL DEFAULT 0,
                reference_id VARCHAR(255),
                notes TEXT,
                performed_by VARCHAR(255),
                created_at TIMESTAMP
            )
            """);
    }

    private void addColumnIfMissing(String table, String column, String definition) {
        if (columnExists(table, column)) return;
        jdbcTemplate.execute("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
    }

    /** Legacy Hibernate ddl-auto created details as varchar(255); scans need TEXT. */
    private void widenVarcharColumnToText(String table, String column) {
        if (!columnExists(table, column)) return;
        String dataType = jdbcTemplate.queryForObject(
            "SELECT data_type FROM information_schema.columns "
                + "WHERE table_schema = 'public' AND table_name = ? AND column_name = ?",
            String.class,
            table,
            column);
        if ("character varying".equals(dataType)) {
            jdbcTemplate.execute("ALTER TABLE " + table + " ALTER COLUMN " + column + " TYPE TEXT");
        }
    }

    private void backfillBooleanColumn(String table, String column, boolean defaultValue) {
        if (!columnExists(table, column)) {
            return;
        }
        jdbcTemplate.update(
            "UPDATE " + table + " SET " + column + " = ? WHERE " + column + " IS NULL",
            defaultValue);
        jdbcTemplate.execute(
            "ALTER TABLE " + table + " ALTER COLUMN " + column + " SET DEFAULT " + defaultValue);
        jdbcTemplate.execute(
            "ALTER TABLE " + table + " ALTER COLUMN " + column + " SET NOT NULL");
    }

    private boolean tableExists(String table) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
            Integer.class,
            table);
        return count != null && count > 0;
    }

    private boolean columnExists(String table, String column) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?",
            Integer.class,
            table,
            column);
        return count != null && count > 0;
    }
}
