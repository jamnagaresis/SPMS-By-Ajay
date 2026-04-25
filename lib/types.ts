export interface EmployeeMapping {
  id: string;
  originalName: string; // The "Dr.ChiragBPandya" style name
  correctedName: string; // The "Dr. Chirag B. Pandya" style name
  panNumber: string;
}

export interface ParseResult {
  fileName: string;
  records: ExtractedRecord[];
}

export interface ExtractedRecord {
  employeeName: string;
  designation: string;
  incomeTax: number;
  grossPay: number; // New field
  netPay: number;
  originalName: string; // For reference
  panNumber?: string; // Enriched data
}

export interface ProcessingStats {
  totalFiles: number;
  totalRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
}
