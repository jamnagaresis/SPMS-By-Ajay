import * as XLSX from 'xlsx';
import { EmployeeMapping, ExtractedRecord, ParseResult, ProcessingStats } from './types';

export const parseExcelFile = async (
    file: File,
    mappings: EmployeeMapping[]
): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                // Use type: 'array' for ArrayBuffer
                const workbook = XLSX.read(data, { type: 'array' });

                // Assuming first sheet by default unless specified
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Parse raw data. 
                // Important: header: 1 gives array of arrays
                const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                const records: ExtractedRecord[] = [];

                // Skip headers (Rows 1 & 2, i.e., index 0 & 1). Start from index 2 (Row 3).
                for (let i = 2; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || row.length === 0) continue;

                    // C column = Index 2 (Employee Name)
                    // D column = Index 3 (Designation)
                    // E column = Index 4 (Income Tax)
                    // N column = Index 13 (Gross Pay)
                    // O column = Index 14 (Net Pay)
                    const rawName = row[2]; // Don't cast yet, check existence
                    const designation = row[3] as string;
                    const incomeTax = row[4];
                    const grossPay = row[13];
                    const netPay = row[14];

                    // If no rawName, skip (empty row)
                    if (!rawName) continue;

                    const rawNameStr = String(rawName).trim();

                    // Find mapping
                    const mapping = mappings.find(
                        m => m.originalName.toLowerCase().trim() === rawNameStr.toLowerCase()
                    );

                    records.push({
                        originalName: rawNameStr,
                        employeeName: mapping ? mapping.correctedName : rawNameStr, // Map or keep original
                        designation: designation || '',
                        incomeTax: typeof incomeTax === 'number' ? incomeTax : parseFloat(incomeTax as string) || 0,
                        grossPay: typeof grossPay === 'number' ? grossPay : parseFloat(grossPay as string) || 0,
                        netPay: typeof netPay === 'number' ? netPay : parseFloat(netPay as string) || 0,
                        panNumber: mapping?.panNumber || 'N/A'
                    });
                }

                resolve({ fileName: file.name, records });
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

export const generateConsolidatedReport = (
    results: ParseResult[],
    mappings: EmployeeMapping[]
) => {
    // Flatten all records
    let allRecords: ExtractedRecord[] = [];
    results.forEach(res => {
        allRecords = [...allRecords, ...res.records];
    });

    // Create worksheet data
    const headers = ['Sr. No.', 'Employee Name', 'Original Name (Reference)', 'Designation', 'PAN Number', 'Income Tax', 'Gross Pay', 'Net Pay', 'Source File'];
    const data = allRecords.map((rec, index) => [
        index + 1,
        rec.employeeName,
        rec.originalName,
        rec.designation,
        rec.panNumber,
        rec.incomeTax,
        rec.grossPay,
        rec.netPay,
        results.find(r => r.records.includes(rec))?.fileName || 'Unknown',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consolidated Data');

    // Return blob
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
