import jsPDF from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';

export const generatePayslipPDF = (record: any, employee: any) => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // --- Premium Color Palette ---
    const primaryBrand: [number, number, number] = [30, 58, 138]; // Blue 900 (Deep, modern)
    const accentColor: [number, number, number] = [14, 165, 233]; // Sky 500 (Vibrant accent)
    const darkSlate: [number, number, number] = [15, 23, 42]; // Slate 900
    const borderSlate: [number, number, number] = [203, 213, 225]; // Slate 300
    const textMuted: [number, number, number] = [71, 85, 105]; // Slate 600
    const textDark: [number, number, number] = [30, 41, 59]; // Slate 800

    const successBg: [number, number, number] = [240, 253, 244]; // Green 50
    const successText: [number, number, number] = [21, 128, 61]; // Green 700
    const successBorder: [number, number, number] = [34, 197, 94]; // Green 500

    const dangerText: [number, number, number] = [220, 38, 38]; // Red 600

    // --- Page Border ---
    doc.setDrawColor(...primaryBrand);
    doc.setLineWidth(4);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30); // Outer border
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(0.5);
    doc.rect(19, 19, pageWidth - 38, pageHeight - 38); // Inner subtle border

    // --- Watermark ---
    doc.saveGraphicsState();
    doc.setTextColor(241, 245, 249); // Very light grey
    doc.setFontSize(80);
    doc.setFont('helvetica', 'bold');
    // Save rotation and translate for angled watermark
    doc.text('CONFIDENTIAL', pageWidth / 2, pageHeight / 2 + 100, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    // --- Premium Header Banner ---
    // Top colored block
    doc.setFillColor(...primaryBrand);
    doc.rect(20, 20, pageWidth - 40, 100, 'F');
    // Accent line below it
    doc.setFillColor(...accentColor);
    doc.rect(20, 120, pageWidth - 40, 4, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYSLIP', 45, 65);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const monthStr = (record.month_year || '').toUpperCase();
    doc.text(`SALARY MONTH: ${monthStr}`, 45, 95);

    // Right aligned company details
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('General Hospital, ESIS, Vadodara', pageWidth - 45, 65, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(186, 230, 253);
    doc.text('Government of Gujarat - Official Payroll Record', pageWidth - 45, 85, { align: 'right' });


    // --- High-End Employee Details Card ---
    const cardY = 155;

    // Shadow trick (draw generic rect shifted lower-right)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(42, cardY + 2, pageWidth - 80, 95, 8, 8, 'F');

    // Main Card
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(0.5);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(40, cardY, pageWidth - 80, 95, 8, 8, 'FD');

    // Vertical divider inside card
    doc.setDrawColor(226, 232, 240); // Lighter line
    doc.line(pageWidth / 2, cardY + 15, pageWidth / 2, cardY + 80);

    // Helper func for labels
    const drawLabel = (text: string, x: number, y: number) => {
        doc.setFontSize(8);
        doc.setTextColor(...textMuted);
        doc.setFont('helvetica', 'bold');
        doc.text(text.toUpperCase(), x, y);
    }
    const drawValue = (text: string, x: number, y: number) => {
        doc.setFontSize(11);
        doc.setTextColor(...textDark);
        doc.setFont('helvetica', 'bold');
        doc.text(text, x, y);
    }

    // Left side info
    drawLabel('Employee Name', 60, cardY + 25);
    drawValue(employee.corrected_name || record.name || 'N/A', 60, cardY + 40);

    drawLabel('Designation', 60, cardY + 60);
    drawValue(record.designation || 'N/A', 60, cardY + 75);

    // Right side info
    drawLabel('Payroll No (HRPN)', (pageWidth / 2) + 20, cardY + 25);
    drawValue(employee.hrpn || record.hrpn || 'N/A', (pageWidth / 2) + 20, cardY + 40);

    // Two cols on right bottom
    drawLabel('PAN Number', (pageWidth / 2) + 20, cardY + 60);
    drawValue(employee.pan_number || 'N/A', (pageWidth / 2) + 20, cardY + 75);

    drawLabel('Bill No', (pageWidth / 2) + 140, cardY + 60);
    drawValue(record.bill_no || 'N/A', (pageWidth / 2) + 140, cardY + 75);


    // --- Stunning Tables Layout ---
    const earnings = [
        ['Basic Pay', record.basic || 0],
        ['Dearness Allowance (DA)', record.da || 0],
        ['House Rent Allowance (HRA)', record.hra || 0],
        ['City Level Allowance (CLA)', record.cla || 0],
        ['Medical Allowance', record.med_allow || 0],
        ['Transport Allowance', record.trans_allow || 0],
        ['Nursing/Special Pay', (record.nursing_allow || 0) + (record.special_pay || 0)],
        ['Other Allowances', (record.book_allow || 0) + (record.npp_allow || 0) + (record.esis_allow || 0) + (record.uniform_allow || 0) + (record.washing_allow || 0)]
    ].filter(item => Number(item[1]) !== 0);

    const deductions = [
        ['Income Tax', record.income_tax || 0],
        ['Professional Tax', record.prof_tax || 0],
        ['GPF', (record.gpf_reg || 0) + (record.gpf_class4 || 0)],
        ['NPS', record.nps_reg || 0],
        ['R&B / Rent', record.rnb || 0],
        ['Govt Savings/Fund', (record.govt_saving || 0) + (record.govt_fund || 0)],
        ['Recovery of Pay', record.recovery_of_pay || 0]
    ].filter(item => Number(item[1]) !== 0);

    const maxRows = Math.max(earnings.length, deductions.length);
    const tableBody = [];

    for (let i = 0; i < maxRows; i++) {
        const earnName = earnings[i] ? String(earnings[i][0]) : '';
        const earnVal = earnings[i] ? `Rs. ${Number(earnings[i][1]).toLocaleString('en-IN')}` : '';
        const dedName = deductions[i] ? String(deductions[i][0]) : '';
        const dedVal = deductions[i] ? `Rs. ${Number(deductions[i][1]).toLocaleString('en-IN')}` : '';
        tableBody.push([earnName, earnVal, dedName, dedVal]);
    }

    autoTable(doc, {
        startY: cardY + 125,
        theme: 'grid',
        head: [['EARNINGS', 'AMOUNT', 'DEDUCTIONS', 'AMOUNT']],
        body: tableBody,
        headStyles: {
            fillColor: darkSlate,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10,
            cellPadding: 10,
            halign: 'center',
            lineColor: darkSlate,
            lineWidth: 0.5
        },
        styles: {
            font: 'helvetica',
            fontSize: 10,
            cellPadding: 10,
            lineColor: borderSlate,
            textColor: textDark,
            minCellHeight: 25
        },
        columnStyles: {
            0: { halign: 'left', fontStyle: 'normal' },
            1: { halign: 'right', fontStyle: 'bold', textColor: [5, 150, 105] },
            2: { halign: 'left', fontStyle: 'normal' },
            3: { halign: 'right', fontStyle: 'bold', textColor: dangerText },
        },
        margin: { left: 40, right: 40 },
        alternateRowStyles: {
            fillColor: [250, 250, 254] // Very light tint 
        }
    });

    const finalYTable = (doc as any).lastAutoTable.finalY || 400;

    // Stylish Grand Totals Row
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(1);
    doc.setFillColor(241, 245, 249);
    doc.rect(40, finalYTable, pageWidth - 80, 36, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...textDark);

    const tableWidth = pageWidth - 80;
    const colWidth = tableWidth / 4;

    doc.text('TOTAL EARNINGS', 48, finalYTable + 22);
    doc.text('TOTAL DEDUCTIONS', 40 + (colWidth * 2) + 8, finalYTable + 22);

    doc.setFontSize(12);
    doc.setTextColor(...successText);
    doc.text(`Rs. ${Number(record.gross || 0).toLocaleString('en-IN')}`, 40 + (colWidth * 2) - 8, finalYTable + 23, { align: 'right' });
    doc.setTextColor(...dangerText);
    doc.text(`Rs. ${Number(record.total_ded || 0).toLocaleString('en-IN')}`, 40 + tableWidth - 8, finalYTable + 23, { align: 'right' });


    // --- Elite Net Pay Badge ---
    const netPayY = finalYTable + 70;

    // Subtly colored background with strong border
    doc.setFillColor(...successBg);
    doc.setDrawColor(...successBorder);
    doc.setLineWidth(1.5);
    doc.roundedRect(40, netPayY, pageWidth - 80, 90, 10, 10, 'FD');

    // Left side Label
    doc.setTextColor(...successText);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY TRANSFERABLE', 70, netPayY + 40);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(21, 128, 61); // Green 700
    doc.text('(Amount credited to bank account)', 70, netPayY + 60);

    // Right side Value
    doc.setFontSize(36);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${Number(record.net_pay || 0).toLocaleString('en-IN')}`, pageWidth - 70, netPayY + 54, { align: 'right' });


    // --- High-End Footer ---
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(0.5);
    doc.line(40, pageHeight - 60, pageWidth - 40, pageHeight - 60);

    doc.setFontSize(8);
    doc.setTextColor(...textMuted);
    doc.setFont('helvetica', 'italic');
    doc.text(
        'This is a computer-generated document and requires no physical signature.',
        pageWidth / 2,
        pageHeight - 45,
        { align: 'center' }
    );
    doc.setFontSize(7);
    doc.text(
        `Data verified from Karmyogi Portal (${monthStr})`,
        pageWidth / 2,
        pageHeight - 33,
        { align: 'center' }
    );

    doc.save(`Payslip_${employee.hrpn}_${record.month_year}.pdf`);
};
