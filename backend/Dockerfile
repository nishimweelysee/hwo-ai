FROM maven:3.9-eclipse-temurin-17-alpine AS builder

WORKDIR /app

COPY pom.xml .
RUN set -e; \
    for i in 1 2 3 4 5; do \
      mvn dependency:go-offline -B \
        -Dmaven.wagon.http.retryHandler.count=5 \
        -Dmaven.wagon.http.connectionTimeout=60000 \
        -Dmaven.wagon.http.readTimeout=60000 && break; \
      echo "Attempt $i failed, retrying in 15s..."; sleep 15; \
    done

COPY src src
RUN set -e; \
    for i in 1 2 3; do \
      mvn clean package -DskipTests -B \
        -Dmaven.wagon.http.retryHandler.count=5 \
        -Dmaven.wagon.http.connectionTimeout=60000 \
        -Dmaven.wagon.http.readTimeout=60000 && break; \
      echo "Build attempt $i failed, retrying in 15s..."; sleep 15; \
    done

FROM eclipse-temurin:17-jre-alpine

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    apk add --no-cache curl

WORKDIR /app
COPY --from=builder /app/target/hwo-backend-1.0.0.jar app.jar
RUN chown -R appuser:appgroup /app

USER appuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
    CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:+UseG1GC", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
