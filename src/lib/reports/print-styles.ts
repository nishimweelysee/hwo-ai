export const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 24px; }
  .report-header { width: 100%; margin-bottom: 20px; }
  .report-header img { width: 100%; max-height: 120px; object-fit: contain; object-position: left; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0f766e; }
  .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #0f766e; border-bottom: 2px solid #ccfbf1; padding-bottom: 4px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .stat-label { font-size: 11px; color: #64748b; }
  .stat-value { font-size: 18px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f0fdfa; color: #0f766e; font-weight: 600; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .badge-high { background: #fee2e2; color: #b91c1c; }
  .badge-medium { background: #fef3c7; color: #b45309; }
  .badge-low { background: #d1fae5; color: #047857; }
  .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none !important; }
  }
`;
