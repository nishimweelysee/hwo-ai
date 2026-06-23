import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@hospital.org" },
    update: {},
    create: {
      email: "admin@hospital.org",
      password: hashedPassword,
      name: "Admin User",
      role: "Admin",
      organization: "General Hospital",
    },
  });

  await prisma.user.upsert({
    where: { email: "analyst@hospital.org" },
    update: {},
    create: {
      email: "analyst@hospital.org",
      password: hashedPassword,
      name: "Analyst User",
      role: "Analyst",
      organization: "General Hospital",
    },
  });

  // Create departments
  const depts = ["Emergency", "ICU", "Surgery", "Pediatrics", "General Medicine", "Radiology"];
  const workloads = [92, 88, 75, 68, 82, 71];
  const staffCounts = [24, 18, 32, 20, 45, 12];
  for (let i = 0; i < depts.length; i++) {
    const existing = await prisma.department.findFirst({ where: { name: depts[i] } });
    if (!existing) {
      await prisma.department.create({
        data: {
          name: depts[i],
          staffCount: staffCounts[i],
          workload: workloads[i],
        },
      });
    }
  }

  // Create sample staff
  const staffData = [
    { name: "Dr. Sarah Chen", role: "Physician", dept: "Emergency", overtime: 12, risk: "high" },
    { name: "Nurse Mike Johnson", role: "RN", dept: "ICU", overtime: 8, risk: "medium" },
    { name: "Dr. Emma Wilson", role: "Physician", dept: "Surgery", overtime: 4, risk: "low" },
    { name: "Nurse Lisa Park", role: "RN", dept: "Pediatrics", overtime: 6, risk: "low" },
    { name: "Dr. James Lee", role: "Physician", dept: "General Medicine", overtime: 5, risk: "low" },
  ];

  const certsData = [
    { staffName: "Dr. Sarah Chen", cert: "ACLS", expiry: "2025-03-15" },
    { staffName: "Nurse Mike Johnson", cert: "PALS", expiry: "2025-03-22" },
    { staffName: "Nurse Lisa Park", cert: "BLS", expiry: "2025-03-28" },
  ];

  for (const s of staffData) {
    const dept = await prisma.department.findFirst({ where: { name: s.dept } });
    if (dept) {
      const staff = await prisma.staff.create({
        data: {
          name: s.name,
          role: s.role,
          departmentId: dept.id,
        },
      });
      await prisma.wellnessRecord.create({
        data: {
          staffId: staff.id,
          date: new Date(),
          overtime: s.overtime,
          riskLevel: s.risk,
          score: s.risk === "high" ? 65 : s.risk === "medium" ? 72 : 85,
        },
      });
      const certMatch = certsData.find((c) => c.staffName === s.name);
      if (certMatch) {
        await prisma.certification.create({
          data: {
            staffId: staff.id,
            name: certMatch.cert,
            expiryDate: new Date(certMatch.expiry),
          },
        });
      }
    }
  }

  // Schedules for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existingSchedules = await prisma.schedule.count({ where: { date: today } });
  if (existingSchedules === 0) {
    const staffList = await prisma.staff.findMany({ take: 5 });
    const shifts = ["Day", "Evening", "Night"];
    for (let i = 0; i < staffList.length; i++) {
      await prisma.schedule.create({
        data: {
          staffId: staffList[i].id,
          date: today,
          shift: shifts[i % 3],
        },
      });
    }
  }

  // Workload records (12 months for ML training)
  const allDepts = await prisma.department.findMany();
  const monthlyValues = [72, 78, 75, 82, 85, 88, 86, 84, 80, 78, 82, 85];
  for (let m = 0; m < 12; m++) {
    const date = new Date(2024, m, 15);
    for (const dept of allDepts) {
      const base = monthlyValues[m] + (dept.workload - 80) * 0.2;
      await prisma.workloadRecord.create({
        data: {
          departmentId: dept.id,
          date,
          hour: [0, 4, 8, 12, 16, 20][m % 6],
          workload: Math.min(100, Math.max(50, base)),
          patientVolume: Math.round(base * 2.5),
        },
      });
    }
  }

  // Resources
  const resources = [
    { name: "Ventilators", type: "Equipment", available: 24, inUse: 22 },
    { name: "ICU Beds", type: "Facility", available: 45, inUse: 42 },
    { name: "Operating Rooms", type: "Facility", available: 12, inUse: 10 },
    { name: "Portable X-Ray", type: "Equipment", available: 6, inUse: 4 },
  ];
  for (const r of resources) {
    await prisma.resource.create({ data: r });
  }

  // Prediction model
  await prisma.predictionModel.create({
    data: {
      name: "Workload LSTM",
      type: "forecast",
      accuracy: 94.2,
      mae: 2.3,
      rmse: 3.1,
      lastTrained: new Date("2025-02-15"),
    },
  });

  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
