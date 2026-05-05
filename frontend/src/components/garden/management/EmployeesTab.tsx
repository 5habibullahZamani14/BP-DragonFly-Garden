import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchEmployees, createEmployee, updateEmployee } from "@/lib/api";
import { UserPlus, Briefcase, DollarSign, Clock, Users, Calendar, Phone } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export const EmployeesTab = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

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

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await fetchEmployees(false);
      setEmployees(data || []);
    } catch (e) {
      console.error(e);
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
      console.error("Failed to save employee", e);
    }
  };

  const handleEdit = (emp: any) => {
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
    if (confirm("Are you sure you want to archive this employee?")) {
      try {
        await updateEmployee(id, { is_archived: 1 });
        loadEmployees();
      } catch (e) {
        console.error(e);
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
    const grouped: Record<string, any[]> = {};
    const deptCounts: Record<string, number> = {};
    const payroll: Record<string, number> = {};

    employees.forEach(emp => {
      const dept = emp.department || "Other";
      
      // Grouping
      if (!grouped[dept]) grouped[dept] = [];
      grouped[dept].push(emp);
      
      // Pie Chart (Count)
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;
      
      // Bar Chart (Payroll)
      payroll[dept] = (payroll[dept] || 0) + Number(emp.salary || 0);
    });

    const pie = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));
    const bar = Object.entries(payroll).map(([name, totalSalary]) => ({ name, totalSalary }));

    return { groupedEmployees: grouped, pieData: pie, barData: bar };
  }, [employees]);

  if (loading && employees.length === 0) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading employees...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          Employee Directory & Analytics
        </h2>
        <Button onClick={() => { setIsAdding(true); setEditingId(null); }} className="bg-blue-600 hover:bg-blue-700 text-white">
          <UserPlus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      {isAdding && (
        <Card className="border-blue-200 shadow-md mb-8">
          <CardHeader>
            <CardTitle>{editingId ? "Edit Employee" : "New Employee"}</CardTitle>
            <CardDescription>Fill in the details below. A unique 4-digit ID will be generated automatically upon saving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="e.g. John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={formData.department} 
                  onChange={(e) => setFormData({...formData, department: e.target.value})}
                >
                  <option value="Waiter">Waiter</option>
                  <option value="Chef">Chef</option>
                  <option value="Chef Assistant">Chef Assistant</option>
                  <option value="Cashier">Cashier</option>
                  <option value="Manager">Manager</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Employment Type</Label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={formData.employment_type} 
                  onChange={(e) => setFormData({...formData, employment_type: e.target.value})}
                >
                  <option value="Full-Time">Full-Time</option>
                  <option value="Part-Time">Part-Time</option>
                  <option value="Contract">Contract</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Contact Info (Phone/Email)</Label>
                <Input value={formData.contact_info} onChange={(e) => setFormData({...formData, contact_info: e.target.value})} placeholder="012-3456789" />
              </div>
              <div className="space-y-2">
                <Label>Salary (RM)</Label>
                <Input type="number" value={formData.salary} onChange={(e) => setFormData({...formData, salary: e.target.value})} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Bonuses (RM)</Label>
                <Input type="number" value={formData.bonuses} onChange={(e) => setFormData({...formData, bonuses: e.target.value})} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Shift Start Time</Label>
                <Input type="time" value={formData.shift_start} onChange={(e) => setFormData({...formData, shift_start: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Shift End Time</Label>
                <Input type="time" value={formData.shift_end} onChange={(e) => setFormData({...formData, shift_end: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white flex-1">Save Employee</Button>
              <Button onClick={() => setIsAdding(false)} variant="outline" className="flex-1">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics Dashboards */}
      {employees.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Staff Distribution</CardTitle>
              <CardDescription>Number of employees per department</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
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
                        <Cell key={`cell-${index}`} fill={departmentColors[entry.name] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [value, 'Employees']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Load by Department</CardTitle>
              <CardDescription>Total base salary (RM) per department</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip formatter={(value: number) => [`RM ${value.toFixed(2)}`, 'Total Salary']} cursor={{fill: 'transparent'}} />
                    <Bar dataKey="totalSalary" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={departmentColors[entry.name] || '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Grouped Employee Lists */}
      {employees.length === 0 ? (
        <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">No active employees found.</p>
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
                <h3 className="text-xl font-bold text-gray-800">{dept} Department</h3>
                <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {emps.length} Members
                </span>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {emps.map((emp) => (
                  <Card key={emp.id} className="overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row h-full">
                      <div className="bg-blue-50 p-4 flex flex-col justify-center items-center border-r border-blue-100 min-w-[120px] shrink-0">
                        <div className="text-xs text-blue-500 font-semibold uppercase tracking-wider mb-1">ID</div>
                        <div className="text-2xl font-mono font-bold text-blue-800">{emp.employee_id}</div>
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">{emp.name}</h3>
                              <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                                <Briefcase className="h-3.5 w-3.5" /> {emp.employment_type}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleEdit(emp)} className="h-7 text-xs px-2">Edit</Button>
                              <Button variant="destructive" size="sm" onClick={() => handleArchive(emp.id)} className="h-7 text-xs px-2">Archive</Button>
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
                              <span>{emp.contact_info || "No contact info"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              <span>Joined: {new Date(emp.hire_date).toLocaleDateString()}</span>
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
