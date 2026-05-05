import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchEmployees, createEmployee, updateEmployee } from "@/lib/api";
import { UserPlus, Briefcase, DollarSign, Clock, Users } from "lucide-react";

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
      const data = await fetchEmployees(false); // Don't include archived by default
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

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading employees...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          Employee Directory
        </h2>
        <Button onClick={() => { setIsAdding(true); setEditingId(null); }} className="bg-blue-600 hover:bg-blue-700 text-white">
          <UserPlus className="h-4 w-4 mr-2" /> Add Employee
        </Button>
      </div>

      {isAdding && (
        <Card className="border-blue-200 shadow-md">
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
                <Input value={formData.contact_info} onChange={(e) => setFormData({...formData, contact_info: e.target.value})} />
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

      <div className="grid grid-cols-1 gap-4">
        {employees.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500">No active employees found.</p>
          </div>
        ) : (
          employees.map((emp) => (
            <Card key={emp.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row">
                <div className="bg-blue-50 p-4 flex flex-col justify-center items-center border-r border-blue-100 min-w-[120px]">
                  <div className="text-sm text-blue-500 font-semibold uppercase tracking-wider mb-1">ID</div>
                  <div className="text-2xl font-mono font-bold text-blue-800">{emp.employee_id}</div>
                </div>
                <div className="p-4 flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">{emp.name}</h3>
                      <p className="text-sm font-medium text-gray-500 flex items-center gap-1">
                        <Briefcase className="h-4 w-4" /> {emp.department} • {emp.employment_type}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(emp)}>Edit</Button>
                      <Button variant="destructive" size="sm" onClick={() => handleArchive(emp.id)}>Archive</Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 bg-gray-50 p-3 rounded-md">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span>{emp.shift_start} - {emp.shift_end}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-gray-400" />
                      <span>Salary: RM {Number(emp.salary).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 truncate">
                      <span>{emp.contact_info || "No contact info"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
