// Excel service for managing test-plans.xlsx repository
import XLSX from 'xlsx';
import * as fs from 'fs';
import { Logger } from './logger';
import { ExcelRow } from '../types';

export class ExcelService {
  private workbookPath: string;
  private logger: Logger;
  private workbook: XLSX.WorkBook | null = null;

  constructor(workbookPath: string = 'test-plans.xlsx', logger: Logger) {
    this.workbookPath = workbookPath;
    this.logger = logger;
    this.initializeWorkbook();
  }

  private initializeWorkbook(): void {
    try {
      if (fs.existsSync(this.workbookPath)) {
        this.workbook = XLSX.readFile(this.workbookPath);
        this.logger.info('Loaded existing test-plans.xlsx', {
          path: this.workbookPath,
        });
      } else {
        this.workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet([
          {
            'User Story': 'User Story description',
            'Scenario Steps': 'Test steps separated by →',
            'Created Date': new Date().toISOString(),
            'Execution Count': 0,
            'Reuse Count': 0,
            Status: 'Active',
          },
        ]);
        XLSX.utils.book_append_sheet(this.workbook, worksheet, 'TestPlans');
        this.save();
        this.logger.info('Created new test-plans.xlsx', {
          path: this.workbookPath,
        });
      }
    } catch (error) {
      this.logger.error('Error initializing workbook', error);
      throw error;
    }
  }



  private readRows(): any[] {
    if (!this.workbook) return [];
    const worksheet = this.workbook.Sheets['TestPlans'];
    if (!worksheet) return [];

    const rows = XLSX.utils.sheet_to_json<any>(worksheet);
    return rows.filter(
      (row) =>
        row &&
        (row['User Story'] || row.userStory || row['User Story']) &&
        row['User Story'] !== 'User Story description'
    );
  }

  private save(): void {
    try {
      if (this.workbook) {
        // Apply professional formatting
        this.formatWorksheet();
        XLSX.writeFile(this.workbook, this.workbookPath);
        this.logger.debug('Excel file saved', { path: this.workbookPath });
      }
    } catch (error: any) {
      const message = String(error?.message ?? error ?? '');
      const code = String(error?.code ?? '');
      const combined = `${code} ${message}`.toLowerCase();

      if (code === 'EBUSY' || combined.includes('busy') || combined.includes('locked') || combined.includes('ebusy')) {
        this.logger.warn('Excel repository is locked by another process; skipping update for this run.', {
          path: this.workbookPath,
          error: message || code || 'Workbook lock detected',
        });
        return;
      }

      this.logger.error('Error saving Excel file', error);
      throw error;
    }
  }

  private formatWorksheet(): void {
    try {
      const worksheet = this.workbook?.Sheets['TestPlans'];
      if (!worksheet) return;

      // Set professional column widths
      if (!worksheet['!cols']) {
        worksheet['!cols'] = [];
      }
      worksheet['!cols'][0] = { wch: 40 }; // User Story
      worksheet['!cols'][1] = { wch: 50 }; // Scenario Steps
      worksheet['!cols'][2] = { wch: 18 }; // Created Date
      worksheet['!cols'][3] = { wch: 15 }; // Execution Count
      worksheet['!cols'][4] = { wch: 12 }; // Reuse Count
      worksheet['!cols'][5] = { wch: 12 }; // Status

      // Apply text wrapping and alignment
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddress = XLSX.utils.encode_col(C) + XLSX.utils.encode_row(R);
          const cell = worksheet[cellAddress];
          if (cell) {
            // Apply text wrapping for long content
            if (C === 0 || C === 1) {
              cell.alignment = { wrapText: true, vertical: 'top' };
            }
            // Format dates
            if (C === 2 && R > 0) {
              cell.num_fmt = 'yyyy-mm-dd hh:mm:ss';
            }
          }
        }
      }
    } catch (error) {
      this.logger.debug('Error formatting worksheet', error);
      // Continue anyway - formatting is not critical
    }
  }

  private normalizeStoryForMatching(value: string): string {
    return value
      .toLowerCase()
      .replace(/https?:\/\/[^\s]+/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeExplicitCredentials(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b(?:user(?:name)?|password)\b\s*[:=]?\s*/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  scenarioExists(userStory: string): ExcelRow | null {
    try {
      if (!this.workbook) return null;

      const rows = this.readRows().map((row) => ({
        userStory: row['User Story'] || row.userStory || '',
        scenario: row['Scenario Steps'] || row.scenario || row.Steps || '',
        steps: row['Scenario Steps'] || row.steps || row.Steps || '',
        applicationMapName: row['Application Map Name'] || row.applicationMapName || '',
        createdDate: row['Created Date'] || row.createdDate || '',
        executionCount: Number(row['Execution Count'] || row.executionCount || 0),
        reuseCount: Number(row['Reuse Count'] || row.reuseCount || 0),
      }));

      const currentStory = this.normalizeStoryForMatching(userStory);
      const exactMatch = rows.find((row) => {
        const rowStory = this.normalizeStoryForMatching(row.userStory || '');
        return rowStory === currentStory;
      });

      if (exactMatch) {
        this.logger.info('Found exact existing scenario in Excel', { userStory });
        return exactMatch;
      }

      const currentIdentity = this.normalizeExplicitCredentials(userStory);
      const partialCredentialMatch = rows.find((row) => {
        const rowIdentity = this.normalizeExplicitCredentials(row.userStory || '');
        return rowIdentity && currentIdentity && rowIdentity === currentIdentity && currentStory !== rowIdentity;
      });

      if (partialCredentialMatch) {
        this.logger.info('Found exact credential-based scenario match in Excel', {
          userStory,
          matchedScenario: partialCredentialMatch.scenario,
        });
        return partialCredentialMatch;
      }

      this.logger.info('No exact scenario match found in Excel for current user story', { userStory });
      return null;
    } catch (error) {
      this.logger.error('Error checking scenario existence', error);
      return null;
    }
  }

  addScenario(row: ExcelRow): void {
    try {
      if (!this.workbook) return;

      const existing = this.scenarioExists(row.userStory);
      if (existing) {
        this.logger.info('Scenario already exists in Excel; incrementing reuse count', {
          userStory: row.userStory,
        });
        this.incrementReuseCount(row.userStory);
        return;
      }

      const worksheet = this.workbook.Sheets['TestPlans'];
      if (!worksheet) return;

      // Read existing rows and convert to proper format
      const data: Record<string, any>[] = this.readRows().map((existingRow) => ({
        'User Story': existingRow['User Story'] || existingRow.userStory || '',
        'Scenario Steps': existingRow['Scenario Steps'] || existingRow.steps || existingRow.Steps || '',
        'Created Date': existingRow['Created Date'] || existingRow.createdDate || '',
        'Execution Count': Number(existingRow['Execution Count'] || existingRow.executionCount || 0),
        'Reuse Count': Number(existingRow['Reuse Count'] || existingRow.reuseCount || 0),
        Status: 'Active',
      }));

      // Add new row with clean format
      data.push({
        'User Story': row.userStory,
        'Scenario Steps': row.steps,
        'Created Date': row.createdDate,
        'Execution Count': row.executionCount,
        'Reuse Count': row.reuseCount,
        Status: 'Active',
      });

      const newWorksheet = XLSX.utils.json_to_sheet(data);
      this.workbook.Sheets['TestPlans'] = newWorksheet;
      this.save();
      this.logger.info('Scenario added to Excel', {
        userStory: row.userStory,
      });
    } catch (error: any) {
      if (error?.code === 'EBUSY' || error?.message?.includes('locked')) {
        this.logger.warn('Excel workbook is locked; skipping repository update for this run.', {
          userStory: row.userStory,
        });
        return;
      }
      this.logger.error('Error adding scenario to Excel', error);
      throw error;
    }
  }

  incrementExecutionCount(userStory: string): void {
    try {
      if (!this.workbook) return;

      const worksheet = this.workbook.Sheets['TestPlans'];
      if (!worksheet) return;

      const data: Record<string, any>[] = this.readRows().map((row) => ({
        'User Story': row['User Story'] || row.userStory || '',
        'Scenario Steps': row['Scenario Steps'] || row.steps || row.Steps || '',
        'Created Date': row['Created Date'] || row.createdDate || '',
        'Execution Count': Number(row['Execution Count'] || row.executionCount || 0),
        'Reuse Count': Number(row['Reuse Count'] || row.reuseCount || 0),
        Status: 'Active',
      }));

      const rowIndex = data.findIndex((r) => r['User Story'].toLowerCase() === userStory.toLowerCase());
      if (rowIndex >= 0) {
        data[rowIndex]['Execution Count'] = (data[rowIndex]['Execution Count'] || 0) + 1;
        const newWorksheet = XLSX.utils.json_to_sheet(data);
        this.workbook.Sheets['TestPlans'] = newWorksheet;
        this.save();
        this.logger.info('Execution count incremented', { userStory });
      }
    } catch (error: any) {
      if (error?.code === 'EBUSY' || error?.message?.includes('locked')) {
        this.logger.warn('Excel workbook is locked; leaving repository state unchanged for this run.', { userStory });
        return;
      }
      this.logger.error('Error incrementing execution count', error);
    }
  }

  incrementReuseCount(userStory: string): void {
    try {
      if (!this.workbook) return;

      const worksheet = this.workbook.Sheets['TestPlans'];
      if (!worksheet) return;

      const data: Record<string, any>[] = this.readRows().map((row) => ({
        'User Story': row['User Story'] || row.userStory || '',
        'Scenario Steps': row['Scenario Steps'] || row.steps || row.Steps || '',
        'Created Date': row['Created Date'] || row.createdDate || '',
        'Execution Count': Number(row['Execution Count'] || row.executionCount || 0),
        'Reuse Count': Number(row['Reuse Count'] || row.reuseCount || 0),
        Status: 'Active',
      }));

      const rowIndex = data.findIndex((r) => r['User Story'].toLowerCase() === userStory.toLowerCase());
      if (rowIndex >= 0) {
        data[rowIndex]['Reuse Count'] = (data[rowIndex]['Reuse Count'] || 0) + 1;
        const newWorksheet = XLSX.utils.json_to_sheet(data);
        this.workbook.Sheets['TestPlans'] = newWorksheet;
        this.save();
        this.logger.info('Reuse count incremented', { userStory });
      }
    } catch (error: any) {
      if (error?.code === 'EBUSY' || error?.message?.includes('locked')) {
        this.logger.warn('Excel workbook is locked; reuse count not updated for this run.', { userStory });
        return;
      }
      this.logger.error('Error incrementing reuse count', error);
    }
  }

  getAllScenarios(): ExcelRow[] {
    try {
      if (!this.workbook) return [];

      const worksheet = this.workbook.Sheets['TestPlans'];
      if (!worksheet) return [];

      const data = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);
      return data.filter((row) => row.userStory && row.userStory !== 'User Story');
    } catch (error) {
      this.logger.error('Error retrieving scenarios', error);
      return [];
    }
  }
}
