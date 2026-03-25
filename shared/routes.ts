export const ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
  },
  API: {
    EMPLOYEES: '/api/employees',
    TRANSACTIONS: {
      MANUAL: '/api/transactions/manual',
      BULK: '/api/transactions/bulk',
      LIST: '/api/transactions',
    },
    REPORTS: {
      GENERATE: '/api/reports/generate',
      EXPORT_PDF: '/api/reports/export-pdf',
      EXPORT_EXCEL: '/api/reports/export-excel',
    }
  }
};
