package com.hwo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class HwoApplication {

    public static void main(String[] args) {
        SpringApplication.run(HwoApplication.class, args);
    }
}
