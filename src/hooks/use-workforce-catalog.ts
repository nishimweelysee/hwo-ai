"use client";

import { useEffect, useState } from "react";
import { DepartmentOption, StaffRoleOption, loadDepartments, loadStaffRoles } from "@/lib/workforce-catalog";

export function useWorkforceCatalog() {
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [staffRoles, setStaffRoles] = useState<StaffRoleOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDepartments(), loadStaffRoles()]).then(([depts, roles]) => {
      if (cancelled) return;
      setDepartments(depts);
      setStaffRoles(roles);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { departments, staffRoles, loading };
}
