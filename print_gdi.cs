using System;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;

class Program {
    static string[] lines;
    
    static void Main(string[] args) {
        if(args.Length < 2) {
            Console.WriteLine("Usage: print_gdi.exe <file> <printerName>");
            return;
        }
        try {
            lines = File.ReadAllLines(args[0]);
            PrintDocument pd = new PrintDocument();
            pd.PrinterSettings.PrinterName = args[1];
            pd.PrintPage += new PrintPageEventHandler(PrintPage);
            pd.Print();
            Console.WriteLine("Success");
        } catch(Exception e) {
            Console.WriteLine("Error: " + e.Message);
        }
    }

    static void PrintPage(object sender, PrintPageEventArgs e) {
        // Force solid black pixels (no antialiasing) to make thermal printing darker
        e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;
        
        float yPos = 0f;
        float leftMargin = 0f;
        
        Font normalFont = new Font("Courier New", 7, FontStyle.Regular);
        Font boldFont = new Font("Courier New", 7, FontStyle.Bold);
        Font h1Font = new Font("Courier New", 12, FontStyle.Bold);

        foreach(string rawLine in lines) {
            string line = rawLine.TrimEnd();
            Font currentFont = normalFont;
            bool center = false;
            bool right = false;

            // Extract tags continuously
            while (line.StartsWith("[")) {
                if (line.StartsWith("[H1]")) {
                    currentFont = h1Font;
                    line = line.Substring(4).Trim();
                } else if (line.StartsWith("[SQUARE]")) {
                    currentFont = new Font("Courier New", 21, FontStyle.Bold);
                    line = "□" + line.Substring(8);
                } else if (line.StartsWith("[BOLD]")) {
                    currentFont = boldFont;
                    line = line.Substring(6).Trim();
                } else if (line.StartsWith("[CENTER]")) {
                    center = true;
                    line = line.Substring(8).Trim();
                } else if (line.StartsWith("[RIGHT]")) {
                    right = true;
                    line = line.Substring(7).Trim();
                } else {
                    break;
                }
            }

            SizeF stringSize = e.Graphics.MeasureString(line, currentFont);
            float xPos = leftMargin;
            
            SizeF maxLineWidth = e.Graphics.MeasureString(new string('-', 28), normalFont);

            if (center) {
                xPos = (e.PageBounds.Width - stringSize.Width) / 2;
                if (xPos < 0) xPos = 0;
            } else if (right) {
                xPos = maxLineWidth.Width - stringSize.Width;
                if (xPos < 0) xPos = 0;
            }

            e.Graphics.DrawString(line, currentFont, Brushes.Black, new PointF(xPos, yPos));
            
            yPos += currentFont.Height - 1; 
        }
        
        // Feed some extra lines at the bottom for tear off
        yPos += normalFont.Height * 4;
    }
}
