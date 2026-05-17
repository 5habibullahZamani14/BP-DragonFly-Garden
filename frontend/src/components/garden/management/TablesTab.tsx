/*
 * TablesTab.tsx — Management UI for restaurant tables.
 *
 * I created this component to allow staff to add, edit, and delete tables,
 * each associated with a QR code for scanning at the point of service.
 * The UI presents a grid of table cards with quick actions, and
 * includes a form for creating new tables. State is synchronized with
 * the backend via the API utilities.
 *
 * Design notes: I used the Card component with hover shadows,
 * and the Grid3X3, Plus, Edit2, Trash2 icons from Lucide.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchTables, createTable, updateTable, deleteTable } from "@/lib/api";
import type { TableRecord } from "@/lib/api";
import { Grid3X3, Plus, QrCode, Edit2, Trash2, Printer, HandPlatter } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const TablesTab = () => {
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newTable, setNewTable] = useState({ table_number: "", qr_code: "" });
  const [viewQRCodeTable, setViewQRCodeTable] = useState<TableRecord | null>(null);
  
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
          <Card key={table.id} className="text-center hover:shadow-md transition-all border-t-4 border-t-green-500 relative group cursor-pointer" onClick={() => setViewQRCodeTable(table)}>
            <CardContent className="pt-6 pb-4">
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
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

      {/* QR Code Modal */}
      <Dialog open={!!viewQRCodeTable} onOpenChange={(open) => !open && setViewQRCodeTable(null)}>
        <DialogContent className="sm:max-w-[340px] border-none shadow-2xl overflow-hidden p-0 [&>button]:right-4 [&>button]:top-4 [&>button]:bg-white [&>button]:rounded-full [&>button]:p-1 [&>button]:shadow-sm">
          {viewQRCodeTable && (
            <div className="bg-gradient-to-b from-gray-50 to-gray-100 p-6 flex flex-col items-center justify-center relative">
            {/* Printable Area */}
            <div id="qr-code-print-area" className="flex flex-col items-center justify-center w-full print:bg-white print:w-full print:h-full">
              {/* Filter Definition for Fluid QR */}
              <svg width="0" height="0" className="absolute hidden">
                <filter id="fluid-qr">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 15 -5" result="fluid" />
                  <feComposite in="SourceGraphic" in2="fluid" operator="atop"/>
                </filter>
              </svg>

              {/* The QR Code Container */}
              <div className="relative border-[6px] border-[#555555] rounded-xl p-3 bg-white flex items-center justify-center z-10 shadow-sm mt-4">
                <div style={{ filter: "url(#fluid-qr)" }} className="opacity-90">
                  <QRCodeSVG 
                    value={`${window.location.origin}/customer?table=${viewQRCodeTable.qr_code}`} 
                    size={180} 
                    level="H"
                    fgColor="#444444"
                    bgColor="#ffffff"
                  />
                </div>
                
                {/* The SCAN ME Center Badge */}
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="bg-white px-3 py-1.5 flex flex-col items-center justify-center border-none">
                    <span className="text-[14px] font-black text-[#555555] uppercase tracking-widest leading-none">Scan</span>
                    <span className="text-[20px] font-black text-[#555555] uppercase tracking-widest leading-none mt-[2px]">Me</span>
                  </div>
                </div>
              </div>
              
              {/* Tray */}
              <div className="w-[240px] mx-auto z-10 relative mt-0">
                <div className="w-full h-[18px] bg-[#555555] rounded-b-full rounded-t-[4px] shadow-sm relative"></div>
              </div>
              
              {/* Hand */}
              <svg viewBox="0 0 200 150" className="w-[180px] h-[135px] text-[#555555] mx-auto z-0" style={{ marginTop: '-15px' }}>
                <path d="M 45 45 C 55 70, 70 95, 100 115" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <path d="M 65 45 C 75 70, 85 95, 110 115" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <path d="M 85 45 C 95 70, 100 95, 120 115" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <path d="M 130 55 C 135 70, 120 90, 110 100" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
                <path d="M 95 145 L 95 125 C 80 120, 60 90, 45 45" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 140 145 L 140 115 C 145 100, 135 75, 130 55" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M 91 145 L 144 145" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
              </svg>
              
              <p className="mt-4 text-xl font-bold text-gray-800 uppercase tracking-widest">{viewQRCodeTable.table_number}</p>
            </div>

            <div className="w-full mt-4">
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white rounded-full shadow-md" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" /> Print QR Code
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
