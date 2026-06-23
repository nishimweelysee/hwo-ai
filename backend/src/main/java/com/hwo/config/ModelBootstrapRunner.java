package com.hwo.config;

import com.hwo.repository.PredictionModelRepository;
import com.hwo.service.AiServiceClient;
import com.hwo.service.PredictionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(5)
public class ModelBootstrapRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ModelBootstrapRunner.class);

    private final PredictionModelRepository predictionModelRepository;
    private final AiServiceClient aiServiceClient;
    private final PredictionService predictionService;

    public ModelBootstrapRunner(PredictionModelRepository predictionModelRepository,
                                AiServiceClient aiServiceClient,
                                PredictionService predictionService) {
        this.predictionModelRepository = predictionModelRepository;
        this.aiServiceClient = aiServiceClient;
        this.predictionService = predictionService;
    }

    @Override
    public void run(String... args) {
        boolean hasSystemModel = predictionModelRepository
            .findFirstByScopeAndGranularityAndActiveTrue("system", "daily")
            .isPresent();
        if (hasSystemModel) {
            return;
        }
        if (!aiServiceClient.isHealthy()) {
            log.info("Skipping startup model bootstrap: AI service unavailable on port 8000");
            return;
        }
        try {
            predictionService.trainAllModels();
            log.info("Bootstrapped unified system prediction model on first startup");
        } catch (Exception e) {
            log.warn("Startup model bootstrap failed: {}", e.getMessage());
        }
    }
}
