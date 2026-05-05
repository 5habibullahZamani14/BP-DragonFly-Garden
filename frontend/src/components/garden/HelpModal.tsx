import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Info, Search } from "lucide-react";

export interface HelpSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface HelpModalProps {
  title: string;
  sections: HelpSection[];
}

export const HelpModal = ({ title, sections }: HelpModalProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections.filter(section => 
      section.title.toLowerCase().includes(query) || 
      (typeof section.content === 'string' && section.content.toLowerCase().includes(query)) ||
      // If content is complex React nodes, we mainly rely on title search, 
      // but we can add keywords to sections later if needed.
      false
    );
  }, [searchQuery, sections]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full bg-white/50 hover:bg-white/80 shadow-sm border border-gray-200" title="Information & Help">
          <Info className="h-6 w-6 text-blue-600" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gray-50/50">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Info className="h-6 w-6 text-blue-600" />
            {title} Instruction Guide
          </DialogTitle>
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search instructions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </DialogHeader>
        
        <div className="p-6 overflow-y-auto flex-1 bg-white">
          {filteredSections.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No instructions found matching "{searchQuery}"
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {filteredSections.map((section) => (
                <AccordionItem key={section.id} value={section.id} className="border-b-gray-100">
                  <AccordionTrigger className="text-left font-semibold text-gray-800 hover:text-blue-600 hover:no-underline py-4">
                    {section.title}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 leading-relaxed pb-4 prose prose-sm max-w-none prose-blue">
                    {section.content}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
