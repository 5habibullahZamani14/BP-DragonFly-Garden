import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchTables, createTable, updateTable, deleteTable } from "@/lib/api";
import { Grid3X3, Plus, QrCode, Edit2, Trash2 } from "lucide-react";

export const TablesTab = () => {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: "", qr_code: "" });
  
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [editTable, setEditTable] = useState({ table_number: "", qr_code: "" });

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      setLoading(true);
      const data = await fetchTables();
      setTables(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTable.table_number || !newTable.qr_code) return;
    try {
      await createTable(newTable);
      setIsAdding(false);
      setNewTable({ table_number: "", qr_code: "" });
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdate = async () => {
    if (!editingTableId || !editTable.table_number || !editTable.qr_code) return;
    try {
      await updateTable(editingTableId, editTable);
      setEditingTableId(null);
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this table?")) return;
    try {
      await deleteTable(id);
      loadTables();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse">Loading tables...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Grid3X3 className="h-6 w-6 text-green-600" />
          Restaurant Tables
        </h2>
        <Button onClick={() => setIsAdding(true)} className="bg-green-600 hover:bg-green-700 text-white">
          <Plus className="h-4 w-4 mr-2" /> Add Table
        </Button>
      </div>

      {isAdding && (
        <Card className="border-green-200 shadow-md">
          <CardHeader>
            <CardTitle>New Table</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Table Number/Name</Label>
                <Input value={newTable.table_number} onChange={(e) => setNewTable({...newTable, table_number: e.target.value})} placeholder="e.g. Table 12 or VIP Lounge" />
              </div>
              <div className="space-y-2">
                <Label>QR Code Identifier</Label>
                <Input value={newTable.qr_code} onChange={(e) => setNewTable({...newTable, qr_code: e.target.value})} placeholder="e.g. table-12" />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleCreate} className="bg-green-600 hover:bg-green-700 text-white flex-1">Save Table</Button>
              <Button onClick={() => setIsAdding(false)} variant="outline" className="flex-1">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingTableId && (
        <Card className="border-blue-200 shadow-md">
          <CardHeader>
            <CardTitle>Edit Table</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Table Number/Name</Label>
                <Input value={editTable.table_number} onChange={(e) => setEditTable({...editTable, table_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>QR Code Identifier</Label>
                <Input value={editTable.qr_code} onChange={(e) => setEditTable({...editTable, qr_code: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button onClick={handleUpdate} className="bg-blue-600 hover:bg-blue-700 text-white flex-1">Update Table</Button>
              <Button onClick={() => setEditingTableId(null)} variant="outline" className="flex-1">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((table) => (
          <Card key={table.id} className="text-center hover:shadow-md transition-all border-t-4 border-t-green-500 relative group">
            <CardContent className="pt-6 pb-4">
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setEditingTableId(table.id);
                    setEditTable({ table_number: table.table_number, qr_code: table.qr_code });
                  }}
                  className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleDelete(table.id)}
                  className="p-1 text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Grid3X3 className="h-8 w-8 text-green-200 mx-auto mb-2" />
              <div className="font-bold text-lg text-gray-800">{table.table_number}</div>
              <div className="text-xs text-gray-500 mt-2 flex items-center justify-center gap-1">
                <QrCode className="h-3 w-3" /> {table.qr_code}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
