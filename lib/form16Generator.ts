import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { TaxOutput } from './taxCalculator';

export const generateForm16PDF = (data: TaxOutput, employee: any, financialYear: string, monthsAnalyzed: number = 12) => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // --- Premium Color Palette ---
    const primaryBrand: [number, number, number] = [16, 185, 129]; // Emerald 500
    const accentColor: [number, number, number] = [5, 150, 105]; // Emerald 600
    const darkSlate: [number, number, number] = [15, 23, 42]; // Slate 900
    const borderSlate: [number, number, number] = [203, 213, 225]; // Slate 300
    const textMuted: [number, number, number] = [71, 85, 105]; // Slate 600
    const textDark: [number, number, number] = [30, 41, 59]; // Slate 800

    const successBg: [number, number, number] = [240, 253, 244];
    const successText: [number, number, number] = [21, 128, 61];
    const successBorder: [number, number, number] = [34, 197, 94];

    // --- Page Borders ---
    doc.setDrawColor(...primaryBrand);
    doc.setLineWidth(4);
    doc.rect(15, 15, pageWidth - 30, pageHeight - 30);
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(0.5);
    doc.rect(19, 19, pageWidth - 38, pageHeight - 38);

    // --- Watermark ---
    doc.saveGraphicsState();
    doc.setTextColor(241, 245, 249);
    doc.setFontSize(70);
    doc.setFont('helvetica', 'bold');
    doc.text('FORM 16 PROFORMA', pageWidth / 2, pageHeight / 2 + 100, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    // --- Premium Header Banner ---
    doc.setFillColor(...primaryBrand);
    doc.rect(20, 20, pageWidth - 40, 100, 'F');
    doc.setFillColor(...accentColor);
    doc.rect(20, 120, pageWidth - 40, 4, 'F');

    // Header Text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('FORM 16 - PART B', 45, 65);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    const nextYear = parseInt(financialYear) + 1;
    doc.text(`Financial Year: ${financialYear}-${nextYear} (Assessment Year: ${nextYear}-${nextYear + 1})`, 45, 95);

    // Right aligned company details
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('General Hospital, ESIS, Vadodara', pageWidth - 45, 65, { align: 'right' });

    // Extrapolated warning if less than 12 months
    if (monthsAnalyzed < 12) {
        doc.setFontSize(10);
        doc.setTextColor(254, 240, 138); // Yellow 200
        doc.text(`⚠️ AI PROJECTION: Extrapolated from ${monthsAnalyzed} Months of YTD Payroll`, pageWidth - 45, 85, { align: 'right' });
    } else {
        doc.setFontSize(10);
        doc.setTextColor(186, 230, 253);
        doc.text('FINAL ACTUALS: Based on full 12 Months Payroll Data', pageWidth - 45, 85, { align: 'right' });
    }

    // --- High-End Employee Details Card ---
    const cardY = 155;

    // Shadow trick
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(42, cardY + 2, pageWidth - 80, 75, 8, 8, 'F');

    // Main Card
    doc.setDrawColor(...borderSlate);
    doc.setLineWidth(0.5);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(40, cardY, pageWidth - 80, 75, 8, 8, 'FD');

    // Vertical divider inside card
    doc.setDrawColor(226, 232, 240);
    doc.line(pageWidth / 2, cardY + 15, pageWidth / 2, cardY + 60);

    const drawLabel = (text: string, x: number, y: number) => {
        doc.setFontSize(8);
        doc.setTextColor(...textMuted);
        doc.setFont('helvetica', 'bold');
        doc.text(text.toUpperCase(), x, y);
    }
    const drawValue = (text: string, x: number, y: number, color: [number, number, number] = textDark) => {
        doc.setFontSize(11);
        doc.setTextColor(...color);
        doc.setFont('helvetica', 'bold');
        doc.text(text, x, y);
    }

    drawLabel('Employee Name', 60, cardY + 25);
    drawValue(employee.corrected_name || 'N/A', 60, cardY + 40);

    drawLabel('Adopted Tax Regime', 60, cardY + 60);
    drawValue(data.regimeName || 'N/A', 60, cardY + 75, [5, 150, 105]); // Green text

    drawLabel('Payroll No (HRPN)', (pageWidth / 2) + 20, cardY + 25);
    drawValue(employee.hrpn || 'N/A', (pageWidth / 2) + 20, cardY + 40);

    drawLabel('PAN Number', (pageWidth / 2) + 20, cardY + 60);
    drawValue(employee.pan_number || 'N/A', (pageWidth / 2) + 20, cardY + 75);

    // --- Stunning Data Table ---
    const formatRow = (val: number | undefined) => `Rs. ${(val || 0).toLocaleString('en-IN')}`;

    const tableBody = [
        ['1. Gross Salary (17(1))', formatRow(data.grossSalary)],
        [{ content: 'Less: Allowance to the extent exempt u/s 10', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }, ''],
        ['   - House Rent Allowance (HRA)', formatRow(data.hraExemption)],
        ['2. Total Amount of Salary', formatRow((data.grossSalary || 0) - (data.hraExemption || 0))],
        [{ content: 'Less: Deductions under section 16', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }, ''],
        ['   - Standard Deduction u/s 16(ia)', formatRow(data.standardDeduction)],
        ['   - Professional Tax', formatRow(data.professionalTax)],
        [{ content: '3. Income Chargeable under the head "Salaries"', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }, formatRow((data.taxableIncome || 0) + (data.totalDeductionsAllowed || 0))],
        ['   - Interest on Housing Loan u/s 24(B)', formatRow(data.homeLoanInterest)],
        [{ content: 'Deductions under Chapter VI-A', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } }, ''],
        ['   - Section 80C (GPF, LIC, PPF, etc)', formatRow(data.section80C)],
        ['   - Section 80CCD(1B) (NPS Extra)', formatRow(data.section80CCD1B)],
        ['   - Section 80D (Health Insurance)', formatRow(data.section80D)],
        ['   - Other Deductions', formatRow(data.otherDeductions)],
        [{ content: '4. Total Deductions under Chapter VI-A', styles: { fontStyle: 'bold' } }, formatRow(data.totalDeductionsAllowed)],
        [{ content: '5. Total Taxable Income', styles: { fontStyle: 'bold', textColor: [5, 150, 105] } }, formatRow(data.taxableIncome)],
        ['6. Tax on Total Income', formatRow(data.taxBeforeRebate)],
        ['7. Rebate under section 87A', formatRow(data.rebate87A)],
        ['8. Health & Education Cess (4%)', formatRow(data.healthAndEducationCess)],
    ];

    autoTable(doc, {
        startY: cardY + 95,
        theme: 'grid',
        head: [['Details of Salary Paid and Any Other Income and Tax Deducted', 'Amount']],
        body: tableBody as any,
        headStyles: {
            fillColor: darkSlate,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 10,
            cellPadding: 8,
            halign: 'left',
            lineColor: darkSlate,
            lineWidth: 0.5
        },
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 6,
            lineColor: borderSlate,
            textColor: textDark,
        },
        columnStyles: {
            0: { halign: 'left' },
            1: { halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: 40, right: 40 }
    });

    const finalYTable = (doc as any).lastAutoTable.finalY + 20;

    // --- Giant Net Tax Liability Badge ---

    // Subtly colored background with strong border
    doc.setFillColor(...successBg);
    doc.setDrawColor(...successBorder);
    doc.setLineWidth(1.5);
    doc.roundedRect(40, finalYTable, pageWidth - 80, 70, 8, 8, 'FD');

    // Left side Label
    doc.setTextColor(...successText);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('NET TAX LIABILITY', 70, finalYTable + 32);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(21, 128, 61); // Green 700
    if (monthsAnalyzed < 12) {
        doc.text(`(Estimated total tax payable for FY ${financialYear})`, 70, finalYTable + 48);
    } else {
        doc.text(`(Total tax payable for FY ${financialYear})`, 70, finalYTable + 48);
    }

    // Right side Value
    doc.setFontSize(32);
    doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${Number(data.totalTaxLiability || 0).toLocaleString('en-IN')}`, pageWidth - 70, finalYTable + 44, { align: 'right' });


    // --- Elite Footer ---
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
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(
        `SPMS - Smart Payroll Management System by Ajay Ambaliya`,
        pageWidth / 2,
        pageHeight - 30,
        { align: 'center' }
    );

    doc.save(`Form16_Proforma_${employee.hrpn}_FY${financialYear}.pdf`);
};
