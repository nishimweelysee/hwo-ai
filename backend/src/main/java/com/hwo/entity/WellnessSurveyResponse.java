package com.hwo.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "wellness_survey_response")
public class WellnessSurveyResponse {

    @Id
    private String id;
    @Column(name = "staff_id")
    private String staffId;
    @Column(name = "session_id")
    private String sessionId;
    @Column(name = "question_id")
    private String questionId;
    private String value;
    @Column(name = "submitted_at")
    private LocalDateTime submittedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getStaffId() { return staffId; }
    public void setStaffId(String staffId) { this.staffId = staffId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getQuestionId() { return questionId; }
    public void setQuestionId(String questionId) { this.questionId = questionId; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public LocalDateTime getSubmittedAt() { return submittedAt; }
    public void setSubmittedAt(LocalDateTime submittedAt) { this.submittedAt = submittedAt; }
}
