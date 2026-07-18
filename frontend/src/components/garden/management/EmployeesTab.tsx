/*
 * EmployeesTab.tsx — Management sub-view for staff and payroll.
 *
 * I built this tab to serve two purposes: record-keeping and analytics.
 * It allows managers to manage employee profiles while giving them
 * a high-level view of their workforce distribution and financial load.
 *
 * Technical features:
 *
 *   1. Automated ID Generation: When a new employee is saved, the backend
 *      automatically generates a unique 4-digit ID. I display this clearly
 *      on the employee cards for quick reference during clock-ins.
 *
 *   2. Real-time Analytics: I used 'recharts' to visualize staff 
 *      distribution. I implemented the useMemo hook to group employees 
 *      by department and calculate total payroll on the fly, ensuring 
 *      the charts stay responsive even as the staff list grows.
 *
 *   3. Archive System: Instead of a hard delete, I implemented an 
 *      archiving toggle. This preserves historical data for audits 
 *      (important for the "Grand Archive") while removing the employee 
 *      from active lists like the Payment Counter login.
 */

import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchEmployees, createEmployee, updateEmployee } from "@/lib/api";
import type { EmployeeRecord } from "@/lib/api";
import { UserPlus, Briefcase, DollarSign, Clock, Users, Calendar, Phone } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import ChartCardFooter from "@/components/ui/ChartCardFooter";
import ChartHeaderExport from "@/components/ui/ChartHeaderExport";
import ChartEmptyState from "@/components/ui/ChartEmptyState";
import CardFilters from "@/components/ui/CardFilters";
import ChartTickWrap from "@/components/ui/ChartTickWrap";
import { ChartSkeleton, CardSkeleton } from "@/components/ui/LoadingSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { DEPT_LABEL_KEYS, EMP_TYPE_LABEL_KEYS, labelForStoredValue } from "@/lib/i18nLabels";
import { useWebSocket } from "@/lib/useWebSocket";
import { safeConsoleError } from "@/lib/safeConsole";

export const EmployeesTab = () => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [staffDistDeptFilter, setStaffDistDeptFilter] = useState("all");
  const [staffDistEmpTypeFilter, setStaffDistEmpTypeFilter] = useState("all");
  const [payrollDeptFilter, setPayrollDeptFilter] = useState("all");
  const [payrollEmpTypeFilter, setPayrollEmpTypeFilter] = useState("all");

  const deptFilterOptions = useMemo(
    () => [
      { value: "all", label: t("m.allCategories") },
      ...Object.entries(DEPT_LABEL_KEYS)
        .filter(([k]) => k !== "Other")
        .map(([value, key]) => ({ value, label: t(key) })),
    ],
    [t]
  );

  const empTypeFilterOptions = useMemo(
    () => [
      { value: "all", label: t("m.allCategories") },
      ...Object.entries(EMP_TYPE_LABEL_KEYS).map(([value, key]) => ({ value, label: t(key) })),
    ],
    [t]
  );

  const filterEmployees = (list: EmployeeRecord[], dept: string, empType: string) =>
    list.filter((emp) => {
      if (dept !== "all" && (emp.department || "Other") !== dept) return false;
      if (empType !== "all" && (emp.employment_type || "") !== empType) return false;
      return true;
    });

  const buildAnalytics = (list: EmployeeRecord[]) => {
    const deptCounts: Record<string, number> = {};
    const payroll: Record<string, number> = {};

    list.forEach((emp) => {
      const dept = emp.department || "Other";
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      payroll[dept] = (payroll[dept] || 0) + Number(emp.salary || 0);
    });

    const pie = Object.entries(deptCounts).map(([name, value]) => ({
      name: labelForStoredValue(t, DEPT_LABEL_KEYS, name),
      deptKey: name,
      value,
    }));
    const bar = Object.entries(payroll).map(([name, totalSalary]) => ({
      name: labelForStoredValue(t, DEPT_LABEL_KEYS, name),
      deptKey: name,
      totalSalary,
    }));

    return { pie, bar };
  };

  const [formData, setFormData] = useState({
    name: "",
    department: "Waiter",
    salary: "",
    bonuses: "",
    shift_start: "09:00",
    shift_end: "17:00",
    employment_type: "Full-Time",
    contact_info: ""
  });

  useEffect(() => {
    loadEmployees();
  }, []);

  // WebSocket listener for real-time employee updates
  useWebSocket(["EMPLOYEE_UPDATE"], (event) => {
    loadEmployees();
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await fetchEmployees(false);
      setEmployees(data || []);
    } catch (e) {
      safeConsoleError("Failed to load employee data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) return;
    try {
      const payload = {
        ...formData,
        salary: parseFloat(formData.salary) || 0,
        bonuses: parseFloat(formData.bonuses) || 0,
      };

      if (editingId) {
        await updateEmployee(editingId, payload);
      } else {
        await createEmployee(payload);
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({
        name: "", department: "Waiter", salary: "", bonuses: "",
        shift_start: "09:00", shift_end: "17:00", employment_type: "Full-Time", contact_info: ""
      });
      loadEmployees();
    } catch (e) {
      safeConsoleError("Failed to save employee", e);
    }
  };

  const handleEdit = (emp: EmployeeRecord) => {
    setFormData({
      name: emp.name,
      department: emp.department || "Waiter",
      salary: emp.salary?.toString() || "",
      bonuses: emp.bonuses?.toString() || "",
      shift_start: emp.shift_start || "09:00",
      shift_end: emp.shift_end || "17:00",
      employment_type: emp.employment_type || "Full-Time",
      contact_info: emp.contact_info || ""
    });
    setEditingId(emp.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleArchive = async (id: number) => {
    if (confirm(t("m.confirmArchive"))) {
      try {
        await updateEmployee(id, { is_archived: 1 });
        loadEmployees();
      } catch (e) {
        safeConsoleError("Failed to archive employee", e);
      }
    }
  };

  // --- Analytics & Grouping Logic ---

  const departmentColors: Record<string, string> = {
    "Waiter": "#3b82f6", // blue
    "Chef": "#ef4444",   // red
    "Chef Assistant": "#f97316", // orange
    "Cashier": "#10b981", // emerald
    "Manager": "#8b5cf6" // violet
  };

  const { groupedEmployees, pieData, barData } = useMemo(() => {
    const grouped: Record<string, EmployeeRecord[]> = {};

    employees.forEach(emp => {
      const dept = emp.department || "Other";
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push(emp);
    });

    const staffFiltered = filterEmployees(employees, staffDistDeptFilter, staffDistEmpTypeFilter);
    const payrollFiltered = filterEmployees(employees, payrollDeptFilter, payrollEmpTypeFilter);
    const staffAnalytics = buildAnalytics(staffFiltered);
    const payrollAnalytics = buildAnalytics(payrollFiltered);

    return {
      groupedEmployees: grouped,
      pieData: staffAnalytics.pie,
      barData: payrollAnalytics.bar,
    };
  }, [employees, staffDistDeptFilter, staffDistEmpTypeFilter, payrollDeptFilter, payrollEmpTypeFilter, t]);

  if (loading && employees.length === 0) return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-5 w-96 rounded-lg" />
      </div>
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          {t("m.empDir")}
        </h2>
        <Button onClick={() => { setIsAdding(true); setEditingId(null); }} className="bg-blue-600 hover:bg-blue-700 text-white">
          <UserPlus className="h-4 w-4 mr-2" /> {t("m.addEmp")}
        </Button>
      </div>

      {isAdding && (
        <Card className="border-blue-200 shadow-md mb-8">
          <CardHeader>
            <CardTitle>{editingId ? t("m.editEmployee") : t("m.newEmployee")}</CardTitle>
            <CardDescription>{t("m.newEmployeeDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("m.fullName")}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder={t("m.namePlaceholderEmp")} />
              </div>
              <div className="space-y-2">
                <Label>{t("m.dept")}</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={formData.department} 
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                >
                  {Object.entries(DEPT_LABEL_KEYS).filter(([k]) => k !== "Other").map(([value, key]) => (
                    <option key={value} value={value}>{t(key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("m.empType")}</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={formData.employment_type} 
                  onChange={(e) => setFormData({...formData, employment_type: e.target.value})}
                >
                  {Object.entries(EMP_TYPE_LABEL_KEYS).map(([value, key]) => (
                    <option key={value} value={value}>{t(key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>{t("m.contactInfo")}</Label>
                <Input value={formData.contact_info} onChange={(e) => setFormData({...formData, contact_info: e.target.value})} placeholder="012-3456789" />
              </div>
              <div className="space-y-2">
                <Label>{t("m.salary")}</Label>
                <Input type="number" value={formData.salary} onChange={(e) => setFormData({...formData, salary: e.target.value})} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{t("m.bonuses")}</Label>
                <Input type="number" value={formData.bonuses} onChange={(e) => setFormData({...formData, bonuses: e.target.value})} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>{t("m.shiftStart")}</Label>
                <Input type="time" value={formData.shift_start} onChange={(e) => setFormData({...formData, shift_start: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t("m.shiftEnd")}</Label>
                <Input type="time" value={formData.shift_end} onChange={(e) => setFormData({...formData, shift_end: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white flex-1">{t("m.saveEmp")}</Button>
              <Button onClick={() => setIsAdding(false)} variant="outline" className="flex-1">{t("m.cancel")}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics Dashboards */}
      {employees.length > 0 && (
        <div className="space-y-8 mb-8">
          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">{t("m.staffDist")}</h3>
                  <p className="text-xs text-foreground/50 mt-1">{t("m.staffDistDesc")}</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="staff-dist-chart"
                data={pieData}
                fileName="staff-distribution"
              />
            </div>
            <CardFilters
              label={t("m.filterStaffDist", "Filter for Staff Distribution")}
              secondaryValue={staffDistDeptFilter}
              onSecondaryChange={setStaffDistDeptFilter}
              secondaryOptions={deptFilterOptions}
              tertiaryValue={staffDistEmpTypeFilter}
              onTertiaryChange={setStaffDistEmpTypeFilter}
              tertiaryOptions={empTypeFilterOptions}
            />
            <div className="flex-1 w-full h-[220px]">
              <div id="staff-dist-chart" className="relative w-full h-full">
                {pieData.length === 0 && (
                  <ChartEmptyState message={t("m.noChartData", "No employees match the selected filters.")} />
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={departmentColors[entry.deptKey] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, t("m.chartEmployees")]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ChartCardFooter
              infoKey="m.staffDistInfo"
            />
          </div>

          <div className="bg-white/70 backdrop-blur-md border border-white/40 shadow-xl rounded-3xl p-6 flex flex-col min-h-[400px]">
            <div className="mb-4 flex items-center justify-between gap-4 px-2">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                <div>
                  <h3 className="font-1 text-lg font-bold text-[#142d1f]">{t("m.payrollLoad")}</h3>
                  <p className="text-xs text-foreground/50 mt-1">{t("m.payrollDesc")}</p>
                </div>
              </div>
              <ChartHeaderExport
                targetId="payroll-load-chart"
                data={barData}
                fileName="payroll-load"
              />
            </div>
            <CardFilters
              label={t("m.filterPayroll", "Filter for Payroll Load")}
              secondaryValue={payrollDeptFilter}
              onSecondaryChange={setPayrollDeptFilter}
              secondaryOptions={deptFilterOptions}
              tertiaryValue={payrollEmpTypeFilter}
              onTertiaryChange={setPayrollEmpTypeFilter}
              tertiaryOptions={empTypeFilterOptions}
            />
            <div className="flex-1 w-full h-[220px]">
              <div id="payroll-load-chart" className="relative w-full h-full">
                {barData.length === 0 && (
                  <ChartEmptyState message={t("m.noChartData", "No employees match the selected filters.")} />
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={<ChartTickWrap wordsPerLine={3} fontSize={11} />} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(140, 20%, 40%)', fontSize: 11 }} tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip formatter={(value: number) => [`RM ${value.toFixed(2)}`, t("m.chartTotalSalary")]} cursor={{fill: 'rgba(0,0,0,0.03)'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontWeight: 'bold' }} />
                    <Bar dataKey="totalSalary" radius={[4, 4, 0, 0]} barSize={24}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={departmentColors[entry.deptKey] || '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <ChartCardFooter
              infoKey="m.payrollInfo"
            />
          </div>
        </div>
      )}

      {/* Grouped Employee Lists */}
      {employees.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">{t("m.noEmployees")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedEmployees).map(([dept, emps]) => (
            <div key={dept} className="space-y-4">
              <div className="flex items-center gap-3 border-b pb-2">
                <div 
                  className="w-4 h-4 rounded-full" 
                  style={{ backgroundColor: departmentColors[dept] || '#94a3b8' }}
                />
                <h3 className="text-xl font-bold text-gray-800">{t("m.departmentHeader", { dept: labelForStoredValue(t, DEPT_LABEL_KEYS, dept) })}</h3>
                <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {t("m.membersCount", { count: emps.length })}
                </span>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {emps.map((emp) => (
                  <Card key={emp.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row h-full">
                      <div className="bg-blue-50 p-4 flex flex-col justify-center items-center border-r border-blue-100 min-w-[120px] shrink-0">
                        <div className="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">{t("m.idLabel")}</div>
                        <div className="text-2xl font-mono font-bold text-blue-800">{emp.employee_id}</div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">{emp.name}</h3>
                              <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" /> {labelForStoredValue(t, EMP_TYPE_LABEL_KEYS, emp.employment_type || "")}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(emp)} className="h-7 text-xs px-2">{t("m.edit")}</Button>
                              <Button variant="destructive" size="sm" onClick={() => handleArchive(emp.id)} className="h-7 text-xs px-2">{t("m.archive")}</Button>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 mt-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-400" />
                              <span>{emp.shift_start} - {emp.shift_end}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-gray-400" />
                              <span>RM {Number(emp.salary).toFixed(2)} {emp.bonuses ? `(+ RM${emp.bonuses})` : ''}</span>
                            </div>
                            <div className="flex items-center gap-2 truncate">
                              <Phone className="h-4 w-4 text-gray-400" />
                              <span>{emp.contact_info || t("m.noContact")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>{t("m.joined", { date: new Date(emp.hire_date).toLocaleDateString() })}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
