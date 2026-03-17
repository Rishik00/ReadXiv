import Table from 'cli-table3';
import { formatBytes, getStats } from '../utils/db-utils.mjs';

export async function showDbCommand() {
  const stats = await getStats();

  const infoTable = new Table({
    head: ['Metric', 'Value'],
    colWidths: [28, 90],
    wordWrap: true,
  });

  infoTable.push(
    ['Database path', stats.dbPath],
    ['Data directory', stats.dataDir],
    ['Total papers', String(stats.totalPapers)],
    ['PDF storage', formatBytes(stats.pdfBytes)],
    ['Notes storage', formatBytes(stats.notesBytes)],
    ['Total storage', formatBytes(stats.totalBytes)]
  );

  console.log(infoTable.toString());

  const statusTable = new Table({ head: ['Status', 'Count'], colWidths: [30, 12] });
  for (const row of stats.statuses) statusTable.push([row.status || 'unknown', String(row.count)]);
  if (stats.statuses.length === 0) statusTable.push(['(none)', '0']);
  console.log('\nPaper statuses');
  console.log(statusTable.toString());

  const recentTable = new Table({ head: ['ID', 'Title', 'Status', 'Last Seen'], colWidths: [16, 50, 14, 28] });
  for (const row of stats.recent) {
    recentTable.push([row.id, row.title || '(untitled)', row.status || '-', row.last_seen || '-']);
  }
  if (stats.recent.length === 0) recentTable.push(['-', 'No papers yet', '-', '-']);
  console.log('\nRecent papers');
  console.log(recentTable.toString());
}
