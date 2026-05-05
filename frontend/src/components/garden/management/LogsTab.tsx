import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchLogs } from "@/lib/api";
import { FileText, Download, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export const LogsTab = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  useEffect(() => {
    loadLogs();
  }, [categoryFilter]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await fetchLogs(categoryFilter);
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (logs.length === 0) return;
    
    const headers = ["ID", "Timestamp", "Category", "Action", "Actor", "Target", "Details"];
    const csvRows = [headers.join(",")];
    
    logs.forEach(log => {
      const row = [
        log.id,
        new Date(log.timestamp).toLocaleString(),
        log.category,
        log.action,
        log.actor_name || "System",
        log.target_name || "-",
        \`"\${log.details ? log.details.replace(/"/g, '""') : ''}"\`
      ];
      csvRows.push(row.join(","));
    });
    
    const blob = new Blob([csvRows.join("\\n")], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = \`dragonfly-garden-logs-\${new Date().toISOString().split('T')[0]}.csv\`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Prepare chart data
  const chartData = logs.reduce((acc: any[], log) => {
    const existing = acc.find(item => item.name === log.category);
    if (existing) {
      existing[log.action] = (existing[log.action] || 0) + 1;
    } else {
      acc.push({ name: log.category, [log.action]: 1 });
    }
    return acc;
  }, []);

  // Get unique actions for bar colors
  const actions = Array.from(new Set(logs.map(log => log.action)));
  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#a4de6c", "#d0ed57"];

  if (loading && logs.length === 0) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading logs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <FileText className="h-6 w-6 text-purple-600" />
          Grand Archive Logs
        </h2>
        <Button onClick={downloadCSV} className="bg-purple-600 hover:bg-purple-700 text-white">
          <Download className="h-4 w-4 mr-2" /> Export to CSV
        </Button>
      </div>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> System Activity Overview</CardTitle>
            <CardDescription>Number of actions performed per category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Legend />
                  {actions.map((action, index) => (
                    <Bar key={action} dataKey={action} stackId="a" fill={colors[index % colors.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>Detailed Audit Log</CardTitle>
            <select 
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="EMPLOYEE">Employees</option>
              <option value="INVENTORY">Inventory</option>
              <option value="ORDER">Orders</option>
              <option value="SYSTEM">System</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No logs found.</td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium">
                        <span className={\`px-2 py-1 rounded-full text-xs \${
                          log.category === 'INVENTORY' ? 'bg-orange-100 text-orange-800' :
                          log.category === 'EMPLOYEE' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }\`}>
                          {log.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-700">{log.action}</td>
                      <td className="px-4 py-3 text-gray-600">{log.actor_name || "System"}</td>
                      <td className="px-4 py-3 text-gray-900">{log.target_name || log.target_id || "-"}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={log.details}>
                        {log.details || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
