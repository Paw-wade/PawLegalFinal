'use client';

export default function PDFLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          background: white !important;
          font-family: Arial, sans-serif !important;
          overflow-x: hidden;
        }
        
        @media print {
          @page {
            margin: 15mm 20mm;
            size: A4;
          }
          
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            font-size: 12px !important;
            overflow: visible !important;
          }
          
          .no-print {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          
          .pdf-container {
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          
          .avoid-break {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          
          .pdf-section {
            margin-bottom: 15px !important;
          }
          
          h1, h2, h3 {
            page-break-after: avoid;
            break-after: avoid;
            margin-top: 0 !important;
          }
          
          .pdf-header {
            page-break-after: avoid;
            break-after: avoid;
          }
        }
        
        @media screen {
          html, body {
            margin: 0;
            padding: 0;
            background: white;
          }
          
          .pdf-container {
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
          }
        }
      `}} />
      {children}
    </>
  );
}
