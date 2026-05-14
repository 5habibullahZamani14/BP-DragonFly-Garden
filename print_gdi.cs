using System;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;

class Program {
    static string textToPrint;
    static void Main(string[] args) {
        if(args.Length < 2) {
            Console.WriteLine("Usage: print.exe <file> <printerName>");
            return;
        }
        try {
            textToPrint = File.ReadAllText(args[0]);
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
        e.Graphics.DrawString(textToPrint, new Font("Consolas", 10), Brushes.Black, new PointF(0, 0));
    }
}
